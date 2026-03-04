import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import type { ArchitectureProfile } from "../schema";
import { extractTokenUsage } from "../metrics-utils";
import { withConcurrency } from "../concurrency";
import { verifyImports } from "../import-guard";
import {
  ExecutionPlanSchema,
  ValidationSchema,
  FilePatchSchema,
} from "../schema";
import { getValidationSystemPrompt } from "../prompts/validationPrompts";
import { checkTsSyntax } from "../ts-syntax-check";
import { setPipelineState } from "../../pipeline-state";

const MAX_FILE_ATTEMPTS = 3;
const INLINE_VALIDATION_TIMEOUT_MS = 300_000;
const INLINE_VALIDATION_SIZE_LIMIT = 10_000; // chars — files larger than this skip inline LLM validation

/**
 * Errors that indicate a cross-file structural issue (wrong import path, duplicate interface,
 * sibling mismatch). Patch mode cannot fix these — they require a full regen with sibling context.
 */
const CROSS_FILE_PATTERN =
  /sibling|defined in|exports? from|import path|incorrect import|duplicate (interface|type|definition)|single source of truth/i;

/**
 * Extract the first 30 export lines from a file, used to build sibling context
 * that is injected into the engineer's prompt during targeted fix rounds.
 */
function extractExportSigs(filePath: string, content: string): string {
  const lines = content.split("\n").filter((l) => /^\s*export\s/.test(l));
  return `[${filePath}]\n${lines.slice(0, 30).join("\n")}`;
}

// ─── Public config interface ──────────────────────────────────────────────────

export interface EngineerConfig {
  /**
   * Short label used in all log lines, e.g. "frontend", "backend", "ai".
   */
  engineerType: string;

  /**
   * Returns the system prompt for a single file.
   */
  getSystemPrompt: (
    filePath: string,
    projectContext: string,
    designSpecs?: string,
    codebaseTree?: string,
    architectureProfile?: ArchitectureProfile,
    installedPackages?: string[],
  ) => string;

  /**
   * Returns the user prompt for a single file generation.
   */
  getUserPrompt: (
    featureScope: string,
    implementationInstructions: string,
    filePath: string,
    fullExecutionPlan: string,
    currentErrors?: string[],
    errorHistory?: string[][],
    cleanFiles?: string[],
    roundNumber?: number,
    surgicalMode?: boolean,
    previousContent?: string,
  ) => string;

  /**
   * Returns the user prompt for a surgical patch attempt.
   * Defaults to a generic search-replace patch prompt if omitted.
   */
  getPatchPrompt?: (
    filePath: string,
    contextSections: string,
    issues: string[],
  ) => string;

  /**
   * Override the model used for generation. Defaults to gemini-3.1-pro-preview.
   */
  modelName?: string;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Default patch prompt used when config.getPatchPrompt is not provided.
 */
function defaultGetPatchPrompt(
  filePath: string,
  contextSections: string,
  issues: string[],
): string {
  return `Fix specific issues in ${filePath}. Do NOT rewrite the file.

For each issue, output a patch with:
- oldCode: the exact string currently in the file (copy character-for-character)
- newCode: the replacement string
- reason: one-line explanation

FILE CONTEXT (imports + problem sections with line numbers):
\`\`\`tsx
${contextSections}
\`\`\`

ISSUES TO FIX:
${issues.map((e) => `- ${e}`).join("\n")}

Rules:
- oldCode must be an exact substring of the shown file content — copy it verbatim including whitespace
- Only change what is needed to fix the listed issues
- If a fix requires a new import, replace the relevant existing import lines in one patch
- Do not touch unrelated code`;
}

/**
 * Extract a context string from file content: always includes the first 15 lines
 * (imports), plus ±windowSize lines around each error's reported line number.
 */
function extractContextWindows(
  content: string,
  errors: string[],
  windowSize = 15,
): string {
  const lines = content.split("\n");
  const include = new Set<number>();

  for (let i = 0; i < Math.min(15, lines.length); i++) include.add(i);

  for (const err of errors) {
    const m = err.match(/:(\d+)[\s\-:]/);
    if (m) {
      const ln = parseInt(m[1], 10) - 1;
      for (
        let i = Math.max(0, ln - windowSize);
        i < Math.min(lines.length, ln + windowSize + 1);
        i++
      )
        include.add(i);
    }
  }

  const sorted = [...include].sort((a, b) => a - b);
  let out = "";
  let prev = -2;
  for (const i of sorted) {
    if (i > prev + 1) out += "\n...\n";
    out += `${i + 1}: ${lines[i]}\n`;
    prev = i;
  }
  return out;
}

/**
 * Apply text-based search-replace patches to file content.
 */
function applyPatches(
  content: string,
  patches: { oldCode: string; newCode: string; reason: string }[],
): { result: string; applied: number; skipped: number } {
  let result = content;
  let applied = 0;
  let skipped = 0;
  for (const p of patches) {
    if (result.includes(p.oldCode)) {
      result = result.replace(p.oldCode, p.newCode);
      applied++;
    } else {
      skipped++;
      console.warn(
        `  [Patch] Could not find: "${p.oldCode.substring(0, 60).replace(/\n/g, "↵")}…"`,
      );
    }
  }
  return { result, applied, skipped };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a LangGraph-compatible engineer node function from a config object.
 * All generation, patch, and inline-validation logic lives here once.
 * Engineers only need to supply their prompts (and optionally a model override).
 *
 * Example:
 *   export const frontendEngineerNode = createEngineerNode({
 *     engineerType: "frontend",
 *     getSystemPrompt: getFrontendEngineerSystemPrompt,
 *     getUserPrompt:   getFrontendEngineerUserPrompt,
 *     getPatchPrompt,
 *   });
 */
export function createEngineerNode(config: EngineerConfig) {
  const label = `${config.engineerType} Engineer`;
  const resolvedPatchPrompt = config.getPatchPrompt ?? defaultGetPatchPrompt;

  return async function engineerNode(state: typeof AgentState.State) {
    const startTime = Date.now();
    await setPipelineState(
      state.ticketId,
      state.ticketSummary,
      "frontendEngineerNode",
    );
    const {
      executionPlan,
      projectContext,
      architectureProfile,
      designSpecifications,
      validationErrors,
      needsRevision,
      roundCount,
      totalRoundCount,
      generatedCode: existingCode,
      errorAttemptHistory,
      fullExecutionPlan: stateFullExecutionPlan,
      surgicalContext,
      checkpointFiles,
    } = state;

    const nextRound = (roundCount ?? 0) + 1;
    const nextTotalRound = (totalRoundCount ?? 0) + 1;
    let filesToGenerate: string[] = [];
    let isTargetedFix = false;

    const model = new ChatGoogleGenerativeAI({
      model: config.modelName ?? "gemini-3.1-pro-preview",
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0,
    });

    const validationModel = new ChatGoogleGenerativeAI({
      model: "gemini-3.1-pro-preview",
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0,
    });
    const structuredValidationModel = validationModel.withStructuredOutput(
      ValidationSchema,
      { name: "validate_code", includeRaw: true },
    );

    const patchModel = model.withStructuredOutput(FilePatchSchema, {
      name: "generate_file_patches",
      includeRaw: true,
    });

    // Low Complexity / No Plan fallback
    let effectiveExecutionPlan = executionPlan;

    if (!executionPlan && !needsRevision) {
      console.log(
        `ℹ️ [${label}][${state.ticketId}] No Execution Plan. Generating lightweight plan (Low Complexity)...`,
      );

      const structuredModel = model.withStructuredOutput(ExecutionPlanSchema, {
        name: "create_lightweight_plan",
      });

      const planPrompt = `
You are a Senior ${label.replace("Engineer", "").trim()} Engineer handling a Low Complexity task.
The user request is: "${state.ticketDescription}"

Codebase Structure:
${state.codebaseTree}

Identify the files that need to be created or modified to fulfill this request.
Generate a concise Execution Plan.
`;
      try {
        const result = await structuredModel.invoke([["user", planPrompt]]);
        effectiveExecutionPlan = {
          ...result,
          engineerType: result.engineerType ?? "frontend",
        };
        console.log(
          `✅ [${label}][${state.ticketId}] Lightweight Plan Generated:`,
        );
        console.log(
          `   Files to Create: ${result.newFilesToCreate?.join(", ") || "None"}`,
        );
        console.log(
          `   Files to Modify: ${result.filesToModify?.join(", ") || "None"}`,
        );
      } catch (e) {
        console.error(
          `❌ [${label}][${state.ticketId}] Failed to generate lightweight plan.`,
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
        `🚑 [${label}][${state.ticketId}] SURGICAL MODE (Round ${nextRound}). Fixing: ${filesToGenerate.join(", ")}`,
      );
    } else if (needsRevision) {
      isTargetedFix = true;
      const revisionFiles = state.filesNeedingRevision;
      if (revisionFiles && revisionFiles.length > 0) {
        filesToGenerate = revisionFiles;
      } else {
        console.warn(
          `⚠️ [${label}][${state.ticketId}] No filesNeedingRevision found. Regenerating all files.`,
        );
        filesToGenerate = allFiles;
        isTargetedFix = false;
      }
      console.log(
        `🛠️ [${label}][${state.ticketId}] Targeted Fix (Round ${nextRound}): ${filesToGenerate.join(", ")}`,
      );
    } else {
      filesToGenerate = allFiles;
      console.log(
        `🚀 [${label}][${state.ticketId}] Initial Code Generation (Round ${nextRound}).`,
      );
    }

    console.log(
      `\n💻 [${label}][${state.ticketId}] Starting generation (Round ${nextRound})...`,
    );

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

    // Build an import-relevant tree slice for the engineer's system prompt.
    // The full tree is injected into every concurrent file generation call, so
    // an uncapped 500-file project would add ~15k chars × 20 files = 300k extra
    // tokens. We only need the paths the engineer will import from — not pages,
    // API routes, or config files.
    //
    // Priority buckets (highest → lowest):
    //   1. components/ui/ & components/shared/  — UI primitives the engineer can import
    //   2. hooks/                               — custom hooks to reuse, not reinvent
    //   3. lib/ / utils/ / constants/           — helper utilities
    //   4. types/ / store/ / context/ / services/ — type defs & state
    //   5. app/ pages (page.tsx / layout.tsx)   — routing awareness, duplicate prevention
    // API routes (app/api/) and config files are excluded entirely.
    const cappedCodebaseTree = (() => {
      if (!state.codebaseTree) return undefined;
      const lines = state.codebaseTree.split("\n").filter((l) => l.trim());

      const bucket1 = lines.filter(
        (l) => l.includes("components/ui/") || l.includes("components/shared/"),
      );
      const bucket2 = lines.filter(
        (l) => l.includes("hooks/") || l.includes("/hooks/"),
      );
      const bucket3 = lines.filter(
        (l) =>
          l.includes("/lib/") ||
          l.includes("/utils/") ||
          l.includes("/constants/"),
      );
      const bucket4 = lines.filter(
        (l) =>
          l.includes("/types/") ||
          l.includes("/store/") ||
          l.includes("/context/") ||
          l.includes("/services/") ||
          l.includes("/auth/") ||
          l.includes("/providers/") ||
          l.includes("/schemas/") ||
          l.includes("/actions/"),
      );
      // Pages: routing awareness and duplicate prevention, but exclude API routes
      const bucket5 = lines
        .filter(
          (l) =>
            (l.includes("page.tsx") || l.includes("layout.tsx")) &&
            !l.includes("/api/"),
        )
        .slice(0, 30);

      const seen = new Set<string>();
      const result: string[] = [];
      for (const line of [
        ...bucket1,
        ...bucket2,
        ...bucket3,
        ...bucket4,
        ...bucket5,
      ]) {
        if (!seen.has(line) && result.length < 120) {
          seen.add(line);
          result.push(line);
        }
      }
      return result.length > 0 ? result.join("\n") : undefined;
    })();

    const fullExecutionPlan =
      stateFullExecutionPlan ||
      `
NEW FILES:
${(executionPlan?.newFilesToCreate || []).join("\n")}

FILES TO MODIFY:
${(executionPlan?.filesToModify || []).join("\n")}
`;

    const validationSystemPrompt = getValidationSystemPrompt(
      projectContext,
      architectureProfile,
      effectiveExecutionPlan,
    );

    const recentErrorHistory = (errorAttemptHistory || []).slice(-3);

    let totalTokenUsage = { prompt: 0, completion: 0, total: 0 };

    const CONCURRENCY = 5;

    console.log(
      `[${label}][${state.ticketId}] Running ${uniqueFiles.length} file(s) in parallel (each with up to ${MAX_FILE_ATTEMPTS} generate→validate attempts, concurrency cap: ${CONCURRENCY})...`,
    );
    const fileResults: {
      filePath: string;
      content: string;
      usage: { prompt: number; completion: number; total: number };
    }[] = [];

    await withConcurrency(uniqueFiles, CONCURRENCY, async (filePath) => {
      const fileIndex = uniqueFiles.indexOf(filePath) + 1;
      const fileTag = `[${fileIndex}/${uniqueFiles.length}]`;

      // Design specs are visual guidelines — types, hooks, utils, and API routes
      // don't render UI and don't benefit from color/typography specifications.
      // Skipping them for non-UI files saves ~4k chars per call.
      const isUiFile =
        filePath.includes("components/") ||
        filePath.includes("page.tsx") ||
        filePath.includes("layout.tsx");

      const systemPrompt = config.getSystemPrompt(
        filePath,
        contextString,
        isUiFile ? designSpecsString : undefined,
        cappedCodebaseTree,
        architectureProfile,
        state.installedPackages,
      );

      const outerErrors = (validationErrors || []).filter((err) =>
        err.includes(filePath),
      );

      let content = "";
      let currentErrors: string[] = outerErrors;
      let previousContent: string | undefined = isTargetedFix
        ? (existingCode || []).find((f) => f.filePath === filePath)?.fileContent
        : undefined;
      let fileUsage = { prompt: 0, completion: 0, total: 0 };

      for (let attempt = 0; attempt < MAX_FILE_ATTEMPTS; attempt++) {
        // ── PATCH MODE (attempt 0 only, when we have prior content + single-file errors) ──
        // Skip patch for cross-file structural errors — import path mismatches, duplicate
        // interface definitions, and sibling mismatches cannot be fixed by patching the
        // current file in isolation; fall through to full regen with the errors as context.
        const hasCrossFileError = currentErrors.some((e) =>
          CROSS_FILE_PATTERN.test(e),
        );
        if (
          attempt === 0 &&
          previousContent &&
          currentErrors.length > 0 &&
          !hasCrossFileError
        ) {
          let patchContent: string | null = null;

          try {
            const contextSections = extractContextWindows(
              previousContent,
              currentErrors,
            );
            const patchResult = await patchModel.invoke([
              [
                "user",
                resolvedPatchPrompt(filePath, contextSections, currentErrors),
              ],
            ]);

            const patchUsage = extractTokenUsage(patchResult.raw);
            fileUsage.prompt += patchUsage.prompt;
            fileUsage.completion += patchUsage.completion;
            fileUsage.total += patchUsage.total;

            if (patchResult.parsed?.patches?.length) {
              const {
                result: patched,
                applied,
                skipped,
              } = applyPatches(previousContent, patchResult.parsed.patches);
              console.log(
                `   [${label}][${state.ticketId}] ${fileTag} ${filePath} patch: ${applied}/${applied + skipped} patches applied`,
              );

              const importErr = verifyImports(
                patched,
                effectiveExecutionPlan!,
                state.codebaseTree || "",
              );
              const syntaxErrs = importErr
                ? []
                : checkTsSyntax(filePath, patched);

              if (!importErr && syntaxErrs.length === 0) {
                patchContent = patched;
              } else {
                previousContent = patched;
                currentErrors = importErr ? [importErr] : syntaxErrs;
              }
            }
          } catch (e) {
            console.warn(
              `   [${label}][${state.ticketId}] ${filePath} patch generation failed: ${e}. Falling back to full regen.`,
            );
          }

          if (patchContent !== null) {
            try {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("patch validation timeout")),
                  INLINE_VALIDATION_TIMEOUT_MS,
                ),
              );
              const valResult = await Promise.race([
                structuredValidationModel.invoke([
                  ["system", validationSystemPrompt],
                  ["user", `FILE: ${filePath}\n\n${patchContent}`],
                ]),
                timeoutPromise,
              ]);

              const inlineUsage = extractTokenUsage(valResult.raw);
              fileUsage.prompt += inlineUsage.prompt;
              fileUsage.completion += inlineUsage.completion;
              fileUsage.total += inlineUsage.total;

              const crit = valResult.parsed.criticalErrors ?? [];
              const warn = valResult.parsed.warnings ?? [];
              const passed = crit.length === 0; // warnings accepted inline; external validator is authoritative on style

              console.log(
                `   [${label}][${state.ticketId}] ${fileTag} ${filePath} attempt 1 (patch): ${crit.length} critical, ${warn.length} warnings ${passed ? "✅" : "🔄"}`,
              );

              if (passed) {
                content = patchContent;
                break;
              }

              previousContent = patchContent;
              currentErrors = [...crit, ...warn];
            } catch {
              console.warn(
                `⚠️ [${label}][${state.ticketId}] Inline validation timeout for ${filePath} patch attempt. Proceeding.`,
              );
              content = patchContent;
              break;
            }
          }

          continue; // proceed to attempt 1 (full regen)
        }

        // ── FULL GENERATION ──────────────────────────────────────────────────
        const isRetry =
          attempt > 0 || (needsRevision && outerErrors.length > 0);

        const rawUserPrompt = config.getUserPrompt(
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

        // Prepend sibling export signatures during targeted fix rounds so the engineer
        // knows exactly what interfaces/hooks each sibling file exports — preventing
        // it from re-generating conflicting definitions or using wrong import paths.
        const siblingExports =
          isTargetedFix && cleanFiles.length > 0
            ? (existingCode ?? [])
                .filter((f) => cleanFiles.includes(f.filePath))
                .map((f) => extractExportSigs(f.filePath, f.fileContent))
                .join("\n\n")
            : "";
        const userPrompt = siblingExports
          ? `SIBLING FILE EXPORTS (do NOT redefine these — import from these exact paths instead):\n${siblingExports}\n\n---\n${rawUserPrompt}`
          : rawUserPrompt;

        const genResult = await Promise.race([
          model.invoke([
            ["system", systemPrompt],
            ["user", userPrompt],
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Generation timeout")),
              INLINE_VALIDATION_TIMEOUT_MS,
            ),
          ),
        ]).catch((e) => {
          console.warn(
            `⚠️ [${label}][${state.ticketId}] ${fileTag} ${filePath} generation failed on attempt ${attempt + 1}: ${e instanceof Error ? e.message : e}. Skipping — external validator will retry.`,
          );
          return null;
        });

        if (!genResult) break;

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

        const importError = verifyImports(
          content,
          effectiveExecutionPlan!,
          state.codebaseTree || "",
        );
        if (importError) {
          console.log(
            `⚠️ [${label}][${state.ticketId}] ${fileTag} ${filePath} attempt ${attempt + 1}: import guard failed — ${importError}`,
          );
          currentErrors = [importError];
          previousContent = content;
          continue;
        }

        const syntaxErrors = checkTsSyntax(filePath, content);
        if (syntaxErrors.length > 0) {
          console.log(
            `⚠️ [${label}][${state.ticketId}] ${fileTag} ${filePath} attempt ${attempt + 1}: syntax check failed (${syntaxErrors.length} error(s))`,
          );
          currentErrors = syntaxErrors;
          previousContent = content;
          continue;
        }

        // Skip inline LLM validation for large files — they consistently time out
        // the 300s budget, wasting 5 minutes per file. The external validator handles
        // them via its own 3-attempt retry with progressively smaller timeouts.
        if (content.length > INLINE_VALIDATION_SIZE_LIMIT) {
          console.log(
            `⏭️ [${label}][${state.ticketId}] ${fileTag} ${filePath} — large file (${content.length} chars), skipping inline LLM validation.`,
          );
          break;
        }

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

          const inlineUsage = extractTokenUsage(validationResult.raw);
          fileUsage.prompt += inlineUsage.prompt;
          fileUsage.completion += inlineUsage.completion;
          fileUsage.total += inlineUsage.total;

          const fileCriticals = validationResult.parsed.criticalErrors ?? [];
          const fileWarnings = validationResult.parsed.warnings ?? [];
          const filePassed = fileCriticals.length === 0; // warnings accepted inline; external validator is authoritative on style

          console.log(
            `   [${label}][${state.ticketId}] ${fileTag} ${filePath} attempt ${attempt + 1}: ${fileCriticals.length} critical, ${fileWarnings.length} warnings ${filePassed ? "✅" : "🔄"}`,
          );

          if (filePassed) {
            break;
          }

          currentErrors = [...fileCriticals, ...fileWarnings];
          previousContent = content;
        } catch {
          console.warn(
            `⚠️ [${label}][${state.ticketId}] Inline validation timeout for ${filePath} attempt ${attempt + 1}. Proceeding with current content.`,
          );
          break;
        }
      }

      fileResults.push({ filePath, content, usage: fileUsage });
    });

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

    const newHistory = [
      ...recentErrorHistory,
      ...(needsRevision && (validationErrors || []).length > 0
        ? [validationErrors!]
        : []),
    ];

    const duration = Date.now() - startTime;
    console.log(`⏱️ [${label}][${state.ticketId}] Completed in ${duration}ms`);

    return {
      generatedCode,
      fullExecutionPlan,
      retryCount: 0,
      roundCount: nextRound,
      totalRoundCount: nextTotalRound,
      errorAttemptHistory: newHistory,
      filesNeedingRevision:
        uniqueFiles.length > 0
          ? uniqueFiles
          : (state.filesNeedingRevision ?? []),
      metrics: {
        nodeExecutionTimes: {
          [`${config.engineerType}EngineerNode_r${nextRound}`]: duration,
        },
        nodeTokenUsage: {
          [`${config.engineerType}EngineerNode_r${nextRound}`]: totalTokenUsage,
        },
        totalFilesGenerated: executionPlan?.newFilesToCreate?.length || 0,
        totalFilesModified: executionPlan?.filesToModify?.length || 0,
        totalRounds: nextRound,
        nodeCallCounts: {
          [`${config.engineerType}EngineerNode`]: 1,
        },
      },
    };
  };
}
