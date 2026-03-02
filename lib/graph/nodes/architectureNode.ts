import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ArchitectureProfileSchema, type ArchitectureProfile } from "../schema";
import {
  ARCHITECTURE_SYSTEM_PROMPT,
  getArchitectureUserPrompt,
} from "../prompts/architecturePrompts";
import {
  analyzeProjectContext,
  getInstalledPackages,
} from "../../project-context";
import { getCached, setCached } from "../../cache";
import { createHash } from "crypto";
import { extractTokenUsage } from "../metrics-utils";
import { setPipelineState } from "../../pipeline-state";
import { GitHubService } from "../../github";

/**
 * The Architecture Understanding Agent node.
 * Responsibilities:
 * 1. Deeply scan the codebase (configs, dependencies, layout).
 * 2. Generate a structured Architecture Profile.
 * 3. Provide this context to downstream agents (PM, Engineer, Validation).
 */
export async function architectureNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  await setPipelineState(
    state.ticketId,
    state.ticketSummary,
    "architectureNode",
  );
  console.log(
    `\n🏛️ [Architecture Node][${state.ticketId}] Analyzing project structure...`,
  );

  // Retrieve user's GitHub OAuth token if available, otherwise fallback to env var
  const userToken = await getCached(`github_token:${state.ticketId}`);
  const token = userToken || process.env.GITHUB_TOKEN || "";
  const github = new GitHubService(token);

  const targetOwner = state.targetOwner;
  const targetRepo = state.targetRepo;
  const targetBranch = state.targetBranch || "main";

  if (!targetOwner || !targetRepo) {
    throw new Error(
      `[Architecture Node] Missing target repository info. State: owner=${targetOwner}, repo=${targetRepo}`,
    );
  }

  // Analyze the project context (files, configs)
  // This reuses the logic we built earlier, but now it feeds the Architecture Agent
  const [rawProjectContext, installedPackages, repoStructure] =
    await Promise.all([
      analyzeProjectContext(github, targetOwner, targetRepo, targetBranch),
      getInstalledPackages(github, targetOwner, targetRepo, targetBranch),
      github.getRepoStructure(targetOwner, targetRepo, targetBranch),
    ]);

  const codebaseTree = repoStructure.join("\n");

  // Check for empty repository or missing stack
  const hasPackageJson = repoStructure.includes("package.json");
  const isEssentiallyEmpty =
    repoStructure.length <= 2 &&
    repoStructure.every((f) => f === "README.md" || f === ".gitignore");

  if (!hasPackageJson || isEssentiallyEmpty) {
    console.log(
      `[Architecture Node][${state.ticketId}] Empty repository or missing stack detected. Defaulting to Next.js TypeScript stack.`,
    );

    const defaultProfile: ArchitectureProfile = {
      language: "TypeScript",
      framework: "Next.js",
      database: "None (Frontend Only)",
      uiLibrary: "Tailwind CSS",
      stylingStrategy: "Tailwind CSS",
      theme: {
        colors: "Default Tailwind Colors",
        spacing: "Default Tailwind Spacing",
        borderRadius: "0.5rem",
      },
      layout: {
        maxWidth: "screen-xl",
        gridSystem: "CSS Grid / Flexbox",
      },
      fonts: ["Inter"],
      configStyle: "next.config.mjs",
      componentPatterns: ["src/components/ui", "src/app/"],
      stateManagement: ["React Hooks"],
      apiPatterns: ["src/app/api/"],
      scaffoldInstructions: [
        "Initialize a new Next.js project with TypeScript, Tailwind CSS, and App Router.",
        "Create package.json with dependencies: next, react, react-dom, tailwindcss, postcss, autoprefixer, lucide-react, clsx, tailwind-merge.",
        "Create tsconfig.json for TypeScript configuration.",
        "Create next.config.mjs.",
        "Create tailwind.config.ts and postcss.config.mjs.",
        "Create src/app/layout.tsx with Inter font and global CSS import.",
        "Create src/app/page.tsx with a welcome message.",
        "Create src/app/globals.css with Tailwind directives.",
        "Create .gitignore.",
        "Ensure all new files are created in the correct directory structure.",
      ],
    };

    return {
      architectureProfile: defaultProfile,
      projectContext:
        "Project is empty. Needs scaffolding for Next.js TypeScript stack.",
      installedPackages: [],
      codebaseTree,
      metrics: {
        nodeExecutionTimes: { architectureNode: Date.now() - startTime },
        nodeTokenUsage: {
          architectureNode: {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
          },
        },
        nodeCallCounts: { architectureNode: 1 },
      },
    };
  }

  // Generate cache key based on project context (which includes package.json content)
  const hash = createHash("md5").update(rawProjectContext).digest("hex");
  const cacheKey = `architecture_profile:${hash}`;

  // Check cache
  const cachedProfile = await getCached(cacheKey);
  if (cachedProfile) {
    console.log(
      `⚡ [Architecture Node][${state.ticketId}] Using cached profile. (${installedPackages.length} packages detected)`,
    );
    return {
      architectureProfile: JSON.parse(cachedProfile),
      projectContext: rawProjectContext,
      installedPackages,
      codebaseTree,
    };
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const structuredModel = model.withStructuredOutput(
    ArchitectureProfileSchema,
    {
      name: "generate_architecture_profile",
      includeRaw: true,
    },
  );

  const systemPrompt = ARCHITECTURE_SYSTEM_PROMPT;
  const userPrompt = getArchitectureUserPrompt(rawProjectContext);

  const { raw, parsed: architectureProfile } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

  console.log(`✅ [Architecture Node][${state.ticketId}] Profile Generated:`);
  console.log(
    `   Language: ${architectureProfile.language} | Framework: ${architectureProfile.framework}`,
  );
  console.log(
    `   UI: ${architectureProfile.uiLibrary} | DB: ${architectureProfile.database}`,
  );
  console.log(
    `   Theme: ${architectureProfile.theme?.colors} | Spacing: ${architectureProfile.theme?.spacing}`,
  );
  console.log(
    `   Packages: ${installedPackages.length} installed (${installedPackages.slice(0, 5).join(", ")}${installedPackages.length > 5 ? "..." : ""})`,
  );

  // Cache the result
  await setCached(cacheKey, JSON.stringify(architectureProfile));

  const duration = Date.now() - startTime;
  console.log(
    `⏱️ [Architecture Node][${state.ticketId}] Completed in ${duration}ms`,
  );

  return {
    architectureProfile,
    projectContext: rawProjectContext,
    installedPackages,
    codebaseTree,
    metrics: {
      nodeExecutionTimes: {
        architectureNode: duration,
      },
      nodeTokenUsage: {
        architectureNode: tokenUsage,
      },
      nodeCallCounts: {
        architectureNode: 1,
      },
    },
  };
}
