import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { z } from "zod";

const ValidationSchema = z.object({
  needsRevision: z.boolean().describe("Whether the code needs to be revised."),
  validationErrors: z
    .array(z.string())
    .describe("List of specific errors or issues found."),
});

/**
 * The Validation Agent node.
 * Responsibilities:
 * 1. Review the generated code against project standards and compatibility rules.
 * 2. Identify potential compilation errors or missing dependencies.
 * 3. Flag code for revision if necessary.
 */
export async function validationNode(state: typeof AgentState.State) {
  const { generatedCode, projectContext, architectureProfile } = state;

  console.log("\n🔍 [Validation Node] Starting code review...");

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
1. TypeScript syntax errors or compilation issues.
2. Missing or incorrect imports (especially relative paths).
3. Usage of dependencies not likely to be in package.json (unless standard).
4. Compliance with Project Context:
${contextString}

CRITICAL RULES:
- If the code imports a component that is not defined in the code provided or likely to exist, flag it.
- If the code uses syntax incompatible with the project's Next.js or Tailwind version, flag it.
- Be strict but fair. Minor style nits are okay, but compilation breakers are failures.

Return a JSON object with 'needsRevision' (boolean) and 'validationErrors' (string array).`;

  const result = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", codeToReview],
  ]);

  if (result.needsRevision) {
    console.log("❌ [Validation Node] Code needs revision.");
    result.validationErrors.forEach((err) => console.log(`   - ${err}`));
  } else {
    console.log("✅ [Validation Node] Code passed validation.");
  }

  return {
    needsRevision: result.needsRevision,
    validationErrors: result.validationErrors,
  };
}
