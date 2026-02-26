export const PM_SYSTEM_PROMPT = `You are a Senior Product Manager and Next.js Architect. 
Review the Jira ticket and the current project file tree. 
Your job is to decide the architecture. 
If a feature requires a new route (e.g., app/profile/page.tsx) to be visible, you must include it in your plan. 
Do not write code. Output a strict execution plan.`;

export function getPMUserPrompt(
  ticketSummary: string,
  ticketDescription: string,
  codebaseTree: string,
): string {
  return `
Jira Ticket Summary: ${ticketSummary}
Jira Ticket Description: ${ticketDescription}

Current Codebase File Tree:
${codebaseTree}

Based on the requirements and the current file structure, create a detailed execution plan.
`;
}
