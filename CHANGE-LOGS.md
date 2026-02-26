## 🗓️ **2026-02-27**

---

### ✨ Features

---

> ### LangGraph State Definition
>
> - **What changed:** Defined the shared `AgentState` interface and installed LangGraph dependencies to enable multi-agent orchestration.
> - **Why:** Establish the shared memory structure required for the new Product Manager and Frontend Engineer agents to collaborate.
> - **Files:**
>   - `lib/graph/state.ts`
>   - `package.json`

> ### PM/Architect Agent Node
>
> - **What changed:** Implemented the Product Manager agent node (`pmNode`) using Gemini and structured output (Zod) to generate execution plans.
> - **Why:** Enable the "thinking" phase where the agent plans the architecture before writing code.
> - **Files:**
>   - `lib/graph/nodes/pmNode.ts`
>   - `package.json`

> ### Frontend Engineer Agent Node
>
> - **What changed:** Created `frontendEngineerNode` to generate code based on execution plans and removed the monolithic `AutonomousAgent`.
> - **Why:** Decouple code generation from ticket analysis and enable the multi-agent workflow.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/agent.ts` (deleted)

> ### Separated System Prompts
>
> - **What changed:** Extracted system prompts and helper functions into `lib/graph/prompts/` directory.
> - **Why:** Improve maintainability and separate prompt engineering from agent logic.
> - **Files:**
>   - `lib/graph/prompts/pmPrompts.ts`
>   - `lib/graph/prompts/engineerPrompts.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Graph Orchestration & Workflow Execution
>
> - **What changed:** Orchestrated the PM and Engineer nodes into a LangGraph pipeline and updated webhook/API routes to execute it.
> - **Why:** Enable end-to-end autonomous workflow where Jira tickets trigger the multi-agent graph, resulting in PRs.
> - **Files:**
>   - `lib/graph/index.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/process-ticket/route.ts`

> ### Structured Output Validation
>
> - **What changed:** Implemented strict Zod schema validation for the PM Agent's execution plan.
> - **Why:** Ensure the PM Agent produces predictable, structured JSON output that guarantees compatibility with the Engineer Node.
> - **Files:**
>   - `lib/graph/schema.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/nodes/pmNode.ts`

> ### Comprehensive Observability
>
> - **What changed:** Added structured logging to the webhook, graph execution stream, agent nodes, and service layers (GitHub/Jira).
> - **Why:** Enable detailed debugging of the multi-agent workflow, tracking state transitions, AI prompts/responses, and external API interactions.
> - **Files:**
>   - `app/api/webhook/route.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/github.ts`
>   - `lib/jira.ts`

> ### Enhanced Service Layer Integration
>
> - **What changed:** Centralized GitHub workflow and Jira transition logic into reusable service methods (`processChangesAndCreatePR`, `linkPRAndTransitionTicket`) and updated API routes to use them.
> - **Why:** Promote code reuse, reduce duplication in route handlers, and ensure consistent behavior across different triggers (webhook vs manual).
> - **Files:**
>   - `lib/github.ts`
>   - `lib/jira.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/process-ticket/route.ts`

> ### Enhanced Output Logging
>
> - **What changed:** Updated agent nodes to log concise summaries and previews of generated content (execution plans, code files) instead of full JSON dumps.
> - **Why:** Improve readability of logs and provide immediate visibility into agent outputs without cluttering the console.
> - **Files:**
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Refined Notification Formatting
>
> - **What changed:** Updated Jira comments to use Atlassian Document Format for clickable links and refined the PM Agent schema to enforce markdown lists in execution plans.
> - **Why:** Improve the usability of automated notifications by ensuring links are clickable and PR descriptions are properly formatted.
> - **Files:**
>   - `lib/jira.ts`
>   - `lib/graph/schema.ts`

> ### Improved Branch Naming Convention
>
> - **What changed:** Updated branch naming to use ticket title slug instead of timestamp (e.g., `feature/kuailabs-13-add-login` instead of `feature/kuailabs-13-123456789`).
> - **Why:** Create more descriptive and readable branch names that are easier to identify and link to requirements.
> - **Files:**
>   - `lib/agent.ts`

---

### 🐛 Fixes

---

> ### Allow creating new files without editing existing ones
>
> - **What changed:** Updated validation logic to check if both `filesToChange` and `newFilesToCreate` are empty before throwing an error.
> - **Why:** Allow the agent to process tickets that only require creating new files.
> - **Files:**
>   - `lib/agent.ts`

> ### Webhook Loop Prevention
>
> - **What changed:** Implemented dynamic check for self-triggered webhooks by comparing the trigger user's Account ID with the agent's own Account ID fetched at runtime. Added exception for `jira:issue_created` events to allow processing of agent-created tickets.
> - **Why:** Prevent infinite loops where the agent reacting to a ticket triggers another webhook event, while ensuring test/automation tickets are still processed.
> - **Files:**
>   - `app/api/webhook/route.ts`
>   - `lib/agent.ts`
>   - `lib/jira.ts`

> ### Enhanced New File Generation
>
> - **What changed:** Updated `getCodeGenerationPrompt` to explicitly instruct the AI when creating new files, ensuring it outputs complete code with imports and dependencies.
> - **Why:** Prevent partial code generation for new files and ensure the AI understands it's building from scratch.
> - **Files:**
>   - `lib/prompts.ts`

## 🗓️ **2026-02-26**

---

### ✨ Features

---

> ### Gemini AI Provider Support
>
> - **What changed:** Implemented `GeminiService` with configurable model selection (e.g., `gemini-3.1-pro-preview`) and JSON mode for structured analysis.
> - **Why:** Enable switching between Ollama and Gemini AI providers for potentially better performance and reliability.
> - **Files:**
>   - `lib/gemini.ts`
>   - `lib/agent.ts`
>   - `.env.example`

> ### Multi-File Analysis Logic
>
> - **What changed:** Updated AI analysis prompt to better identify and structure complex features requiring multiple files (UI, hooks, API).
> - **Why:** Improve the agent's ability to architect complete features like authentication systems or complex state management.
> - **Files:**
>   - `lib/prompts.ts`

> ### Enhanced Webhook Filtering
>
> - **What changed:** Updated `shouldProcessTicket` to ignore tickets in "In Progress", "In Review", or "Done" states.
> - **Why:** Prevent unnecessary processing of active or completed tickets and improve system efficiency.
> - **Files:**
>   - `lib/agent.ts`

> ### Production-Ready Code Generation
>
> - **What changed:** Updated AI prompts to generate complete, working TypeScript/React code instead of requirements.
> - **Why:** To enable the agent to produce directly committable implementations with proper imports and error handling.
> - **Files:**
>   - `lib/prompts.ts`
>   - `lib/ollama.ts`

> ### Improve Agent File Processing
>
> - **What changed:** Updated `lib/agent.ts` to process both new and existing files, and improved prompt generation for code changes.
> - **Why:** To enable the agent to create new files as suggested by the AI analysis and handle missing files gracefully.
> - **Files:**
>   - `lib/agent.ts`
>   - `lib/ollama.ts`

> ### Enhanced AI Ticket Analysis
>
> - **What changed:** Updated `analyzeTicket` to use `AgentPrompts` for structured analysis with improved error handling and fallback mechanism.
> - **Why:** Increase reliability of AI responses by parsing JSON more robustly and providing fallback logic for failures.
> - **Files:**
>   - `lib/ollama.ts`
>   - `lib/prompts.ts`

---

### 🐛 Fixes

---

> ### Webhook Duplicate Processing Lock
>
> - **What changed:** Implemented an in-memory lock system in `processTicket` to track and prevent concurrent processing of the same ticket ID.
> - **Why:** Prevent race conditions and redundant operations when Jira sends duplicate webhook events.
> - **Files:**
>   - `lib/agent.ts`

> ### Webhook Loop Protection
>
> - **What changed:** Added status check to `processTicket` to ignore tickets already "In Progress", "In Review", or "Done".
> - **Why:** Prevent infinite processing loops and redundant operations on active or completed tickets.
> - **Files:**
>   - `lib/agent.ts`

> ### Corrected Ollama Model Selection
>
> - **What changed:** Updated default and agent-configured Ollama model from "llama2" to "codegemma:2b".
> - **Why:** Ensure the agent uses the correct code-specialized model available in the environment.
> - **Files:**
>   - `lib/ollama.ts`
>   - `lib/agent.ts`

> ### Migrated API to Next.js App Router Structure
>
> - **What changed:** Moved API functions from `api/` to `app/api/` and removed `vercel.json`.
> - **Why:** Align with standard Next.js App Router conventions and fix Vercel deployment issues caused by conflicting configuration.
> - **Files:**
>   - `api/` (deleted)
>   - `app/api/process-ticket/route.ts` (created)
>   - `app/api/webhook/route.ts` (created)
>   - `app/api/test/route.ts` (created)
>   - `vercel.json` (deleted)

---

### ✨ Features

---

> ### Comprehensive Autonomous Agent Workflow
>
> - **What changed:** Implemented full agent orchestration including Jira status management, GitHub branching/PRs, and AI code generation with rollback support.
> - **Why:** Enable end-to-end autonomous ticket resolution.
> - **Files:**
>   - `lib/agent.ts`
>   - `lib/github.ts`
>   - `lib/jira.ts`
>   - `lib/ollama.ts`

> ### Enhanced Debug Logging
>
> - **What changed:** Added detailed console logs to `lib/ollama.ts` and `lib/agent.ts` to track prompt generation and AI responses.
> - **Why:** Improve visibility into the AI code generation process for debugging and monitoring.
> - **Files:**
>   - `lib/ollama.ts`
>   - `lib/agent.ts`

> ### Enhanced API Endpoints
>
> - **What changed:** Implemented asynchronous webhook processing with validation, and comprehensive service health checks.
> - **Why:** Improve system reliability and observability.
> - **Files:**
>   - `app/api/webhook/route.ts`
>   - `app/api/test/route.ts`
>   - `lib/agent.ts`

> ### Robust Error Handling and Logging
>
> - **What changed:** Implemented structured JSON logging and comprehensive rollback mechanisms (status reversion, error comments) for the agent.
> - **Why:** Ensure observability and prevent tickets from getting stuck in invalid states upon failure.
> - **Files:**
>   - `lib/agent.ts`

> ### Verified Jira Integration
>
> - **What changed:** Validated Jira API connectivity and ticket creation using Atlassian Document Format.
> - **Why:** Ensure the agent can successfully interact with the Jira project.

> ### Jira Creation Test Endpoint
>
> - **What changed:** Added `app/api/create-jira-ticket/route.ts` to manually create Jira tickets with payload customization.
> - **Why:** Facilitate validation of Jira integration with dynamic content.

> ### Enhanced Environment Debugging
>
> - **What changed:** Added console logging of environment variable status to the health check endpoint.
> - **Why:** Simplify troubleshooting of configuration issues in production logs.
> - **Files:**
>   - `app/api/test/route.ts`

---

### 🔧 DevOps / Build

---

> ### Gemini Dependencies and Configuration
>
> - **What changed:** Added `@google/generative-ai` dependency and configured `GEMINI_API_KEY`, `GEMINI_MODEL`, and `AI_PROVIDER` env vars.
> - **Why:** Support the new Gemini AI integration.
> - **Files:**
>   - `package.json`
>   - `.env.example`
>   - `app/api/webhook/route.ts`
>   - `app/api/process-ticket/route.ts`

> ### Environment Configuration and Deployment Setup
>
> - **What changed:** Configured project for multi-service deployment with specific GitHub/Jira/Ollama variables; updated `package.json` scripts; removed legacy config.
> - **Why:** Prepare for production deployment and align with user infrastructure.
> - **Files:**
>   - `.env`
>   - `.env.example`
>   - `package.json`
>   - `lib/agent.ts`
>   - `lib/jira.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/test/route.ts`

---

### 🧹 Refactors

---

> ### Extracted Business Logic to Lib Directory
>
> - **What changed:** Created `lib` directory with dedicated services for GitHub, Jira, Ollama, and Agent logic; updated API routes to use these services.
> - **Why:** Improve code modularity, reusability, and separation of concerns by moving logic out of route handlers.
> - **Files:**
>   - `lib/agent.ts`
>   - `lib/github.ts`
>   - `lib/jira.ts`
>   - `lib/ollama.ts`
>   - `lib/types.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/test/route.ts`

> ### Standardized Prompt Generation Location
>
> - **What changed:** Moved `AgentPrompts.getCodeGenerationPrompt` call from `lib/agent.ts` into `lib/ollama.ts`.
> - **Why:** Encapsulate AI prompt construction within the AI service layer and simplify the agent's logic.
> - **Files:**
>   - `lib/ollama.ts`
>   - `lib/agent.ts`
