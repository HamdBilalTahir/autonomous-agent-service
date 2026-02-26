import { GitHubService } from "./github";
import { JiraService } from "./jira";
import { OllamaService } from "./ollama";
import { AgentPrompts } from "./prompts";
import { Ticket, AgentResponse } from "./types";

export class AutonomousAgent {
  private github: GitHubService;
  private jira: JiraService;
  private ollama: OllamaService;
  private targetOwner: string;
  private targetRepo: string;
  private processingTickets: Set<string>;

  constructor(
    githubToken: string,
    jiraBaseUrl: string,
    jiraEmail: string,
    jiraToken: string,
    ollamaUrl: string,
    targetOwner: string,
    targetRepo: string,
    hfApiKey?: string,
  ) {
    this.github = new GitHubService(githubToken);
    this.jira = new JiraService(jiraBaseUrl, jiraEmail, jiraToken);
    this.ollama = new OllamaService(ollamaUrl, "codegemma:2b", hfApiKey);
    this.targetOwner = targetOwner;
    this.targetRepo = targetRepo;
    this.processingTickets = new Set<string>();
  }

  private log(level: "info" | "error" | "warn", message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    console.log(
      JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
      }),
    );
  }

  async checkHealth(): Promise<{
    github: boolean;
    jira: boolean;
    ollama: boolean;
  }> {
    const [github, jira, ollama] = await Promise.all([
      this.github.checkHealth(),
      this.jira.checkHealth(),
      this.ollama.checkHealth(),
    ]);

    return { github, jira, ollama };
  }

  shouldProcessTicket(payload: any): boolean {
    if (
      payload.webhookEvent !== "jira:issue_created" &&
      payload.webhookEvent !== "jira:issue_updated"
    ) {
      return false;
    }

    if (!payload.issue) {
      return false;
    }

    // Skip if status is already processing or completed
    const statusName = payload.issue.fields?.status?.name;
    if (
      statusName &&
      ["In Progress", "Done", "In Review"].includes(statusName)
    ) {
      return false;
    }

    const labels = payload.issue.fields.labels || [];
    if (labels.includes("ai-agent")) {
      return true;
    }

    return false;
  }

  async processTicket(ticketId: string): Promise<AgentResponse> {
    const actions: any[] = [];
    let initialStatus: string | undefined;

    this.log("info", "Starting ticket processing", { ticketId });

    if (this.processingTickets.has(ticketId)) {
      this.log("warn", "Ticket processing skipped - lock active", { ticketId });
      return {
        success: false,
        actions: [],
        message: `Ticket ${ticketId} is already being processed.`,
      };
    }
    this.processingTickets.add(ticketId);

    try {
      // 1. Fetch ticket details from Jira
      this.log("info", "Fetching ticket details", { ticketId });
      const ticketData = await this.jira.getTicket(ticketId);
      initialStatus = ticketData.fields.status.name;

      // Skip if already processing or completed
      if (
        ["In Progress", "Done", "In Review"].includes(
          ticketData.fields.status.name,
        )
      ) {
        this.log("info", "Skipping ticket - already processed or in progress", {
          ticketId,
          status: ticketData.fields.status.name,
        });
        return {
          success: true,
          actions: [],
          message: `Ticket already in status: ${ticketData.fields.status.name}`,
        };
      }

      const description =
        typeof ticketData.fields.description === "string"
          ? ticketData.fields.description
          : JSON.stringify(ticketData.fields.description);

      const ticket: Ticket = {
        id: ticketData.key,
        title: ticketData.fields.summary,
        description: description || "No description provided",
        status: ticketData.fields.status.name,
      };

      // 2. Transition to "In Progress"
      this.log("info", "Transitioning ticket status", {
        ticketId,
        toStatus: "In Progress",
      });
      await this.jira.transitionTicket(ticketId, "In Progress");
      actions.push({
        type: "ticket_update",
        payload: { status: "In Progress" },
      });

      // 3. Analyze ticket with Ollama
      this.log("info", "Analyzing ticket with AI", { ticketId });

      // Fetch codebase structure
      this.log("info", "Fetching codebase structure", { ticketId });
      const structure = await this.github.getRepoStructure(
        this.targetOwner,
        this.targetRepo,
      );

      const analysis = await this.ollama.analyzeTicket(
        ticket.title,
        ticket.description,
        { structure },
      );

      const filesToChange = analysis.filesToChange || [];
      if (filesToChange.length === 0) {
        throw new Error(
          "AI could not identify files to change. Manual intervention required.",
        );
      }
      this.log("info", "AI analysis complete", {
        ticketId,
        filesToChange,
        complexity: analysis.complexity,
      });

      // 4. Create Feature Branch
      const branchName = `feature/${ticketId.toLowerCase()}-${Date.now()}`;
      this.log("info", "Creating feature branch", { ticketId, branchName });
      await this.github.createBranch(
        this.targetOwner,
        this.targetRepo,
        branchName,
      );
      actions.push({ type: "branch_create", payload: { branch: branchName } });

      // 5. Generate Code and Commit for each file
      const allFiles = [...filesToChange, ...(analysis.newFilesToCreate || [])];
      // Deduplicate files
      const uniqueFiles = Array.from(new Set(allFiles));

      for (const filePath of uniqueFiles) {
        this.log("info", "Processing file", { ticketId, filePath });

        // Fetch existing content
        this.log("info", "Fetching existing file content", {
          ticketId,
          filePath,
        });

        let existingContent = "";
        try {
          const content = await this.github.getFileContent(
            this.targetOwner,
            this.targetRepo,
            filePath,
            "main", // Get from main to ensure fresh base
          );
          existingContent = content || "";
        } catch (error) {
          this.log("info", "File not found, treating as new file", {
            ticketId,
            filePath,
          });
          existingContent = "";
        }

        // Generate new content
        this.log("info", "Generating code with AI", { ticketId, filePath });

        this.log("info", "Analysis for file", {
          ticketId,
          filePath,
          analysisSummary: analysis.summary,
        });

        const { code, explanation } = await this.ollama.generateCode(
          ticket,
          existingContent,
          filePath,
          analysis,
        );
        this.log("info", "Code generation successful", {
          ticketId,
          filePath,
          codeLength: code.length,
        });

        // Commit changes
        this.log("info", "Committing changes to branch", {
          ticketId,
          filePath,
          branchName,
        });
        await this.github.createOrUpdateFile(
          this.targetOwner,
          this.targetRepo,
          filePath,
          code,
          `Fix(${ticketId}): ${analysis.summary}`,
          branchName,
        );
        actions.push({ type: "code_change", payload: { file: filePath } });
      }

      // 6. Create Pull Request
      this.log("info", "Creating Pull Request", { ticketId });
      const pr = await this.github.createPullRequest(
        this.targetOwner,
        this.targetRepo,
        `${ticketId}: ${ticket.title}`,
        branchName,
        "main",
        `### Description
          ${analysis.summary}
          
          ### Suggested Action
          ${analysis.suggestedAction}
          
          ### Complexity
          ${analysis.complexity}
          
          Auto-generated by Autonomous Agent.`,
      );
      actions.push({ type: "pr_create", payload: { prUrl: pr.html_url } });

      // 7. Comment on Jira with PR link
      this.log("info", "Adding PR comment to Jira", {
        ticketId,
        prUrl: pr.html_url,
      });
      await this.jira.addComment(
        ticketId,
        `I have processed this ticket. A Pull Request has been created: ${pr.html_url}`,
      );

      // 8. Transition to "In Review" or "Done"
      this.log("info", "Transitioning to In Review", { ticketId });
      try {
        await this.jira.transitionTicket(ticketId, "In Review");
      } catch (e) {
        this.log(
          "warn",
          "Could not transition to In Review, attempting Done or skipping",
          { ticketId },
        );
      }

      this.log("info", "Ticket processing completed successfully", {
        ticketId,
      });
      return {
        success: true,
        actions: actions,
        message: `Processed ticket ${ticketId} successfully. PR: ${pr.html_url}`,
      };
    } catch (error: any) {
      this.log("error", "Agent failed to process ticket", {
        ticketId,
        error: error.message,
        stack: error.stack,
      });

      // Comprehensive Rollback
      try {
        // 1. Comment on Jira
        await this.jira.addComment(
          ticketId,
          `❌ Automated processing failed.\n\nError: ${error.message}\n\nPlease check logs for details.`,
        );

        // 2. Attempt to revert status if it was changed
        if (initialStatus) {
          this.log("info", "Attempting to revert ticket status", {
            ticketId,
            targetStatus: initialStatus,
          });
          // This is tricky because we need the transition ID for 'To Do' or whatever initialStatus was.
          // We'll try to transition back to 'To Do' as a safe default if initialStatus matches common names.
          // Or just leave it In Progress so a human sees it.
          // Let's try 'To Do' if it's not 'Done'.
          try {
            await this.jira.transitionTicket(ticketId, "To Do");
          } catch (revertError) {
            this.log("warn", "Failed to revert ticket status", {
              ticketId,
              error: revertError,
            });
          }
        }
      } catch (e) {
        this.log("error", "Critical: Failed during error handling rollback", {
          ticketId,
          error: e,
        });
      }

      return {
        success: false,
        actions: actions,
        message: `Failed to process ticket: ${error.message}`,
      };
    } finally {
      this.processingTickets.delete(ticketId);
    }
  }

  async handleWebhook(payload: any) {
    // Basic webhook handling logic
    if (payload.issue && payload.action === "opened") {
      // Handle GitHub issue opening if needed
      const issue = payload.issue;
      await this.github.createComment(
        payload.repository.owner.login,
        payload.repository.name,
        issue.number,
        "I have received this issue and am analyzing it.",
      );
    }
  }
}
