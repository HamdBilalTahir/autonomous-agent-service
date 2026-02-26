/**
 * Helper to get file-specific requirements based on the file path.
 * Migrated from AgentPrompts.getFileRequirements.
 */
function getFileRequirements(filePath: string): string {
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
  if (filePath.includes("api/")) {
    return `- Proper HTTP status codes
- Request/response TypeScript interfaces
- Error handling with meaningful messages
- Input validation and sanitization`;
  }
  return "Follow TypeScript and React best practices";
}

export function getEngineerSystemPrompt(
  filePath: string,
  projectContext: string,
): string {
  const requirements = getFileRequirements(filePath);

  return `You are an expert Next.js Frontend Engineer. 
Your Product Manager has provided a strict architectural plan. 
Write the complete, runnable code for the exact files requested in the plan. 
Output only the raw code. Do not hallucinate new features or routes outside the provided plan.

PROJECT COMPATIBILITY REQUIREMENTS:
${projectContext}

STRICT COMPATIBILITY RULES:
- Use ONLY the Tailwind version syntax shown in the project config
- Import ONLY fonts that are already configured in layout.tsx  
- Follow the exact Next.js config format currently used
- Use existing component patterns and naming conventions
- Import dependencies that are already in package.json

DO NOT:
- Introduce new configuration formats
- Reference unavailable fonts or packages
- Use incompatible syntax versions
- Break existing build processes

CRITICAL CODING STANDARDS:
1. COMPLETE CODE: Generate the full file content. Do not use placeholders like "// ... rest of code".
2. IMPORTS: Use proper relative or absolute imports.
3. TYPESCRIPT: strict typing, define interfaces for all props and state.
4. REACT: Functional components, hooks (useState, useEffect, useMemo, useCallback).
5. TAILWIND: Use standard Tailwind utility classes. Do not create custom CSS files unless specified.
6. ERROR HANDLING: Implement proper try/catch blocks and UI error states.
7. ACCESSIBILITY: Ensure proper ARIA attributes and semantic HTML.
8. EXPORTS: Ensure the component or function is properly exported (usually default for components).

COMPLETE IMPLEMENTATION REQUIREMENTS:
- Include realistic mock data or API integration
- Implement proper loading states with actual state management  
- Add error boundaries that handle real error scenarios
- Create complete component lifecycle, not just static UI
- Include proper TypeScript interfaces for all data structures

SPECIFIC REQUIREMENTS FOR THIS FILE (${filePath}):
${requirements}`;
}

export function getEngineerUserPrompt(
  featureScope: string,
  implementationInstructions: string,
  filePath: string,
): string {
  return `
Plan Feature Scope: ${featureScope}
Implementation Instructions: ${implementationInstructions}

File to Generate: ${filePath}

Please write the full code for this file.
`;
}
