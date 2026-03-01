import { NextResponse } from "next/server";
import { GitHubService } from "@/lib/github";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.TARGET_GITHUB_OWNER;
  const repo = process.env.TARGET_GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "Missing GitHub configuration" },
      { status: 500 },
    );
  }

  try {
    const github = new GitHubService(token);
    const branches = await github.listBranches(owner, repo);
    return NextResponse.json({ branches });
  } catch (error: any) {
    console.error("Failed to fetch branches:", error);
    return NextResponse.json(
      { error: "Failed to fetch branches" },
      { status: 500 },
    );
  }
}
