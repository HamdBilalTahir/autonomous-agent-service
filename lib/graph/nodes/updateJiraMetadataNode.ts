import { AgentState } from "../state";
import { JiraService } from "../../jira";
import { setCached } from "../../cache";

/**
 * Updates the Jira ticket with priority and story points
 * immediately after the PM analysis is complete.
 */
export async function updateJiraMetadataNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { ticketId, ticketClassification } = state;

  if (!ticketId) {
    console.warn(
      `[Update Jira Node][${ticketId}] No ticket ID found in state. Available keys: ${Object.keys(state).join(", ")}`,
    );
    return { jiraMetadataUpdated: true };
  }

  if (!ticketClassification) {
    console.warn(
      `[Update Jira Node][${ticketId}] No classification found in state. Skipping update.`,
    );
    return { jiraMetadataUpdated: true };
  }

  const { priority, storyPoints } = ticketClassification;

  if (!priority && storyPoints === undefined) {
    console.log(
      `[Update Jira Node][${ticketId}] No priority or story points to update. Skipping.`,
    );
    return { jiraMetadataUpdated: true };
  }

  console.log(
    `[Update Jira Node][${ticketId}] Updating ticket ${ticketId} with Priority: ${priority}, Story Points: ${storyPoints}`,
  );

  try {
    // Set a short-lived cache key to signal that this update is coming from the agent.
    // The webhook handler will check this key to ignore the resulting "issue_updated" event.
    // TTL: 60 seconds should be enough for the webhook to arrive.
    await setCached(`agent_update:${ticketId}`, "true", 60);

    const jira = new JiraService(
      process.env.JIRA_BASE_URL || "",
      process.env.JIRA_EMAIL || "",
      process.env.JIRA_API_TOKEN || "",
    );

    await jira.updateTicketMetadata(ticketId, {
      priority,
      storyPoints,
    });

    console.log(
      `[Update Jira Node][${ticketId}] Successfully updated Jira metadata.`,
    );
  } catch (error) {
    console.error(
      `[Update Jira Node][${ticketId}] Failed to update Jira metadata:`,
      error,
    );
    // We don't want to fail the whole workflow if Jira update fails, just log it.
  }

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Update Jira Node][${ticketId}] Completed in ${duration}ms`);

  return {
    jiraMetadataUpdated: true,
    metrics: {
      nodeExecutionTimes: {
        updateJiraMetadataNode: duration,
      },
      nodeCallCounts: {
        updateJiraMetadataNode: 1,
      },
    },
  };
}
