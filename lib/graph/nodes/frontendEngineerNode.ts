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
  const { executionPlan } = state;

  console.log("\n💻 [Engineer Node] Starting code generation...");
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

  for (const filePath of uniqueFiles) {
    console.log(`Engineer Agent: Generating code for ${filePath}...`);

    const systemPrompt = getEngineerSystemPrompt(filePath);

    const userPrompt = getEngineerUserPrompt(
      executionPlan.featureScope,
      executionPlan.implementationInstructions,
      filePath,
    );

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
