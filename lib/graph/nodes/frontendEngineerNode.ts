import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  getFrontendEngineerSystemPrompt,
  getFrontendEngineerUserPrompt,
} from "../prompts/frontendEngineerPrompts";
import { extractTokenUsage } from "../metrics-utils";
import { verifyImports } from "../import-guard";

/**
 * The Frontend Engineer Agent node.
 * Responsibilities:
 * 1. Read the execution plan from the PM.
 * 2. Generate code for new and modified files.
 * 3. On revision: perform targeted fixes on faulty files only (up to 3 retries per round).
 * 4. After 3 retries, start a new round with full regeneration.
 * 5. Unlimited rounds until validation passes.
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
  } = state;

  // Every engineer call = one new round. Always increment.
  const nextRound = (roundCount ?? 0) + 1;
  let filesToGenerate: string[] = [];
  let isTargetedFix = false;

  const allFiles = [
    ...(executionPlan.newFilesToCreate || []),
    ...(executionPlan.filesToModify || []),
  ];

  // Determine generation mode
  if (validationCrashed) {
    // Technical crash — full regeneration to recover
    filesToGenerate = allFiles;
    console.log(
      `🔥 [Engineer Node][${state.ticketId}] Validation crashed. Full regen (Round ${nextRound}).`,
    );
  } else if (needsRevision) {
    // Targeted fix — only regenerate files listed in validation errors/warnings
    isTargetedFix = true;

    const errorFiles = new Set<string>();
    (validationErrors || []).forEach((err) => {
      // Supports paths with @ alias (e.g., @/components/Foo.tsx)
      const match = err.match(/\]\s+([@a-zA-Z0-9_\-\/.]+)(?::|\s-)/);
      if (match && match[1]) {
        errorFiles.add(match[1].trim());
      }
    });

    if (errorFiles.size > 0) {
      filesToGenerate = Array.from(errorFiles);
    } else {
      console.warn(
        `⚠️ [Engineer Node][${state.ticketId}] Could not parse filenames from errors. Regenerating all files.`,
      );
      filesToGenerate = allFiles;
      isTargetedFix = false;
    }

    console.log(
      `🛠️ [Engineer Node][${state.ticketId}] Targeted Fix (Round ${nextRound}): ${filesToGenerate.join(", ")}`,
    );
  } else {
    // Initial run — generate all files for the first time
    filesToGenerate = allFiles;
    console.log(
      `🚀 [Engineer Node][${state.ticketId}] Initial Code Generation (Round ${nextRound}).`,
    );
  }

  console.log(
    `\n💻 [Engineer Node][${state.ticketId}] Starting generation (Round ${nextRound})...`,
  );

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // Initialize output — keep existing code if targeted fix, otherwise start fresh
  const generatedCode: { filePath: string; fileContent: string }[] =
    isTargetedFix ? [...(existingCode || [])] : [];

  // Files NOT being regenerated — already validated as correct
  const cleanFiles = (existingCode || [])
    .map((f) => f.filePath)
    .filter((p) => !filesToGenerate.includes(p));

  // Deduplicate files to generate
  const uniqueFiles = Array.from(new Set(filesToGenerate));

  const contextString = architectureProfile
    ? `ARCHITECTURE PROFILE:
- Next.js: ${architectureProfile.nextJsVersion}
- Tailwind: ${architectureProfile.tailwindVersion}
- Styling: ${architectureProfile.stylingApproach}
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
${(executionPlan.newFilesToCreate || []).join("\n")}

FILES TO MODIFY:
${(executionPlan.filesToModify || []).join("\n")}
`;

  let totalTokenUsage = { prompt: 0, completion: 0, total: 0 };

  for (const filePath of uniqueFiles) {
    console.log(
      `[Engineer Node][${state.ticketId}] Generating code for ${filePath}...`,
    );

    const systemPrompt = getFrontendEngineerSystemPrompt(
      filePath,
      contextString,
      designSpecsString,
    );

    // Errors relevant to this specific file
    const relevantErrors = (validationErrors || []).filter((err) =>
      err.includes(filePath),
    );
    const errorsForFile =
      relevantErrors.length > 0
        ? relevantErrors
        : (validationErrors || []).filter((e) => !e.includes(":")) || [];

    let retries = 0;
    const MAX_INTERNAL_RETRIES = 1;
    let currentInternalError: string | undefined = undefined;
    let content = "";

    while (retries <= MAX_INTERNAL_RETRIES) {
      let userPrompt = getFrontendEngineerUserPrompt(
        executionPlan.featureScope,
        executionPlan.implementationInstructions,
        filePath,
        fullExecutionPlan,
        needsRevision && errorsForFile.length > 0 ? errorsForFile : undefined,
        needsRevision ? errorAttemptHistory || [] : undefined,
        isTargetedFix && cleanFiles.length > 0 ? cleanFiles : undefined,
        nextRound,
      );

      if (currentInternalError) {
        userPrompt += `\n\nSYSTEM NOTE: ${currentInternalError}`;
      }

      const result = await model.invoke([
        ["system", systemPrompt],
        ["user", userPrompt],
      ]);

      const usage = extractTokenUsage(result) ?? {
        prompt: 0,
        completion: 0,
        total: 0,
      };
      totalTokenUsage.prompt += usage.prompt;
      totalTokenUsage.completion += usage.completion;
      totalTokenUsage.total += usage.total;

      content = result.content.toString();

      // Remove markdown code blocks
      content = content.replace(/^```(?:\w+)?\n/, "").replace(/\n```$/, "");

      // Verify imports
      const importError = verifyImports(
        content,
        executionPlan,
        state.codebaseTree || "",
      );

      if (!importError) {
        break; // Success
      }

      currentInternalError = importError;
      retries++;

      if (retries <= MAX_INTERNAL_RETRIES) {
        console.log(
          `⚠️ [Engineer Node][${state.ticketId}] Import mismatch detected for ${filePath}. Retrying internally... Error: ${importError}`,
        );
      } else {
        console.warn(
          `⚠️ [Engineer Node][${state.ticketId}] Import mismatch persists after retry for ${filePath}. Proceeding.`,
        );
      }
    }

    console.log(
      `[Engineer Node][${state.ticketId}] Generated ${content.length} chars for ${filePath}`,
    );
    console.log(
      `[Engineer Node][${state.ticketId}] Preview:\n${content.substring(0, 200)}...`,
    );

    // Replace existing entry or append
    const existingIndex = generatedCode.findIndex(
      (f) => f.filePath === filePath,
    );
    if (existingIndex >= 0) {
      generatedCode[existingIndex] = { filePath, fileContent: content };
    } else {
      generatedCode.push({ filePath, fileContent: content });
    }
  }

  // Record current validation errors in history for future retries
  const newHistory = [
    ...(errorAttemptHistory || []),
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
    metrics: {
      nodeExecutionTimes: {
        [`frontendEngineerNode_r${nextRound}`]: duration,
      },
      nodeTokenUsage: {
        [`frontendEngineerNode_r${nextRound}`]: totalTokenUsage,
      },
      totalFilesGenerated: executionPlan.newFilesToCreate?.length || 0,
      totalFilesModified: executionPlan.filesToModify?.length || 0,
      totalRounds: nextRound,
      nodeCallCounts: {
        frontendEngineerNode: 1,
      },
    },
  };
}
