import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { pmNode } from "./nodes/pmNode";
import { updateJiraMetadataNode } from "./nodes/updateJiraMetadataNode";
import { designNode } from "./nodes/designNode";
import { frontendEngineerNode } from "./nodes/frontendEngineerNode";
import { validationNode } from "./nodes/validationNode";
import { architectureNode } from "./nodes/architectureNode";
import { triageNode } from "./nodes/triageNode";

/**
 * Determine the next step based on validation results.
 * Round/retry decision logic lives entirely in frontendEngineerNode.
 */
function shouldContinue(state: typeof AgentState.State) {
  // 1. Technical crash: retry validation up to 3 times, then send to engineer
  if (state.validationCrashed) {
    if ((state.validationCrashCount || 0) < 3) {
      console.log(
        `🔄 [Graph][${state.ticketId}] Validation crashed. Retrying validation (Attempt ${(state.validationCrashCount || 0) + 1}/3)...`,
      );
      return "validationNode";
    }
    console.log(
      `❌ [Graph][${state.ticketId}] Validation crashed 3 times. Sending to Engineer for new round...`,
    );
    return "frontendEngineerNode";
  }

  // 2. Code has issues — Engineer decides retry vs new round based on retryCount
  if (state.needsRevision) {
    console.log(
      `🛠️ [Graph][${state.ticketId}] Validation found issues (Round ${state.roundCount || 0}, Retry ${state.retryCount || 0}/3). Sending to Engineer...`,
    );
    return "frontendEngineerNode";
  }

  // 3. Passed validation
  console.log(`✅ [Graph][${state.ticketId}] Validation passed. Workflow complete.`);
  return END;
}

/**
 * Route the ticket based on complexity.
 * Always runs after updateJiraMetadataNode (which immediately follows triageNode).
 */
function routeTicket(state: typeof AgentState.State) {
  if (state.ticketClassification?.complexity === "Low") {
    // Fast path: Skip PM and Design, go straight to Engineer
    return "frontendEngineerNode";
  }
  // Full path: PM → Design → Engineer
  return "pmNode";
}

// Initialize the graph with the state definition
const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("architectureNode", architectureNode)
  .addNode("triageNode", triageNode)
  .addNode("updateJiraMetadataNode", updateJiraMetadataNode)
  .addNode("pmNode", pmNode)
  .addNode("designNode", designNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
  .addNode("validationNode", validationNode)
  // Define edges
  .addEdge(START, "architectureNode")
  .addEdge("architectureNode", "triageNode")
  // Jira metadata always updated immediately after triage (before routing)
  .addEdge("triageNode", "updateJiraMetadataNode")
  // Route: Low complexity → engineer directly; else → PM → Design → engineer
  .addConditionalEdges("updateJiraMetadataNode", routeTicket)
  .addEdge("pmNode", "designNode")
  .addEdge("designNode", "frontendEngineerNode")
  .addEdge("frontendEngineerNode", "validationNode")
  .addConditionalEdges("validationNode", shouldContinue);

// Compile the graph
export const graph = workflow.compile();
