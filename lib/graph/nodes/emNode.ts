import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  EM_SYSTEM_PROMPT,
  EM_SURGICAL_SYSTEM_PROMPT,
  getEMUserPrompt,
} from "../prompts/emPrompts";
import { ExecutionPlanSchema } from "../schema";
import { extractTokenUsage } from "../metrics-utils";

/**
 * The Engineering Manager (EM) Agent node.
 * Responsibilities:
 * 1. Receive the Feature List from PM.
 * 2. Analyze Architecture Profile.
 * 3. Generate a strict Technical Contract (Execution Plan).
 */
export async function emNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { featureList, architectureProfile, codebaseTree, surgicalContext } =
    state;

  const mode = surgicalContext ? "SURGICAL" : "STANDARD";
  console.log(
    `\n👷 [EM Node] Drafting Technical Contract (${mode} MODE) for ${featureList?.featureList?.length || 0} features...`,
  );

  // Initialize the Gemini model (using Pro as requested)
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // includeRaw: true returns { raw: BaseMessage, parsed: T } so we can read
  // usage_metadata from result.raw — same approach as validationNode/engineerNode.
  const structuredModel = model.withStructuredOutput(ExecutionPlanSchema, {
    name: "create_technical_contract",
    includeRaw: true,
  });

  // Extract likely components from codebaseTree
  // Assuming codebaseTree is a string representation of file structure
  const existingComponents = codebaseTree
    ? codebaseTree
        .split("\n")
        .filter(
          (line) =>
            line.includes("components/") ||
            line.includes(".tsx") ||
            line.includes(".jsx") ||
            line.includes(".vue") ||
            line.includes(".py"), // Covers various frameworks
        )
        .join("\n")
    : "No existing components detected.";

  // System prompt
  const systemPrompt = surgicalContext
    ? EM_SURGICAL_SYSTEM_PROMPT + "\n\n" + EM_SYSTEM_PROMPT // Append standard prompt for context if needed, or just replace
    : EM_SYSTEM_PROMPT;

  // User prompt
  const userPrompt = getEMUserPrompt(
    featureList?.featureList || [],
    architectureProfile!,
    existingComponents,
    surgicalContext,
  );

  console.log(
    `[EM Node][${state.ticketId}] Sending Prompt to LLM:`,
    JSON.stringify({ systemPrompt, userPrompt }, null, 2),
  );

  // Generate the execution plan
  const { raw, parsed: result } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

  if (!result) {
    throw new Error(
      `[EM Node][${state.ticketId}] Structured output returned null — model failed to conform to ExecutionPlan schema. Raw response type: ${raw?.constructor?.name ?? "unknown"}.`,
    );
  }

  console.log(`✅ [EM Node][${state.ticketId}] Technical Contract Generated:`);
  console.log(`   Scope: ${result.featureScope}`);
  console.log(
    `   Files to Create: ${result.newFilesToCreate?.join(", ") || "None"}`,
  );
  console.log(
    `   Files to Modify: ${result.filesToModify?.join(", ") || "None"}`,
  );

  const duration = Date.now() - startTime;
  console.log(`⏱️ [EM Node][${state.ticketId}] Completed in ${duration}ms`);

  // Generate the execution plan summary for state persistence
  const planSummary = (result.newFilesToCreate || [])
    .map((f) => `- NEW FILE: ${f}`)
    .concat((result.filesToModify || []).map((f) => `- MODIFY: ${f}`))
    .join("\n");

  const implementationSummary = `STRATEGY: ${result.implementationInstructions}`;

  const fullExecutionPlan = `${planSummary}\n\n${implementationSummary}`;

  // Return the updated state
  // If this was a surgical escalation, reset the round counter so the engineer
  // starts fresh on the narrow surgical scope (round 1), and clear revision flags.
  // totalRoundCount is NOT reset — it is the monotonic hard cap counter.
  const isSurgical = !!surgicalContext;

  return {
    executionPlan: result,
    fullExecutionPlan,
    ...(isSurgical && {
      roundCount: 0,
      needsRevision: false,
      errorAttemptHistory: [],
    }),
    metrics: {
      nodeExecutionTimes: {
        emNode: duration,
      },
      nodeTokenUsage: {
        emNode: tokenUsage,
      },
      nodeCallCounts: {
        emNode: 1,
      },
    },
  };
}
