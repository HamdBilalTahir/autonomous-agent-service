import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { pmNode } from "./nodes/pmNode";
import { frontendEngineerNode } from "./nodes/frontendEngineerNode";
import { validationNode } from "./nodes/validationNode";
import { architectureNode } from "./nodes/architectureNode";

/**
 * Determine the next step based on validation results.
 */
function shouldContinue(state: typeof AgentState.State) {
  if (state.needsRevision) {
    return "frontendEngineerNode";
  }
  return END;
}

// Initialize the graph with the state definition
const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("architectureNode", architectureNode)
  .addNode("pmNode", pmNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
  .addNode("validationNode", validationNode)
  // Define edges
  .addEdge(START, "architectureNode")
  .addEdge("architectureNode", "pmNode")
  .addEdge("pmNode", "frontendEngineerNode")
  .addEdge("frontendEngineerNode", "validationNode")
  .addConditionalEdges("validationNode", shouldContinue);

// Compile the graph
export const graph = workflow.compile();
