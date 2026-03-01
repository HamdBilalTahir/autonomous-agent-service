import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  DESIGN_SYSTEM_PROMPT,
  DESIGN_SURGICAL_SYSTEM_PROMPT,
  getDesignUserPrompt,
} from "../prompts/designPrompts";
import { DesignSpecificationsSchema } from "../schema";
import { extractTokenUsage } from "../metrics-utils";

/**
 * The Design Agent node.
 * Responsibilities:
 * 1. Analyze feature requirements and PM execution plan.
 * 2. Generate comprehensive design specifications.
 */
export async function designNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const {
    ticketSummary,
    ticketDescription,
    executionPlan,
    architectureProfile,
    projectContext,
    surgicalContext,
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

  // User prompt with context
  const userPrompt = getDesignUserPrompt(
    ticketSummary,
    ticketDescription,
    profileString,
    planString,
    surgicalContext,
  );

  console.log(
    `[Design Node][${state.ticketId}] Sending Prompt to LLM:`,
    JSON.stringify({ userPrompt }, null, 2),
  );

  const systemPrompt = surgicalContext
    ? DESIGN_SURGICAL_SYSTEM_PROMPT
    : DESIGN_SYSTEM_PROMPT;

  const { raw, parsed: result } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

  console.log(
    `✅ [Design Node][${state.ticketId}] Design Specifications Generated:`,
  );
  console.log(`   Primary Color: ${result.colorSystem.primary}`);
  console.log(`   Typography Headings: ${result.typography.headings.length}`);
  console.log(`   Components Defined: ${result.components.length}`);

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
