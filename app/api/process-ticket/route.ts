import { NextRequest, NextResponse } from "next/server";
import { AutonomousAgent } from "../../../lib/agent";

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

    const result = await agent.processTicket(ticketId);

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing ticket:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
