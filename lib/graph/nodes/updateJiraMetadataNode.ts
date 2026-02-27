import { AgentState } from "../state";
import { JiraService } from "../../jira";

/**
 * Updates the Jira ticket with priority and story points
 * immediately after the PM analysis is complete.
 */
export async function updateJiraMetadataNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { ticketId, executionPlan } = state;

  if (!ticketId) {
    console.warn(
      "[Update Jira Node] No ticket ID found in state. Skipping update.",
    );
    return {};
  }

  if (!executionPlan) {
    console.warn(
      "[Update Jira Node] No execution plan found in state. Skipping update.",
    );
    return {};
  }

  const { priority, storyPoints } = executionPlan;

  if (!priority && storyPoints === undefined) {
    console.log(
      "[Update Jira Node] No priority or story points to update. Skipping.",
    );
    return {};
  }

  console.log(
    `[Update Jira Node] Updating ticket ${ticketId} with Priority: ${priority}, Story Points: ${storyPoints}`,
  );

  try {
    const jira = new JiraService(
      process.env.JIRA_BASE_URL || "",
      process.env.JIRA_EMAIL || "",
      process.env.JIRA_API_TOKEN || "",
    );

    await jira.updateTicketMetadata(ticketId, {
      priority,
      storyPoints,
    });

    console.log("[Update Jira Node] Successfully updated Jira metadata.");
  } catch (error) {
    console.error("[Update Jira Node] Failed to update Jira metadata:", error);
    // We don't want to fail the whole workflow if Jira update fails, just log it.
  }

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Update Jira Node] Completed in ${duration}ms`);

  return {
    metrics: {
      nodeExecutionTimes: {
        updateJiraMetadataNode: duration,
      },
    },
  };
}
