import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";

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
    const summary = body.issue.fields.summary;
    const description = body.issue.fields.description || "";
    const status = body.issue.fields.status.name;
    const labels = body.issue.fields.labels || [];

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

    // Transition to In Progress
    await jira.transitionTicket(ticketId, "In Progress");

    // Fetch Codebase Tree
    const structure = await github.getRepoStructure(targetOwner, targetRepo);
    const codebaseTree = structure.join("\n");

    // Invoke Graph
    console.log("[Webhook] Invoking LangGraph...");
    let finalState: any = {};
    const stream = await graph.stream({
      ticketSummary: summary,
      ticketDescription:
        typeof description === "string"
          ? description
          : JSON.stringify(description),
      codebaseTree,
    });

    for await (const chunk of stream) {
      const nodeName = Object.keys(chunk)[0];
      const chunkData = (chunk as Record<string, any>)[nodeName];
      console.log(`\n[Graph Transition] Finished Node: ${nodeName}`);
      console.log(
        `[Current State Snapshot]:`,
        JSON.stringify(chunkData, null, 2),
      );
      finalState = { ...finalState, ...chunkData };
    }
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
    if (executionPlan?.priority && executionPlan?.storyPoints !== undefined) {
      await jira.updateTicketMetadata(ticketId, {
        priority: executionPlan.priority,
        storyPoints: executionPlan.storyPoints,
      });
    }

    // Update Jira Status and Link PR
    await jira.linkPRAndTransitionTicket(ticketId, pr.html_url, "In Review");

    return NextResponse.json({
      status: "success",
      ticketId,
      prUrl: pr.html_url,
    });
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 },
    );
  }
}
