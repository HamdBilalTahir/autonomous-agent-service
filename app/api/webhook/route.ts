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
    );

    // Validate payload and check if ticket should be processed
    if (!agent.shouldProcessTicket(body)) {
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
      agent
        .processTicket(ticketId)
        .then((result) =>
          console.log(`Async processing for ${ticketId} finished:`, result),
        )
        .catch((err) =>
          console.error(`Async processing for ${ticketId} failed:`, err),
        );

      return NextResponse.json({
        status: "processing",
        message: `Ticket ${ticketId} accepted for processing`,
      });
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
