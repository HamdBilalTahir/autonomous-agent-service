import { NextRequest, NextResponse } from "next/server";
import { AutonomousAgent } from "../../../lib/agent";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const envStatus = {
    OLLAMA_URL: process.env.OLLAMA_URL ? "configured" : "missing",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "configured" : "missing",
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? "configured" : "missing",
    JIRA_BASE_URL: process.env.JIRA_BASE_URL ? "configured" : "missing",
    JIRA_EMAIL: process.env.JIRA_EMAIL ? "configured" : "missing",
    TARGET_GITHUB_OWNER: process.env.TARGET_GITHUB_OWNER
      ? "configured"
      : "missing (using default)",
    TARGET_GITHUB_REPO: process.env.TARGET_GITHUB_REPO
      ? "configured"
      : "missing (using default)",
    HF_API_KEY: process.env.HF_API_KEY ? "configured" : "missing (optional)",
  };

  console.log("Environment Status Check:", JSON.stringify(envStatus, null, 2));

  let agentStatus = "not initialized";
  let health: any = {
    github: "unknown",
    jira: "unknown",
    ollama: "unknown",
  };

  try {
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
    agentStatus = "initialized";

    // Perform health checks
    health = await agent.checkHealth();
  } catch (e: any) {
    agentStatus = `failed: ${e.message}`;
  }

  const overallStatus =
    agentStatus === "initialized" &&
    health.github &&
    health.jira &&
    health.ollama
      ? "healthy"
      : "degraded";

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      environment: envStatus,
      agent: agentStatus,
      services: health,
    },
    { status: overallStatus === "healthy" ? 200 : 503 },
  );
}
