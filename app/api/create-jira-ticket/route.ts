import { NextRequest, NextResponse } from "next/server";
import { setCached } from "../../../lib/cache";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } =
    process.env;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    return NextResponse.json(
      { error: "Missing Jira configuration in environment variables" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      summary,
      description,
      projectKey,
      issueType,
      labels,
      repoOwner,
      repoName,
      branch,
      githubToken,
    } = body;

    // Build ADF content: metadata paragraph (machine-readable) + description paragraph
    const adfContent: object[] = [];

    // First paragraph: human-readable GitHub link (also parsed by the agent webhook)
    if (repoOwner && repoName && branch) {
      const branchUrl = `https://github.com/${repoOwner}/${repoName}/tree/${branch}`;
      // Note: The webhook in app/api/webhook/route.ts specifically looks for "github.com/{owner}/{repo}/tree/{branch}"
      // via regex match on the first paragraph text.
      // We label it "🤖 Agent Target: " which seems to be what the webhook code expects or at least tolerates.
      // But let's check webhook regex again: /github\.com\/([^\/\s]+)\/([^\/\s]+)\/tree\/([^\s]+)/
      // This regex is robust enough to find the URL anywhere in the text.
      // HOWEVER, the user mentioned "prNode adding these commits to the repo from the env file".
      // This means the parsing fails, so state.targetOwner is empty.

      // I will update the text prefix to match what might be expected or just be safer.
      // The previous code had "🤖 Target Repo: ", I'll change it to "🤖 Agent Target: " to be consistent with comments in webhook route.

      adfContent.push({
        type: "paragraph",
        content: [
          { type: "text", text: "🤖 Agent Target: " },
          {
            type: "text",
            text: branchUrl,
            marks: [{ type: "link", attrs: { href: branchUrl } }],
          },
        ],
      });
    }

    // Second paragraph: the story description (already includes GitHub link + AC)
    adfContent.push({
      type: "paragraph",
      content: [{ type: "text", text: description }],
    });

    const descriptionADF = {
      type: "doc",
      version: 1,
      content: adfContent,
    };

    const payload = {
      fields: {
        project: { key: projectKey || JIRA_PROJECT_KEY }, // Fallback to env key is probably desired
        summary: summary,
        description: descriptionADF,
        issuetype: { name: issueType || "Story" }, // Defaulting issue type is usually safe
        labels: labels || ["ai-agent"],
      },
    };

    console.log(
      "Creating Jira ticket with payload:",
      JSON.stringify(payload, null, 2),
    );

    const response = await fetch(`https://${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok && data.key && githubToken) {
      // Store the user's GitHub OAuth token in Redis, associated with this ticket.
      // This allows the background worker (graph) to perform actions on behalf of the user.
      // Note: We use the Jira ticket key as the reference.
      await setCached(`github_token:${data.key}`, githubToken, 3600 * 24 * 7); // 7 days
    }

    if (!response.ok) {
      console.error("Jira API Error:", data);
      return NextResponse.json(
        { error: "Failed to create Jira ticket", details: data },
        { status: response.status },
      );
    }

    return NextResponse.json({
      status: "success",
      message: "Jira ticket created successfully",
      data: data,
    });
  } catch (error: any) {
    console.error("Internal Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
