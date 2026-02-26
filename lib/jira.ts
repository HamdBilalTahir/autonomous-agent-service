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
      // Use 'myself' endpoint which is standard
      const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
        method: "GET",
        headers: this.headers,
      });
      return response.ok;
    } catch (e) {
      console.error("Jira health check failed:", e);
      return false;
    }
  }

  async getCurrentUser() {
    try {
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
    } catch (e) {
      console.error("Get current user failed:", e);
      return null;
    }
  }

  async getTicket(ticketId: string) {
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
  }

  async getTransitions(ticketId: string) {
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
  }

  async transitionTicket(ticketId: string, targetStatus: string) {
    console.log(
      `[Jira] Transitioning ticket ${ticketId} to ${targetStatus}...`,
    );
    // First, find the transition ID for the target status
    const transitionsData = await this.getTransitions(ticketId);
    const transition = transitionsData.transitions.find(
      (t: any) => t.name.toLowerCase() === targetStatus.toLowerCase(),
    );

    if (!transition) {
      console.warn(
        `Transition to status "${targetStatus}" not found for ticket ${ticketId}. Available transitions: ${transitionsData.transitions
          .map((t: any) => t.name)
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
  }

  async addComment(ticketId: string, comment: string | any) {
    const logComment =
      typeof comment === "string" ? comment : "Structured ADF comment";
    console.log(
      `[Jira] Adding comment to ${ticketId}: ${logComment.substring(0, 50)}...`,
    );

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
  }

  async linkPRAndTransitionTicket(
    ticketKey: string,
    prUrl: string,
    targetStatus: string,
  ) {
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

      await this.addComment(ticketKey, adfBody);

      await this.transitionTicket(ticketKey, targetStatus);

      console.log(
        `[Jira] Successfully linked PR and transitioned ticket ${ticketKey}`,
      );
    } catch (error: any) {
      console.error(
        `[Jira] Failed to link PR and transition ticket ${ticketKey}:`,
        error,
      );
      // Graceful degradation: do not throw error to ensure the process completes
    }
  }
}
