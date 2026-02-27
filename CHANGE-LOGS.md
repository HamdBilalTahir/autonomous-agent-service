## 🗓️ **2026-02-27**

---

### 🐛 Fixes

---

> ### Fix Retry Logic Persistence Across Rounds
>
> - **What changed:** Refactored `frontendEngineerNode` and `validationNode` to explicitly reset `retryCount` to 0 when a new round (phase) begins, and used safer null-coalescing operators (`??`) for state initialization.
> - **Why:** The retry counter was sometimes persisting or appearing to increment across rounds due to logic flow issues, confusing the phase tracking (e.g., showing "Retry 1" immediately in a new round).
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/validationNode.ts`

---

### ✨ Features

---

> ### Unlimited Engineer/Validation Rounds with Per-Phase Retry Logic
>
> - **What changed:** Replaced the hard 3-attempt cap with an unlimited round model. One round = one Engineer→Validation cycle. Within a round, the engineer retries up to 3 times with targeted fixes (only faulty files). After 3 failed retries, a new round begins with a full file regeneration reset.
> - **Why:** The previous model hard-stopped at 3 total attempts regardless of progress, leaving tickets unresolved. The new model continues until the code actually passes validation.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/index.ts`

> ### Warning Leniency After Round 5
>
> - **What changed:** Added `WARNING_LENIENCY_ROUND = 5` to the Validation Agent. After 5 total rounds, warnings no longer trigger revision — only `criticalErrors` (compilation-breaking) block the workflow. Split `ValidationSchema` into separate `criticalErrors` and `warnings` arrays.
> - **Why:** Prevent the workflow from looping indefinitely over minor style/quality issues that don't affect runtime correctness.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/state.ts`

> ### Engineer Error History & Clean File Context
>
> - **What changed:** Added `errorAttemptHistory` state field (accumulated across retries). On each retry, the engineer prompt now includes past failed attempts and a list of files already validated as correct (`cleanFiles`) that must not be broken. Engineer only regenerates files listed in validation errors — never touches passing files.
> - **Why:** Prevent the engineer from repeating the same mistakes across retries and from inadvertently breaking already-validated files.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/state.ts`

> ### LangGraph Recursion Limit Set to 100
>
> - **What changed:** Added `{ recursionLimit: 100 }` as a second argument to all `graph.invoke()` calls in both API routes.
> - **Why:** LangGraph's default recursion limit is 25 steps, which is insufficient for a workflow with unlimited rounds. This prevents premature termination on complex tickets.
> - **Files:**
>   - `app/api/webhook/route.ts`
>   - `app/api/process-ticket/route.ts`

> ### Ticket-Scoped Log Context Across All Nodes
>
> - **What changed:** Updated all `console.log` / `console.warn` / `console.error` statements in every agent node to include a `[ticketId]` prefix (e.g., `[Validation Node][PROJ-123]`).
> - **Why:** Concurrent processing of multiple tickets caused log lines from different tickets to interleave, making debugging impossible.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/triageNode.ts`
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/designNode.ts`
>   - `lib/graph/nodes/updateJiraMetadataNode.ts`

> ### Self-Correcting Engineer & Context-Aware Validation
>
> - **What changed:** Implemented "Contextual Anchoring" and a "Pre-Flight Checklist" in Engineer prompts, injected the full execution plan to improve sibling-file awareness, enforced "REPAIR HINT" format in Validation prompts, implemented "Pivotal Correction" logic, updated AgentState to persist the full execution plan, added an "Import-Plan Guard", and enhanced the Post-Validation Feedback Loop with structured "Problem/Context/Strategy" reporting and a mandatory "Correction Plan" for retries.
> - **Why:** To eliminate "Context Blindness" where code works in isolation but fails integration, and to prevent the Validation Agent from giving vague error reports.
> - **Files:**
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/nodes/validationNode.ts`

---

### 🐛 Fixes

---

> ### Fix Round Logic for Retries
>
> - **What changed:** Updated `frontendEngineerNode` to increment `roundCount` only when starting a new phase (initial generation or full regeneration), rather than on every invocation.
> - **Why:** To align "Round" with "Phase" semantics, ensuring that retry counts reset correctly at the start of a new round, addressing user confusion where retries appeared to increment across rounds.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Simplified Validation Logs
>
> - **What changed:** Removed "Validation Attempt" counter from Validation Node logs.
> - **Why:** To reduce confusion, as "Round" and "Retry" counters provide sufficient context for the current execution phase.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`

> ### Fix Retry Count Not Resetting Between Phases
>
> - **What changed:** `retryCount` is now explicitly reset to `0` when a new phase begins (after 3 failed retries or a validation crash), and the state returned from the engineer node always carries the updated `retryCount`.
> - **Why:** The retry counter was not resetting, causing the engineer to always see `retryCount >= 3` after the first phase, bypassing targeted-fix mode for all subsequent phases.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/state.ts`

> ### Move Jira Metadata Update Immediately After Triage
>
> - **What changed:** `updateJiraMetadataNode` now runs unconditionally right after `triageNode` (before routing). `routeTicket` then dispatches Low-complexity tickets to `frontendEngineerNode` directly, or to `pmNode → designNode → frontendEngineerNode` for others. Removed the previous parallel fan-in where both `designNode` and `updateJiraMetadataNode` fed into `frontendEngineerNode`.
> - **Why:** The old graph had an implicit parallel join that could cause ordering issues. Moving the Jira update before routing ensures metadata is always synced, even for low-complexity tickets that skip PM/Design.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Rename `validationAttempts` → `validationCrashCount`
>
> - **What changed:** Renamed the state field from `validationAttempts` to `validationCrashCount` across all files. Updated annotations, descriptions, and all read/write sites.
> - **Why:** The field only tracks API crash retries (not total validation calls) and legitimately resets to 0 on success. The old name implied it counted all attempts, which was confusing.
> - **Files:**
>   - `lib/graph/state.ts`
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/index.ts`

> ### Fix Metrics Accumulation — Switch Webhook to `graph.invoke()`
>
> - **What changed:** Replaced `graph.stream()` + manual `{ ...finalState, ...chunkData }` accumulation in `webhook/route.ts` with a single `graph.invoke()` call that returns the fully-reduced final state.
> - **Why:** The shallow merge in the stream loop was overwriting `metrics` on every chunk, causing `nodeCallCounts` to always show `1` and `validationCrashCount` to appear as `0` regardless of actual execution. LangGraph's built-in reducers handle accumulation correctly when using `invoke()`.
> - **Files:**
>   - `app/api/webhook/route.ts`

> ### Robust State Reducer for Ticket ID
>
> - **What changed:** Updated `lib/graph/state.ts` to use a custom reducer for `ticketId` that explicitly ignores `undefined` or `null` updates, preventing state data loss.
> - **Why:** Fixed a critical bug where `ticketId` was being overwritten or lost during graph execution, causing downstream nodes (like `updateJiraMetadataNode`) to fail.
> - **Files:**
>   - `lib/graph/state.ts`

> ### Webhook Self-Loop Prevention & Initialization Fix
>
> - **What changed:** Implemented a cache-based loop prevention mechanism using an in-memory fallback. The `updateJiraMetadataNode` flags internal updates with a short-lived cache key, which the webhook handler checks to distinguish between internal loops (blocked) and user-initiated API actions (allowed). Also fixed `ticketId` initialization in `app/api/webhook/route.ts`.
> - **Why:** Prevented infinite loops caused by agent updates while correctly allowing initial ticket creation via API/curl using the same agent credentials. Fixed missing `ticketId` in webhook flows.
> - **Files:**
>   - `app/api/webhook/route.ts`
>   - `lib/graph/nodes/updateJiraMetadataNode.ts`
>   - `lib/cache.ts`

> ### Triage & PM Responsibility Refactor
>
> - **What changed:** Moved Priority and Story Point estimation responsibility from the PM Agent to the Triage Agent. The Triage Agent now handles all classification and estimation (Priority, Story Points). The PM Agent focuses purely on detailed architectural planning (files, implementation instructions).
> - **Why:** Streamlined the workflow by consolidating all ticket metadata estimation into the Triage phase, allowing the PM agent to focus exclusively on technical execution planning.
> - **Files:**
>   - `lib/graph/nodes/triageNode.ts`
>   - `lib/graph/prompts/triagePrompts.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/prompts/pmPrompts.ts`
>   - `lib/graph/schema.ts`
>   - `lib/graph/nodes/updateJiraMetadataNode.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/process-ticket/route.ts`

> ### Fix missing ticket ID in graph state
>
> - **What changed:** Added reducers to `AgentState` annotations in `lib/graph/state.ts` to persist values across graph nodes.
> - **Why:** The `ticketId` was being lost during graph execution, preventing the Jira metadata update node from running correctly.
> - **Files:**
>   - `lib/graph/state.ts`

> ### Error Recovery & Rollback System
>
> - **What changed:** Implemented transaction-like rollback for GitHub/Jira operations and added retry logic with exponential backoff.
> - **Why:** To prevent inconsistent states (orphaned branches, stuck Jira tickets) when agents fail mid-workflow due to network issues or API errors.
> - **Files:**
>   - `lib/graph/state.ts`
>   - `lib/graph/metrics-utils.ts` (new)
>   - `lib/graph/nodes/*.ts`
>   - `app/api/process-ticket/route.ts`

> ### Ticket Complexity Assessment & Routing
>
> - **What changed:** Introduced a `triageNode` to classify tickets as Low/Medium/High complexity and route simple tasks to a fast-track workflow, bypassing heavy planning stages.
> - **Why:** To optimize resource usage and reduce latency for simple changes like styling or text updates.
> - **Files:**
>   - `lib/graph/nodes/triageNode.ts` (new)
>   - `lib/graph/prompts/triagePrompts.ts` (new)
>   - `lib/graph/index.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/schema.ts`

> ### Enhanced Git Conventions
>
> - **What changed:** Updated branch naming to use ticket classification prefixes (e.g., `feature/`, `bugfix/`) and AI-generated concise slugs (2-4 words). Added Conventional Commits support based on ticket type.
> - **Why:** To improve repository hygiene and make branch names more readable and semantic (e.g., `feature/PROJ-123-add-login-page`).
> - **Files:**
>   - `lib/github.ts`
>   - `app/api/process-ticket/route.ts`
>   - `lib/graph/schema.ts`
>   - `lib/graph/prompts/triagePrompts.ts`

---

### 🧹 Refactors

---

> ### Validation Prompts Refactor
>
> - **What changed:** Extracted validation system prompts to `lib/graph/prompts/validationPrompts.ts` and moved `ValidationSchema` to `lib/graph/schema.ts`.
> - **Why:** To align with the project structure where prompts and schemas are separated from node logic, improving maintainability.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/prompts/validationPrompts.ts`
>   - `lib/graph/schema.ts`

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
