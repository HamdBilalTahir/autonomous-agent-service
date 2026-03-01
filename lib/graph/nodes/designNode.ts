import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  DESIGN_SYSTEM_PROMPT,
  DESIGN_SURGICAL_SYSTEM_PROMPT,
  getDesignUserPrompt,
} from "../prompts/designPrompts";
import { DesignSpecificationsSchema } from "../schema";
import { extractTokenUsage } from "../metrics-utils";
import { setPipelineState } from "../../pipeline-state";

/**
 * The Design Agent node.
 * Responsibilities:
 * 1. Analyze feature requirements and PM execution plan.
 * 2. Generate comprehensive design specifications.
 */
export async function designNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  await setPipelineState(state.ticketId, state.ticketSummary, "designNode");
  const {
    ticketSummary,
    ticketDescription,
    executionPlan,
    architectureProfile,
    projectContext,
    surgicalContext,
    codebaseTree,
    installedPackages,
  } = state;

  const mode = surgicalContext ? "SURGICAL" : "STANDARD";
  console.log(
    `\n🎨 [Design Node][${state.ticketId}] Starting design analysis (${mode} MODE) for ticket:`,
    state.ticketSummary,
  );

  // Initialize the Gemini model
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.2, // Low temperature for consistent design systems
  });

  const structuredModel = model.withStructuredOutput(
    DesignSpecificationsSchema,
    {
      name: "create_design_specifications",
      includeRaw: true,
    },
  );

  // Format architecture profile for the prompt
  const profileString = architectureProfile
    ? `ARCHITECTURE PROFILE:
- Framework: ${architectureProfile.framework}
- UI Library: ${architectureProfile.uiLibrary}
- Styling: ${architectureProfile.stylingStrategy}
- Theme: Colors=${architectureProfile.theme?.colors}, Spacing=${architectureProfile.theme?.spacing}
- Components: ${architectureProfile.componentPatterns.join(", ")}
- State Management: ${architectureProfile.stateManagement.join(", ")}
- API Patterns: ${architectureProfile.apiPatterns.join(", ")}
- Fonts: ${architectureProfile.fonts.join(", ")}`
    : projectContext; // Fallback

  // Format execution plan for the prompt
  const planString = `
Feature Scope: ${executionPlan.featureScope}
New Files: ${executionPlan.newFilesToCreate.join(", ")}
Modified Files: ${executionPlan.filesToModify.join(", ")}
Instructions:
${executionPlan.implementationInstructions}
`;

  // Detect actual UI library from installed packages — more reliable than architectureProfile
  // which reads the agent's own filesystem, not the target project.
  const detectedLibs = (installedPackages ?? []).filter((p) =>
    [
      "tailwindcss", "framer-motion", "react-spring",
      "@radix-ui", "shadcn", "@shadcn", "@mui", "antd",
      "lucide-react", "@heroicons", "react-icons",
    ].some((lib) => p.startsWith(lib)),
  );

  // Filter codebase tree to design-relevant files only (config, globals, ui components)
  const designRelevantFiles = (codebaseTree ?? "")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return (
        t &&
        (t.includes("globals.css") ||
          t.includes("tailwind.config") ||
          t.includes("theme") ||
          t.includes("components/ui/") ||
          t.includes("components/shared/") ||
          t.includes("tokens") ||
          t.includes("styles/"))
      );
    })
    .slice(0, 30)
    .join("\n");

  const systemPrompt = surgicalContext
    ? DESIGN_SURGICAL_SYSTEM_PROMPT
    : DESIGN_SYSTEM_PROMPT;

  // User prompt with context
  const userPrompt = getDesignUserPrompt(
    ticketSummary,
    ticketDescription,
    profileString,
    planString,
    surgicalContext,
    detectedLibs,
    designRelevantFiles,
  );

  console.log(
    `[Design Node][${state.ticketId}] Sending prompt to LLM — system: ${systemPrompt.length} chars, user: ${userPrompt.length} chars`,
  );

  const { raw, parsed: result } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

  console.log(`✅ [Design Node][${state.ticketId}] Design Specifications Generated:`);
  console.log(`   Colors — Primary: ${result.colorSystem.primary} | Secondary: ${result.colorSystem.secondary} | Accent: ${result.colorSystem.accent}`);
  console.log(`   Semantic — Success: ${result.colorSystem.semantic?.success} | Error: ${result.colorSystem.semantic?.error} | Warning: ${result.colorSystem.semantic?.warning}`);
  console.log(`   Typography — ${result.typography.headings.length} heading levels | Body: ${result.typography.body?.fontSize} / lh ${result.typography.body?.lineHeight}`);
  console.log(`   Spacing — Grid: ${result.spacing?.grid} | Scale: ${result.spacing?.scale?.slice(0, 4).join(", ")}…`);
  console.log(`   Animations — Fast: ${result.animations?.durations?.fast} | Normal: ${result.animations?.durations?.normal}`);
  console.log(`   Components (${result.components.length}):`);
  result.components.forEach((c) =>
    console.log(`     • ${c.name} — variants: [${c.variants?.join(", ")}] | states: [${c.states?.join(", ")}]`),
  );

  const duration = Date.now() - startTime;
  console.log(`⏱️ [Design Node][${state.ticketId}] Completed in ${duration}ms`);

  // Return the updated state
  return {
    designSpecifications: result,
    metrics: {
      nodeExecutionTimes: {
        designNode: duration,
      },
      nodeTokenUsage: {
        designNode: tokenUsage,
      },
      nodeCallCounts: {
        designNode: 1,
      },
    },
  };
}
