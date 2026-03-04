import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState, GeneratedFile } from "../state";
import { ValidationSchema } from "../schema";
import { getValidationSystemPrompt } from "../prompts/validationPrompts";
import { extractTokenUsage } from "../metrics-utils";
import { setPipelineState, setValidationProgress } from "../../pipeline-state";
import { withConcurrency } from "../concurrency";
import {
  checkCrossFileImports,
  checkPackageImports,
} from "../ts-cross-file-check";

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
  await setPipelineState(state.ticketId, state.ticketSummary, "validationNode");
  const {
    generatedCode,
    projectContext,
    architectureProfile,
    executionPlan,
    retryCount,
    roundCount,
  } = state;
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
    };
  }

  const isLenient = currentRound >= WARNING_LENIENCY_ROUND;

  // Validation Logic
  // Pro is required here — Flash produces noisy false positives and misses subtle
  // type errors, causing extra revision rounds that cost more total time than the
  // per-call savings. Pro with a lean prompt is the fastest end-to-end approach.
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
  // Timeouts shrink aggressively on retries: smaller prompt = should complete fast.
  // If a stripped prompt still doesn't finish in 120s, another 300s attempt won't help.
  const ATTEMPT_TIMEOUTS = [300_000, 120_000, 60_000]; // ms per attempt (1-indexed by attempt-1)
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
    `   [Validation Node][${state.ticketId}] Validating ${filesToValidate.length} file(s) in parallel (timeouts: ${ATTEMPT_TIMEOUTS.map((t) => t / 1000).join("s / ")}s per attempt)...`,
  );

  const invokeStart = Date.now();

  // Pre-compute export signatures. On attempt 1, each file receives the exports
  // of its closest siblings (same directory) first, then others — capped at 8 total
  // to keep the combined prompt lean. At 30 lines/file that's ≤240 lines of context
  // vs the previous unbounded N-1 siblings (510+ lines on an 18-file ticket).
  const allSiblingSignatures = (generatedCode ?? []).map((f) =>
    extractExportSignatures(f.filePath, f.fileContent),
  );
  const MAX_SIBLING_CONTEXT = 8;

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

  const CONCURRENCY = 8;

  // ── Deterministic pre-LLM checks (AST-based, < 10ms total, zero API cost) ──
  // Results are merged into validationResults after the LLM pass so they are
  // always surfaced — even when the LLM validation times out.
  const crossFileErrorMap = new Map<string, string[]>();
  try {
    // 1. Cross-file import/export consistency (named vs default, missing exports)
    const cfResults = checkCrossFileImports(
      generatedCode ?? [],
      filesToValidate,
    );
    for (const { filePath, criticalErrors } of cfResults) {
      if (criticalErrors.length > 0) {
        const existing = crossFileErrorMap.get(filePath) ?? [];
        crossFileErrorMap.set(filePath, [...existing, ...criticalErrors]);
      }
    }

    // 2. Package dependency check (imports not in package.json)
    const pkgResults = checkPackageImports(
      filesToValidate,
      state.installedPackages ?? [],
    );
    for (const { filePath, criticalErrors } of pkgResults) {
      if (criticalErrors.length > 0) {
        const existing = crossFileErrorMap.get(filePath) ?? [];
        crossFileErrorMap.set(filePath, [...existing, ...criticalErrors]);
      }
    }

    if (crossFileErrorMap.size > 0) {
      const totalErrs = [...crossFileErrorMap.values()].reduce(
        (n, errs) => n + errs.length,
        0,
      );
      console.log(
        `   🔗 [Validation Node][${state.ticketId}] Static checks: ${totalErrs} issue(s) in ${crossFileErrorMap.size} file(s).`,
      );
      for (const [fp, errs] of crossFileErrorMap) {
        errs.forEach((e) => console.log(`      ❌ [STATIC] ${fp}: ${e}`));
      }
    }
  } catch (cfErr) {
    console.warn(
      `   ⚠️ [Validation Node][${state.ticketId}] Static checks failed (non-fatal): ${cfErr instanceof Error ? cfErr.message : String(cfErr)}`,
    );
  }

  // Helper to process a batch of files
  const processBatch = async (files: GeneratedFile[], attempt: number) => {
    if (files.length === 0) return [];

    if (attempt > 1) {
      console.log(
        `   🔄 [Validation Node][${state.ticketId}] Retrying ${files.length} file(s) (Attempt ${attempt}/${MAX_FILE_RETRIES})...`,
      );
    }

    const failedFiles: GeneratedFile[] = [];

    await withConcurrency(files, CONCURRENCY, async (file) => {
      const fileIndex = filesToValidate.indexOf(file) + 1;
      const fileTag = `[${fileIndex}/${filesToValidate.length}]`;

      try {
        console.log(
          `   [Validation Node][${state.ticketId}] ${fileTag} Reviewing ${file.filePath} (${file.fileContent.length} chars)...`,
        );

        // Timeout shrinks each attempt: full prompt gets 300s; stripped retries get much less.
        const timeoutMs =
          ATTEMPT_TIMEOUTS[Math.min(attempt - 1, ATTEMPT_TIMEOUTS.length - 1)];
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Validation timed out after ${timeoutMs / 1000}s`),
              ),
            timeoutMs,
          ),
        );

        // Attempt 1: full context — sibling exports + focus hint + file.
        // Attempt 2+: file only — strip everything to minimise prompt size and
        //             maximise the chance of completing within the reduced timeout.
        let userContent: string;
        if (attempt === 1) {
          const fileDir = file.filePath.split("/").slice(0, -1).join("/");
          const siblings = allSiblingSignatures.filter(
            (sig) => !sig.startsWith(`[${file.filePath}]`),
          );
          // Prioritise same-directory siblings (most likely to have type dependencies),
          // then fill up to MAX_SIBLING_CONTEXT from the rest.
          const sameDirSibs = siblings.filter((sig) =>
            sig.startsWith(`[${fileDir}/`),
          );
          const otherSibs = siblings.filter(
            (sig) => !sig.startsWith(`[${fileDir}/`),
          );
          const siblingContext = [...sameDirSibs, ...otherSibs]
            .slice(0, MAX_SIBLING_CONTEXT)
            .join("\n\n");
          const focusHint =
            previouslyFailing && previouslyFailing.includes(file.filePath)
              ? `\nFOCUS: This file was revised to fix prior errors. Give extra scrutiny to changed sections. Still validate the full file.\n\n`
              : "";
          userContent = siblingContext
            ? `SIBLING FILE EXPORTS (for cross-file type checking — do NOT flag these imports as missing):\n${siblingContext}\n\n${focusHint}FILE TO VALIDATE: ${file.filePath}\n${file.fileContent}`
            : `${focusHint}FILE: ${file.filePath}\n\n${file.fileContent}`;
        } else {
          // Bare minimum — just validate the file, no extra context.
          userContent = `FILE: ${file.filePath}\n\n${file.fileContent}`;
        }

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
          `   ${statusEmoji} [Validation Node][${state.ticketId}] ${fileTag} ${file.filePath}: ${fileCriticals.length} critical, ${fileWarnings.length} warnings`,
        );

        validationResults.set(file.filePath, {
          filePath: file.filePath,
          criticalErrors: fileCriticals,
          warnings: fileWarnings,
          needsWork:
            fileCriticals.length > 0 || (!isLenient && fileWarnings.length > 0),
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `   ❌ [Validation Node][${state.ticketId}] ${fileTag} Failed to validate ${file.filePath}: ${errMsg}`,
        );
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

    // Merge cross-file import errors into LLM validation results.
    // Cross-file errors are deterministic and always correct — they are prepended
    // so the engineer sees them first (before any LLM-generated errors).
    for (const [filePath, cfErrors] of crossFileErrorMap) {
      const existing = validationResults.get(filePath);
      if (existing) {
        existing.criticalErrors = [...cfErrors, ...existing.criticalErrors];
        existing.needsWork = true;
      } else {
        // File failed LLM validation entirely (timeout) — still surface CF errors
        validationResults.set(filePath, {
          filePath,
          criticalErrors: cfErrors,
          warnings: [],
          needsWork: true,
        });
      }
    }

    // Convert map to array for final processing
    const fileResults = Array.from(validationResults.values());

    // In lenient mode (round ≥ WARNING_LENIENCY_ROUND), files that failed ONLY due
    // to API timeouts are accepted as-is. The engineer already inline-validated them
    // up to 3 times — a persistent API timeout is not a code bug and cannot be fixed
    // by regenerating the file. Clearing these prevents an infinite timeout loop.
    const isTimeoutOnly = (r: { criticalErrors: string[] }) =>
      r.criticalErrors.length > 0 &&
      r.criticalErrors.every((e) => e.includes("Validation process failed"));

    const effectiveResults = isLenient
      ? fileResults.map((r) =>
          isTimeoutOnly(r) ? { ...r, criticalErrors: [], needsWork: false } : r,
        )
      : fileResults;

    if (isLenient) {
      const accepted = fileResults.filter(isTimeoutOnly);
      if (accepted.length > 0) {
        console.log(
          `   ⏭️ [Validation Node][${state.ticketId}] Lenient mode: accepting ${accepted.length} timeout-only file(s) as-is: ${accepted.map((r) => r.filePath).join(", ")}`,
        );
      }
    }

    // Merge per-file results
    const criticalErrors = effectiveResults.flatMap((r) => r.criticalErrors);
    const warnings = effectiveResults.flatMap((r) => r.warnings);
    const filesNeedingRevision = effectiveResults
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

      // Split errors at source: real TypeScript bugs vs system timeouts/crashes.
      // EM receives only realErrors so it doesn't hallucinate infrastructure fixes
      // for what are actually transient system retries.
      const systemErrors = criticalErrors.filter(
        (e) => e.includes("Validation process failed") || e.includes("timeout"),
      );
      const realErrors = criticalErrors.filter(
        (e) => !systemErrors.includes(e),
      );

      // Identify failing files. Seed directly from filesNeedingRevision — timeout-
      // failing file paths cannot be extracted from error strings (the message
      // "Validation process failed" contains no path). Also parse real error strings
      // for any additional path precision from TypeScript error formatting.
      const failingFiles = new Set<string>(filesNeedingRevision);
      realErrors.forEach((err) => {
        const match = err.match(/\]\s+([@a-zA-Z0-9_\-\/.]+)(?::|\s-)/);
        if (match && match[1]) {
          failingFiles.add(match[1].trim());
        }
      });

      surgicalContext = {
        failingFilePaths: Array.from(failingFiles),
        errorLogs: realErrors,
        systemErrors,
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

    // Store progress for the 5-min periodic logger in the webhook
    const totalFiles = generatedCode?.length ?? 0;
    const passedFiles = totalFiles - filesNeedingRevision.length;
    await setValidationProgress(
      state.ticketId,
      passedFiles,
      totalFiles,
      currentRound,
    );

    return {
      needsRevision,
      validationErrors: [...criticalErrors, ...warnings],
      validationWarnings: warnings,
      filesNeedingRevision,
      surgicalContext, // Update or clear
      checkpointFiles, // Store or keep
      featureList: surgicalContext ? featureList : state.featureList, // Mask if surgical, else keep original
      metrics: {
        nodeExecutionTimes: {
          [`validationNode_r${currentRound}_retry${currentRetry}`]: duration,
        },
        nodeTokenUsage: {
          [`validationNode_r${currentRound}_retry${currentRetry}`]: tokenUsage,
        },
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

    // Absorb catastrophic failures within the node — mark all files as needing
    // revision and let the normal engineer retry flow handle recovery.
    const crashedFilePaths = (filesToValidate ?? []).map((f) => f.filePath);
    const crashError = `Validation system error: ${errMsg}`;

    return {
      needsRevision: true,
      validationErrors: [crashError],
      validationWarnings: [],
      filesNeedingRevision: crashedFilePaths,
      metrics: {
        totalRounds: currentRound,
        nodeCallCounts: {
          validationNode: 1,
        },
      },
    };
  }
}
