import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  getFrontendEngineerSystemPrompt,
  getFrontendEngineerUserPrompt,
} from "../prompts/frontendEngineerPrompts";
import { extractTokenUsage } from "../metrics-utils";
import { verifyImports } from "../import-guard";
import { ExecutionPlanSchema, ValidationSchema } from "../schema";
import { getValidationSystemPrompt } from "../prompts/validationPrompts";

const MAX_FILE_ATTEMPTS = 3; // Per-file generate→validate cycles
const INLINE_VALIDATION_TIMEOUT_MS = 60_000;
const WARNING_LENIENCY_ROUND = 5;

/**
 * The Frontend Engineer Agent node.
 * Each file is generated and validated in its own parallel stream.
 * Files loop between generate→validate until they pass or exhaust attempts.
 * Only when all files complete does the node return.
 * The outer validationNode is a final safety-net checkpoint.
 */
export async function frontendEngineerNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const {
    executionPlan,
    projectContext,
    architectureProfile,
    designSpecifications,
    validationErrors,
    needsRevision,
    roundCount,
    validationCrashed,
    generatedCode: existingCode,
    errorAttemptHistory,
    fullExecutionPlan: stateFullExecutionPlan,
    surgicalContext,
    checkpointFiles,
  } = state;

  // Every engineer call = one new round. Always increment.
  const nextRound = (roundCount ?? 0) + 1;
  const isLenient = nextRound >= WARNING_LENIENCY_ROUND;
  let filesToGenerate: string[] = [];
  let isTargetedFix = false;

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // Validation model for inline per-file validation
  const validationModel = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });
  const structuredValidationModel = validationModel.withStructuredOutput(
    ValidationSchema,
    { name: "validate_code" },
  );

  // Low Complexity / No Plan fallback: Determine files to modify using LLM
  let effectiveExecutionPlan = executionPlan;

  if (!executionPlan && !needsRevision && !validationCrashed) {
    console.log(
      `ℹ️ [Engineer Node][${state.ticketId}] No Execution Plan. Generating lightweight plan (Low Complexity)...`,
    );

    const structuredModel = model.withStructuredOutput(ExecutionPlanSchema, {
      name: "create_lightweight_plan",
    });

    const planPrompt = `
You are a Senior Frontend Engineer handling a Low Complexity task.
The user request is: "${state.ticketDescription}"

Codebase Structure:
${state.codebaseTree}

Identify the files that need to be created or modified to fulfill this request.
Generate a concise Execution Plan.
`;
    try {
      const result = await structuredModel.invoke([["user", planPrompt]]);
      effectiveExecutionPlan = result;
      console.log(
        `✅ [Engineer Node][${state.ticketId}] Lightweight Plan Generated:`,
      );
      console.log(
        `   Files to Create: ${result.newFilesToCreate?.join(", ") || "None"}`,
      );
      console.log(
        `   Files to Modify: ${result.filesToModify?.join(", ") || "None"}`,
      );
    } catch (e) {
      console.error(
        `❌ [Engineer Node][${state.ticketId}] Failed to generate lightweight plan.`,
        e,
      );
    }
  }

  const allFiles = [
    ...(effectiveExecutionPlan?.newFilesToCreate || []),
    ...(effectiveExecutionPlan?.filesToModify || []),
  ];

  // Determine generation mode
  if (surgicalContext) {
    filesToGenerate = surgicalContext.failingFilePaths;
    isTargetedFix = true;
    console.log(
      `🚑 [Engineer Node][${state.ticketId}] SURGICAL MODE (Round ${nextRound}). Fixing: ${filesToGenerate.join(", ")}`,
    );
  } else if (validationCrashed) {
    filesToGenerate = allFiles;
    console.log(
      `🔥 [Engineer Node][${state.ticketId}] Validation crashed. Full regen (Round ${nextRound}).`,
    );
  } else if (needsRevision) {
    isTargetedFix = true;
    const revisionFiles = state.filesNeedingRevision;
    if (revisionFiles && revisionFiles.length > 0) {
      filesToGenerate = revisionFiles;
    } else {
      console.warn(
        `⚠️ [Engineer Node][${state.ticketId}] No filesNeedingRevision found. Regenerating all files.`,
      );
      filesToGenerate = allFiles;
      isTargetedFix = false;
    }
    console.log(
      `🛠️ [Engineer Node][${state.ticketId}] Targeted Fix (Round ${nextRound}): ${filesToGenerate.join(", ")}`,
    );
  } else {
    filesToGenerate = allFiles;
    console.log(
      `🚀 [Engineer Node][${state.ticketId}] Initial Code Generation (Round ${nextRound}).`,
    );
  }

  console.log(
    `\n💻 [Engineer Node][${state.ticketId}] Starting generation (Round ${nextRound})...`,
  );

  // Initialize output — targeted fix starts with existing code as base
  const baseFiles = surgicalContext ? checkpointFiles : existingCode;
  const generatedCode: { filePath: string; fileContent: string }[] =
    isTargetedFix ? [...(baseFiles || [])] : [];

  const cleanFiles = (baseFiles || [])
    .map((f) => f.filePath)
    .filter((p) => !filesToGenerate.includes(p));

  const uniqueFiles = Array.from(new Set(filesToGenerate));

  const contextString = architectureProfile
    ? `ARCHITECTURE PROFILE:
- Framework: ${architectureProfile.framework}
- Language: ${architectureProfile.language}
- UI Library: ${architectureProfile.uiLibrary}
- Styling Strategy: ${architectureProfile.stylingStrategy}
- Theme: Colors=${architectureProfile.theme?.colors}, Spacing=${architectureProfile.theme?.spacing}
- Components: ${architectureProfile.componentPatterns.join(", ")}
- API Patterns: ${architectureProfile.apiPatterns.join(", ")}
- Fonts: ${architectureProfile.fonts.join(", ")}`
    : projectContext;

  const designSpecsString = designSpecifications
    ? JSON.stringify(designSpecifications, null, 2)
    : undefined;

  const fullExecutionPlan =
    stateFullExecutionPlan ||
    `
NEW FILES:
${(executionPlan?.newFilesToCreate || []).join("\n")}

FILES TO MODIFY:
${(executionPlan?.filesToModify || []).join("\n")}
`;

  // Validation system prompt (shared across all inline validations this round)
  const validationSystemPrompt = getValidationSystemPrompt(
    projectContext,
    architectureProfile,
    effectiveExecutionPlan,
  );

  // Keep only last 3 rounds of error history to prevent token bloat
  const recentErrorHistory = (errorAttemptHistory || []).slice(-3);

  let totalTokenUsage = { prompt: 0, completion: 0, total: 0 };

  console.log(
    `[Engineer Node][${state.ticketId}] Running ${uniqueFiles.length} file(s) in parallel (each with up to ${MAX_FILE_ATTEMPTS} generate→validate attempts)...`,
  );

  // Per-file parallel streams: each file independently loops generate→validate until it passes
  const fileResults = await Promise.all(
    uniqueFiles.map(async (filePath) => {
      const systemPrompt = getFrontendEngineerSystemPrompt(
        filePath,
        contextString,
        designSpecsString,
        state.codebaseTree,
      );

      // Errors from the outer validation loop relevant to this file
      const outerErrors = (validationErrors || []).filter((err) =>
        err.includes(filePath),
      );

      let content = "";
      let currentErrors: string[] = outerErrors; // Start with any outer errors
      let previousContent: string | undefined = isTargetedFix
        ? (existingCode || []).find((f) => f.filePath === filePath)?.fileContent
        : undefined;
      let fileUsage = { prompt: 0, completion: 0, total: 0 };

      for (let attempt = 0; attempt < MAX_FILE_ATTEMPTS; attempt++) {
        const isRetry = attempt > 0 || (needsRevision && outerErrors.length > 0);

        // GENERATE
        const userPrompt = getFrontendEngineerUserPrompt(
          effectiveExecutionPlan?.featureScope || "Feature Scope Not Provided",
          effectiveExecutionPlan?.implementationInstructions ||
            "Follow standard best practices based on the user request.",
          filePath,
          fullExecutionPlan,
          isRetry && currentErrors.length > 0 ? currentErrors : undefined,
          isRetry ? recentErrorHistory : undefined,
          isTargetedFix && cleanFiles.length > 0 ? cleanFiles : undefined,
          nextRound,
          !!surgicalContext,
          previousContent,
        );

        const genResult = await model.invoke([
          ["system", systemPrompt],
          ["user", userPrompt],
        ]);

        const usage = extractTokenUsage(genResult) ?? {
          prompt: 0,
          completion: 0,
          total: 0,
        };
        fileUsage.prompt += usage.prompt;
        fileUsage.completion += usage.completion;
        fileUsage.total += usage.total;

        content = genResult.content.toString();
        content = content.replace(/^```(?:\w+)?\n/, "").replace(/\n```$/, "");

        // Quick local import check before spending a model call on validation
        const importError = verifyImports(
          content,
          effectiveExecutionPlan!,
          state.codebaseTree || "",
        );
        if (importError) {
          console.log(
            `⚠️ [Engineer Node][${state.ticketId}] ${filePath} attempt ${attempt + 1}: import guard failed — ${importError}`,
          );
          currentErrors = [importError];
          previousContent = content;
          continue; // Skip inline validation, retry generation with the import error
        }

        // VALIDATE inline
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Inline validation timeout for ${filePath} attempt ${attempt + 1}`,
                  ),
                ),
              INLINE_VALIDATION_TIMEOUT_MS,
            ),
          );

          const validationResult = await Promise.race([
            structuredValidationModel.invoke([
              ["system", validationSystemPrompt],
              ["user", `FILE: ${filePath}\n\n${content}`],
            ]),
            timeoutPromise,
          ]);

          const fileCriticals = validationResult.criticalErrors ?? [];
          const fileWarnings = validationResult.warnings ?? [];
          const filePassed =
            fileCriticals.length === 0 &&
            (isLenient || fileWarnings.length === 0);

          console.log(
            `   [Engineer Node][${state.ticketId}] ${filePath} attempt ${attempt + 1}: ${fileCriticals.length} critical, ${fileWarnings.length} warnings ${filePassed ? "✅" : "🔄"}`,
          );

          if (filePassed) {
            break; // File passes — exit inner loop
          }

          // File still has issues — set up next attempt
          currentErrors = [...fileCriticals, ...fileWarnings];
          previousContent = content; // Pass previous code for patch-mode fixing
        } catch {
          // Validation timeout — proceed with current content, outer validator catches it
          console.warn(
            `⚠️ [Engineer Node][${state.ticketId}] Inline validation timeout for ${filePath} attempt ${attempt + 1}. Proceeding with current content.`,
          );
          break;
        }
      }

      return { filePath, content, usage: fileUsage };
    }),
  );

  // Merge parallel results into generatedCode and aggregate token usage
  for (const { filePath, content, usage } of fileResults) {
    totalTokenUsage.prompt += usage.prompt;
    totalTokenUsage.completion += usage.completion;
    totalTokenUsage.total += usage.total;

    const existingIndex = generatedCode.findIndex(
      (f) => f.filePath === filePath,
    );
    if (existingIndex >= 0) {
      generatedCode[existingIndex] = { filePath, fileContent: content };
    } else {
      generatedCode.push({ filePath, fileContent: content });
    }
  }

  // Accumulate error history (capped at last 3 rounds)
  const newHistory = [
    ...recentErrorHistory,
    ...(needsRevision && (validationErrors || []).length > 0
      ? [validationErrors!]
      : []),
  ];

  const duration = Date.now() - startTime;
  console.log(
    `⏱️ [Engineer Node][${state.ticketId}] Completed in ${duration}ms`,
  );

  return {
    generatedCode,
    fullExecutionPlan,
    retryCount: 0,
    roundCount: nextRound,
    errorAttemptHistory: newHistory,
    validationCrashCount: 0,
    // Clear filesNeedingRevision so outer validationNode does a full check
    filesNeedingRevision: [],
    metrics: {
      nodeExecutionTimes: {
        [`frontendEngineerNode_r${nextRound}`]: duration,
      },
      nodeTokenUsage: {
        [`frontendEngineerNode_r${nextRound}`]: totalTokenUsage,
      },
      totalFilesGenerated: executionPlan?.newFilesToCreate?.length || 0,
      totalFilesModified: executionPlan?.filesToModify?.length || 0,
      totalRounds: nextRound,
      nodeCallCounts: {
        frontendEngineerNode: 1,
      },
    },
  };
}
