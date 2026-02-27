import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState, GeneratedFile } from "../state";
import { ValidationSchema } from "../schema";
import { getValidationSystemPrompt } from "../prompts/validationPrompts";
import { extractTokenUsage } from "../metrics-utils";

/**
 * Extracts exported type/function/const signatures from a generated file.
 * Used to give the LLM validator cross-file context without sending full
 * file contents (which would double prompt size). Capped at 30 lines.
 *
 * This lets the validator catch cross-file mismatches in round 1 — e.g.
 * "File A passes onClick: () => void but SiblingB expects onClick: (id: string) => void".
 */
function extractExportSignatures(filePath: string, content: string): string {
  const exportLines = content
    .split("\n")
    .filter(
      (l) =>
        /^\s*export\s/.test(l) ||
        /^\s*['"]use client['"]/.test(l) ||
        /^\s*['"]use server['"]/.test(l),
    );
  return `[${filePath}]\n${exportLines.slice(0, 30).join("\n")}`;
}

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

  // includeRaw: true returns { raw: BaseMessage, parsed: T }
  // so we can call extractTokenUsage(result.raw) — the same approach the
  // engineer node uses — instead of relying on callbacks, which don't fire
  // reliably when the invoke is wrapped in Promise.race.
  const structuredModel = model.withStructuredOutput(ValidationSchema, {
    name: "validate_code",
    includeRaw: true,
  });

  const systemPrompt = getValidationSystemPrompt(
    projectContext,
    architectureProfile,
    executionPlan,
  );

  const tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const VALIDATION_TIMEOUT_MS = 90_000;
  const MAX_FILE_RETRIES = 3;

  // On a revision round, only re-validate the files the engineer just fixed.
  // Clean files haven't changed and don't need re-checking.
  const previouslyFailing = state.filesNeedingRevision;
  let filesToValidate: GeneratedFile[] =
    previouslyFailing && previouslyFailing.length > 0 && generatedCode
      ? generatedCode.filter((f) => previouslyFailing.includes(f.filePath))
      : (generatedCode ?? []);

  if (!filesToValidate) {
    filesToValidate = [];
  }

  console.log(
    `   [Validation Node][${state.ticketId}] Validating ${filesToValidate.length} file(s) in parallel (timeout: ${VALIDATION_TIMEOUT_MS / 1000}s each)...`,
  );

  const invokeStart = Date.now();

  // Pre-compute export signatures from ALL generated files.
  // Each file validation receives the exports of its siblings so the LLM
  // can catch cross-file type mismatches (wrong prop types, missing exports, etc.)
  // in round 1 instead of discovering them in round 2.
  const allSiblingSignatures = (generatedCode ?? []).map((f) =>
    extractExportSignatures(f.filePath, f.fileContent),
  );

  // Store results for each file
  const validationResults = new Map<
    string,
    {
      filePath: string;
      criticalErrors: string[];
      warnings: string[];
      needsWork: boolean;
    }
  >();

  // Helper to process a batch of files
  const processBatch = async (files: GeneratedFile[], attempt: number) => {
    if (files.length === 0) return [];

    if (attempt > 1) {
      console.log(
        `   🔄 [Validation Node][${state.ticketId}] Retrying ${files.length} file(s) (Attempt ${attempt}/${MAX_FILE_RETRIES})...`,
      );
    }

    const promises = files.map(async (file) => {
      try {
        console.log(
          `   [Validation Node][${state.ticketId}] Reviewing ${file.filePath} (${file.fileContent.length} chars)...`,
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Validation timed out after ${VALIDATION_TIMEOUT_MS / 1000}s`,
                ),
              ),
            VALIDATION_TIMEOUT_MS,
          ),
        );

        // Build sibling context: exports of every other generated file.
        // Gives the LLM cross-file visibility so it can catch prop-type mismatches
        // between siblings without needing a second validation round.
        const siblingContext = allSiblingSignatures
          .filter((sig) => !sig.startsWith(`[${file.filePath}]`))
          .join("\n\n");

        const userContent = siblingContext
          ? `SIBLING FILE EXPORTS (for cross-file type checking — do NOT flag these imports as missing):\n${siblingContext}\n\nFILE TO VALIDATE: ${file.filePath}\n${file.fileContent}`
          : `FILE: ${file.filePath}\n\n${file.fileContent}`;

        const result = await Promise.race([
          structuredModel.invoke([
            ["system", systemPrompt],
            ["user", userContent],
          ]),
          timeoutPromise,
        ]);

        // Accumulate token usage from the raw BaseMessage response.
        // result.raw carries usage_metadata; result.parsed is the structured output.
        const fileUsage = extractTokenUsage(result.raw);
        tokenUsage.prompt += fileUsage.prompt;
        tokenUsage.completion += fileUsage.completion;
        tokenUsage.total += fileUsage.total;

        const fileCriticals = result.parsed.criticalErrors ?? [];
        const fileWarnings = result.parsed.warnings ?? [];

        // Determine status emoji
        let statusEmoji = "✅";
        if (fileCriticals.length > 0) statusEmoji = "❌";
        else if (fileWarnings.length > 0) statusEmoji = "⚠️";

        console.log(
          `   ${statusEmoji} [Validation Node][${state.ticketId}] ${file.filePath}: ${fileCriticals.length} critical, ${fileWarnings.length} warnings`,
        );

        return {
          status: "fulfilled" as const,
          value: {
            filePath: file.filePath,
            criticalErrors: fileCriticals,
            warnings: fileWarnings,
            needsWork:
              fileCriticals.length > 0 ||
              (!isLenient && fileWarnings.length > 0),
          },
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `   ❌ [Validation Node][${state.ticketId}] Failed to validate ${file.filePath}: ${errMsg}`,
        );
        return {
          status: "rejected" as const,
          reason: error,
          filePath: file.filePath, // Custom property to track which file failed
        };
      }
    });

    const results = await Promise.allSettled(promises);

    // Process results
    const failedFiles: GeneratedFile[] = [];

    results.forEach((result, index) => {
      const file = files[index];

      if (
        result.status === "fulfilled" &&
        result.value.status === "fulfilled"
      ) {
        validationResults.set(file.filePath, result.value.value);
      } else {
        // Validation failed (crashed/timed out)
        failedFiles.push(file);
      }
    });

    return failedFiles;
  };

  try {
    let pendingFiles = [...filesToValidate];
    let attempt = 1;

    while (pendingFiles.length > 0 && attempt <= MAX_FILE_RETRIES) {
      pendingFiles = await processBatch(pendingFiles, attempt);
      attempt++;
    }

    // Handle files that completely failed validation after retries
    if (pendingFiles.length > 0) {
      console.error(
        `   ❌ [Validation Node][${state.ticketId}] ${pendingFiles.length} file(s) failed validation after ${MAX_FILE_RETRIES} attempts.`,
      );

      pendingFiles.forEach((file) => {
        validationResults.set(file.filePath, {
          filePath: file.filePath,
          criticalErrors: ["Validation process failed (timeout or crash)"],
          warnings: [],
          needsWork: true,
        });
      });
    }

    console.log(
      `   [Validation Node][${state.ticketId}] All files processed in ${Date.now() - invokeStart}ms.`,
    );

    // Convert map to array for final processing
    const fileResults = Array.from(validationResults.values());

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
      criticalErrors.forEach((err) => console.log(`   ❌ [CRITICAL] ${err}`));
      warnings.forEach((w) => console.log(`   ⚠️ [WARNING] ${w}`));
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
        warnings.forEach((w) => console.log(`   ⚠️ [WARNING] ${w}`));
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
    const errType =
      error instanceof Error ? error.constructor.name : typeof error;
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
