import { Command } from "@langchain/langgraph";
import { AgentState } from "../state";

/**
 * Join Node (Sync Point)
 * Acts as a "Gatekeeper" or "Waiting Room".
 *
 * Synchronization Rules:
 * 1. Low Complexity: Bypass planning. Proceed as soon as ticketId is confirmed.
 * 2. High/Medium Complexity: Wait for full planning (Technical Contract + Design Plan).
 */
export async function joinNode(state: typeof AgentState.State) {
  const {
    ticketId,
    ticketClassification,
    executionPlan,
    designSpecifications,
  } = state;
  console.log(`[Join Node][${ticketId}] Synchronizing branches...`);

  // Basic validation to ensure we have the minimum required to code
  const hasJiraId = !!ticketId;
  const complexity = ticketClassification?.complexity;
  const isHighMed = complexity === "High" || complexity === "Medium";
  const hasPlan = !!executionPlan && !!designSpecifications;

  // We check for jiraMetadataUpdated implicitly via hasJiraId/Jira branch sync expectation
  // but strictly speaking, we check if we are ready to code.
  // The provided snippet logic:
  if (hasJiraId && (isHighMed ? hasPlan : true)) {
    console.log("✅ [Join Node] All branches merged. Releasing to Engineer.");
    return new Command({
      goto: "frontendEngineerNode",
      update: {
        // Optional status update if schema supported it
      },
    });
  }

  // Fallback: If data is missing, we wait or throw a controlled error
  console.log("⏳ [Join Node] Waiting for parallel branches...");
  return {};
}
