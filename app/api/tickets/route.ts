import { NextResponse } from "next/server";
import { getCached } from "../../../lib/cache";
import type { PipelineState } from "../../../lib/pipeline-state";

export const dynamic = "force-dynamic";

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    created: string;
    updated: string;
    priority?: { name: string };
    labels?: string[];
    comment?: {
      comments: Array<{ body: { content: Array<{ content: Array<{ text?: string; marks?: Array<{ type: string; attrs?: { href?: string } }> }> }> } }>;
    };
  };
}

export async function GET() {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    return NextResponse.json({ error: "Missing Jira configuration" }, { status: 500 });
  }

  const base = JIRA_BASE_URL.startsWith("http") ? JIRA_BASE_URL : `https://${JIRA_BASE_URL}`;
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  try {
    // Query Jira for all ai-agent / ai-generated tickets, newest first
    const jql = encodeURIComponent(
      `project = "${JIRA_PROJECT_KEY}" AND labels in ("ai-agent","ai-generated") ORDER BY created DESC`
    );
    const res = await fetch(
      `${base}/rest/api/3/search?jql=${jql}&maxResults=50&fields=summary,status,created,updated,priority,labels,comment`,
      { headers }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[/api/tickets] Jira search failed:", err);
      return NextResponse.json({ error: "Jira search failed" }, { status: res.status });
    }

    const jiraData = await res.json();
    const issues: JiraIssue[] = jiraData.issues ?? [];

    // For each issue, check if there's a live pipeline state in Redis
    const enriched = await Promise.all(
      issues.map(async (issue) => {
        const pipelineRaw = await getCached(`pipeline_state:${issue.key}`);
        let pipeline: PipelineState | null = null;
        if (pipelineRaw) {
          try { pipeline = JSON.parse(pipelineRaw); } catch { /* ignore */ }
        }

        // Extract PR link from the most recent comment containing a github.com URL
        let prUrl: string | null = null;
        const comments = issue.fields.comment?.comments ?? [];
        for (let i = comments.length - 1; i >= 0; i--) {
          const blocks = comments[i]?.body?.content ?? [];
          outer: for (const block of blocks) {
            for (const inline of block.content ?? []) {
              const link = inline.marks?.find((m) => m.type === "link" && m.attrs?.href?.includes("github.com"));
              if (link?.attrs?.href) { prUrl = link.attrs.href; break outer; }
            }
          }
          if (prUrl) break;
        }

        return {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          created: issue.fields.created,
          updated: issue.fields.updated,
          priority: issue.fields.priority?.name ?? null,
          labels: issue.fields.labels ?? [],
          prUrl,
          pipeline,
        };
      })
    );

    return NextResponse.json({ tickets: enriched });
  } catch (error: unknown) {
    console.error("[/api/tickets] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
