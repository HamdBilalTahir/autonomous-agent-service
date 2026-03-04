import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Octokit } from "@octokit/rest";
import { authOptions } from "../../../../auth/[...nextauth]/route";

export async function GET(
  request: Request,
  { params }: { params: { owner: string; repo: string } },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session: any = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo } = params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  try {
    const octokit = new Octokit({ auth: session.accessToken });

    // Fetch branch list and repo metadata in parallel to get defaultBranch
    const [{ data: branches }, { data: repoInfo }] = await Promise.all([
      octokit.repos.listBranches({ owner, repo, per_page: 100, page }),
      octokit.repos.get({ owner, repo }),
    ]);

    return NextResponse.json({
      branches: branches.map((b) => b.name),
      defaultBranch: repoInfo.default_branch,
      hasMore: branches.length === 100,
    });
  } catch (error) {
    console.error("Failed to fetch branches:", error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).status === 401) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch branches" },
      { status: 500 },
    );
  }
}
