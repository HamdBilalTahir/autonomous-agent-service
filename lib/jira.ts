import { withRetry } from "./utils/retry";

let STASHED_SP_ID: string | null = null;

export class JiraService {
  private baseUrl: string;
  private email: string;
  private token: string;

  constructor(baseUrl: string, email: string, token: string) {
    this.baseUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    this.email = email;
    this.token = token;
  }

  private get headers() {
    return {
      Authorization: `Basic ${Buffer.from(
        `${this.email}:${this.token}`,
      ).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      return await withRetry(async () => {
        // Use 'myself' endpoint which is standard
        const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
          method: "GET",
          headers: this.headers,
        });
        return response.ok;
      });
    } catch (e) {
      console.error("Jira health check failed:", e);
      return false;
    }
  }

  async getCurrentUser() {
    try {
      return await withRetry(async () => {
        const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
          method: "GET",
          headers: this.headers,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to get current user: ${response.status} ${response.statusText}`,
          );
        }

        return response.json();
      });
    } catch (e) {
      console.error("Get current user failed:", e);
      return null;
    }
  }

  async getTicket(ticketId: string) {
    return await withRetry(async () => {
      const response = await fetch(
        `${this.baseUrl}/rest/api/3/issue/${ticketId}`,
        {
          method: "GET",
          headers: this.headers,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ticket ${ticketId}: ${response.status} ${response.statusText}`,
        );
      }

      return response.json();
    });
  }

  async getTransitions(ticketId: string) {
    return await withRetry(async () => {
      const response = await fetch(
        `${this.baseUrl}/rest/api/3/issue/${ticketId}/transitions`,
        {
          method: "GET",
          headers: this.headers,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get transitions for ${ticketId}: ${response.status} ${response.statusText}`,
        );
      }

      return response.json();
    });
  }

  async transitionTicket(ticketId: string, targetStatus: string) {
    console.log(
      `[Jira] Transitioning ticket ${ticketId} to ${targetStatus}...`,
    );
    await withRetry(async () => {
      // First, find the transition ID for the target status
      // Note: We don't wrap this internal call in another withRetry since it's already wrapped
      const transitionsData = await this.getTransitions(ticketId);
      const transition = transitionsData.transitions.find(
        (t: { name: string; id: string }) =>
          t.name.toLowerCase() === targetStatus.toLowerCase(),
      );

      if (!transition) {
        console.warn(
          `Transition to status "${targetStatus}" not found for ticket ${ticketId}. Available transitions: ${transitionsData.transitions
            .map((t: { name: string }) => t.name)
            .join(", ")}`,
        );
        return; // Or throw error, but maybe we just want to proceed
      }

      const response = await fetch(
        `${this.baseUrl}/rest/api/3/issue/${ticketId}/transitions`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({
            transition: {
              id: transition.id,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to transition ticket ${ticketId} to ${targetStatus}: ${response.status} ${response.statusText}`,
        );
      }
      console.log(
        `[Jira] Successfully transitioned ${ticketId} to ${targetStatus}`,
      );
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async addComment(ticketId: string, comment: string | any) {
    const logComment =
      typeof comment === "string" ? comment : "Structured ADF comment";
    console.log(
      `[Jira] Adding comment to ${ticketId}: ${logComment.substring(0, 50)}...`,
    );

    return await withRetry(async () => {
      const bodyPayload =
        typeof comment === "string"
          ? {
              body: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: comment,
                      },
                    ],
                  },
                ],
              },
            }
          : { body: comment };

      const response = await fetch(
        `${this.baseUrl}/rest/api/3/issue/${ticketId}/comment`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(bodyPayload),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to add comment to ${ticketId}: ${response.status} ${response.statusText}`,
        );
      }
      console.log(`[Jira] Successfully added comment to ${ticketId}`);
      return await response.json();
    });
  }

  async deleteComment(ticketId: string, commentId: string) {
    console.log(`[Jira] Deleting comment ${commentId} from ${ticketId}...`);
    try {
      await withRetry(async () => {
        const response = await fetch(
          `${this.baseUrl}/rest/api/3/issue/${ticketId}/comment/${commentId}`,
          {
            method: "DELETE",
            headers: this.headers,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to delete comment ${commentId}: ${response.status} ${response.statusText}`,
          );
        }
      });
      console.log(`[Jira] Successfully deleted comment ${commentId}`);
    } catch (e) {
      console.warn(
        `[Jira] Failed to delete comment ${commentId}:`,
        (e as Error).message,
      );
    }
  }

  async linkPRAndTransitionTicket(
    ticketKey: string,
    prUrl: string,
    targetStatus: string,
  ) {
    let commentId: string | undefined;
    try {
      console.log(
        `[Jira] Linking PR ${prUrl} to ticket ${ticketKey} and transitioning to ${targetStatus}...`,
      );

      // Construct ADF with clickable link
      const adfBody = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "🤖 AI Agent Update\n\nThe code generation for this ticket is complete.\n\n👉 ",
              },
              {
                type: "text",
                text: "Review the Pull Request Here",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: prUrl,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const commentData = await this.addComment(ticketKey, adfBody);
      commentId = commentData.id;

      await this.transitionTicket(ticketKey, targetStatus);

      console.log(
        `[Jira] Successfully linked PR and transitioned ticket ${ticketKey}`,
      );
    } catch (error) {
      console.error(
        `[Jira] Failed to link PR and transition ticket ${ticketKey}:`,
        error,
      );
      // Rollback: delete comment if transition failed
      if (commentId) {
        console.log(`[Jira] Rolling back comment ${commentId}...`);
        await this.deleteComment(ticketKey, commentId);
      }
      // Graceful degradation: do not throw error to ensure the process completes
    }
  }

  private async getStoryPointFieldId() {
    if (STASHED_SP_ID) {
      return STASHED_SP_ID;
    }

    try {
      return await withRetry(async () => {
        console.log("[JiraService] Fetching fields to find Story Points ID...");
        const response = await fetch(`${this.baseUrl}/rest/api/3/field`, {
          method: "GET",
          headers: this.headers,
        });

        if (!response.ok) {
          console.error(
            `[JiraService] Failed to fetch fields: ${response.status}`,
          );
          return null;
        }

        const fields = await response.json();
        const storyPointsField = fields.find(
          (f: { name: string; id: string }) =>
            f.name === "Story point estimate" || f.name === "Story Points",
        );

        if (storyPointsField) {
          STASHED_SP_ID = storyPointsField.id;
          console.log(`[JiraService] Found Story Points ID: ${STASHED_SP_ID}`);
          return STASHED_SP_ID;
        } else {
          console.warn("[JiraService] 'Story point estimate' field not found.");
          return null;
        }
      });
    } catch (e) {
      console.error("[JiraService] Error fetching fields:", e);
      return null;
    }
  }

  async updateTicketMetadata(
    ticketKey: string,
    data: { priority?: string; storyPoints?: number },
  ) {
    const { priority, storyPoints } = data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: Record<string, any> = {};

    if (priority) {
      const allowedPriorities = ["Highest", "High", "Medium", "Low", "Lowest"];
      const validatedPriority = allowedPriorities.includes(priority)
        ? priority
        : "Medium";

      if (priority !== validatedPriority) {
        console.warn(
          `[JiraService] Invalid priority '${priority}', defaulting to '${validatedPriority}'`,
        );
      }
      fields.priority = { name: validatedPriority };
    }

    const spId = await this.getStoryPointFieldId();
    if (storyPoints !== undefined && spId) {
      fields[spId] = storyPoints;
    } else if (storyPoints !== undefined) {
      console.warn(
        "Story Points provided but field ID not found. Skipping story points update.",
      );
    }

    if (Object.keys(fields).length === 0) {
      return;
    }

    try {
      await withRetry(async () => {
        console.log(
          `[JiraService] Updating ${ticketKey}: Priority=${priority}, StoryPoints=${storyPoints}`,
        );
        const response = await fetch(
          `${this.baseUrl}/rest/api/3/issue/${ticketKey}`,
          {
            method: "PUT",
            headers: this.headers,
            body: JSON.stringify({ fields }),
          },
        );

        if (!response.ok) {
          // If priority update fails (e.g. invalid priority name), try to parse error
          const errorText = await response.text();
          throw new Error(
            `Failed to update ticket metadata: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        console.log(`[Jira] Successfully updated metadata for ${ticketKey}`);
      });
    } catch (error) {
      console.error(
        `[Jira] Failed to update metadata for ${ticketKey}:`,
        error,
      );
      // Graceful degradation
    }
  }
}
