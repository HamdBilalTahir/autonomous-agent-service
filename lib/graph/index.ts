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
 */
function shouldContinue(state: typeof AgentState.State) {
  if (state.needsRevision) {
    return "frontendEngineerNode";
  }
  return END;
}

/**
 * Route the ticket based on complexity.
 */
function routeTicket(state: typeof AgentState.State) {
  if (state.ticketClassification?.complexity === "Low") {
    // Fast path: Skip PM and Design
    return "updateJiraMetadataNode";
  }
  // Full path: Continue to PM
  return "pmNode";
}

// Initialize the graph with the state definition
const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("architectureNode", architectureNode)
  .addNode("triageNode", triageNode)
  .addNode("pmNode", pmNode)
  .addNode("updateJiraMetadataNode", updateJiraMetadataNode)
  .addNode("designNode", designNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
  .addNode("validationNode", validationNode)
  // Define edges
  .addEdge(START, "architectureNode")
  .addEdge("architectureNode", "triageNode")
  .addConditionalEdges("triageNode", routeTicket)
  // Parallel execution: PM triggers both Design and Jira Update
  .addEdge("pmNode", "designNode")
  .addEdge("pmNode", "updateJiraMetadataNode")
  // Sync point: Engineer waits for Design and Jira Update (implicit join)
  .addEdge("designNode", "frontendEngineerNode")
  .addEdge("updateJiraMetadataNode", "frontendEngineerNode")
  .addEdge("frontendEngineerNode", "validationNode")
  .addConditionalEdges("validationNode", shouldContinue);

// Compile the graph
export const graph = workflow.compile();
