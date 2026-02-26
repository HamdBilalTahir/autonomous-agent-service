import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const envStatus = {
    OLLAMA_URL: process.env.OLLAMA_URL ? "configured" : "missing",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "configured" : "missing",
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? "configured" : "missing",
  };

  return NextResponse.json({
    status: "service running",
    timestamp: new Date().toISOString(),
    environment: envStatus,
  });
}
