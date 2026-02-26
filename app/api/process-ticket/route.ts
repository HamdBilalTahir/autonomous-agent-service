import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId } = body;

    if (!ticketId) {
      return NextResponse.json(
        { error: "Ticket ID is required" },
        { status: 400 },
      );
    }

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
    const finalState = await graph.invoke({
      ticketSummary: summary,
      ticketDescription:
        typeof description === "string"
          ? description
          : JSON.stringify(description),
      codebaseTree,
    });

    const { executionPlan, generatedCode } = finalState;

    if (!generatedCode || generatedCode.length === 0) {
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

    // Update Jira Estimates
    if (executionPlan?.priority && executionPlan?.storyPoints !== undefined) {
      await jira.updateTicketMetadata(ticketId, {
        priority: executionPlan.priority,
        storyPoints: executionPlan.storyPoints,
      });
    }

    // Update Jira Status and Link PR
    await jira.linkPRAndTransitionTicket(ticketId, pr.html_url, "In Review");

    return NextResponse.json({
      success: true,
      ticketId,
      prUrl: pr.html_url,
    });
  } catch (error: any) {
    console.error("Error processing ticket:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
