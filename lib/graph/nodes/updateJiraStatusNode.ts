import { AgentState } from "../state";
import { JiraService } from "../../jira";

/**
 * Updates Jira Status and adds a comment with the PR link.
 * Runs after PR creation.
 */
export async function updateJiraStatusNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const { ticketId, prUrl } = state;

  if (!prUrl) {
    console.error(`[Update Jira Status Node][${ticketId}] Missing PR URL.`);
    return {};
  }

  console.log(
    `[Update Jira Status Node][${ticketId}] Updating status and linking PR...`,
  );

  const jira = new JiraService(
    process.env.JIRA_BASE_URL || "",
    process.env.JIRA_EMAIL || "",
    process.env.JIRA_API_TOKEN || "",
  );

  try {
    // 1. Add Comment with PR Link
    const commentBody = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "🤖 AI Agent Update\n\nThe code generation for this ticket is complete.\n\n👉 ",
            },
            {
              type: "text",
              text: "Review the Pull Request Here",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: prUrl,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    console.log(`[Update Jira Status Node][${ticketId}] Adding PR comment...`);
    await jira.addComment(ticketId, commentBody);

    // 2. Transition Ticket
    console.log(
      `[Update Jira Status Node][${ticketId}] Transitioning to 'In Review'...`,
    );
    await jira.transitionTicket(ticketId, "In Review");

    console.log(`✅ [Update Jira Status Node][${ticketId}] Jira updated.`);

    const duration = Date.now() - startTime;
    console.log(
      `⏱️ [Update Jira Status Node][${ticketId}] Completed in ${duration}ms`,
    );

    return {
      metrics: {
        nodeExecutionTimes: { updateJiraStatusNode: duration },
        nodeCallCounts: { updateJiraStatusNode: 1 },
      },
    };
  } catch (error) {
    console.error(
      `❌ [Update Jira Status Node][${ticketId}] Failed to update Jira:`,
      error,
    );
    // Do not throw, as PR is already created. Just log.
    return {};
  }
}
