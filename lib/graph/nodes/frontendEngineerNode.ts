import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  getEngineerSystemPrompt,
  getEngineerUserPrompt,
} from "../prompts/engineerPrompts";

/**
 * The Frontend Engineer Agent node.
 * Responsibilities:
 * 1. Read the execution plan from the PM.
 * 2. Generate the code for new and modified files.
 * 3. Output the generated code objects.
 */
export async function frontendEngineerNode(state: typeof AgentState.State) {
  const {
    executionPlan,
    projectContext,
    architectureProfile,
    validationErrors,
    needsRevision,
  } = state;

  console.log("\n💻 [Engineer Node] Starting code generation...");
  if (needsRevision && validationErrors?.length > 0) {
    console.log("   ⚠️ Addressing validation errors:", validationErrors);
  }
  console.log(
    "Files to create/modify:",
    (executionPlan.newFilesToCreate || []).concat(
      executionPlan.filesToModify || [],
    ),
  );

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const generatedCode: { filePath: string; fileContent: string }[] = [];
  const allFiles = [
    ...(executionPlan.newFilesToCreate || []),
    ...(executionPlan.filesToModify || []),
  ];
  // Deduplicate
  const uniqueFiles = Array.from(new Set(allFiles));

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

  for (const filePath of uniqueFiles) {
    console.log(`Engineer Agent: Generating code for ${filePath}...`);

    const systemPrompt = getEngineerSystemPrompt(filePath, contextString);

    let userPrompt = getEngineerUserPrompt(
      executionPlan.featureScope,
      executionPlan.implementationInstructions,
      filePath,
    );

    if (needsRevision && validationErrors && validationErrors.length > 0) {
      userPrompt += `
      
VALIDATION FAILED - PLEASE FIX THESE ISSUES:
The previous code generation had the following errors. You must fix them in this new version:
${validationErrors.map((e) => `- ${e}`).join("\n")}
`;
    }

    const result = await model.invoke([
      ["system", systemPrompt],
      ["user", userPrompt],
    ]);

    let content = result.content.toString();

    // Remove markdown code blocks
    content = content.replace(/^```(?:\w+)?\n/, "").replace(/\n```$/, "");

    console.log(
      `[Engineer Node] Generated ${content.length} chars for ${filePath}`,
    );
    console.log(`[Engineer Node] Preview:\n${content.substring(0, 200)}...`);

    generatedCode.push({
      filePath,
      fileContent: content,
    });
  }

  return {
    generatedCode,
  };
}
