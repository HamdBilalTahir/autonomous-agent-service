import { AgentState } from "../state";
import { GitHubService } from "../../github";

/**
 * Creates a Pull Request.
 * Runs after validation succeeds.
 */
export async function createPrNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const {
    ticketId,
    ticketSummary,
    generatedCode,
    executionPlan,
    ticketClassification,
  } = state;

  console.log(`[Create PR Node][${ticketId}] Initiating PR creation...`);

  const github = new GitHubService(process.env.GITHUB_TOKEN || "");
  const targetOwner = process.env.TARGET_GITHUB_OWNER || "HamdBilalTahir";
  const targetRepo =
    process.env.TARGET_GITHUB_REPO || "autonomous-agent-service";

  try {
    const pr = await github.processChangesAndCreatePR(
      targetOwner,
      targetRepo,
      ticketId,
      ticketSummary,
      generatedCode || [],
      executionPlan || { featureScope: "", implementationInstructions: "" },
      ticketClassification?.type || "feature",
      ticketClassification?.branchSlug,
      ticketClassification?.commitMessage,
    );

    console.log(`✅ [Create PR Node][${ticketId}] PR Created: ${pr.html_url}`);

    const duration = Date.now() - startTime;
    console.log(`⏱️ [Create PR Node][${ticketId}] Completed in ${duration}ms`);

    return {
      prUrl: pr.html_url,
      metrics: {
        nodeExecutionTimes: { createPrNode: duration },
        nodeCallCounts: { createPrNode: 1 },
      },
    };
  } catch (error) {
    console.error(
      `❌ [Create PR Node][${ticketId}] Failed to create PR:`,
      error,
    );
    // Throwing ensures the graph stops with an error if PR fails
    throw error;
  }
}
