import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";
import { getCached, setCached } from "../../../lib/cache";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
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

    const ticketId = body.issue.key;

    // Verify ticket still exists (handles deleted tickets)
    try {
      await jira.getTicket(ticketId);
    } catch (error) {
      console.log(`[Webhook] Ignored ${ticketId}: Ticket not found or deleted`);
      return NextResponse.json({
        status: "ignored",
        message: "Ticket not found or deleted",
      });
    }

    const summary = body.issue.fields.summary;
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
      await jira.transitionTicket(ticketId, "In Progress");
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

      const { executionPlan, generatedCode } = finalState;
      console.log("[Webhook] Graph execution completed.");

      if (!generatedCode || generatedCode.length === 0) {
        console.log("[Webhook] No code generated.");
        await jira.addComment(
          ticketId,
          "AI Analysis completed but no code was generated.",
        );
        return NextResponse.json({
          status: "processed",
          message: "No code generated",
        });
      }

      const pr = await github.processChangesAndCreatePR(
        targetOwner,
        targetRepo,
        ticketId,
        summary,
        generatedCode,
        executionPlan || { featureScope: "", implementationInstructions: "" },
      );

      console.log(`[Webhook] PR created: ${pr.html_url}`);

      // Update Jira Estimates
      // Priority and Story Points now come from Triage (TicketClassification), not PM (ExecutionPlan)
      const { ticketClassification } = finalState;
      if (
        ticketClassification?.priority &&
        ticketClassification?.storyPoints !== undefined
      ) {
        // Refresh agent update flag before metadata update
        await setCached(`agent_update:${ticketId}`, "true", 60);

        await jira.updateTicketMetadata(ticketId, {
          priority: ticketClassification.priority,
          storyPoints: ticketClassification.storyPoints,
        });
      }

      // Update Jira Status and Link PR
      await jira.linkPRAndTransitionTicket(ticketId, pr.html_url, "In Review");

      return NextResponse.json({
        status: "success",
        ticketId,
        prUrl: pr.html_url,
      });
    } finally {
      // Clear processing lock
      await setCached(`processing:${ticketId}`, "false", 1);
      console.log(`[Webhook] released processing lock for ${ticketId}`);
    }
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 },
    );
  }
}
