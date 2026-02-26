import { z } from "zod";

export const ExecutionPlanSchema = z.object({
  featureScope: z
    .string()
    .describe(
      "Briefly explain if this requires new routes, modifying existing pages, or just isolated components based on the Next.js App Router structure.",
    ),
  newFilesToCreate: z
    .array(z.string())
    .describe(
      "Exact file paths of entirely new files that need to be created (e.g., 'src/app/profile/page.tsx'). Must be an array of strings.",
    ),
  filesToModify: z
    .array(z.string())
    .describe(
      "Exact file paths of existing files that need to be updated (e.g., 'src/components/index.ts'). Must be an array of strings.",
    ),
  implementationInstructions: z
    .string()
    .describe(
      "Highly detailed, step-by-step technical instructions for the frontend engineer. Include the logic, required UI elements, and Tailwind structure. Do not write code. Format as a markdown list.",
    ),
});

// Export the TypeScript type for use in our LangGraph State
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
