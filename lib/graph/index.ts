import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { pmNode } from "./nodes/pmNode";
import { emNode } from "./nodes/emNode";
import { updateJiraMetadataNode } from "./nodes/updateJiraMetadataNode";
import { designNode } from "./nodes/designNode";
import { frontendEngineerNode } from "./nodes/frontendEngineerNode";
import { validationNode } from "./nodes/validationNode";
import { architectureNode } from "./nodes/architectureNode";
import { triageNode } from "./nodes/triageNode";
import { createPrNode } from "./nodes/createPrNode";
import { updateJiraStatusNode } from "./nodes/updateJiraStatusNode";

/**
 * Resolves the engineer node name from the execution plan's engineerType.
 * To add a new engineer:
 *   1. Create the node (e.g. backendEngineerNode) using createEngineerNode()
 *   2. Add .addNode("backendEngineerNode", backendEngineerNode) below
 *   3. Append "backendEngineerNode" to each ENGINEER_TARGETS array below
 */
function getEngineerNodeName(state: typeof AgentState.State): string {
  return `${state.executionPlan?.engineerType ?? "frontend"}EngineerNode`;
}

// All valid engineer node names — update when new engineers are registered
const ENGINEER_TARGETS = ["frontendEngineerNode"] as const;

/**
 * Determine the next step based on validation results.
 * - Code issues (needsRevision): send back to Engineer to fix.
 * - Escalation: 5+ rounds with critical failures → Engineering Manager for surgical fix.
 * - Success: proceed to PR creation.
 * Crashes are absorbed within validationNode — needsRevision:true routes to Engineer automatically.
 */
function shouldContinue(state: typeof AgentState.State) {
  // Hard cap — use totalRoundCount (never resets across EM surgical passes)
  // roundCount resets to 0 after each EM escalation; totalRoundCount is monotonic.
  if ((state.totalRoundCount ?? 0) >= 15) {
    console.error(
      `🛑 [Graph][${state.ticketId}] Hard round cap reached (total: ${state.totalRoundCount}). Terminating.`,
    );
    return "createPrNode";
  }

  // Success — passing code goes forward
  if (!state.needsRevision) {
    console.log(
      `✅ [Graph][${state.ticketId}] Validation passed. Proceeding to PR creation.`,
    );
    return "createPrNode";
  }

  // Escalation — only when there are ACTUAL critical failures after 5+ rounds
  if ((state.roundCount ?? 0) >= 5) {
    console.log(
      `🚨 [Graph][${state.ticketId}] Max rounds (${state.roundCount}) exceeded with critical failures. Escalating to Engineering Manager for surgical fix.`,
    );
    return "emNode";
  }

  // Code bugs or absorbed system errors → back to Engineer
  console.log(
    `🔄 [Graph][${state.ticketId}] Sending back to Engineer (needsRevision: ${state.needsRevision}).`,
  );
  return getEngineerNodeName(state);
}

/**
 * After EM runs, route based on mode:
 * - Surgical escalation (surgicalContext present): skip Design, go directly to Engineer
 * - Standard PM planning flow: go through Design as normal
 */
function routeFromEM(state: typeof AgentState.State) {
  if (state.surgicalContext) {
    console.log(
      `🔀 [Graph][${state.ticketId}] EM surgical escalation — bypassing Design, routing directly to Engineer.`,
    );
    return getEngineerNodeName(state);
  }
  return "designNode";
}

/**
 * Split execution after Triage.
 * High/Medium → full planning pipeline (PM → EM → Design → Engineer).
 * Low → directly to Engineer (no planning needed).
 */
function splitPath(state: typeof AgentState.State) {
  const complexity = state.ticketClassification?.complexity;

  if (complexity === "High" || complexity === "Medium") {
    console.log(
      "🚦 [Graph] Complex ticket detected. Routing to Project Manager.",
    );
    return "pmNode";
  }

  console.log("⏩ [Graph] Low complexity detected. Fast-tracking to Engineer.");
  return getEngineerNodeName(state);
}

// Initialize the graph with the state definition
const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("architectureNode", architectureNode)
  .addNode("triageNode", triageNode)
  .addNode("updateJiraMetadataNode", updateJiraMetadataNode)
  .addNode("pmNode", pmNode)
  .addNode("emNode", emNode)
  .addNode("designNode", designNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
  // To add backendEngineerNode: .addNode("backendEngineerNode", backendEngineerNode)
  .addNode("validationNode", validationNode)
  .addNode("createPrNode", createPrNode)
  .addNode("updateJiraStatusNode", updateJiraStatusNode)
  // Define edges
  .addEdge(START, "architectureNode")
  .addEdge("architectureNode", "triageNode")
  // Triage -> Jira Update (Unconditional)
  .addEdge("triageNode", "updateJiraMetadataNode")
  // Jira Update -> Planning/Execution (Conditional)
  .addConditionalEdges("updateJiraMetadataNode", splitPath, [
    "pmNode",
    ...ENGINEER_TARGETS,
  ])
  // Planning Branch
  .addEdge("pmNode", "emNode")
  // After EM: surgical escalation skips Design and goes directly to Engineer;
  // standard PM flow continues through Design as normal
  .addConditionalEdges("emNode", routeFromEM, [
    "designNode",
    ...ENGINEER_TARGETS,
  ])
  // Design feeds into the engineer selected by the EM
  .addConditionalEdges("designNode", getEngineerNodeName, [...ENGINEER_TARGETS])
  .addEdge("frontendEngineerNode", "validationNode")
  // To add backendEngineerNode: .addEdge("backendEngineerNode", "validationNode")
  .addConditionalEdges("validationNode", shouldContinue, [
    ...ENGINEER_TARGETS,
    "emNode",
    "createPrNode",
  ])
  // Success Branch -> Create PR -> Update Jira -> End
  .addEdge("createPrNode", "updateJiraStatusNode")
  .addEdge("updateJiraStatusNode", END);

// Compile the graph
export const graph = workflow.compile();
