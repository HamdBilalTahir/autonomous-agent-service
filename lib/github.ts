import { Octokit } from "@octokit/rest";
import { withRetry } from "./utils/retry";

/**
 * Generates a short, specific conventional commit message for a single file
 * based on its path. Avoids the "same message for every file" problem.
 *
 * Examples:
 *   src/app/onboarding/page.tsx          → feat(onboarding): add onboarding page
 *   src/components/profile/AvatarCard.tsx → feat(profile): add avatar card component
 *   src/hooks/useOnboardingWizard.ts      → feat(hooks): add useOnboardingWizard hook
 *   src/app/api/users/route.ts            → feat(api): add users endpoint
 *   src/app/settings/layout.tsx           → feat(settings): add settings layout
 */
function generateFileCommitMessage(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] ?? filePath;
  const fileNameNoExt = fileName.replace(/\.(tsx?|jsx?|css|json|mjs|cjs)$/, "");

  // Derive conventional commit type from file characteristics
  let type = "feat";
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(fileName)) type = "test";
  else if (/\.(css|scss|sass)$/.test(fileName)) type = "style";

  // Derive scope from the directory structure
  let scope = "";
  const apiIdx = parts.findIndex((p) => p === "api");
  const compIdx = parts.findIndex((p) => p === "components");
  const appIdx = parts.findIndex((p) => p === "app");
  const hooksIdx = parts.findIndex((p) => p === "hooks");
  const libIdx = parts.findIndex((p) => p === "lib");
  const utilsIdx = parts.findIndex((p) => p === "utils");

  if (apiIdx !== -1) {
    scope = "api";
  } else if (hooksIdx !== -1) {
    scope = "hooks";
  } else if (compIdx !== -1 && parts[compIdx + 1]) {
    // Use the subfolder under components (e.g. components/onboarding → onboarding)
    scope = parts[compIdx + 1].toLowerCase();
  } else if (
    appIdx !== -1 &&
    parts[appIdx + 1] &&
    parts[appIdx + 1] !== "api"
  ) {
    scope = parts[appIdx + 1].toLowerCase();
  } else if (libIdx !== -1) {
    scope = "lib";
  } else if (utilsIdx !== -1) {
    scope = "utils";
  }

  // Derive human-readable subject from the file name
  // Convert PascalCase/camelCase to kebab words: UserProfile → user profile
  const toWords = (s: string) =>
    s
      .replace(/([A-Z])/g, " $1")
      .trim()
      .toLowerCase();

  let subject = "";
  if (fileNameNoExt === "page") {
    const parent = parts[parts.length - 2] ?? scope;
    subject = `add ${parent} page`;
  } else if (fileNameNoExt === "layout") {
    const parent = parts[parts.length - 2] ?? scope;
    subject = `add ${parent} layout`;
  } else if (fileNameNoExt === "route") {
    const parent = parts[parts.length - 2] ?? "api route";
    subject = `add ${parent} endpoint`;
  } else if (fileNameNoExt === "loading") {
    const parent = parts[parts.length - 2] ?? scope;
    subject = `add ${parent} loading skeleton`;
  } else if (fileNameNoExt === "error") {
    const parent = parts[parts.length - 2] ?? scope;
    subject = `add ${parent} error boundary`;
  } else if (fileNameNoExt.startsWith("use")) {
    subject = `add ${toWords(fileNameNoExt)} hook`;
  } else if (
    fileNameNoExt.endsWith("Context") ||
    fileNameNoExt.endsWith("Provider")
  ) {
    subject = `add ${toWords(fileNameNoExt)}`;
  } else if (fileNameNoExt.endsWith("Schema") || fileNameNoExt === "schema") {
    subject = `add ${scope || fileNameNoExt} schema`;
  } else if (fileNameNoExt === "types" || fileNameNoExt === "index") {
    subject = scope ? `add ${scope} ${fileNameNoExt}` : `add ${fileNameNoExt}`;
  } else {
    subject = `add ${toWords(fileNameNoExt)} component`;
  }

  const scopePart = scope ? `(${scope})` : "";
  // Cap at 72 chars — conventional commit best practice
  return `${type}${scopePart}: ${subject}`.slice(0, 72);
}

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async getIssue(owner: string, repo: string, issueNumber: number) {
    return withRetry(async () => {
      const { data } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      return data;
    });
  }

  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ) {
    await withRetry(async () => {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body: string,
  ) {
    console.log(`[GitHub] Creating PR: ${title} (${head} -> ${base})`);
    return withRetry(async () => {
      try {
        const { data } = await this.octokit.pulls.create({
          owner,
          repo,
          title,
          head,
          base,
          body,
        });
        console.log(`[GitHub] PR Created: ${data.html_url}`);
        return data;
      } catch (error) {
        console.error("[GitHub] Failed to create PR:", error);
        throw error;
      }
    });
  }

  async getReference(owner: string, repo: string, ref: string) {
    return withRetry(async () => {
      const { data } = await this.octokit.git.getRef({
        owner,
        repo,
        ref, // e.g. 'heads/main'
      });
      return data;
    });
  }

  async checkBranchExists(
    owner: string,
    repo: string,
    branchName: string,
  ): Promise<boolean> {
    try {
      await withRetry(async () => {
        await this.octokit.git.getRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromBranch: string = "main",
  ) {
    try {
      await withRetry(async () => {
        // Get the sha of the fromBranch
        const ref = await this.getReference(owner, repo, `heads/${fromBranch}`);
        const sha = ref.object.sha;

        // Create the new branch
        console.log(
          `[GitHub] Creating branch ${branchName} from ${fromBranch}...`,
        );
        await this.octokit.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha,
        });
        console.log(`[GitHub] Created branch ${branchName}`);
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).status === 422) {
        console.log(`Branch ${branchName} likely already exists.`);
        return; // Assume exists
      }
      throw error;
    }
  }

  async deleteBranch(owner: string, repo: string, branchName: string) {
    try {
      console.log(`[GitHub] Deleting branch ${branchName}...`);
      await withRetry(async () => {
        await this.octokit.git.deleteRef({
          owner,
          repo,
          ref: `heads/${branchName}`,
        });
      });
      console.log(`[GitHub] Deleted branch ${branchName}`);
    } catch (error) {
      console.warn(
        `[GitHub] Failed to delete branch ${branchName}:`,
        (error as Error).message,
      );
      // Don't throw, as this is a cleanup operation
    }
  }

  async generateBranchName(
    owner: string,
    repo: string,
    ticketId: string,
    summary: string,
    type: string = "feature",
    manualSlug?: string,
  ): Promise<string> {
    const sanitize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

    let slug = "";
    if (manualSlug && manualSlug.length > 0) {
      slug = manualSlug;
    } else {
      // Fallback: Generate meaningful slug from summary if manual slug is missing
      slug = sanitize(summary).split("-").slice(0, 4).join("-");
    }

    const typeMap: Record<string, string> = {
      feature: "feature",
      bug: "bugfix",
      chore: "chore",
      styling: "style",
      content: "docs",
    };
    const prefix = typeMap[type.toLowerCase()] || "feature";
    const baseName = `${prefix}/${ticketId.toLowerCase()}-${slug}`;

    // 1. Check feature/{ticketId}-{title}
    if (!(await this.checkBranchExists(owner, repo, baseName))) {
      return baseName.substring(0, 250); // Git ref limit compliance
    }

    // 2. Check feature/{ticketId}-{title}-{timestamp}
    const timestamp = Date.now();
    const timestampName = `${baseName}-${timestamp}`.substring(0, 250);
    if (!(await this.checkBranchExists(owner, repo, timestampName))) {
      return timestampName;
    }

    // 3. Fallback: feature/{ticketId}-{hash}
    const hash = Math.random().toString(36).substring(2, 8);
    return `feature/${ticketId.toLowerCase()}-${hash}`;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ) {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (Array.isArray(data) || !("content" in data)) {
        throw new Error(`Path ${path} is a directory or invalid`);
      }

      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch (error) {
      console.error(`Error fetching file ${path}:`, (error as Error).message);
      return null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.octokit.users.getAuthenticated();
      return true;
    } catch {
      // console.error("GitHub health check failed:", e);
      return false;
    }
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
  ) {
    await withRetry(async () => {
      // Check if file exists to get sha (for update)
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });
        if (!Array.isArray(data) && "sha" in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist, which is fine for creation
      }

      console.log(`[GitHub] Pushing file ${path} to branch ${branch}...`);
      try {
        await this.octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message,
          content: Buffer.from(content).toString("base64"),
          branch,
          sha,
        });
        console.log(`[GitHub] Successfully pushed ${path}`);
      } catch (error) {
        console.error(`[GitHub] Failed to push ${path}:`, error);
        throw error;
      }
    });
  }

  async listFiles(owner: string, repo: string, path: string = "") {
    return withRetry(async () => {
      // This is a simplified list, might need recursive tree for full codebase
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(data)) {
        return data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
        }));
      }
      return [];
    });
  }

  async listBranches(owner: string, repo: string) {
    return withRetry(async () => {
      const { data } = await this.octokit.repos.listBranches({
        owner,
        repo,
      });
      return data.map((branch) => branch.name);
    });
  }

  async getRepoStructure(owner: string, repo: string, branch: string = "main") {
    try {
      return await withRetry(async () => {
        // Get the sha of the branch
        const { data: refData } = await this.octokit.git.getRef({
          owner,
          repo,
          ref: `heads/${branch}`,
        });
        const sha = refData.object.sha;

        // Get the tree recursively
        const { data } = await this.octokit.git.getTree({
          owner,
          repo,
          tree_sha: sha,
          recursive: "true",
        });

        // Filter out node_modules, .git, and other noise
        // Return a list of file paths
        return data.tree
          .filter(
            (item) =>
              item.path &&
              !item.path.startsWith("node_modules") &&
              !item.path.startsWith(".git") &&
              !item.path.startsWith("dist") &&
              !item.path.startsWith(".next"),
          )
          .map((item) => item.path);
      });
    } catch (error) {
      console.error("Error fetching repo structure:", error);
      return [];
    }
  }

  async processChangesAndCreatePR(
    owner: string,
    repo: string,
    ticketId: string,
    summary: string,
    generatedCode: { filePath: string; fileContent: string }[],
    executionPlan: { featureScope: string; implementationInstructions: string },
    ticketType: string = "feature",
    branchSlug?: string,
    baseBranch: string = "main",
  ) {
    let branchName: string | undefined;

    try {
      // Create Branch
      branchName = await this.generateBranchName(
        owner,
        repo,
        ticketId,
        summary,
        ticketType,
        branchSlug,
      );

      // Verify branch name format (feature/TICKET-slug)
      console.log(`[GitHub] Generated branch name: ${branchName}`);

      await this.createBranch(owner, repo, branchName);

      // Push Code
      for (const file of generatedCode) {
        // Generate a file-specific commit message so each commit describes
        // exactly what that file adds, instead of repeating the ticket summary.
        const message = generateFileCommitMessage(file.filePath);

        await this.createOrUpdateFile(
          owner,
          repo,
          file.filePath,
          file.fileContent,
          message,
          branchName,
        );
      }

      // Create PR
      const prBody = `
### Execution Plan
${executionPlan?.implementationInstructions || "Automated implementation"}

### Feature Scope
${executionPlan?.featureScope || "N/A"}

Auto-generated by LangGraph Agent.
`;
      const pr = await this.createPullRequest(
        owner,
        repo,
        `${ticketId}: ${summary}`,
        branchName,
        baseBranch,
        prBody,
      );

      return pr;
    } catch (error) {
      console.error(
        "[GitHub] Process failed, rolling back branch...",
        (error as Error).message,
      );
      if (branchName) {
        await this.deleteBranch(owner, repo, branchName);
      }
      throw error;
    }
  }
}
