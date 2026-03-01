import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ArchitectureProfileSchema } from "../schema";
import {
  ARCHITECTURE_SYSTEM_PROMPT,
  getArchitectureUserPrompt,
} from "../prompts/architecturePrompts";
import { analyzeProjectContext, getInstalledPackages } from "../../project-context";
import { getCached, setCached } from "../../cache";
import { createHash } from "crypto";
import { extractTokenUsage } from "../metrics-utils";

/**
 * The Architecture Understanding Agent node.
 * Responsibilities:
 * 1. Deeply scan the codebase (configs, dependencies, layout).
 * 2. Generate a structured Architecture Profile.
 * 3. Provide this context to downstream agents (PM, Engineer, Validation).
 */
export async function architectureNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  console.log(
    `\n🏛️ [Architecture Node][${state.ticketId}] Analyzing project structure...`,
  );

  // Analyze the project context (files, configs)
  // This reuses the logic we built earlier, but now it feeds the Architecture Agent
  const [rawProjectContext, installedPackages] = await Promise.all([
    analyzeProjectContext(),
    getInstalledPackages(),
  ]);

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
