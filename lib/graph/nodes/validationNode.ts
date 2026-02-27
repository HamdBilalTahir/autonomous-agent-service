import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { z } from "zod";
import { createTokenUsageCallback } from "../metrics-utils";

const ValidationSchema = z.object({
  needsRevision: z.boolean().describe("Whether the code needs to be revised."),
  validationErrors: z
    .array(z.string())
    .describe(
      "List of specific errors with actionable fixes. Format: '[CRITICAL|WARNING] File:Line - Error Description. Fix: Actionable Instruction'",
    ),
});

/**
 * The Validation Agent node.
 * Responsibilities:
 * 1. Review the generated code against project standards and compatibility rules.
 * 2. Identify potential compilation errors or missing dependencies.
 * 3. Flag code for revision if necessary.
 */
export async function validationNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const {
    generatedCode,
    projectContext,
    architectureProfile,
    validationAttempts,
  } = state;
  const currentAttempts = validationAttempts || 0;

  console.log(
    `\n🔍 [Validation Node] Starting code review (Attempt ${currentAttempts + 1})...`,
  );

  // MAX RETRY LIMIT: 3 attempts (increased from 2 to give more chance)
  if (currentAttempts >= 3) {
    console.warn(
      "⚠️ [Validation Node] Max validation attempts reached. Forcefully approving to prevent infinite loop.",
    );
    // In a real autonomous system, we might want to flag this for a "Senior Engineer" agent or try a different strategy.
    // For now, we stop the loop to avoid burning tokens, but we log the failure.
    return {
      needsRevision: false,
      validationErrors: [],
      validationAttempts: currentAttempts + 1,
    };
  }

  // Use architecture profile if available, otherwise fallback to raw context
  const contextString = architectureProfile
    ? `ARCHITECTURE PROFILE:
- Next.js: ${architectureProfile.nextJsVersion}
- Tailwind: ${architectureProfile.tailwindVersion}
- Styling: ${architectureProfile.stylingApproach}
- Components: ${architectureProfile.componentPatterns.join(", ")}
- API Patterns: ${architectureProfile.apiPatterns.join(", ")}
- Fonts: ${architectureProfile.fonts.join(", ")}`
    : projectContext;

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

  const systemPrompt = `You are a Senior Code Reviewer and QA Engineer.
Review the following generated code for a Next.js project.

Check for:
1. TypeScript syntax errors or compilation issues (e.g., missing props, invalid types).
2. Missing or incorrect imports (especially relative paths).
3. Usage of dependencies not likely to be in package.json (unless standard).
4. Compliance with Project Context:
${contextString}

CRITICAL RULES:
- PRIORITIZE COMPILATION ERRORS (CRITICAL) over style issues (WARNING).
- If the code imports a component that is not defined in the code provided or likely to exist, flag it.
- If the code uses syntax incompatible with the project's Next.js or Tailwind version, flag it.
- Be strict but fair. Minor style nits are okay, but compilation breakers are failures.

OUTPUT FORMAT:
For each error, provide a structured string:
"[CRITICAL] path/to/file.tsx:LineNumber - specific error message. Fix: Exact code change or instruction."
`;

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const TokenHandler = createTokenUsageCallback(tokenUsage);

  const result = await structuredModel.invoke(
    [
      ["system", systemPrompt],
      ["user", codeToReview],
    ],
    {
      callbacks: [new TokenHandler()],
    },
  );

  if (result.needsRevision) {
    console.log("❌ [Validation Node] Code needs revision.");
    result.validationErrors.forEach((err) => console.log(`   - ${err}`));
  } else {
    console.log("✅ [Validation Node] Code passed validation.");
  }

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Validation Node] Completed in ${duration}ms`);

  return {
    needsRevision: result.needsRevision,
    validationErrors: result.validationErrors,
    validationAttempts: currentAttempts + 1,
    metrics: {
      nodeExecutionTimes: {
        [`validationNode_attempt_${currentAttempts + 1}`]: duration,
      },
      nodeTokenUsage: {
        [`validationNode_attempt_${currentAttempts + 1}`]: tokenUsage,
      },
      validationRetries: currentAttempts, // 0 for first attempt
    },
  };
}
