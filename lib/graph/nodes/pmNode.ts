import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { PM_SYSTEM_PROMPT, getPMUserPrompt } from "../prompts/pmPrompts";
import { FeatureListSchema } from "../schema";
import { createTokenUsageCallback } from "../metrics-utils";

/**
 * The Product Manager (PM) Agent node.
 * Responsibilities:
 * 1. Review the Jira ticket.
 * 2. Extract requirements into a feature list.
 */
export async function pmNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { ticketSummary, ticketDescription, architectureProfile } = state;

  console.log(
    `\n🧠 [PM Node] Starting analysis for ticket (ID: ${state.ticketId}):`,
    state.ticketSummary,
  );

  // Initialize the Gemini model (using Flash as requested)
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // Create a structured output model
  const structuredModel = model.withStructuredOutput(FeatureListSchema, {
    name: "extract_feature_list",
  });

  // System prompt
  const systemPrompt = PM_SYSTEM_PROMPT;

  // User prompt
  const userPrompt = getPMUserPrompt(
    ticketSummary,
    ticketDescription,
    architectureProfile,
  );

  console.log(
    `[PM Node][${state.ticketId}] Sending Prompt to LLM:`,
    JSON.stringify({ systemPrompt, userPrompt }, null, 2),
  );

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const TokenHandler = createTokenUsageCallback(tokenUsage);

  // Generate the feature list
  const result = await structuredModel.invoke(
    [
      ["system", systemPrompt],
      ["user", userPrompt],
    ],
    {
      callbacks: [new TokenHandler()],
    },
  );

  console.log(`✅ [PM Node][${state.ticketId}] Feature List Generated:`);
  console.log(`   Scope: ${result.featureScope}`);
  console.log(`   Features: ${result.featureList.length} items`);
  result.featureList.forEach((f) => console.log(`     - ${f}`));

  const duration = Date.now() - startTime;
  console.log(`⏱️ [PM Node][${state.ticketId}] Completed in ${duration}ms`);

  // Return the updated state
  return {
    featureList: result,
    metrics: {
      nodeExecutionTimes: {
        pmNode: duration,
      },
      nodeTokenUsage: {
        pmNode: tokenUsage,
      },
      nodeCallCounts: {
        pmNode: 1,
      },
    },
  };
}
