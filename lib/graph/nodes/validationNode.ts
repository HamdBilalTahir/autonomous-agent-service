import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ValidationSchema } from "../schema";
import { createTokenUsageCallback } from "../metrics-utils";
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

  console.log(
    `\n🔍 [Validation Node][${state.ticketId}] Starting code review (Round ${currentRound}, Retry ${currentRetry})${isLenient ? " [LENIENT MODE — warnings ignored]" : ""}...`,
  );

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const structuredModel = model.withStructuredOutput(ValidationSchema, {
    name: "validate_code",
  });

  const codeToReview = generatedCode
    .map((file) => `FILE: ${file.filePath}\n\n${file.fileContent}`)
    .join("\n\n---\n\n");

  const systemPrompt = getValidationSystemPrompt(
    projectContext,
    architectureProfile,
  );

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const TokenHandler = createTokenUsageCallback(tokenUsage);

  try {
    const result = await structuredModel.invoke(
      [
        ["system", systemPrompt],
        ["user", codeToReview],
      ],
      {
        callbacks: [new TokenHandler()],
      },
    );

    const criticalErrors = result.criticalErrors ?? [];
    const warnings = result.warnings ?? [];

    const needsRevision =
      criticalErrors.length > 0 || (!isLenient && warnings.length > 0);

    if (needsRevision) {
      console.log(
        `❌ [Validation Node][${state.ticketId}] Code needs revision (${criticalErrors.length} critical, ${warnings.length} warnings).`,
      );
      criticalErrors.forEach((err) => console.log(`   [CRITICAL] ${err}`));
      warnings.forEach((w) => console.log(`   [WARNING] ${w}`));
    } else {
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
      validationCrashCount: 0,
      validationCrashed: false,
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
    console.error(`❌ [Validation Node][${state.ticketId}] CRASHED:`, error);

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
