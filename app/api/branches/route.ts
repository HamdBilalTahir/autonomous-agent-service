import { NextResponse } from "next/server";
import { GitHubService } from "@/lib/github";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = process.env.GITHUB_TOKEN;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!token) {
    return NextResponse.json(
      { error: "Missing GitHub token configuration" },
      { status: 500 },
    );
  }

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo query parameters" },
      { status: 400 },
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
