import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const envStatus = {
    OLLAMA_URL: process.env.OLLAMA_URL ? "configured" : "missing",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "configured" : "missing",
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? "configured" : "missing",
  };

  res.status(200).json({
    status: "service running",
    timestamp: new Date().toISOString(),
    environment: envStatus,
  });
}
