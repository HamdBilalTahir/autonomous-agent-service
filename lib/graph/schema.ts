import { z } from "zod";

export const FeatureListSchema = z.object({
  featureScope: z
    .string()
    .describe(
      "Briefly explain if this requires new routes, modifying existing pages, or just isolated components based on the Next.js App Router structure.",
    ),
  featureList: z
    .array(z.string())
    .describe(
      "A comprehensive, categorized list of actionable implementation tasks derived from the story audit. Each item is prefixed with a category tag: [CORE] for explicit story features, [NAV] for navigation/routing entry points, [STATE] for loading/error/empty states, [LAYOUT] for page layout requirements, [UX] for feedback/success/validation messages, [IMPACT] for updates to shared components. Inferred tasks not in the original story are prefixed with * (e.g., '* [NAV] Add sidebar link to new settings page'). Tasks must be specific enough for an engineer to implement without ambiguity.",
    ),
});

export type FeatureList = z.infer<typeof FeatureListSchema>;

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
      "Highly detailed, step-by-step technical instructions for the frontend engineer. Include the logic, required UI elements, and Tailwind structure. Do not write code. Format as a markdown list. MUST include exact TypeScript interfaces and prop names.",
    ),
  validationChecklist: z
    .array(z.string())
    .describe(
      "List of specific rules for the validation agent to check (e.g., 'must use ActivityEvent interface').",
    ),
  engineerType: z
    .enum(["frontend", "backend", "ai"])
    .default("frontend")
    .describe(
      "Which engineer agent should implement this plan. Use 'frontend' for UI/React/CSS work, 'backend' for API/server/database work, 'ai' for ML/model/AI pipeline work.",
    ),
});

// Export the TypeScript type for use in our LangGraph State
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const ArchitectureProfileSchema = z.object({
  language: z
    .string()
    .describe(
      "The primary programming language (e.g., TypeScript, JavaScript, Python, Go).",
    ),
  framework: z
    .string()
    .describe(
      "The primary web framework (e.g., Next.js, React, FastAPI, Django, Express).",
    ),
  database: z
    .string()
    .describe(
      "Detected database or ORM (e.g., Prisma, Drizzle, SQLAlchemy, Django ORM).",
    ),
  uiLibrary: z
    .string()
    .describe(
      "Primary UI/Component library (e.g., Tailwind, MUI, Bootstrap, Shadcn).",
    ),
  stylingStrategy: z
    .string()
    .describe(
      "Specific styling approach (e.g., Tailwind v3, CSS Modules, Styled Components).",
    ),
  theme: z
    .object({
      colors: z
        .string()
        .describe("Dominant color palette or theme system detected."),
      spacing: z
        .string()
        .describe("Spacing scale used (e.g., 4px base, rems)."),
      borderRadius: z.string().describe("Border radius conventions."),
    })
    .describe("Visual design system details."),
  layout: z
    .object({
      maxWidth: z.string().describe("Standard max-width for containers."),
      gridSystem: z.string().describe("Grid system or layout approach."),
    })
    .describe("Layout structure details."),
  fonts: z
    .array(z.string())
    .describe("List of used fonts (e.g., Inter, Roboto)."),
  configStyle: z
    .string()
    .describe("Configuration format (e.g., next.config.js, pyproject.toml)."),
  componentPatterns: z
    .array(z.string())
    .describe("Identified component/structure patterns."),
  stateManagement: z
    .array(z.string())
    .describe("State management libraries or patterns used."),
  apiPatterns: z
    .array(z.string())
    .describe("API route patterns (e.g., app/api, routers/)."),
  scaffoldInstructions: z
    .array(z.string())
    .optional()
    .describe(
      "If the project is empty or missing a stack, this field contains a list of high-level instructions to scaffold the project (e.g., 'Initialize Next.js app', 'Setup Tailwind').",
    ),
  systemIntegrity: z
    .object({
      globalLayouts: z
        .array(z.string())
        .describe(
          "Paths to detected layout wrappers (e.g., RootLayout, DashboardLayout).",
        ),
      navigationComponents: z
        .array(z.string())
        .describe("Paths to Sidebar, NavBar, or other navigation elements."),
      activeRoutes: z
        .array(z.string())
        .describe("List of registered routes or pages found in the project."),
      uiLibrary: z
        .array(
          z.object({
            name: z.string().describe("Component name (e.g., 'Button')"),
            path: z
              .string()
              .describe("File path (e.g., 'components/ui/button.tsx')"),
          }),
        )
        .describe(
          "List of UI components and their file paths. Example: [{ name: 'Button', path: 'components/ui/button.tsx' }, { name: 'Toast', path: 'components/ui/toast.tsx' }]",
        ),
    })
    .optional()
    .describe(
      "Tracks critical UX/Architectural components for seamless integration.",
    ),
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

export const SurgicalContextSchema = z.object({
  failingFilePaths: z.array(z.string()),
  errorLogs: z.array(z.string()), // real TypeScript/runtime errors
  systemErrors: z.array(z.string()), // timeout/crash strings — informational only
});

export type SurgicalContext = z.infer<typeof SurgicalContextSchema>;

export const FilePatchSchema = z.object({
  patches: z
    .array(
      z.object({
        oldCode: z
          .string()
          .describe(
            "Exact string currently in the file — must match character-for-character",
          ),
        newCode: z.string().describe("Replacement string"),
        reason: z
          .string()
          .describe("One-line explanation of what this patch fixes"),
      }),
    )
    .min(1),
});

export type FilePatch = z.infer<typeof FilePatchSchema>;
