import { AgentState } from "../state";
import { GitHubService } from "../../github";
import { setPipelineState } from "../../pipeline-state";
import { getCached } from "../../cache";

/**
 * Creates a Pull Request.
 * Runs after validation succeeds.
 */
export async function createPrNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  await setPipelineState(state.ticketId, state.ticketSummary, "createPrNode");
  const {
    ticketId,
    ticketSummary,
    generatedCode,
    executionPlan,
    ticketClassification,
  } = state;

  console.log(`[Create PR Node][${ticketId}] Initiating PR creation...`);

  // Retrieve user's GitHub OAuth token if available, otherwise fallback to env var
  const userToken = await getCached(`github_token:${ticketId}`);
  const token = userToken || process.env.GITHUB_TOKEN || "";

  const github = new GitHubService(token);
  // Use the repo selected in the UI (passed via state). Do NOT fallback to env vars if state is missing,
  // as that causes commits to go to the wrong repo (the test/default one).
  const targetOwner = state.targetOwner;
  const targetRepo = state.targetRepo;
  const targetBranch = state.targetBranch || "main";

  if (!targetOwner || !targetRepo) {
    throw new Error(
      `[Create PR Node] Missing target repository info. State: owner=${targetOwner}, repo=${targetRepo}`,
    );
  }

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
      targetBranch,
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
