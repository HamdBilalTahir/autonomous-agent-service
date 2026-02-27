# Autonomous Agent Service
An intelligent development assistant that automatically implements Jira tickets by analyzing your codebase, generating code solutions, and creating pull requests - all without human intervention.
What It Does

🎯 Monitors Jira tickets - Automatically detects new development tasks
🧠 Understands your code - Analyzes existing patterns and architecture
⚡ Implements features - Writes production-ready code using AI
🔄 Creates pull requests - Submits changes for human review
📋 Updates project status - Keeps Jira tickets synchronized

# How It Works
Jira Ticket Created → Analysis & Triage → [Fast Track OR Full Planning] → Sync & Execute → Automated Testing → PR Creation

### Visualize Workflow

To generate a visual representation of the current agent workflow graph:
```bash
npx ts-node scripts/visualize_graph.ts
```

Webhook Trigger: New Jira ticket automatically triggers the agent
Code Analysis: Agent studies your existing codebase patterns
AI Implementation: DeepSeek Coder generates contextual solutions
Quality Assurance: Automated testing validates the changes
Human Oversight: Pull request created for review and approval

# Key Features

🏗️ Multi-repo architecture - Agent service separate from your code
💰 Zero cost operation - Uses free tiers of Ollama, Hugging Face, and Vercel
🔒 Secure by design - Agent only creates branches/PRs, never direct commits#
📊 Full audit trail - Complete logging of all agent activities
🎛️ Configurable workflows - Customizable for different project types

# Perfect For

Startups wanting to accelerate development velocity
Solo developers looking to automate routine coding tasks
Teams seeking to reduce repetitive feature implementation
POCs and MVPs where speed of iteration matters most

### This service transforms your development workflow from manual coding to specification-driven automation, letting you focus on architecture and product decisions while AI handles the implementation details.

## Quick Start

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

- `OLLAMA_URL`: URL of your Ollama service (e.g. Hugging Face Space)
- `GITHUB_TOKEN`: GitHub Personal Access Token
- `TARGET_GITHUB_OWNER`: GitHub username for target repo
- `TARGET_GITHUB_REPO`: Repository name to modify
- `AGENT_GITHUB_OWNER`: GitHub username for agent repo
- `AGENT_GITHUB_REPO`: Repository name for this agent service
- `JIRA_BASE_URL`: Atlassian URL (e.g. https://your-domain.atlassian.net)
- `JIRA_EMAIL`: User email for Jira
- `JIRA_API_TOKEN`: Jira API token
- `VERCEL_URL`: Deployment URL (filled after deploy)

### Deployment

To deploy on Vercel:

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel`

### Testing Endpoints

#### Check Service Status
```bash
curl https://your-deployment-url/api/test
```
Response:
```json
{
  "status": "service running",
  "timestamp": "2024-03-20T10:00:00.000Z",
  "environment": {
    "OLLAMA_URL": "configured",
    ...
  }
}
```

#### Test Webhook
```bash
curl -X POST https://your-deployment-url/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```
Response:
```json
{
  "status": "success",
  "message": "Webhook received",
  ...
}
```
