import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentState } from "../state";
import {
  EM_SYSTEM_PROMPT,
  EM_SURGICAL_SYSTEM_PROMPT,
  getEMUserPrompt,
} from "../prompts/emPrompts";
import { ExecutionPlanSchema } from "../schema";
import { extractTokenUsage } from "../metrics-utils";
import { setPipelineState } from "../../pipeline-state";

/**
 * The Engineering Manager (EM) Agent node.
 * Responsibilities:
 * 1. Receive the Feature List from PM.
 * 2. Analyze Architecture Profile.
 * 3. Generate a strict Technical Contract (Execution Plan).
 */
export async function emNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  await setPipelineState(state.ticketId, state.ticketSummary, "emNode");
  const { featureList, architectureProfile, codebaseTree, surgicalContext } =
    state;

  const mode = surgicalContext ? "SURGICAL" : "STANDARD";
  console.log(
    `\n👷 [EM Node] Drafting Technical Contract (${mode} MODE) for ${featureList?.featureList?.length || 0} features...`,
  );

  // Initialize the Gemini model (using Pro as requested)
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-pro-preview",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  // includeRaw: true returns { raw: BaseMessage, parsed: T } so we can read
  // usage_metadata from result.raw — same approach as validationNode/engineerNode.
  const structuredModel = model.withStructuredOutput(ExecutionPlanSchema, {
    name: "create_technical_contract",
    includeRaw: true,
  });

  // Build a priority-ordered component list for the EM.
  // Pages (app/) are entry points, not reusable — they come last and are capped small.
  // Shared/UI primitives and hooks are the highest-value context for reuse decisions.
  const existingComponents = (() => {
    if (!codebaseTree) return "No existing components detected.";

    const lines = codebaseTree.split("\n").filter((l) => {
      const t = l.trim();
      return t && /\.[a-z]+$/i.test(t); // files only, no bare directory entries
    });

    // Bucket 1 — shared/UI primitives (Button, LoadingSkeleton, ToastNotification…)
    const sharedUi = lines.filter(
      (l) => l.includes("components/shared/") || l.includes("components/ui/"),
    );

    // Bucket 2 — custom hooks (always good reuse candidates)
    const hooks = lines.filter((l) => l.includes("hooks/") || l.includes("/hooks/"));

    // Bucket 3 — other feature components (not shared/ui, not pages)
    const featureComponents = lines.filter(
      (l) =>
        l.includes("components/") &&
        !l.includes("components/shared/") &&
        !l.includes("components/ui/"),
    );

    // Bucket 4 — app pages (routing awareness only; capped at 20 to save tokens)
    const pages = lines
      .filter((l) => (l.includes("/app/") || l.includes("app/")) && l.includes("page."))
      .slice(0, 20);

    // Merge priority buckets, deduplicate, hard cap at 80 total
    const seen = new Set<string>();
    const result: string[] = [];
    for (const line of [...sharedUi, ...hooks, ...featureComponents, ...pages]) {
      if (!seen.has(line) && result.length < 80) {
        seen.add(line);
        result.push(line);
      }
    }
    return result.join("\n") || "No existing components detected.";
  })();

  // System prompt
  const systemPrompt = surgicalContext
    ? EM_SURGICAL_SYSTEM_PROMPT + "\n\n" + EM_SYSTEM_PROMPT // Append standard prompt for context if needed, or just replace
    : EM_SYSTEM_PROMPT;

  // User prompt
  const userPrompt = getEMUserPrompt(
    featureList?.featureList || [],
    architectureProfile!,
    existingComponents,
    surgicalContext,
  );

  console.log(
    `[EM Node][${state.ticketId}] Sending prompt to LLM — system: ${systemPrompt.length} chars, user: ${userPrompt.length} chars`,
  );

  // Generate the execution plan
  const { raw, parsed: result } = await structuredModel.invoke([
    ["system", systemPrompt],
    ["user", userPrompt],
  ]);

  const tokenUsage = extractTokenUsage(raw);

  if (!result) {
    throw new Error(
      `[EM Node][${state.ticketId}] Structured output returned null — model failed to conform to ExecutionPlan schema. Raw response type: ${raw?.constructor?.name ?? "unknown"}.`,
    );
  }

  console.log(`✅ [EM Node][${state.ticketId}] Technical Contract Generated:`);
  console.log(`   Scope: ${result.featureScope}`);
  console.log(
    `   Files to Create: ${result.newFilesToCreate?.join(", ") || "None"}`,
  );
  console.log(
    `   Files to Modify: ${result.filesToModify?.join(", ") || "None"}`,
  );

  const duration = Date.now() - startTime;
  console.log(`⏱️ [EM Node][${state.ticketId}] Completed in ${duration}ms`);

  // Generate the execution plan summary for state persistence
  const planSummary = (result.newFilesToCreate || [])
    .map((f) => `- NEW FILE: ${f}`)
    .concat((result.filesToModify || []).map((f) => `- MODIFY: ${f}`))
    .join("\n");

  const implementationSummary = `STRATEGY: ${result.implementationInstructions}`;

  const fullExecutionPlan = `${planSummary}\n\n${implementationSummary}`;

  // Return the updated state
  // If this was a surgical escalation, reset the round counter so the engineer
  // starts fresh on the narrow surgical scope (round 1), and clear revision flags.
  // totalRoundCount is NOT reset — it is the monotonic hard cap counter.
  const isSurgical = !!surgicalContext;

  return {
    executionPlan: result,
    fullExecutionPlan,
    ...(isSurgical && {
      roundCount: 0,
      needsRevision: false,
      errorAttemptHistory: [],
    }),
    metrics: {
      nodeExecutionTimes: {
        emNode: duration,
      },
      nodeTokenUsage: {
        emNode: tokenUsage,
      },
      nodeCallCounts: {
        emNode: 1,
      },
    },
  };
}
