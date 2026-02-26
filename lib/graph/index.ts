import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { pmNode } from "./nodes/pmNode";
import { frontendEngineerNode } from "./nodes/frontendEngineerNode";

// Initialize the graph with the state definition
const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("pmNode", pmNode)
  .addNode("frontendEngineerNode", frontendEngineerNode)
  // Define edges
  .addEdge(START, "pmNode")
  .addEdge("pmNode", "frontendEngineerNode")
  .addEdge("frontendEngineerNode", END);

// Compile the graph
export const graph = workflow.compile();
