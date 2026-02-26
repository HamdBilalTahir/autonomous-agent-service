import { GitHubService } from "./github";
import { JiraService } from "./jira";
import { OllamaService } from "./ollama";
import { GeminiService } from "./gemini";
import { AgentPrompts } from "./prompts";
import { Ticket, AgentResponse } from "./types";

export class AutonomousAgent {
  private github: GitHubService;
  private jira: JiraService;
  private aiService: OllamaService | GeminiService;
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
    geminiApiKey?: string,
    aiProvider: "ollama" | "gemini" = "ollama",
    geminiModelName: string = "gemini-1.5-pro",
  ) {
    this.github = new GitHubService(githubToken);
    this.jira = new JiraService(jiraBaseUrl, jiraEmail, jiraToken);

    if (aiProvider === "gemini") {
      if (!geminiApiKey) {
        throw new Error(
          "Gemini API Key is required when using Gemini provider",
        );
      }
      this.aiService = new GeminiService(geminiApiKey, geminiModelName);
    } else {
      this.aiService = new OllamaService(ollamaUrl, "codegemma:2b", hfApiKey);
    }

    this.targetOwner = targetOwner;
    this.targetRepo = targetRepo;
    this.processingTickets = new Set<string>();
  }

  private log(level: "info" | "error" | "warn", message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...meta,
    };
    console.log(JSON.stringify(logData));
    // Also print a human readable version for easier debugging during development
    if (process.env.NODE_ENV !== "production") {
      console.log(`[${level.toUpperCase()}] ${message}`, meta ? meta : "");
    }
  }

  async checkHealth(): Promise<{
    github: boolean;
    jira: boolean;
    ai: boolean;
  }> {
    const [github, jira, ai] = await Promise.all([
      this.github.checkHealth(),
      this.jira.checkHealth(),
      this.aiService.checkHealth(),
    ]);

    return { github, jira, ai };
  }

  async getCurrentUser() {
    return this.jira.getCurrentUser();
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
      this.log("info", "[Step 1] Fetching ticket details", { ticketId });
      const ticketData = await this.jira.getTicket(ticketId);
      initialStatus = ticketData.fields.status.name;
      this.log("info", "[Step 1] Ticket details fetched", {
        status: initialStatus,
      });

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
      this.log("info", "[Step 2] Transitioning ticket status", {
        ticketId,
        toStatus: "In Progress",
      });
      await this.jira.transitionTicket(ticketId, "In Progress");
      actions.push({
        type: "ticket_update",
        payload: { status: "In Progress" },
      });
      this.log("info", "[Step 2] Ticket status transitioned");

      // 3. Analyze ticket with AI
      this.log("info", "[Step 3] Starting AI Analysis", { ticketId });

      let structure: (string | undefined)[] = [];
      try {
        // Fetch codebase structure
        this.log("info", "[Step 3.1] Fetching codebase structure", {
          ticketId,
        });
        structure = await this.github.getRepoStructure(
          this.targetOwner,
          this.targetRepo,
        );
        this.log("info", "[Step 3.1] Codebase structure fetched", {
          fileCount: structure.length,
        });
      } catch (error: any) {
        this.log("error", "[Step 3.1] Failed to fetch codebase structure", {
          error: error.message,
        });
        throw new Error(`Failed to fetch codebase structure: ${error.message}`);
      }

      let analysis;
      try {
        this.log("info", "[Step 3.2] Calling AI Service analyzeTicket", {
          provider:
            this.aiService instanceof GeminiService ? "Gemini" : "Ollama",
        });

        analysis = await this.aiService.analyzeTicket(
          ticket.title,
          ticket.description,
          { structure },
        );

        this.log("info", "[Step 3.2] AI Service analysis returned", {
          analysisSummary: analysis.summary,
        });
      } catch (error: any) {
        this.log("error", "[Step 3.2] AI Analysis failed", {
          error: error.message,
        });
        throw new Error(`AI Analysis failed: ${error.message}`);
      }

      const filesToChange = analysis.filesToChange || [];
      const newFilesToCreate = analysis.newFilesToCreate || [];

      if (filesToChange.length === 0 && newFilesToCreate.length === 0) {
        const errorMsg =
          "AI could not identify files to change or create. Manual intervention required.";
        this.log("error", `[Step 3] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      this.log("info", "[Step 3] AI analysis complete", {
        ticketId,
        filesToChange,
        newFilesToCreate,
        complexity: analysis.complexity,
      });

      // 4. Create Feature Branch
      let slugifiedTitle = ticket.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      if (!slugifiedTitle) {
        slugifiedTitle = "feature";
      }

      const branchName = `feature/${ticketId.toLowerCase()}-${slugifiedTitle}`;
      this.log("info", "[Step 4] Creating feature branch", {
        ticketId,
        branchName,
      });
      await this.github.createBranch(
        this.targetOwner,
        this.targetRepo,
        branchName,
      );
      actions.push({ type: "branch_create", payload: { branch: branchName } });
      this.log("info", "[Step 4] Feature branch created");

      // 5. Generate Code and Commit for each file
      const allFiles = [...filesToChange, ...(analysis.newFilesToCreate || [])];
      // Deduplicate files
      const uniqueFiles = Array.from(new Set(allFiles));
      this.log("info", "[Step 5] Processing files", { uniqueFiles });

      for (const filePath of uniqueFiles) {
        this.log("info", `[Step 5.1] Processing file: ${filePath}`, {
          ticketId,
        });

        // Fetch existing content
        this.log(
          "info",
          `[Step 5.2] Fetching existing content for ${filePath}`,
        );

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
          this.log(
            "info",
            `[Step 5.2] File not found, treating as new file: ${filePath}`,
          );
          existingContent = "";
        }

        // Generate new content
        this.log("info", `[Step 5.3] Generating code for ${filePath}`);

        const { code, explanation } = await this.aiService.generateCode(
          ticket,
          existingContent,
          filePath,
          analysis,
        );
        this.log("info", `[Step 5.3] Code generated for ${filePath}`, {
          codeLength: code.length,
        });

        // Commit changes
        this.log("info", `[Step 5.4] Committing changes for ${filePath}`, {
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
        this.log("info", `[Step 5.4] Changes committed for ${filePath}`);
      }

      // 6. Create Pull Request
      this.log("info", "[Step 6] Creating Pull Request", { ticketId });
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
