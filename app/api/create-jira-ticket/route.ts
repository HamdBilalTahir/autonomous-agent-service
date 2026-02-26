import { NextRequest, NextResponse } from "next/server";

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
    const { summary, description, projectKey, issueType, labels } = body;

    const descriptionADF = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: description,
            },
          ],
        },
      ],
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
