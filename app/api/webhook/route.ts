import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";
import { getCached, setCached } from "../../../lib/cache";
import { logPerformanceReport } from "../../../lib/graph/metrics-utils";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let ticketId: string | undefined;
  let summary = "";

  try {
    const body = await req.json();

    // Initialize Services
    const jira = new JiraService(
      process.env.JIRA_BASE_URL || "",
      process.env.JIRA_EMAIL || "",
      process.env.JIRA_API_TOKEN || "",
    );

    const github = new GitHubService(process.env.GITHUB_TOKEN || "");
    const targetOwner = process.env.TARGET_GITHUB_OWNER || "HamdBilalTahir";
    const targetRepo =
      process.env.TARGET_GITHUB_REPO || "autonomous-agent-service";

    // Basic validation
    if (!body.issue || !body.issue.key) {
      return NextResponse.json({
        status: "ignored",
        message: "No issue key found",
      });
    }

    ticketId = body.issue.key;

    // Verify ticket still exists (handles deleted tickets)
    try {
      await jira.getTicket(ticketId!);
    } catch (error) {
      console.log(`[Webhook] Ignored ${ticketId}: Ticket not found or deleted`);
      return NextResponse.json({
        status: "ignored",
        message: "Ticket not found or deleted",
      });
    }

    summary = body.issue.fields.summary;
    const description = body.issue.fields.description || "";
    const status = body.issue.fields.status.name;
    const labels = body.issue.fields.labels || [];

    // Filter: Ignore if triggered by the agent itself ONLY IF we have flagged it as an internal update
    const currentUser = await jira.getCurrentUser();
    const isSelfTriggered =
      currentUser && body.user && body.user.accountId === currentUser.accountId;

    // Check if we are already processing this ticket
    const isProcessing = await getCached(`processing:${ticketId}`);
    if (isProcessing === "true") {
      console.log(
        `[Webhook] Ignored ${ticketId}: Already processing this ticket`,
      );
      return NextResponse.json({
        status: "ignored",
        message: "Already processing this ticket",
      });
    }

    // Check if we recently performed an update on this ticket
    const isAgentUpdate = await getCached(`agent_update:${ticketId}`);

    if (isSelfTriggered && isAgentUpdate === "true") {
      console.log(
        `[Webhook] Ignored ${ticketId}: Triggered by agent itself (Loop Prevention)`,
      );
      return NextResponse.json({
        status: "ignored",
        message: "Triggered by agent itself (Loop Prevention)",
      });
    }

    // Filter: Only process if label 'ai-agent' is present
    if (!labels.includes("ai-agent")) {
      console.log(`[Webhook] Ignored ${ticketId}: Missing 'ai-agent' label`);
      return NextResponse.json({
        status: "ignored",
        message: "Missing 'ai-agent' label",
      });
    }

    // Filter: Ignore if already processed or in progress
    if (["In Progress", "In Review", "Done"].includes(status)) {
      console.log(`[Webhook] Ignored ${ticketId}: Status is ${status}`);
      return NextResponse.json({
        status: "ignored",
        message: `Ticket status is ${status}`,
      });
    }

    console.log(`[Webhook] Processing ticket ${ticketId}: ${summary}`);
    console.time("GraphExecution");

    // Set processing lock (15 minutes expiry to cover long executions)
    await setCached(`processing:${ticketId}`, "true", 900);

    // Mark as agent update BEFORE transitioning to avoid self-trigger loop
    await setCached(`agent_update:${ticketId}`, "true", 900);

    try {
      // Transition to In Progress
      await jira.transitionTicket(ticketId!, "In Progress");
      const structure = await github.getRepoStructure(targetOwner, targetRepo);
      const codebaseTree = structure.join("\n");

      // Invoke Graph
      console.log("[Webhook] Invoking LangGraph...");
      const finalState = await graph.invoke(
        {
          ticketId,
          ticketSummary: summary,
          ticketDescription:
            typeof description === "string"
              ? description
              : JSON.stringify(description),
          codebaseTree,
        },
        { recursionLimit: 100 },
      );
      console.timeEnd("GraphExecution");

      const { metrics } = finalState;
      console.log("[Webhook] Graph execution completed.");

      // --- Performance Logging ---
      logPerformanceReport(metrics, ticketId!, summary);
      // ---------------------------

      return NextResponse.json({
        status: "success",
        ticketId,
        prUrl: finalState.prUrl,
      });
    } finally {
      // Clear processing lock
      await setCached(`processing:${ticketId}`, "false", 1);
      console.log(`[Webhook] released processing lock for ${ticketId}`);
    }
  } catch (error: any) {
    console.error("[Webhook] Error:", error);

    // Attempt rollback: restore ticket status and leave a comment so the issue
    // is visible in Jira rather than silently stuck "In Progress".
    if (ticketId) {
      try {
        const jira = new JiraService(
          process.env.JIRA_BASE_URL || "",
          process.env.JIRA_EMAIL || "",
          process.env.JIRA_API_TOKEN || "",
        );
        await jira.addComment(
          ticketId,
          `❌ **Agent Workflow Failed**\n\nError: ${error.message}\n\nPlease check server logs and reset status manually if needed.`,
        );
        await jira.transitionTicket(ticketId, "Selected for Development");
        // Clear the agent_update flag so the ticket can be re-processed after a manual reset
        await setCached(`agent_update:${ticketId}`, "false", 1);
      } catch (rollbackError) {
        console.error("[Webhook] Rollback failed:", rollbackError);
      }
    }

    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 },
    );
  }
}
