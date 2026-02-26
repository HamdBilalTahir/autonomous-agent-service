import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import { ArchitectureProfileSchema } from "../schema";
import {
  ARCHITECTURE_SYSTEM_PROMPT,
  getArchitectureUserPrompt,
} from "../prompts/architecturePrompts";
import { analyzeProjectContext } from "../../project-context";

/**
 * The Architecture Understanding Agent node.
 * Responsibilities:
 * 1. Deeply scan the codebase (configs, dependencies, layout).
 * 2. Generate a structured Architecture Profile.
 * 3. Provide this context to downstream agents (PM, Engineer, Validation).
 */
export async function architectureNode(state: typeof AgentState.State) {
  console.log("\n🏛️ [Architecture Node] Analyzing project structure...");

  // Analyze the project context (files, configs)
  // This reuses the logic we built earlier, but now it feeds the Architecture Agent
  const rawProjectContext = await analyzeProjectContext();

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

  const architectureProfile = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  console.log("✅ [Architecture Node] Profile Generated:");
  console.log(
    `   Next.js: ${architectureProfile.nextJsVersion} | Tailwind: ${architectureProfile.tailwindVersion}`,
  );
  console.log(`   Styling: ${architectureProfile.stylingApproach}`);
  console.log(`   Fonts: ${architectureProfile.fonts.join(", ")}`);

  return {
    architectureProfile,
    // We can also keep the raw context string if needed, or let the profile replace it.
    // The previous implementation used 'projectContext' string.
    // To minimize breakage, we can keep 'projectContext' as the raw string,
    // and add 'architectureProfile' as the structured data.
    projectContext: rawProjectContext,
  };
}
