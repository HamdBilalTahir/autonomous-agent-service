import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { PM_SYSTEM_PROMPT, getPMUserPrompt } from "../prompts/pmPrompts";
import { FeatureListSchema } from "../schema";
import { extractTokenUsage } from "../metrics-utils";
import { setPipelineState } from "../../pipeline-state";

/**
 * The Product Manager (PM) Agent node.
 * Responsibilities:
 * 1. Review the Jira ticket.
 * 2. Extract requirements into a feature list.
 */
export async function pmNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  await setPipelineState(state.ticketId, state.ticketSummary, "pmNode");
  const {
    ticketSummary,
    ticketDescription,
    architectureProfile,
    codebaseTree,
  } = state;

  console.log(
    `\n🧠 [PM Node] Starting analysis for ticket (ID: ${state.ticketId}):`,
    state.ticketSummary,
  );

  // Initialize the Gemini model (using Pro for holistic product reasoning)
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const structuredModel = model.withStructuredOutput(FeatureListSchema, {
    name: "extract_feature_list",
    includeRaw: true,
  });

  // System prompt
  const systemPrompt = PM_SYSTEM_PROMPT;

  // User prompt
  const userPrompt = getPMUserPrompt(
    ticketSummary,
    ticketDescription,
    architectureProfile,
    codebaseTree,
  );

  console.log(
    `[PM Node][${state.ticketId}] Sending prompt to LLM — system: ${systemPrompt.length} chars, user: ${userPrompt.length} chars`,
  );

  // Generate the feature list
  const { raw, parsed: result } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

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
