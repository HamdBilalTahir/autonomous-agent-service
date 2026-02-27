import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  getFrontendEngineerSystemPrompt,
  getFrontendEngineerUserPrompt,
} from "../prompts/frontendEngineerPrompts";
import { extractTokenUsage } from "../metrics-utils";

/**
 * The Frontend Engineer Agent node.
 * Responsibilities:
 * 1. Read the execution plan from the PM.
 * 2. Generate the code for new and modified files.
 * 3. Output the generated code objects.
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

  const designSpecsString = designSpecifications
    ? JSON.stringify(designSpecifications, null, 2)
    : undefined;

  let totalTokenUsage = { prompt: 0, completion: 0, total: 0 };

  for (const filePath of uniqueFiles) {
    console.log(`Engineer Agent: Generating code for ${filePath}...`);

    const systemPrompt = getFrontendEngineerSystemPrompt(
      filePath,
      contextString,
      designSpecsString,
    );

    let userPrompt = getFrontendEngineerUserPrompt(
      executionPlan.featureScope,
      executionPlan.implementationInstructions,
      filePath,
    );

    // Filter errors relevant to this file
    const relevantErrors =
      validationErrors?.filter((err) => err.includes(filePath)) || [];

    // If global errors exist but none specific to this file, we might still want to pass them
    // just in case, but usually path-specific is better.
    // If no path match, maybe it's a general error? Let's pass all if relevantErrors is empty but validationErrors is not?
    // Actually, let's stick to relevantErrors if possible, otherwise pass all if it seems generic.
    const errorsToPass =
      relevantErrors.length > 0
        ? relevantErrors
        : validationErrors?.filter((e) => !e.includes(":")) || [];

    if (needsRevision && errorsToPass.length > 0) {
      userPrompt += `
      
VALIDATION FAILED - PLEASE FIX THESE ISSUES:
The previous code generation had the following errors. You must fix them in this new version:
${errorsToPass.map((e) => `- ${e}`).join("\n")}

IMPORTANT: You MUST change the code to fix these errors. Do not output the exact same code again.
`;
    }

    const result = await model.invoke([
      ["system", systemPrompt],
      ["user", userPrompt],
    ]);

    const usage = extractTokenUsage(result);
    totalTokenUsage.prompt += usage.prompt;
    totalTokenUsage.completion += usage.completion;
    totalTokenUsage.total += usage.total;

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

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Engineer Node] Completed in ${duration}ms`);

  return {
    generatedCode,
    metrics: {
      nodeExecutionTimes: {
        frontendEngineerNode: duration,
      },
      nodeTokenUsage: {
        frontendEngineerNode: totalTokenUsage,
      },
      totalFilesGenerated: executionPlan.newFilesToCreate?.length || 0,
      totalFilesModified: executionPlan.filesToModify?.length || 0,
    },
  };
}
