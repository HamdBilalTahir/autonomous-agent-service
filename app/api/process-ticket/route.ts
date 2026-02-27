import { NextRequest, NextResponse } from "next/server";
import { graph } from "../../../lib/graph";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";

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
      ticketId,
      ticketSummary: summary,
      ticketDescription:
        typeof description === "string"
          ? description
          : JSON.stringify(description),
      codebaseTree,
    });

    const { executionPlan, generatedCode, metrics } = finalState;

    // --- Performance Logging ---
    const endTime = Date.now();
    const totalDuration = (endTime - (metrics?.startTime || endTime)) / 1000;

    let totalTokens = { prompt: 0, completion: 0, total: 0 };
    Object.values(metrics?.nodeTokenUsage || {}).forEach((usage) => {
      totalTokens.prompt += usage.prompt;
      totalTokens.completion += usage.completion;
      totalTokens.total += usage.total;
    });

    console.log(`\n📊 Workflow Performance Report`);
    console.log(`--------------------------------`);
    console.log(`Ticket: ${ticketId} (${summary})`);
    console.log(`Total Duration: ${totalDuration.toFixed(2)}s`);
    console.log(`--------------------------------`);
    console.log(`⏱️ Execution Time:`);
    Object.entries(metrics?.nodeExecutionTimes || {}).forEach(
      ([node, duration]) => {
        console.log(`  - ${node}: ${(duration / 1000).toFixed(2)}s`);
      },
    );
    console.log(`\n🤖 AI Token Usage:`);
    Object.entries(metrics?.nodeTokenUsage || {}).forEach(([node, usage]) => {
      console.log(
        `  - ${node}: ${usage.total.toLocaleString()} (In: ${usage.prompt.toLocaleString()}, Out: ${usage.completion.toLocaleString()})`,
      );
    });
    console.log(`  ----------------`);
    console.log(
      `  TOTAL: ${totalTokens.total.toLocaleString()} (In: ${totalTokens.prompt.toLocaleString()}, Out: ${totalTokens.completion.toLocaleString()})`,
    );
    console.log(`\n📂 Output:`);
    console.log(
      `  - Files Generated: ${metrics?.totalFilesGenerated || generatedCode?.length || 0}`,
    );
    console.log(`  - Files Modified: ${metrics?.totalFilesModified || 0}`);
    console.log(`  - Validation Retries: ${metrics?.validationRetries || 0}`);
    console.log(`--------------------------------\n`);
    // ---------------------------

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
      finalState.ticketClassification?.type || "feature",
      finalState.ticketClassification?.branchSlug,
    );

    // Update Jira Status and Link PR
    await jira.linkPRAndTransitionTicket(ticketId, pr.html_url, "In Review");

    return NextResponse.json({
      success: true,
      ticketId,
      prUrl: pr.html_url,
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
  }
}
