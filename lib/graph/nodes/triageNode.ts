import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { TicketClassificationSchema, ExecutionPlanSchema } from "../schema";
import {
  TRIAGE_SYSTEM_PROMPT,
  getTriageUserPrompt,
  FAST_PLANNER_SYSTEM_PROMPT,
  getFastPlannerUserPrompt,
} from "../prompts/triagePrompts";
import { extractTokenUsage } from "../metrics-utils";
/**
 * The Triage Agent node.
 * Responsibilities:
 * 1. Analyze the ticket complexity, type, and PRIORITY.
 * 2. If simple, generate a fast-track execution plan.
 * 3. Route the workflow accordingly.
 */
export async function triageNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { ticketSummary, ticketDescription, codebaseTree } = state;

  console.log(
    `\n🚦 [Triage Node] Assessing ticket complexity (ID: ${state.ticketId}):`,
    state.ticketSummary,
  );

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // 1. Classification Step
  const classifierModel = model.withStructuredOutput(
    TicketClassificationSchema,
    {
      name: "classify_ticket",
      includeRaw: true,
    },
  );

  const { raw: classifyRaw, parsed: classification } =
    await classifierModel.invoke([
      ["system", TRIAGE_SYSTEM_PROMPT],
      ["user", getTriageUserPrompt(ticketSummary, ticketDescription)],
    ]);

  const classifyUsage = extractTokenUsage(classifyRaw);
  const tokenUsage = { ...classifyUsage };

  console.log(
    `   Classification: [${classification.complexity}] ${classification.type}`,
  );
  console.log(
    `   Priority: ${classification.priority} | Story Points: ${classification.storyPoints}`,
  );
  console.log(`   Reasoning: ${classification.reasoning}`);

  let executionPlan = undefined;

  // 2. Fast Path Planning (if Low complexity)
  if (classification.complexity === "Low") {
    console.log("⚡ [Triage Node] Low complexity detected. Fast-tracking...");

    const plannerModel = model.withStructuredOutput(ExecutionPlanSchema, {
      name: "fast_plan_execution",
      includeRaw: true,
    });

    const { raw: planRaw, parsed: plan } = await plannerModel.invoke([
      ["system", FAST_PLANNER_SYSTEM_PROMPT],
      [
        "user",
        getFastPlannerUserPrompt(
          ticketSummary,
          ticketDescription,
          codebaseTree,
        ),
      ],
    ]);

    const planUsage = extractTokenUsage(planRaw);
    tokenUsage.prompt += planUsage.prompt;
    tokenUsage.completion += planUsage.completion;
    tokenUsage.total += planUsage.total;

    executionPlan = plan;

    // Ensure priority from classification is carried over to plan if not set by planner
    // (Removed as priority is no longer part of ExecutionPlanSchema)

    console.log("   Generated Fast Execution Plan.");
  }

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Triage Node] Completed in ${duration}ms`);

  return {
    ticketClassification: classification,
    executionPlan, // Will be undefined if not Low complexity
    metrics: {
      nodeExecutionTimes: {
        triageNode: duration,
      },
      nodeTokenUsage: {
        triageNode: tokenUsage,
      },
      nodeCallCounts: {
        triageNode: 1,
      },
    },
  };
}
