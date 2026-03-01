import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";
import { getCached, setCached } from "../../../lib/cache";
import { logPerformanceReport } from "../../../lib/graph/metrics-utils";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let ticketId: string | undefined;

  try {
    const body = await req.json();
    ticketId = body.ticketId;

    if (!ticketId) {
      return NextResponse.json(
        { error: "Ticket ID is required" },
        { status: 400 },
      );
    }

    // Prevent duplicate processing
    const isProcessing = await getCached(`processing:${ticketId}`);
    if (isProcessing === "true") {
      console.log(`[Process Ticket] Ignored ${ticketId}: Already processing`);
      return NextResponse.json({
        status: "ignored",
        message: "Already processing this ticket",
      });
    }
    await setCached(`processing:${ticketId}`, "true", 900);

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

    // Fetch Ticket Details
    const ticket = await jira.getTicket(ticketId);
    const summary = ticket.fields.summary;
    const description = ticket.fields.description || "";

    console.log(`[Process Ticket] Processing ${ticketId}: ${summary}`);

    // Transition to In Progress
    await jira.transitionTicket(ticketId, "In Progress");

    // Fetch Codebase Tree
    const structure = await github.getRepoStructure(targetOwner, targetRepo);
    const codebaseTree = structure.join("\n");

    // Invoke Graph
    console.log("[Process Ticket] Invoking LangGraph...");
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

    const { generatedCode, metrics } = finalState;

    // PR creation and Jira updates are now handled within the graph nodes
    const prUrl = finalState.prUrl;

    // --- Performance Logging ---
    logPerformanceReport(metrics, ticketId!, summary, {
      generatedFiles: metrics?.totalFilesGenerated || generatedCode?.length || 0,
      modifiedFiles: metrics?.totalFilesModified || 0,
    });
    // ---------------------------

    return NextResponse.json({
      success: true,
      ticketId,
      prUrl: prUrl,
    });
  } catch (error: any) {
    console.error("Error processing ticket:", error);

    // Attempt to recover/compensate
    try {
      // Re-initialize services if needed (they should be available in scope, but just in case)
      const jira = new JiraService(
        process.env.JIRA_BASE_URL || "",
        process.env.JIRA_EMAIL || "",
        process.env.JIRA_API_TOKEN || "",
      );

      if (ticketId) {
        console.log(`[Process Ticket] Attempting rollback for ${ticketId}...`);
        await jira.addComment(
          ticketId,
          `❌ **Agent Workflow Failed**\n\nError: ${error.message}\n\nPlease check logs and reset status manually if needed.`,
        );

        // Attempt to move back to "Selected for Development" or "To Do"
        // This is a best-effort attempt
        await jira.transitionTicket(ticketId, "Selected for Development");
      }
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }

    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  } finally {
    if (ticketId) {
      await setCached(`processing:${ticketId}`, "false", 1);
      console.log(`[Process Ticket] Released processing lock for ${ticketId}`);
    }
  }
}
