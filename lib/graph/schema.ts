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
  storyPoints: z
    .number()
    .describe(
      "Estimate the effort using Fibonacci sequence (1, 2, 3, 5, 8). 1 = simple text change, 3 = standard component, 5 = complex component with state/routing, 8 = massive refactor.",
    ),
  priority: z
    .enum(["Highest", "High", "Medium", "Low", "Lowest"])
    .describe(
      "Assess the severity/priority of this ticket based on its description.",
    ),
});

// Export the TypeScript type for use in our LangGraph State
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const ArchitectureProfileSchema = z.object({
  nextJsVersion: z.string().describe("Detected Next.js version."),
  configStyle: z
    .string()
    .describe("Next.js configuration format (e.g., next.config.js)."),
  tailwindVersion: z.string().describe("Detected Tailwind CSS version."),
  fonts: z.array(z.string()).describe("List of available/configured fonts."),
  componentPatterns: z
    .array(z.string())
    .describe("Identified component patterns (e.g., atomic, feature-based)."),
  stateManagement: z
    .array(z.string())
    .describe("State management libraries or patterns used."),
  apiPatterns: z
    .array(z.string())
    .describe("API route patterns (e.g., app/api, pages/api)."),
  stylingApproach: z
    .string()
    .describe("Primary styling approach (e.g., Tailwind, CSS Modules)."),
});

export type ArchitectureProfile = z.infer<typeof ArchitectureProfileSchema>;
