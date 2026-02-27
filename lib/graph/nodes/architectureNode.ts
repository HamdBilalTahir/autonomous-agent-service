import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ArchitectureProfileSchema } from "../schema";
import {
  ARCHITECTURE_SYSTEM_PROMPT,
  getArchitectureUserPrompt,
} from "../prompts/architecturePrompts";
import { analyzeProjectContext } from "../../project-context";
import { getCached, setCached } from "../../cache";
import { createHash } from "crypto";
import { createTokenUsageCallback } from "../metrics-utils";

/**
 * The Architecture Understanding Agent node.
 * Responsibilities:
 * 1. Deeply scan the codebase (configs, dependencies, layout).
 * 2. Generate a structured Architecture Profile.
 * 3. Provide this context to downstream agents (PM, Engineer, Validation).
 */
export async function architectureNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  console.log(`\n🏛️ [Architecture Node][${state.ticketId}] Analyzing project structure...`);

  // Analyze the project context (files, configs)
  // This reuses the logic we built earlier, but now it feeds the Architecture Agent
  const rawProjectContext = await analyzeProjectContext();

  // Generate cache key based on project context (which includes package.json content)
  const hash = createHash("md5").update(rawProjectContext).digest("hex");
  const cacheKey = `architecture_profile:${hash}`;

  // Check cache
  const cachedProfile = await getCached(cacheKey);
  if (cachedProfile) {
    console.log(`⚡ [Architecture Node][${state.ticketId}] Using cached profile.`);
    return {
      architectureProfile: JSON.parse(cachedProfile),
      projectContext: rawProjectContext,
    };
  }

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const structuredModel = model.withStructuredOutput(
    ArchitectureProfileSchema,
    {
      name: "generate_architecture_profile",
    },
  );

  const systemPrompt = ARCHITECTURE_SYSTEM_PROMPT;
  const userPrompt = getArchitectureUserPrompt(rawProjectContext);

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  const TokenHandler = createTokenUsageCallback(tokenUsage);

  const architectureProfile = await structuredModel.invoke(
    [
      ["system", systemPrompt],
      ["user", userPrompt],
    ],
    {
      callbacks: [new TokenHandler()],
    },
  );

  console.log(`✅ [Architecture Node][${state.ticketId}] Profile Generated:`);
  console.log(
    `   Next.js: ${architectureProfile.nextJsVersion} | Tailwind: ${architectureProfile.tailwindVersion}`,
  );
  console.log(`   Styling: ${architectureProfile.stylingApproach}`);
  console.log(`   Fonts: ${architectureProfile.fonts.join(", ")}`);

  // Cache the result
  await setCached(cacheKey, JSON.stringify(architectureProfile));

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Architecture Node][${state.ticketId}] Completed in ${duration}ms`);

  return {
    architectureProfile,
    // We can also keep the raw context string if needed, or let the profile replace it.
    // The previous implementation used 'projectContext' string.
    // To minimize breakage, we can keep 'projectContext' as the raw string,
    // and add 'architectureProfile' as the structured data.
    projectContext: rawProjectContext,
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
