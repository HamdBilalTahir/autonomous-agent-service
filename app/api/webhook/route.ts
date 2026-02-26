import { NextRequest, NextResponse } from "next/server";
import { AutonomousAgent } from "../../../lib/agent";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const agent = new AutonomousAgent(
      process.env.GITHUB_TOKEN || "",
      process.env.JIRA_BASE_URL || "",
      process.env.JIRA_EMAIL || "",
      process.env.JIRA_API_TOKEN || "",
      process.env.OLLAMA_URL || "http://localhost:11434",
      process.env.TARGET_GITHUB_OWNER || "HamdBilalTahir",
      process.env.TARGET_GITHUB_REPO || "autonomous-agent-service",
      process.env.HF_API_KEY,
      process.env.GEMINI_API_KEY,
      (process.env.AI_PROVIDER as "ollama" | "gemini") || "ollama",
      process.env.GEMINI_MODEL,
    );

    // Check for self-triggering loop
    const triggeredByAccountId = body.user?.accountId;
    if (triggeredByAccountId) {
      const agentUser = await agent.getCurrentUser();
      const agentAccountId = agentUser?.accountId;

      // Only ignore if it's the agent AND it's NOT an issue creation event
      // We want to process tickets created by the agent (e.g. for testing)
      if (
        agentAccountId &&
        triggeredByAccountId === agentAccountId &&
        body.webhookEvent !== "jira:issue_created" &&
        body.webhookEvent !== "issue_created"
      ) {
        console.log(
          `[Webhook] Ignoring self-triggered update from agent (accountId: ${agentAccountId}, event: ${body.webhookEvent})`,
        );
        return NextResponse.json({
          status: "ignored",
          message: "Ignored self-triggered update",
        });
      }
    }

    // Validate payload and check if ticket should be processed
    const shouldProcess = agent.shouldProcessTicket(body);
    console.log(
      `[Webhook] Payload received. Should process: ${shouldProcess}`,
      {
        event: body.webhookEvent,
        issueKey: body.issue?.key,
      },
    );

    if (!shouldProcess) {
      return NextResponse.json({
        status: "ignored",
        message: "Webhook ignored (criteria not met)",
      });
    }

    // Extract ticket ID (assuming standard Jira payload structure)
    // Jira issue key is usually in issue.key
    const ticketId = body.issue?.key;

    if (ticketId) {
      // Trigger asynchronous processing
      // Note: In serverless, we might need waitUntil.
      // For standard Node, we can just not await.
      // We log errors inside the promise chain.
      console.log(
        `[Webhook] Starting SYNC processing (DEBUG MODE) for ticket: ${ticketId}`,
      );

      try {
        const result = await agent.processTicket(ticketId);
        console.log(
          `[Webhook] Sync processing for ${ticketId} finished:`,
          result,
        );
        return NextResponse.json({
          status: "processed",
          message: `Ticket ${ticketId} processed`,
          result: result,
        });
      } catch (err) {
        console.error(`[Webhook] Sync processing for ${ticketId} failed:`, err);
        return NextResponse.json(
          {
            status: "error",
            message: `Ticket ${ticketId} failed processing`,
            error: String(err),
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      status: "ignored",
      message: "No ticket ID found in payload",
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
