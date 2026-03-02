import { NextRequest, NextResponse } from "next/server";
import { JiraService } from "../../../lib/jira";
import { GitHubService } from "../../../lib/github";

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
      : "missing",
    TARGET_GITHUB_REPO: process.env.TARGET_GITHUB_REPO
      ? "configured"
      : "missing",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "configured" : "missing",
    HF_API_KEY: process.env.HF_API_KEY ? "configured" : "missing (optional)",
  };

  console.log("Environment Status Check:", JSON.stringify(envStatus, null, 2));

  let health: any = {
    github: "unknown",
    jira: "unknown",
    ollama: "unknown",
  };

  try {
    const jira = new JiraService(
      process.env.JIRA_BASE_URL || "",
      process.env.JIRA_EMAIL || "",
      process.env.JIRA_API_TOKEN || "",
    );

    const github = new GitHubService(process.env.GITHUB_TOKEN || "");

    const [jiraHealth, githubHealth] = await Promise.all([
      jira.checkHealth(),
      github.checkHealth(),
    ]);

    let ollamaHealth = "disabled";
    if (process.env.OLLAMA_URL) {
      try {
        const response = await fetch(`${process.env.OLLAMA_URL}/api/tags`);
        ollamaHealth = response.ok ? "healthy" : "unreachable";
      } catch (e) {
        ollamaHealth = "unreachable";
      }
    }

    health = {
      jira: jiraHealth,
      github: githubHealth,
      ollama: ollamaHealth,
    };
  } catch (e: any) {
    console.error("Health check failed:", e);
  }

  const overallStatus =
    health.github && health.jira && health.ollama !== "unreachable"
      ? "healthy"
      : "degraded";

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      environment: envStatus,
      services: health,
    },
    { status: overallStatus === "healthy" ? 200 : 503 },
  );
}
