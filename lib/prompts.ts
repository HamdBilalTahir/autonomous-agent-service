import { Ticket } from "./types";

export interface AnalysisResponse {
  summary: string;
  suggestedAction: string;
  complexity: "Low" | "Medium" | "High";
  filesToChange: string[];
  newFilesToCreate?: string[];
  estimatedLines?: number;
  dependencies?: string[];
  testFiles?: string[];
}

export class AgentPrompts {
  static getFallbackAnalysis(ticket: Partial<Ticket>): AnalysisResponse {
    // Simple heuristic fallback if AI analysis fails
    const title = ticket.title?.toLowerCase() || "";
    const description = ticket.description?.toLowerCase() || "";

    let complexity: "Low" | "Medium" | "High" = "Medium";
    if (
      title.includes("typo") ||
      title.includes("text") ||
      title.includes("copy")
    ) {
      complexity = "Low";
    } else if (
      title.includes("feature") ||
      title.includes("api") ||
      title.includes("endpoint")
    ) {
      complexity = "High";
    }

    const filesToChange: string[] = [];
    const newFilesToCreate: string[] = [];

    // Heuristic for React components
    if (title.includes("component") || description.includes("component")) {
      if (title.includes("create") || title.includes("new")) {
        // Try to extract a component name (very basic)
        newFilesToCreate.push("src/components/NewComponent.tsx");
      } else {
        filesToChange.push("src/components/ExistingComponent.tsx"); // Placeholder
      }
    }

    // Heuristic for API routes
    if (title.includes("api") || description.includes("api")) {
      if (title.includes("route") || title.includes("endpoint")) {
        filesToChange.push("app/api/route.ts"); // Placeholder
      }
    }

    return {
      summary: `Automated fallback analysis for: ${ticket.title}`,
      suggestedAction:
        "Manual review recommended. AI analysis failed to produce structured output.",
      complexity,
      filesToChange,
      newFilesToCreate,
    };
  }

  static getAnalysisPrompt(
    title: string,
    description: string,
    codebaseContext?: any,
  ): string {
    return `You are a senior React/TypeScript architect analyzing development tasks.

CONTEXT:
- Working on a modern React/TypeScript project
- Using Next.js 14+ with App Router
- Tailwind CSS for styling
- Component library structure: src/components/, src/hooks/, src/utils/

CODEBASE STRUCTURE:
${JSON.stringify(codebaseContext?.structure || [], null, 2)}

RECENT PATTERNS:
${codebaseContext?.recentCommits?.map((c: any) => c.message).join(", ") || "No recent commits"}

TASK TO ANALYZE:
Title: ${title}
Description: ${description}

ANALYZE and respond with ONLY valid JSON (no markdown, no explanations):

{
  "filesToChange": ["exact/file/paths.tsx"],
  "complexity": "Low|Medium|High",
  "suggestedAction": "specific technical action",
  "summary": "one sentence technical summary",
  "estimatedLines": 50,
  "dependencies": ["package-name"],
  "testFiles": ["path/to/test.tsx"],
  "newFilesToCreate": ["path/to/new/file.tsx"]
}

ANALYSIS RULES:
1. UI Components → src/components/ComponentName.tsx
2. Business Logic → src/hooks/useFeatureName.ts  
3. Utilities → src/utils/featureName.ts
4. API Routes → app/api/endpoint/route.ts
5. Pages → app/page-name/page.tsx

COMPLEXITY GUIDELINES:
- LOW: Single component, <50 lines, no API calls
- MEDIUM: Multiple files, API integration, state management
- HIGH: Complex logic, external integrations, database changes

EXAMPLES:
"Add login button" → ["src/components/LoginButton.tsx"]
"User authentication system" → ["src/hooks/useAuth.ts", "src/components/LoginForm.tsx", "app/api/auth/route.ts"]
"Fix navbar styling" → ["src/components/Navbar.tsx"]

Respond with JSON only:`;
  }

  static getCodeGenerationPrompt(
    ticket: Ticket,
    existingContent: string,
    filePath: string,
    analysis?: AnalysisResponse,
  ): string {
    const isNewFile = !existingContent || existingContent.trim() === "";
    const fileType = filePath.split(".").pop();
    const task = `${ticket.title}\n${ticket.description}`;
    const complexity = analysis?.complexity || "Medium";
    const suggestedAction =
      analysis?.suggestedAction || "Implement the requested changes.";

    return `You are an expert React/TypeScript developer implementing: ${task}

FILE: ${filePath}
TYPE: ${isNewFile ? "CREATE NEW" : "MODIFY EXISTING"}
COMPLEXITY: ${complexity}

${isNewFile ? "REQUIREMENTS FOR NEW FILE:" : "EXISTING CONTENT:"}
${isNewFile ? this.getFileRequirements(filePath) : existingContent}

IMPLEMENTATION REQUIREMENTS:
${suggestedAction}

CODING STANDARDS:
1. TypeScript with strict typing - define interfaces for all props
2. Functional components with React hooks (useState, useEffect, etc.)
3. Tailwind CSS classes for styling (no custom CSS)
4. Error boundaries and proper error handling
5. Accessibility: ARIA labels, keyboard navigation, semantic HTML
6. Performance: useMemo, useCallback where appropriate
7. JSDoc comments for all functions and interfaces

SPECIFIC TO ${fileType?.toUpperCase()}:
${this.getFileTypeRequirements(filePath)}

${isNewFile ? "TEMPLATE STRUCTURE:" : "MODIFICATION STRATEGY:"}
${isNewFile ? this.getTemplateStructure(filePath) : "Preserve existing structure, improve and extend functionality"}

Return ONLY the complete file content. No explanations, no markdown blocks, no comments about the code.`;
  }

  static getFileCreationPrompt(ticket: Ticket, filePath: string): string {
    // Reusing getCodeGenerationPrompt for consistency since it handles new files
    return this.getCodeGenerationPrompt(ticket, "", filePath);
  }

  private static getFileRequirements(filePath: string): string {
    if (filePath.includes("components/")) {
      return `- Export default React component
- Include TypeScript interface for props
- Use Tailwind for styling
- Add proper accessibility attributes
- Include error states and loading states
- Add JSDoc documentation`;
    }
    if (filePath.includes("hooks/")) {
      return `- Export custom hook function
- Use proper TypeScript return types
- Handle loading, error, and success states
- Include cleanup in useEffect
- Add JSDoc with usage examples`;
    }
    if (filePath.includes("utils/")) {
      return `- Export utility functions with TypeScript types
- Include input validation
- Add comprehensive error handling
- Write pure functions where possible
- Include JSDoc with examples`;
    }
    return "Follow TypeScript and React best practices";
  }

  private static getFileTypeRequirements(filePath: string): string {
    if (filePath.includes("components/")) {
      return `- Props interface with optional/required fields clearly marked
- Default props using defaultProps or default parameters
- Event handlers with proper TypeScript event types
- Responsive design with Tailwind breakpoints
- Loading and error state handling`;
    }
    if (filePath.includes("hooks/")) {
      return `- Clear return type with object destructuring
- Dependencies array optimization in useEffect
- Cleanup functions for subscriptions/timers
- Error handling with try/catch
- Memoization for expensive computations`;
    }
    if (filePath.includes("api/")) {
      return `- Proper HTTP status codes
- Request/response TypeScript interfaces
- Error handling with meaningful messages
- Input validation and sanitization
- Rate limiting and security considerations`;
    }
    return "Standard TypeScript patterns";
  }

  private static getTemplateStructure(filePath: string): string {
    if (filePath.includes("components/")) {
      return `
// Imports
// TypeScript interfaces
// Main component function
// Default export`;
    }
    if (filePath.includes("hooks/")) {
      return `
// Imports
// TypeScript types
// Custom hook function
// Export`;
    }
    return "Standard file structure";
  }

  static getClassificationPrompt(title: string, description: string): string {
    return `Classify this development task into categories.

TASK: ${title}
DESCRIPTION: ${description}

Respond with ONLY valid JSON:

{
  "category": "ui-component|business-logic|api-endpoint|styling-fix|bug-fix|feature-enhancement",
  "priority": "low|medium|high|critical",
  "estimatedHours": 2,
  "skillsRequired": ["react", "typescript"],
  "riskLevel": "low|medium|high",
  "blockers": ["dependency on X", "requires design approval"]
}

CLASSIFICATION RULES:
- ui-component: New buttons, forms, modals, cards
- business-logic: Authentication, data processing, state management  
- api-endpoint: REST APIs, database operations
- styling-fix: CSS/Tailwind adjustments, responsive issues
- bug-fix: Error corrections, performance issues
- feature-enhancement: Extending existing functionality

PRIORITY LOGIC:
- Critical: Security issues, production bugs
- High: User-blocking features, performance problems
- Medium: New features, enhancements
- Low: Nice-to-have improvements, refactoring

SKILLS MAPPING:
UI work → ["react", "typescript", "tailwind", "design"]
API work → ["typescript", "next.js", "database", "security"]
Logic → ["typescript", "react-hooks", "state-management"]`;
  }

  static getReviewPrompt(code: string, filePath: string, task: string): string {
    return `You are a senior code reviewer. Review this implementation for: ${task}

FILE: ${filePath}
CODE:
${code}

Analyze for:
1. TypeScript correctness and type safety
2. React best practices and performance
3. Security vulnerabilities  
4. Accessibility compliance
5. Error handling completeness
6. Code maintainability

Respond with ONLY valid JSON:

{
  "approved": true|false,
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "line": 15,
      "message": "Specific issue description",
      "fix": "Suggested correction"
    }
  ],
  "suggestions": [
    "Performance improvement ideas",
    "Code organization suggestions"
  ],
  "securityRisks": ["XSS vulnerability in line 10"],
  "testingRecommendations": ["Add unit test for error handling"]
}

REVIEW CRITERIA:
- ERROR: Breaks functionality, security issues, type errors
- WARNING: Performance concerns, accessibility issues  
- SUGGESTION: Style improvements, optimization opportunities

Be thorough but practical. Focus on issues that impact functionality, security, or maintainability.`;
  }
}
