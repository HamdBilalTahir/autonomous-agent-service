import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { PM_SYSTEM_PROMPT, getPMUserPrompt } from "../prompts/pmPrompts";
import { ExecutionPlanSchema } from "../schema";

/**
 * The Product Manager (PM) Agent node.
 * Responsibilities:
 * 1. Review the Jira ticket and codebase structure.
 * 2. Decide the architecture (files to create/modify).
 * 3. Output a strict execution plan.
 */
export async function pmNode(state: typeof AgentState.State) {
  const { ticketSummary, ticketDescription, codebaseTree } = state;

  console.log(
    "\n🧠 [PM Node] Starting analysis for ticket:",
    state.ticketSummary,
  );

  // Initialize the Gemini model
  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0, // Low temperature for deterministic planning
  });

  // Create a structured output model
  const structuredModel = model.withStructuredOutput(ExecutionPlanSchema, {
    name: "create_execution_plan",
  });

  // System prompt
  const systemPrompt = PM_SYSTEM_PROMPT;

  // User prompt with context
  const userPrompt = getPMUserPrompt(
    ticketSummary,
    ticketDescription,
    codebaseTree,
  );

  console.log(
    "[PM Node] Sending Prompt to LLM:",
    JSON.stringify({ systemPrompt, userPrompt }, null, 2),
  );

  // Generate the execution plan
  const result = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  console.log("✅ [PM Node] Execution Plan Generated:");
  console.log(`   Scope: ${result.featureScope}`);
  console.log(
    `   Files to Create: ${result.newFilesToCreate?.join(", ") || "None"}`,
  );
  console.log(
    `   Files to Modify: ${result.filesToModify?.join(", ") || "None"}`,
  );
  console.log(
    `   Instructions (preview): ${result.implementationInstructions.substring(0, 200)}...`,
  );

  // Return the updated state
  return {
    executionPlan: result,
  };
}
