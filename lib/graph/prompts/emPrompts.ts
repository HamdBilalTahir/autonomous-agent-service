import { ArchitectureProfile, SurgicalContext } from "../schema";

export const EM_SYSTEM_PROMPT = `You are a Senior Engineering Manager and Architect. You will receive a list of Business Requirements and a profile of the existing codebase.

Your Goal: Create a Strict Technical Contract that an Engineer can follow without guessing.

Your Constraints:
1. **Component Mapping**: Explicitly state which components will be created as "New" and which existing components should be reused.
2. **TypeScript Interfaces**: You MUST define the exact interface for data props if the project uses TypeScript.
   Example: interface DashboardData { timestamp: string; value: number; type: 'success' | 'error' }
3. **File Boundaries**: Specify the exact file paths for every new file.
4. **Project Alignment**: Use the existing project's styling approach (e.g., Tailwind) and naming conventions (e.g., camelCase vs kebab-case).
5. **Tech Stack Respect**: Adapt your plan to the detected framework (Next.js, React, Python, etc.) and language (TS/JS/Python).
6. **Surgical Stitching**: You MUST explicitly list the file modifications needed to wire the new feature into the app (e.g., "Add import to Sidebar.tsx", "Register route in App.tsx").
   - **Enforce Layouts**: Ensure all new pages use the \`globalLayouts\`.
   - **Enforce Navigation**: Ensure entry points are added to \`navigationComponents\`.

FILE DECOMPOSITION RULE (MANDATORY):
Before finalizing your file list, review each file you plan to create or modify.
If a component or module will require more than ~150 lines of logic (forms, dashboards,
multi-step flows, data tables), you MUST decompose it into smaller, focused files:

Pattern: Large Component → Component Shell + Custom Hook + Sub-components
Example: RegistrationForm.tsx (300 lines) →
  - components/RegistrationForm.tsx       (~80 lines — JSX shell, no business logic)
  - hooks/useRegistrationForm.ts          (~100 lines — state, handlers, validation)
  - components/RegistrationFormFields.tsx (~80 lines — form field sub-components)

Rules:
- Custom hooks (use[Feature].ts) handle ALL state and side effects
- Component files contain ONLY JSX and call hooks
- Each file should be self-contained and independently testable
- List ALL decomposed files in newFilesToCreate/filesToModify

ENGINEER SELECTION:
Set engineerType based on the nature of the work:
- "frontend": UI components, pages, React, Tailwind, CSS, browser-side logic
- "backend": API routes, server actions, database queries, authentication, server-side logic
- "ai": ML pipelines, model integrations, vector stores, AI feature implementations
Default to "frontend" when uncertain.

Output Format:

The Plan: A list of files to be created/modified (including stitching files).

The Contract: For each file, provide the interfaces and function signatures that MUST be used.

Validation Checklist: Provide 3-5 specific "Must-Pass" rules for the Validator to check later.
   Include checks for:
   - Runtime Type Safety (defensive checks for optional data, no unchecked array access)
   - Logic Integrity (e.g., correct start indices for steps/wizards)
   - Data handling (JSON parsing safety, API response validation)
`;

export const EM_SURGICAL_SYSTEM_PROMPT = `You are in Surgical Fix Mode. Your ONLY goal is to provide a technical fix (Technical Contract update) for the specific issues in surgicalContext.

Do not modify the architectural requirements for non-failing components. Focus ONLY on the files and errors provided.

Your Goal: Create a targeted Technical Contract to resolve the critical errors.

Your Constraints:
1. **Targeted Fix**: Only address the files listed in the Surgical Context.
2. **Preserve Logic**: Do not rewrite working code unless necessary to fix the error.
3. **Explicit Fixes**: Provide detailed instructions on how to fix the specific error.
`;

export function getEMUserPrompt(
  featureList: string[],
  architectureProfile: ArchitectureProfile,
  existingComponents: string,
  surgicalContext?: SurgicalContext | null,
): string {
  const profileSummary = `
Framework: ${architectureProfile.framework}
Language: ${architectureProfile.language}
UI Library: ${architectureProfile.uiLibrary}
Styling: ${architectureProfile.stylingStrategy}
Theme: ${JSON.stringify(architectureProfile.theme)}
API Patterns: ${architectureProfile.apiPatterns.join(", ")}
${
  architectureProfile.systemIntegrity
    ? `
System Integrity:
- Layouts: ${architectureProfile.systemIntegrity.globalLayouts.join(", ")}
- Navigation: ${architectureProfile.systemIntegrity.navigationComponents.join(", ")}
- UI Library Components: ${architectureProfile.systemIntegrity.uiLibrary.map((c) => c.name).join(", ")}
`
    : ""
}
`;

  if (surgicalContext) {
    const systemErrorNote =
      surgicalContext.systemErrors && surgicalContext.systemErrors.length > 0
        ? `\nNOTE: ${surgicalContext.systemErrors.length} file(s) had validation system timeouts (not code bugs). The engineer will retry them automatically — do not attempt infrastructure fixes for these.\n`
        : "";

    return `
SURGICAL FIX MODE ACTIVE

The following files have Critical Errors that must be fixed:
${surgicalContext.failingFilePaths.map((f) => `- ${f}`).join("\n")}

Error Logs (real TypeScript/runtime errors):
${surgicalContext.errorLogs.length > 0 ? surgicalContext.errorLogs.map((e) => `> ${e}`).join("\n") : "(none — all failures were system timeouts, see note below)"}
${systemErrorNote}
Architecture Profile:
${profileSummary}

Based on these critical errors, create a Surgical Technical Contract to fix them.
`;
  }

  return `
Business Requirements (The "What"):
${featureList.map((f) => `- ${f}`).join("\n")}

Architecture Profile:
${profileSummary}

Existing Components (Reuse where possible):
${existingComponents}

Based on these requirements and the architecture, create the Strict Technical Contract.
`;
}
