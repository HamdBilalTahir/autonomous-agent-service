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
import { joinNode } from "./nodes/joinNode";
import { createPrNode } from "./nodes/createPrNode";
import { updateJiraStatusNode } from "./nodes/updateJiraStatusNode";

/**
 * Determine the next step based on validation results.
 * - API crash (validationCrashed): retry validation up to 3 times, then send to Engineer.
 * - Code issues (needsRevision): successful API response with bugs — send to Engineer to fix.
 * - Escalation: 5+ rounds with critical failures → Engineering Manager for surgical fix.
 */
function shouldContinue(state: typeof AgentState.State) {
  // Hard cap — prevent infinite loops
  if ((state.roundCount ?? 0) >= 15) {
    console.error(
      `🛑 [Graph][${state.ticketId}] Hard round cap reached (${state.roundCount}). Terminating.`,
    );
    return "createPrNode";
  }

  // Success always wins — even at round 5+, passing code goes forward
  if (!state.validationCrashed && !state.needsRevision) {
    console.log(
      `✅ [Graph][${state.ticketId}] Validation passed. Proceeding to PR creation.`,
    );
    return "createPrNode";
  }

  // API/technical failure: retry the validation node up to 3 times before giving up
  if (state.validationCrashed && (state.validationCrashCount ?? 0) < 3) {
    console.log(
      `🔁 [Graph][${state.ticketId}] Validation crashed (attempt ${state.validationCrashCount ?? 0}/3). Retrying validation...`,
    );
    return "validationNode";
  }

  // Escalation — only when there are ACTUAL critical failures after 5+ rounds
  if ((state.roundCount ?? 0) >= 5) {
    console.log(
      `🚨 [Graph][${state.ticketId}] Max rounds (${state.roundCount}) exceeded with critical failures. Escalating to Engineering Manager for surgical fix.`,
    );
    return "emNode";
  }

  // Code bugs found (needsRevision) OR crash retries exhausted → back to Engineer
  console.log(
    `🔄 [Graph][${state.ticketId}] Sending back to Engineer (Crash: ${state.validationCrashed}, Revision: ${state.needsRevision}).`,
  );
  return "frontendEngineerNode";
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
    return "frontendEngineerNode";
  }
  return "designNode";
}

/**
 * Split execution after Triage.
 * Branches into Planning (PM) or Fast-Track (Join).
 * Jira Update runs in parallel unconditionally.
 */
function splitPath(state: typeof AgentState.State) {
  const complexity = state.ticketClassification?.complexity;

  if (complexity === "High" || complexity === "Medium") {
    console.log(
      "🚦 [Graph] Complex ticket detected. Routing to Project Manager.",
    );
    return "pmNode";
  }

  console.log("⏩ [Graph] Low complexity detected. Routing to Join directly.");
  return "joinNode";
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
  .addNode("joinNode", joinNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
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
    "joinNode",
  ])
  // Planning Branch
  .addEdge("pmNode", "emNode")
  // After EM: surgical escalation skips Design and goes directly to Engineer;
  // standard PM flow continues through Design as normal
  .addConditionalEdges("emNode", routeFromEM, [
    "designNode",
    "frontendEngineerNode",
  ])
  .addEdge("designNode", "joinNode")
  // Join -> Engineer (via Command inside joinNode or direct edge)
  .addEdge("joinNode", "frontendEngineerNode")
  .addEdge("frontendEngineerNode", "validationNode")
  .addConditionalEdges("validationNode", shouldContinue, [
    "validationNode",
    "frontendEngineerNode",
    "emNode",
    "createPrNode",
  ])
  // Success Branch -> Create PR -> Update Jira -> End
  .addEdge("createPrNode", "updateJiraStatusNode")
  .addEdge("updateJiraStatusNode", END);

// Compile the graph
export const graph = workflow.compile();
