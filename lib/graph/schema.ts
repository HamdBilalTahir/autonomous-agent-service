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

export const DesignSpecificationsSchema = z.object({
  colorSystem: z.object({
    primary: z.string().describe("Primary brand color hex code"),
    secondary: z.string().describe("Secondary brand color hex code"),
    accent: z.string().describe("Accent/Highlight color hex code"),
    neutral: z
      .array(z.string())
      .describe("Array of neutral shades from lightest to darkest"),
    semantic: z.object({
      success: z.string(),
      warning: z.string(),
      error: z.string(),
      info: z.string(),
    }),
  }),
  typography: z.object({
    headings: z.array(
      z.object({
        level: z.string(),
        fontSize: z.string(),
        fontWeight: z.string(),
        lineHeight: z.string(),
      }),
    ),
    body: z.object({
      fontSize: z.string(),
      fontWeight: z.string(),
      lineHeight: z.string(),
    }),
  }),
  spacing: z.object({
    scale: z.array(z.string()).describe("Spacing scale values (e.g., rems)"),
    grid: z.string().describe("Grid base unit (e.g., 8px)"),
  }),
  animations: z.object({
    durations: z.object({
      fast: z.string(),
      normal: z.string(),
      slow: z.string(),
    }),
    easings: z.object({
      easeOut: z.string(),
      easeInOut: z.string(),
    }),
  }),
  components: z.array(
    z.object({
      name: z.string(),
      variants: z.array(z.string()),
      states: z.array(z.string()),
      interactions: z.array(z.string()),
    }),
  ),
});

export type DesignSpecifications = z.infer<typeof DesignSpecificationsSchema>;

export const TicketClassificationSchema = z.object({
  complexity: z
    .enum(["Low", "Medium", "High"])
    .describe("The estimated complexity of the task."),
  type: z
    .enum(["Feature", "Bug", "Chore", "Styling", "Content"])
    .describe("The type of the ticket."),
  reasoning: z.string().describe("Brief explanation for the classification."),
  branchSlug: z
    .string()
    .describe(
      "A concise, hyphenated slug summarizing the task in 2-4 words (e.g., 'add-login-page', 'fix-nav-zindex'). Do not include ticket ID or prefixes.",
    ),
  commitMessage: z
    .string()
    .describe(
      "A Conventional Commit message summarizing the change (e.g., 'feat: add login page implementation'). Do not include the ticket ID.",
    ),
  priority: z
    .enum(["Highest", "High", "Medium", "Low", "Lowest"])
    .describe(
      "Assess the severity/priority of this ticket based on its description.",
    ),
  storyPoints: z
    .number()
    .describe(
      "Estimate the effort using Fibonacci sequence (1, 2, 3, 5, 8). 1 = simple text change, 3 = standard component, 5 = complex component with state/routing, 8 = massive refactor.",
    ),
});

export type TicketClassification = z.infer<typeof TicketClassificationSchema>;

export const ValidationSchema = z.object({
  criticalErrors: z
    .array(z.string())
    .describe(
      "Compilation-breaking errors. Format: '[CRITICAL] path/to/file.tsx:LineNumber - THE PROBLEM: {Error} THE CONTEXT: {Sibling/Interface} THE STRATEGY: {Pivot instruction}'",
    ),
  warnings: z
    .array(z.string())
    .describe(
      "Style issues. Format: '[WARNING] path/to/file.tsx:LineNumber - THE PROBLEM: {Issue} THE CONTEXT: {Why it matters} THE STRATEGY: {Fix instruction}'",
    ),
});

export type ValidationResult = z.infer<typeof ValidationSchema>;
