import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ValidationSchema } from "../schema";
import { getValidationSystemPrompt } from "../prompts/validationPrompts";

const WARNING_LENIENCY_ROUND = 5;

/**
 * The Validation Agent node.
 * Responsibilities:
 * 1. Review the generated code against project standards and compatibility rules.
 * 2. Identify compilation errors (criticalErrors) separately from style issues (warnings).
 * 3. Flag code for revision if necessary.
 *    - Before round 5: both criticalErrors and warnings trigger revision.
 *    - Round 5+: only criticalErrors trigger revision (warnings are accepted).
 */
export async function validationNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const {
    generatedCode,
    projectContext,
    architectureProfile,
    executionPlan,
    validationCrashCount,
    retryCount,
    roundCount,
  } = state;
  const currentAttempts = validationCrashCount || 0;
  const currentRetry = retryCount ?? 0;
  const currentRound = roundCount ?? 0;

  // Check if there is code to validate
  if (!generatedCode || generatedCode.length === 0) {
    console.warn(
      `⚠️ [Validation Node][${state.ticketId}] No generated code found. Sending back to Engineer.`,
    );
    return {
      needsRevision: true,
      validationErrors: ["No code generated. Please regenerate."],
      validationWarnings: [],
      validationCrashCount: 0,
      validationCrashed: false,
    };
  }

  const isLenient = currentRound >= WARNING_LENIENCY_ROUND;

  // Validation Logic
  // Using Flash model as per configuration rules (Pro restricted to EM/Design/Engineer)
  // const modelName = "gemini-3-flash-preview";
  const modelName = "gemini-3.1-pro-preview";

  console.log(
    `\n🔍 [Validation Node][${state.ticketId}] Starting code review (Round ${currentRound}, Retry ${currentRetry})`,
  );
  console.log(`   Model: ${modelName}`);
  if (isLenient) console.log("   [LENIENT MODE — warnings ignored]");

  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const structuredModel = model.withStructuredOutput(ValidationSchema, {
    name: "validate_code",
  });

  const systemPrompt = getValidationSystemPrompt(
    projectContext,
    architectureProfile,
    executionPlan,
  );

  const tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const VALIDATION_TIMEOUT_MS = 90_000;

  // On a revision round, only re-validate the files the engineer just fixed.
  // Clean files haven't changed and don't need re-checking.
  const previouslyFailing = state.filesNeedingRevision;
  const filesToValidate =
    previouslyFailing && previouslyFailing.length > 0
      ? generatedCode.filter((f) => previouslyFailing.includes(f.filePath))
      : generatedCode;

  console.log(
    `   [Validation Node][${state.ticketId}] Validating ${filesToValidate.length}/${generatedCode.length} file(s) in parallel (timeout: ${VALIDATION_TIMEOUT_MS / 1000}s each)...`,
  );

  const invokeStart = Date.now();

  try {
    // Validate each file independently in parallel to avoid oversized payloads
    const fileResults = await Promise.all(
      filesToValidate.map(async (file) => {
        console.log(
          `   [Validation Node][${state.ticketId}] Reviewing ${file.filePath} (${file.fileContent.length} chars)...`,
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Validation timed out after ${VALIDATION_TIMEOUT_MS / 1000}s for ${file.filePath}`,
                ),
              ),
            VALIDATION_TIMEOUT_MS,
          ),
        );

        const result = await Promise.race([
          structuredModel.invoke([
            ["system", systemPrompt],
            ["user", `FILE: ${file.filePath}\n\n${file.fileContent}`],
          ]),
          timeoutPromise,
        ]);

        const fileCriticals = result.criticalErrors ?? [];
        const fileWarnings = result.warnings ?? [];

        console.log(
          `   [Validation Node][${state.ticketId}] ${file.filePath}: ${fileCriticals.length} critical, ${fileWarnings.length} warnings`,
        );

        return {
          filePath: file.filePath,
          criticalErrors: fileCriticals,
          warnings: fileWarnings,
          needsWork: fileCriticals.length > 0 || (!isLenient && fileWarnings.length > 0),
        };
      }),
    );

    console.log(
      `   [Validation Node][${state.ticketId}] All files validated in ${Date.now() - invokeStart}ms.`,
    );

    // Merge per-file results
    const criticalErrors = fileResults.flatMap((r) => r.criticalErrors);
    const warnings = fileResults.flatMap((r) => r.warnings);
    const filesNeedingRevision = fileResults
      .filter((r) => r.needsWork)
      .map((r) => r.filePath);

    const needsRevision =
      criticalErrors.length > 0 || (!isLenient && warnings.length > 0);

    // SURGICAL DELTA LOGIC
    // If round >= 5 and critical errors exist, trigger surgical mode
    let surgicalContext = null;
    let checkpointFiles = state.checkpointFiles; // Keep existing if already present
    let featureList = state.featureList; // Mask this if surgical

    if (currentRound >= 5 && criticalErrors.length > 0) {
      console.log(
        `🚑 [Validation Node][${state.ticketId}] CRITICAL THRESHOLD REACHED (Round ${currentRound}). Initiating Surgical Delta.`,
      );

      // Identify failing files
      const failingFiles = new Set<string>();
      criticalErrors.forEach((err) => {
        const match = err.match(/\]\s+([@a-zA-Z0-9_\-\/.]+)(?::|\s-)/);
        if (match && match[1]) {
          failingFiles.add(match[1].trim());
        }
      });

      surgicalContext = {
        failingFilePaths: Array.from(failingFiles),
        errorLogs: criticalErrors,
      };

      // Store current files as checkpoint (if not already stored)
      if (!checkpointFiles || checkpointFiles.length === 0) {
        checkpointFiles = generatedCode;
      }

      // Mask the feature list to focus ONLY on the fix
      // We create a temporary feature list that forces the EM to focus on the bug
      featureList = {
        featureScope: "SURGICAL FIX MODE",
        featureList: [
          "CRITICAL FIX REQUIRED",
          ...criticalErrors.map((e) => `Fix error: ${e}`),
        ],
      };

      console.log(
        `   [Surgical] Context created for ${failingFiles.size} files.`,
      );
      console.log(`   [Surgical] Checkpoint saved. Feature List masked.`);
    } else if (currentRound < 5 && needsRevision) {
      // Normal revision
    }

    // If we are already in surgical mode and failed again, we KEEP surgical context
    if (state.surgicalContext && needsRevision) {
      surgicalContext = state.surgicalContext;
      checkpointFiles = state.checkpointFiles;
      featureList = state.featureList; // Keep the masked feature list
      console.log(
        `🚑 [Validation Node][${state.ticketId}] Surgical Fix Failed. Retrying Surgical Mode.`,
      );
    }

    if (needsRevision) {
      console.log(
        `❌ [Validation Node][${state.ticketId}] Code needs revision (${criticalErrors.length} critical, ${warnings.length} warnings).`,
      );
      criticalErrors.forEach((err) => console.log(`   [CRITICAL] ${err}`));
      warnings.forEach((w) => console.log(`   [WARNING] ${w}`));
    } else {
      // SUCCESS - Clear Surgical Context
      if (state.surgicalContext) {
        console.log(
          `✨ [Validation Node][${state.ticketId}] Surgical Fix Verified. Restoring Full Context.`,
        );
        surgicalContext = null; // Clear it
        // We do NOT clear checkpointFiles here, the Engineer merges them.
        // But if validation passes, we are done with this cycle.
      }
      if (isLenient && warnings.length > 0) {
        console.log(
          `⚠️ [Validation Node][${state.ticketId}] Warnings ignored — lenient mode (round ${currentRound} ≥ ${WARNING_LENIENCY_ROUND}).`,
        );
        warnings.forEach((w) => console.log(`   [WARNING] ${w}`));
      }
      console.log(
        `✅ [Validation Node][${state.ticketId}] Code passed validation.`,
      );
    }

    const duration = Date.now() - startTime;
    console.log(
      `⏱️ [Validation Node][${state.ticketId}] Completed in ${duration}ms`,
    );

    return {
      needsRevision,
      validationErrors: [...criticalErrors, ...warnings],
      validationWarnings: warnings,
      filesNeedingRevision,
      validationCrashCount: 0,
      validationCrashed: false,
      surgicalContext, // Update or clear
      checkpointFiles, // Store or keep
      featureList: surgicalContext ? featureList : state.featureList, // Mask if surgical, else keep original
      metrics: {
        nodeExecutionTimes: {
          [`validationNode_r${currentRound}_retry${currentRetry}_attempt${currentAttempts + 1}`]:
            duration,
        },
        nodeTokenUsage: {
          [`validationNode_r${currentRound}_retry${currentRetry}_attempt${currentAttempts + 1}`]:
            tokenUsage,
        },
        validationRetries: currentAttempts,
        totalRounds: currentRound,
        nodeCallCounts: {
          validationNode: 1,
        },
      },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errType = error instanceof Error ? error.constructor.name : typeof error;
    const elapsed = Date.now() - invokeStart;
    console.error(
      `❌ [Validation Node][${state.ticketId}] CRASHED [${errType}] after ${elapsed}ms: ${errMsg}`,
    );

    return {
      needsRevision: false,
      validationErrors: [],
      validationWarnings: [],
      validationCrashCount: currentAttempts + 1,
      validationCrashed: true,
      metrics: {
        validationRetries: currentAttempts + 1,
        totalRounds: currentRound,
        nodeCallCounts: {
          validationNode: 1,
        },
      },
    };
  }
}
