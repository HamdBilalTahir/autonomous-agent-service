import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Octokit } from "@octokit/rest";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(request: Request) {
  const session: any = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  try {
    const octokit = new Octokit({ auth: session.accessToken });

    // Fetch user repos and org list in parallel
    const [{ data: userRepos }, { data: orgs }] = await Promise.all([
      octokit.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
        page,
      }),
      octokit.orgs.listForAuthenticatedUser({ per_page: 100 }),
    ]);

    // Fetch repos for all orgs the user is a member of
    const orgRepoArrays = await Promise.all(
      orgs.map((org) =>
        octokit.repos
          .listForOrg({ org: org.login, sort: "updated", per_page: 100, page })
          .then(({ data }) => data)
          .catch(() => []),
      ),
    );

    const orgRepos = orgRepoArrays.flat();

    // Merge: user repos first, then org repos not already in user list
    const seen = new Set(userRepos.map((r) => r.full_name));
    const merged = [
      ...userRepos,
      ...orgRepos.filter((r) => !seen.has(r.full_name)),
    ];

    // Sort by updated_at descending
    merged.sort(
      (a, b) =>
        new Date(b.updated_at ?? 0).getTime() -
        new Date(a.updated_at ?? 0).getTime(),
    );

    const hasMore = userRepos.length === 100 || orgRepos.length === 100;

    return NextResponse.json({ repos: merged, hasMore });
  } catch (error: any) {
    console.error("Failed to fetch repos:", error);
    if (error.status === 401) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 },
    );
  }
}
