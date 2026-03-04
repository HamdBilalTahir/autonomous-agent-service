## 🗓️ **2026-03-04**

---

### ✨ Features

---

> ### Development Tools & Makefile Setup
>
> - **What changed:** Added a `Makefile` with targets for `lint`, `format`, `test`, and frontend workflow. Created a `tools` directory and set up `husky` with `lint-staged` for pre-commit checks.
> - **Why:** To standardize development commands and enforce code quality (linting/formatting) automatically before commits.
> - **Files:**
>   - `Makefile`
>   - `tools/`
>   - `.husky/`
>   - `package.json`

---

### 🐛 Fixes

---

> ### Comprehensive Linting Fixes (Strict Type Safety)
>
> - **What changed:** Resolved 49+ ESLint errors across the codebase, primarily targeting `no-explicit-any` and `no-unused-vars` rules. This involved adding proper types (or explicit suppressions where necessary), removing unused variables, and enabling safe error handling patterns in API routes and library modules. Configured `.eslintrc.json` to enforce Next.js and TypeScript best practices.
> - **Why:** The codebase contained numerous loose types (`any`) and unused variables which cluttered the code and bypassed type safety checks. Fixing these ensures a more robust and maintainable codebase that passes strict linting checks in CI/CD.
> - **Files:**
>   - `.eslintrc.json`
>   - `app/api/auth/[...nextauth]/route.ts`
>   - `app/api/branches/route.ts`
>   - `app/api/chat/route.ts`
>   - `app/api/create-jira-ticket/route.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/repos/[owner]/[repo]/branches/route.ts`
>   - `app/api/test/route.ts`
>   - `app/api/user/repos/route.ts`
>   - `app/api/webhook/route.ts`
>   - `app/components/RepoSelector.tsx`
>   - `app/components/RequirementGathering.tsx`
>   - `app/monitor/page.tsx`
>   - `jest.config.js`
>   - `lib/github.ts`
>   - `lib/graph/metrics-utils.ts`
>   - `lib/graph/nodes/emNode.ts`
>   - `lib/graph/redis-checkpointer.ts`
>   - `lib/jira.ts`
>   - `lib/project-context.ts`
>   - `lib/utils/retry.ts`

## 🗓️ **2026-03-02**

---

### ✨ Features

---

> ### Auto-Scaffold Next.js Stack for Empty Repositories
>
> - **What changed:** Implemented automatic detection of empty repositories (or those missing a stack) in the Architecture Node, which now returns a default "Fresh Next.js TypeScript Project" profile with detailed `scaffoldInstructions`. The Engineering Manager (EM) Node consumes these instructions to prioritize project scaffolding (package.json, tsconfig, app structure) before implementing requested features.
> - **Why:** The agent previously failed or hallucinated on empty repositories because it tried to analyze a non-existent architecture. Now it autonomously bootstraps a standard Next.js + Tailwind stack on a new branch when starting from scratch.
> - **Files:**
>   - `lib/graph/schema.ts`
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/prompts/emPrompts.ts`

---

> ### Agent Startup Logger
>
> - **What changed:** Added explicit logging of the target repository (owner/repo) and base branch at the very start of the graph execution in the webhook handler.
> - **Why:** To provide immediate visibility into which codebase context the agent is operating on for each ticket, confirming the dynamic repo selection is working as expected.
> - **Files:**
>   - `app/api/webhook/route.ts`

---

> ### Dynamic Repository Context & Environment Independence
>
> - **What changed:** Updated the entire agent pipeline to support dynamic GitHub repository selection (owner/repo/branch) passed via state, removing all hardcoded reliance on `TARGET_GITHUB_OWNER` and `TARGET_GITHUB_REPO` environment variables.
>   1. **Architecture Node** (`lib/graph/nodes/architectureNode.ts`): Now instantiates `GitHubService` with the correct target repo from state, fetches the `codebaseTree` dynamically (replacing the static env-based fetch in the API route), and passes repo details to `analyzeProjectContext` and `getInstalledPackages` for accurate project analysis.
>   2. **Design Node** (`lib/graph/nodes/designNode.ts`): Added strict validation to ensure target repo details are present in state before execution, preventing operation on the wrong codebase.
>   3. **Process Ticket API** (`app/api/process-ticket/route.ts`): Updated to extract `targetOwner`, `targetRepo`, and `targetBranch` from the request body and pass them to the graph state. Removed fallback to environment variables.
>   4. **Webhook API** (`app/api/webhook/route.ts`): Removed environment variable fallbacks; now strictly relies on `AGENT_META` extracted from the Jira ticket.
>   5. **Branches API** (`app/api/branches/route.ts`): Updated to require `owner` and `repo` query parameters instead of defaulting to env vars.
>   6. **Project Context** (`lib/project-context.ts`): Updated context analyzers to fetch `package.json` and config files via GitHub API when repo details are provided, enabling analysis of remote repositories.
> - **Why:** The agent was previously tethered to a single "target repo" defined in `.env`, causing it to read/write to the wrong codebase if the user selected a different repo in the UI. Now the agent is fully multi-tenant capable, respecting the specific repo/branch selected for each ticket.
> - **Files:**
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/nodes/designNode.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/webhook/route.ts`
>   - `app/api/branches/route.ts`
>   - `lib/project-context.ts`
>   - `app/api/test/route.ts`

---

> ### Validation Progress Logger
>
> - **What changed:** Added a 5-minute interval logger to the webhook handler that fetches and logs the validation completion percentage (files validated / total files) and current round count for the running ticket.
> - **Why:** Long-running tickets provided no visibility into their validation progress, making it difficult to tell if the agent was stuck or just churning through a large batch of files.
> - **Files:**
>   - `app/api/webhook/route.ts`

---

> ### Story Creator UI — GitHub Repo/Branch Selection + AI Chat for User Stories
>
> - **What changed:** Built the full front-end experience for creating Jira user stories through an AI-assisted chat flow:
>   1. **Repo & Branch Selector** (`app/components/RepoSelector.tsx`): Step 1 of the flow. Fetches the authenticated user's GitHub repositories via `GET /api/user/repos`, lets the user search/filter, then loads the selected repo's branches via `GET /api/repos/[owner]/[repo]/branches`. Confirms the selection and advances to the requirements step.
>   2. **Requirements gathering chat** (`app/components/RequirementGathering.tsx`): Step 2. A full chat interface pre-seeded with a context-aware greeting (repo + branch name). The user describes their feature in natural language; messages are sent to `POST /api/chat` which returns either a follow-up question or a structured `stories[]` array when enough context has been gathered.
>   3. **Two-step page layout** (`app/page.tsx`): Step 1 renders a centred card with the `RepoSelector`. On confirmation, the page transitions to Step 2 with an expanded max-width layout housing the `RequirementGathering` component.
>   4. **Repo selection persistence**: The selected repo and branch are serialised to `localStorage` under `kuai_repo_selection` so the session survives a page refresh.
> - **Why:** The agent pipeline required a structured Jira ticket as its entry point, but writing detailed user stories by hand is time-consuming and inconsistent. This UI lets users describe a feature conversationally and have the AI turn it into well-formed stories (summary, description, acceptance criteria) ready for Jira creation.
> - **Files:**
>   - `app/page.tsx` *(new)*
>   - `app/components/RepoSelector.tsx` *(new)*
>   - `app/components/RequirementGathering.tsx` *(new)*
>   - `app/api/chat/route.ts` *(new)*

---

> ### Repo Context Sidebar + Change Repo Warning
>
> - **What changed:** When a repo and branch are selected, the requirements page now shows a sticky left sidebar displaying the active repository and branch. A "Change Repo" button triggers an inline amber confirmation dialog warning the user that their current conversation and stories will be cleared, requiring explicit confirmation before resetting state.
> - **Why:** Users had no visibility into which repo/branch was active once they moved to the requirements step, and there was no way to switch repos without refreshing the page.
> - **Files:**
>   - `app/page.tsx`

---

> ### Review / Edit / Approve Flow Before Ticket Creation
>
> - **What changed:** After the AI generates user stories, instead of creating them immediately, the app transitions to a review panel. Each story is shown as a collapsible accordion card with inline editing for the summary (single-line input), description (textarea), and acceptance criteria (add/edit/remove individual items per story). Users can also delete individual stories. A single "Create N Tickets in Jira" button at the bottom submits all approved stories. On completion, a success view lists created ticket keys as clickable Jira links and offers a "Start a new conversation" button to reset.
> - **Why:** Giving the AI direct create access with no human review step was risky — stories often need minor corrections before being committed to Jira.
> - **Files:**
>   - `app/components/RequirementGathering.tsx`

---

> ### Repo/Branch Binding for Jira Ticket Creation
>
> - **What changed:** Jira tickets created from the UI are now bound to the GitHub repo and branch the user selected. The selected repo owner, repo name, and branch are embedded as machine-readable `AGENT_META` in the first ADF paragraph of the ticket description. The webhook extracts this metadata and uses it for codebase fetching and PR creation, with env var values as fallback. The GitHub repo link is also displayed in the ticket description above the acceptance criteria.
> - **Why:** Previously all tickets used hardcoded env var values for repo/branch, so the UI selection had no effect on which codebase the agent actually read or targeted. Now the agent reads the correct codebase (using the selected branch as the base) and opens the PR against the selected repo.
> - **Files:**
>   - `app/components/RequirementGathering.tsx` — passes `repoOwner`, `repoName`, `branch` to ticket creation API; adds GitHub link in description
>   - `app/api/create-jira-ticket/route.ts` — embeds `AGENT_META:{owner,repo,branch}` as first ADF paragraph
>   - `lib/graph/state.ts` — added `targetOwner`, `targetRepo`, `targetBranch` Annotation fields
>   - `app/api/webhook/route.ts` — extracts `AGENT_META` from ADF, uses values for `getRepoStructure` and seeds graph state
>   - `lib/graph/nodes/createPrNode.ts` — reads `targetOwner`/`targetRepo`/`targetBranch` from state with env var fallback
>   - `lib/github.ts` — `processChangesAndCreatePR` accepts `baseBranch` as 9th parameter; PR is opened against the selected base branch

---

> ### Multi-Story Generation for Large Scopes
>
> - **What changed:** The chat AI now proactively splits large feature scopes into multiple focused user stories instead of always producing a single story. Updated the `SYSTEM_PROMPT` in `app/api/chat/route.ts` with explicit scope-splitting rules: features with 3+ distinct surfaces, independent sub-features (create/edit/delete), or mixed UI+API work are broken into separate stories (capped at 6). Each story must be independently shippable. The frontend review panel already supported N stories — no UI changes needed.
> - **Why:** Large features described in a single chat turn were being squeezed into one monolithic story that would be too big for a single agent run. Splitting them upstream produces right-sized tickets that the agent can implement cleanly in one PR each.
> - **Files:**
>   - `app/api/chat/route.ts`

---

> ### Pipeline State Tracking Across Graph Nodes
>
> - **What changed:** Added a `lib/pipeline-state.ts` module that writes the current pipeline stage for each active ticket to Redis (TTL 2 hours). Every graph node calls `setPipelineState(ticketId, ticketSummary, nodeName)` at the start of execution, mapping node names to human-readable labels (e.g. `"architectureNode"` → `"Analyzing Architecture"`). `updateJiraStatusNode` calls `clearPipelineState` on completion. `lib/cache.ts` gained a `deleteCached` helper to support cache key removal.
> - **Why:** Enables the monitor page to show which stage of the pipeline each in-flight ticket is currently in, without modifying the LangGraph orchestration layer.
> - **Files:**
>   - `lib/pipeline-state.ts` *(new)*
>   - `lib/cache.ts`
>   - `lib/graph/nodes/triageNode.ts`
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/designNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/nodes/updateJiraMetadataNode.ts`

---

> ### Ticket Monitor Page (`/monitor`)
>
> - **What changed:** Added a `/monitor` route with a live dashboard. "Running" tickets (those with an active pipeline state in Redis) appear in a top section with a pulsing blue indicator, the current pipeline node label, and a live elapsed timer (ticks every second). All other AI-generated tickets appear in a table with status badges, last-updated timestamps, PR links, and direct Jira links. The page auto-refreshes every 15 seconds. A new `GET /api/tickets` endpoint powers it — querying Jira for all `ai-agent`/`ai-generated` labelled tickets, enriching each with Redis pipeline state and a PR URL extracted from Jira comment links.
> - **Why:** There was no visibility into tickets after they were created — users couldn't tell if the agent had picked them up, which stage they were at, or whether a PR had been opened.
> - **Files:**
>   - `app/monitor/page.tsx` *(new)*
>   - `app/api/tickets/route.ts` *(new)*

---

### 🐛 Fixes

---

> ### Jira Rollback Status Correction
>
> - **What changed:** Updated the error handling rollback in `webhook/route.ts` to transition failed tickets to **"To Do"** instead of "Selected for Development".
> - **Why:** "Selected for Development" was not a valid transition in the target Jira project's workflow, causing the rollback itself to fail and leaving tickets in a broken state. "To Do" is the correct initial state.
> - **Files:**
>   - `app/api/webhook/route.ts`

---

> ### EM Node Retry Logic & Error Handling
>
> - **What changed:** Implemented a retry mechanism (3 attempts with backoff) for the EM Node's structured output generation. Added detailed `FATAL` logging of the raw response content if the model fails to conform to the schema after retries.
> - **Why:** The EM Node occasionally failed with a null result when the model produced malformed JSON, crashing the entire workflow. Retries and better logging ensure transient failures are recovered and persistent issues are easier to debug.
> - **Files:**
>   - `lib/graph/nodes/emNode.ts`

---

### 🔧 Improvements

---

> ### Chat UI — Expandable Textarea, Viewport-Locked Layout, Fixed Message Colors
>
> - **What changed:** Three UI fixes to the requirements chat:
>   1. **Expandable textarea**: The chat input auto-resizes as the user types (up to 160px), then shows an internal scrollbar. Uses a `textareaRef` with `el.style.height = Math.min(el.scrollHeight, 160) + 'px'` and resets on send.
>   2. **Viewport-locked layout**: Changed `<main>` from `min-h-screen` to `h-screen overflow-hidden` with a flex column that propagates height down through `flex-1 min-h-0` at each level. When a repo is selected, the header collapses to a compact one-line bar (logo + Monitor link) so the chat fills the remaining viewport without any page-level scroll. The chat container uses `h-full` instead of `calc(100vh - 260px)`.
>   3. **Message label colors**: User bubble role labels ("You") were nearly invisible (light purple on dark purple). Fixed with explicit inline styles: `rgba(255,255,255,0.55)` for user labels and `#A56ABD` for assistant labels.
> - **Why:** The textarea previously caused the browser window to scroll when it grew; the fixed-height chat container was mis-sized so scrolling was broken; message sender labels were illegible.
> - **Files:**
>   - `app/page.tsx`
>   - `app/components/RequirementGathering.tsx`

---

> ### GitHub OAuth — Org Repos, Pagination, Auth Error Recovery, Default Branch
>
> - **What changed:** Closed 5 gaps in the GitHub repo/branch selection flow to match Vercel-quality behaviour:
>   1. **`read:org` scope added** (`app/api/auth/[...nextauth]/route.ts`): The previous scope list (`read:user user:email repo`) did not include `read:org`, so the API couldn't enumerate organisations the user is a member of (only orgs they own).
>   2. **Org repos visible** (`app/api/user/repos/route.ts`): `listForAuthenticatedUser()` only returns repos owned directly by the user. Now also calls `orgs.listForAuthenticatedUser()` then `repos.listForOrg()` for every org in parallel, merges and deduplicates by `full_name`, and sorts by `updated_at` descending.
>   3. **Pagination** (repos + branches APIs): Both endpoints now accept a `page` query param (`?page=N`) and return `hasMore: boolean`. RepoSelector shows a "Load more" button at the bottom of each list when `hasMore` is true — no data is silently dropped.
>   4. **Auth error recovery** (`app/components/RepoSelector.tsx`): API routes now explicitly return 401 for expired tokens. The selector detects 401 vs generic failure and shows an inline "Session expired — Reconnect GitHub" banner with a `signIn('github')` trigger instead of silently showing an empty list.
>   5. **Default branch highlighted + auto-selected** (branches API + RepoSelector): `GET /api/repos/[owner]/[repo]/branches` now fetches `repos.get()` in parallel and returns `defaultBranch`. RepoSelector displays a `default` badge next to the default branch in the list and auto-selects it when the branch list loads.
> - **Why:** Users with repos in organisations (not just personal) couldn't see them at all. The 100-item hard cap silently dropped repos for active users. Silent empty lists on token expiry left users confused with no recovery path. Branch selectors that don't highlight the default branch make users guess which branch to target.
> - **Files:**
>   - `app/api/auth/[...nextauth]/route.ts`
>   - `app/api/user/repos/route.ts`
>   - `app/api/repos/[owner]/[repo]/branches/route.ts`
>   - `app/components/RepoSelector.tsx`

---

## 🗓️ **2026-03-01**

---

### 🐛 Fixes

---

> ### Validation — Strict Prop-Derived Array Safety (Audit 1)
>
> - **What changed:** Strengthened **Audit 1** in the validation prompt to flag ALL unguarded array iterations on prop/state/API variables as `[CRITICAL]`, regardless of TypeScript types.
> - **Why:** The previous rule only flagged variables "not typed as a concrete array". `slots.forEach(...)` was passing because `slots` was typed as `BookingSlot[]` in the interface, but at runtime `slots` was `undefined` (parent hadn't loaded data yet), causing a crash. The new rule assumes all external data is potentially undefined and demands optional chaining (`?.`) or a fallback (`?? []`) for every iteration.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`

---

### 🔧 Improvements

---

> ### EM + Engineer — Mandatory File Size Discipline (~200 lines / ~6,000 chars hard limit)
>
> - **What changed:** Two-layer fix to prevent large files from being planned or generated in the first place:
>   1. **EM Prompt** (`emPrompts.ts`): Replaced vague "~150 lines of logic" guidance with 4 mandatory, concrete decomposition rules + a hard limit of ~200 lines / ~6,000 chars per file:
>      - **Rule 1** — Component + logic separation: any component that manages state or calls APIs must split into JSX shell + `hooks/use[Feature].ts`
>      - **Rule 2** — Modal/Drawer/Sheet: wrapper shell + content sub-component + hook; 2+ distinct steps/views → each view is its own file
>      - **Rule 3** — Pages are thin orchestrators (~40-60 lines): layout shell + content component + hook
>      - **Rule 4** — 3+ distinct visual sections → each section is its own sub-component file
>      - Three domain-neutral decomposition examples covering the most common file types: **(A)** feature modal with form, **(B)** multi-step flow/wizard, **(C)** data page with filters and table — applicable to any user story (auth, e-commerce, admin, social, dashboards, etc.)
>   2. **Engineer Prompt** (`frontendEngineerPrompts.ts`): Added `FILE SIZE DISCIPLINE` block — if implementing this file would exceed ~200 lines, stop; that means you are writing another file's responsibility. Component files contain only JSX; page files contain only layout structure.
> - **Why:** `PaymentMethodModal.tsx` (9,385 chars) and `CancellationFlowModal.tsx` caused 300s validation timeouts on both inline and external validation passes. Root cause is file size — big files take longer to generate and longer to validate. Fix upstream at the planning stage prevents the problem from occurring rather than handling it reactively.
> - **Files:**
>   - `lib/graph/prompts/emPrompts.ts`
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`

---

> ### Validation Node — Audit 9: Flow Coherence (UX Gut-Check)
>
> - **What changed:** Added **Audit 9** — a domain-universal UX gut-check that catches things that compile and run but make a real user feel confused, stuck, or frustrated. Applies to any user story type (auth, settings, dashboards, e-commerce, social, admin, onboarding, etc.). 16 checks across 5 categories:
>
>   **Completion & Navigation (3)**
>   1. Success state with no next step — "Done" screen with no CTA or redirect
>   2. Multi-step flow with no progress indicator — `currentStep` state but no counter/bar/breadcrumb
>   3. Page with no `<h1>` — user lands with zero orientation cue
>
>   **Forms & Input (3)**
>   4. Form wiped on error — `catch` block calling `reset()`, user loses all input on network failure
>   5. Validation errors on mount — required/error states shown before user has interacted with anything
>   6. Disabled button with no explanation — greyed-out control, no `title`, no adjacent helper text
>
>   **Lists, Data & Context (4)**
>   7. Filter/sort controls above an empty list — controls for data that doesn't exist yet
>   8. Raw number with no label/unit — `{count}` or `{value}` with no surrounding context
>   9. Truncated text with no tooltip — `truncate`/`line-clamp` with no `title` attribute
>   10. Weak empty state — "No items" with no explanation of why or what to do next
>
>   **Interactions & Affordances (4)**
>   11. Clickable element with no affordance — `onClick` card/row with no `cursor-pointer` or hover style
>   12. Confirmation dialog without item name — "Are you sure?" with no name/preview of what's being affected
>   13. Bulk action without count — "Delete all" confirmation that doesn't say how many items will be deleted
>   14. Opt-in feature defaulted to on — notifications/analytics/marketing toggle initialized to `true`
>
>   **Buttons & Hierarchy (2)**
>   15. Generic CTA label — "Submit", "OK", "Confirm" where a descriptive outcome label is possible
>   16. Flat button hierarchy — primary and secondary/destructive actions with identical `variant`
>
> - **Cost:** Zero extra API calls. Same single validation pass, same concurrency. ~60 additional lines in the system prompt.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`

---

> ### Validation Node — Audit 8: Human QA Scan
>
> - **What changed:** Added **Audit 8** to the validation system prompt — a human QA lens applied to all JSX-rendering files (components, pages, layouts). Skipped automatically for types, hooks, utils, and API routes. Seven checks that catch issues a code reviewer misses but a QA tester clicking through the app would immediately notice:
>   1. **Destructive actions without confirmation** — Delete/Remove/Cancel buttons that fire directly with no `AlertDialog`, confirmation state, or intermediate step
>   2. **Uncloseable modals/drawers** — `<Dialog>`, `<Sheet>`, `<Drawer>` with no X button, no `onOpenChange` dismiss, and no backdrop handler
>   3. **Icon-only buttons without `aria-label`** — `<button><Trash2 /></button>` is invisible to screen readers and keyboard users
>   4. **Hardcoded dummy data in JSX** — `"John Doe"`, `"test@example.com"`, `"Lorem ipsum"` rendered directly in the UI
>   5. **Placeholder JSX text** — `TODO:`, `FIXME:`, or `...` string literals visible to end users
>   6. **Unlabelled form inputs** — inputs with no `<label>` and no `aria-label` (placeholder alone vanishes on focus)
>   7. **Step count mismatch** — wizard step indicator showing a different count than the number of step components rendered
> - **Why:** Audits 1–7 catch what a static code reviewer sees (type errors, import syntax, color classes, duplicate elements). Audit 8 catches what only shows up when you actually use the feature — a modal you can't dismiss, a delete button that skips confirmation, an input you can't identify after clicking it. All checks are [WARNING] level so they don't block builds; they feed repair hints back to the engineer.
> - **Cost:** Zero extra API calls. Audit 8 runs in the same validation pass as Audits 1–7 — it adds ~50 lines to the system prompt but no additional model invocations.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`

---

> ### Engineer Node — Prompt Size Reduction & Generation Reliability
>
> - **What changed:** Three targeted improvements to reduce token overhead per file and prevent generation hangs:
>   1. **Priority-bucketed codebase tree** (`cappedCodebaseTree`): Replaced a flat first-200-lines slice (which gave pages/API routes — noise) with a 5-bucket filter that guarantees the engineer always sees the paths it actually imports from — `components/ui/`, `components/shared/`, `hooks/`, `lib/`, `utils/`, `constants/`, `types/`, `store/`, `context/`, `services/`, `auth/`, `providers/`, `schemas/`, `actions/`, and pages (capped at 30, no API routes). Total ceiling: 120 lines of 100% relevant paths.
>   2. **Design specs scoped to UI files only**: JSON design specs (~4k chars) are now only injected into files that render UI (`components/`, `page.tsx`, `layout.tsx`). Types files, hooks, and utils had no use for color palettes or animation specs — removing them from those calls saves ~4k chars per non-UI file generation.
>   3. **Generation timeout**: Wrapped `model.invoke()` with the same `INLINE_VALIDATION_TIMEOUT_MS` ceiling already used for validation. Previously, if the Gemini API hung (rate limit, load spike), the engineer node would wait indefinitely. On timeout the file is skipped with empty content so the external validator catches it and surgical mode retries.
> - **Why:** The first file in a 20-file round was taking 10+ minutes. Root cause was every file's system prompt containing the full uncapped codebase tree (pages + API routes + config noise) plus JSON design specs regardless of whether the file rendered UI. This pushed prompts to 15,000-30,000 chars per file, slowing Pro model inference and hitting API rate limits. No quality impact — UI files still get full design specs, and the bucketed tree is strictly more relevant than the previous random slice.
> - **Files:**
>   - `lib/graph/nodes/engineerNode.ts`

---

> ### Design Node — Active Design Audit & Upgrade Mode
>
> - **What changed:** The design node's role expanded from "generate specs for new components" to "audit the existing design and actively upgrade it." New 3-phase approach in `DESIGN_SYSTEM_PROMPT`:
>   1. **Phase 0 — Design Audit**: Evaluates 6 dimensions before writing a single spec — color palette (generic? poor contrast? missing semantic tokens?), typography (monotone? wrong line heights?), spacing (off 8pt grid?), component states (missing hover/focus/loading?), visual depth (flat? no elevation system?), micro-interactions (instant state changes?).
>   2. **Phase 1 — Upgrade Strategy**: For each dimension, decides KEEP / REFINE / REPLACE. Output represents the improved version, not the current state.
>   3. **Phase 2 — Specification**: Full authoritative design contract with WCAG AA contrast, 4+ heading levels, strict 8pt spacing grid, all five component states, ease-out micro-interactions, 44px touch targets, and responsive breakpoints.
>   - Specs apply to **all files in the sprint** — both new files and existing files in `filesToModify`. When the engineer touches an existing file it must apply the upgraded design, not preserve weak existing styles.
>   - Each component spec explicitly states what it is upgrading from so the engineer knows to replace old styles rather than merge with them.
> - **Why:** The design node was producing forward-looking specs but ignoring existing design quality. Flat color palettes, missing states, and off-grid spacing in already-shipped components were never challenged. Now every engineer pass that touches a file is an opportunity to raise the quality bar.
> - **Files:**
>   - `lib/graph/prompts/designPrompts.ts`

---

> ### Design Node — Real Project Context & Richer Output
>
> - **What changed:** Design node was generating specs in the dark — `architectureProfile` always showed `UI Library: Unknown` because it reads the agent's own filesystem, not the target project. Three improvements:
>   1. **Installed library detection**: `installedPackages` (fetched from GitHub) is now scanned for confirmed design/animation libraries (`tailwindcss`, `framer-motion`, `@radix-ui`, `@mui`, `antd`, `lucide-react`, etc.). The prompt now tells the model exactly what is available — preventing it from inventing Framer Motion animations on a project that only has CSS, or Shadcn variants that aren't installed.
>   2. **Design-relevant file injection**: `codebaseTree` is filtered for `globals.css`, `tailwind.config.*`, `components/ui/`, `components/shared/`, `styles/` files (capped at 30 lines). The model can now infer actual design tokens and component conventions from what the project already has.
>   3. **Richer output logging**: Expanded from 3 lines to full palette, semantic colors, typography scale, spacing grid, animation timings, and each component with its variants and states.
>   4. **Fixed `systemPrompt` use-before-declare bug**: `systemPrompt` was declared after the `console.log` that referenced `systemPrompt.length`. Reordered to: detect libs → filter files → declare systemPrompt → build userPrompt → log.
>   5. **Removed `JSON.stringify({ userPrompt })` logging** — same blocking serialization issue fixed in PM/EM nodes.
> - **Why:** The design node was hallucinating a design system (defaulting to its own Shadcn/Framer Motion preferences) regardless of what the target project actually uses, potentially misleading the engineer with wrong component APIs or unavailable animation libraries.
> - **Files:**
>   - `lib/graph/nodes/designNode.ts`
>   - `lib/graph/prompts/designPrompts.ts`

---

> ### EM Node — Priority-Ordered Component Context
>
> - **What changed:** `existingComponents` in `emNode` was an unordered, uncapped list of all `.tsx`/`.jsx` files. Replaced with a 4-bucket priority system (cap: 80 total):
>   - **Bucket 1** — `components/shared/` and `components/ui/` primitives (highest reuse value — always included first)
>   - **Bucket 2** — Custom hooks (`hooks/`) — prime reuse candidates for state/data logic
>   - **Bucket 3** — Feature components (other `components/` paths)
>   - **Bucket 4** — App pages (`app/*/page.*`) — routing awareness only, capped at 20
>   - Deduplication across buckets; file-only entries (no bare directory names)
> - **Why:** With the flat filter, a 200-file project would inject an arbitrary 80-line slice that could miss all shared components and hooks — the very files the EM needs to make reuse decisions. Now shared primitives and hooks always appear first regardless of project size.
> - **Files:**
>   - `lib/graph/nodes/emNode.ts`

---

### ⚡ Performance

---

> ### Pipeline Speed Optimisations — Model Tuning, Prompt Bloat & Logging
>
> - **What changed:** Three sources of unnecessary latency removed across the planning pipeline:
>   1. **Flash model for lightweight nodes**: `architectureNode` and `triageNode` switched from Pro to `gemini-3-flash-preview`. Both nodes do structured extraction from configs / ticket text — no deep reasoning required. Pro was being used where Flash is equivalent and 5–10× faster.
>   2. **Removed full-prompt `JSON.stringify` logging**: `pmNode` and `emNode` were serialising the entire system + user prompt (5–10 k chars) to JSON and printing it before every LLM call. Node.js `console.log` with large objects is synchronous and blocks the event loop. Replaced with a single-line size summary (`system: N chars, user: N chars`).
>   3. **Capped `existingComponents` in emNode**: The EM prompt was injecting every `.tsx`/`.jsx` file found in the codebase tree with no limit. On a project with 200+ files this adds thousands of tokens before the LLM call. Capped at 80 lines — enough context for the EM to make component reuse decisions.
> - **Why:** `pmNode` was consistently taking 5–15 minutes. Part of that is Pro model inference time, but the logging and uncapped injections were adding measurable overhead on top and inflating the token count sent to the model.
> - **Files:**
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/nodes/triageNode.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/emNode.ts`
>   - `lib/graph/metrics-utils.ts` — updated `NODE_MODEL_MAPPING` (architectureNode → Flash, pmNode → Pro) and renamed pricing key to `GEMINI_3_1_FLASH` to match current model naming

---

### ✨ Features

---

> ### Per-File Commit Messages — Descriptive Conventional Commits
>
> - **What changed:** Replaced the repeated ticket-level commit message (all files got the same `feat: implement X (src/path/to/file)` message) with a deterministic per-file message generator. Each file now gets a specific, meaningful commit that describes exactly what that file adds:
>   - `src/app/onboarding/page.tsx` → `feat(onboarding): add onboarding page`
>   - `src/components/profile/AvatarCard.tsx` → `feat(profile): add avatar card component`
>   - `src/hooks/useOnboardingWizard.ts` → `feat(hooks): add useOnboardingWizard hook`
>   - `src/app/api/users/route.ts` → `feat(api): add users endpoint`
>   - `src/app/settings/layout.tsx` → `feat(settings): add settings layout`
>   - Scope is derived from the directory structure (subfolder under `components/`, parent folder under `app/`, etc.). Subject is derived from the file name (PascalCase/camelCase converted to lowercase words, with special handling for `page`, `layout`, `route`, `loading`, `error`, hooks, providers, and schemas). All messages capped at 72 characters per conventional commit best practice.
>   - `commitMessage` parameter removed from `processChangesAndCreatePR` and its call site — the ticket-level commit message is no longer used per-file (the PR title still uses the ticket summary).
> - **Why:** Every commit in the PR had an identical message, making the git log useless for understanding what changed file-by-file. Code review and `git blame` both rely on per-commit descriptions being meaningful.
> - **Files:**
>   - `lib/github.ts`
>   - `lib/graph/nodes/createPrNode.ts`

---

> ### Validation — UX Completeness & User Journey Audits (AUDIT 6 & 7)
>
> - **What changed:** Added two new audit sections to the LLM validation prompt and injected the sprint's new routes into the validation context:
>   1. **AUDIT 6 — UX COMPLETENESS** (all warnings): Catches patterns that compile cleanly but produce broken or confusing experiences — `href="#"` / `href=""` placeholder links, uninterpolated dynamic route segments (`/user/[id]` literal), lists with no empty state, async submit buttons with no loading/disabled state, form submissions with no success path (no toast or redirect), and async API calls with no catch block / error state shown to the user.
>   2. **AUDIT 7 — USER JOURNEY & NAVIGATION** (critical + warnings): Catches `app/` page files missing `export default function` (404 — critical), page components with no back navigation (user trapped), step components calling `router.push` directly instead of `onNext()` (bypasses wizard shell), and navigation components modified this sprint that are missing a `<Link>` to newly created routes (orphan pages).
>   3. **Sprint scope injection**: The list of new `app/` routes created this sprint is now extracted from `executionPlan.newFilesToCreate` and injected into the validation system prompt, enabling AUDIT 7 to cross-reference navigation components against the routes that should be reachable.
>   4. **Two new REPAIR HINT templates** added to the solution-oriented feedback section: loading-state fix and empty-state fix.
> - **Why:** Generated code was producing isolated dead-end screens with no back navigation, lists that showed blank space when empty, form submissions that offered no feedback, and new routes that were unreachable because no nav component was updated to link to them. These are all valid TypeScript but bad user experience — a gap between compilation correctness and actual usability.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`

---

> ### PM Agent — Story Refinement, First Principles Audit & Categorized Task Generation
>
> - **What changed:** Completely rewrote the PM agent's system prompt to act as a Story Refinement Agent, not just a feature extractor. Three-phase approach:
>   1. **Phase 0 — Story Audit**: Before planning, the PM now critically evaluates the raw user story: reframes solution-first stories as problem statements, assesses scope (is this one story or several?), runs a First Principles Check (does each element serve a distinct need? is there a simpler path? what's the minimum viable version?), and systematically identifies every implied gap — entry points, success/cancel/error paths, loading/empty states, auth gates, data cascades, and shared component side effects.
>   2. **Phase 1 — Impact Analysis** (existing, strengthened): entry point, success path, cancel path, error state, auth gate, shared component impact, routing gaps — now grounded by the full active route list and codebase tree injected into the prompt.
>   3. **Phase 2 — Task Generation**: Output is now a categorized, actionable task list using explicit tags — `[CORE]` (story features), `[NAV]` (navigation entry points), `[STATE]` (loading/error/empty), `[LAYOUT]` (page wrappers), `[UX]` (feedback/toasts/validation), `[IMPACT]` (shared component updates). Inferred tasks not in the original story are marked with `*`. Every task must be specific enough to implement without guessing.
>   4. **Schema update**: `featureList` description updated to reflect the new categorized format so the structured output model generates rich task items instead of vague bullet points.
> - **Why:** The PM was only extracting what the ticket said literally, ignoring implied work. The result was engineers building features with no nav links, no loading states, no success feedback, and no connection to the rest of the app. The new approach audits the story against product fundamentals before generating tasks, ensuring nothing is missed.
> - **Files:**
>   - `lib/graph/prompts/pmPrompts.ts`
>   - `lib/graph/schema.ts`

---

> ### PM Agent — Holistic User Journey & Routing Gap Detection
>
> - **What changed:** Upgraded the PM node from `gemini-3-flash-preview` to `gemini-3.1-pro-preview` and completely rewrote its system prompt and user prompt to enforce holistic product thinking:
>   1. **Phase 1 — Impact Analysis**: Before listing any requirements, the PM must answer 8 questions: entry point, success path, cancel/back path, error states, auth gate, shared component impact, data cascades, and routing gaps. Any new route with no entry point is flagged as a gap requiring an explicit nav link requirement.
>   2. **Phase 2 — Feature Decomposition**: Requirements are categorised into Core Features, UX Integration (navigation hooks the ticket omits), Feedback/Loading States, Global Layout, and UI Components.
>   3. **Mandatory UX Invariants**: Five rules applied to every ticket — no orphan pages, no dead ends, layout consistency, async feedback pattern (loading → success → error), and mobile navigation parity.
>   4. **Richer context in user prompt**: The full `codebaseTree` (file structure) and complete active route list are now passed to the PM, so it can ground gap detection in what actually exists rather than generalising.
> - **Why:** Generated features were producing isolated, dead-end UX — new pages with no nav links to reach them, multi-step flows with no back paths, and missing sidebar/navbar updates. The PM node was not reasoning about the user journey holistically; it only translated the literal ticket text without considering implied work.
> - **Files:**
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/prompts/pmPrompts.ts`

---

> ### UI/UX Bug Detection — Duplicate Elements & Color Contrast
>
> - **What changed:** Extended both the engineer and validation prompts with two new structural UI/UX audit layers:
>   1. **DUPLICATION PREVENTION** (engineer) + **AUDIT 4 — DUPLICATE UI ELEMENTS** (validator): Detects page headers, CTA buttons, social auth sections, and dividers rendered more than once across parent + child component (the "stitching bug"). Adds explicit **wizard navigation ownership rule**: Back/Next/Continue buttons are owned exclusively by the wizard shell — step components must render content only. Validator flags each as `[WARNING]` with a REPAIR HINT identifying which location to remove the duplicate from.
>   2. **COLOR CONTRAST** (engineer) + **AUDIT 5 — COLOR CONTRAST & VISIBILITY** (validator): Detects `text-white` on light containers (`bg-white`, `bg-gray-50`) and `placeholder:text-white` (invisible placeholder text). Validator flags these as `[CRITICAL]`; unguarded `dark:` Tailwind variants and missing explicit text color on light backgrounds are `[WARNING]`.
>   3. **`packageContext` injection** (engineer): The concrete list of installed npm packages is now injected directly into the engineer's system prompt, replacing the vague "only use installed packages" instruction. Pre-flight checklist extended from 7 to 9 steps (added step 7: Duplication Check, step 8: Contrast Check).
> - **Why:** Code review of a generated registration page revealed two runtime-safe but user-visible bugs: (1) the form heading and social auth section appeared twice because both the page wrapper and its child `<RegistrationForm>` independently rendered them (stitching bug); (2) placeholder text was invisible (white-on-white) because `text-white` was inherited from a dark parent theme into a light card.
> - **Files:**
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/prompts/validationPrompts.ts`
>   - `lib/graph/nodes/engineerNode.ts`

---

### ⚡ Performance

---

> ### Engineer Loop Efficiency — 4 Targeted Fixes
>
> - **What changed:** Four changes to `engineerNode.ts` that reduce wasted inline validation cycles, identified from real execution logs (KUAILABS-41):
>   1. **Critical-only inline acceptance** — Changed pass criterion from `crit === 0 && warn === 0` to `crit === 0`. Files with 0 criticals are accepted immediately; warnings are deferred to the external validator which has sibling context and produces more actionable repair hints. Removed the now-unnecessary `WARNING_LENIENCY_ROUND` constant and `isLenient` variable from `engineerNode`.
>   2. **Skip patch mode for cross-file errors** — Added `CROSS_FILE_PATTERN` regex that detects errors describing cross-file structural issues ("sibling", "import path", "duplicate interface", etc.). When matched, the surgical patch attempt is skipped and the engineer falls through to full regen. Patch mode (search-replace) cannot fix cross-file issues; skipping it eliminates a wasted attempt per failing file.
>   3. **Sibling export injection in revision rounds** — During targeted fix rounds (rounds 2+), the export signatures of clean sibling files are prepended to the engineer's user prompt as a `SIBLING FILE EXPORTS` block. This tells the engineer exactly what interfaces and hooks are exported from sibling files, preventing re-generated conflicting definitions.
>   4. **Skip inline LLM validation for large files** — Files >10 000 chars bypass the 300s inline LLM validation call entirely and defer to the external validator. Large files consistently timed out the inline call, burning 5 minutes per file for zero additional signal.
> - **Why:** In KUAILABS-41 logs, round 1 burned up to 57 inline validation calls (3 per file × 19 files) on warning-only and oversized files. These fixes reduce inline calls by ~60% for typical tickets and eliminate large-file timeout waste.
> - **Files:**
>   - `lib/graph/nodes/engineerNode.ts`

> ### Reduce Validation Prompt Size (Faster Pro Completion)
>
> - **What changed:** Three changes to shrink the prompt sent to the Pro validation model, directly reducing per-file API latency:
>   1. **Removed `implementationInstructions` from system prompt** — the full EM technical contract (potentially 500–2000 tokens) was sent with every file validation. Only the `validationChecklist` is relevant to the validator; the implementation instructions are the engineer's contract.
>   2. **Cap sibling context to 8 files, same-directory first** — previously all N-1 siblings were included (510+ lines on an 18-file ticket). Now capped at 8, with same-directory siblings prioritised (most likely to have type dependencies).
>   3. **Increased CONCURRENCY from 5 → 8** — more files processed in parallel within the pool.
> - **Why:** Flash model tested and rejected — produces noisy false positives causing extra revision rounds that cost more total time than the per-call savings. Pro with a lean prompt is the fastest end-to-end approach.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`
>   - `lib/graph/nodes/validationNode.ts`

---

### 🏗️ Architecture

---

> ### Redis Cache — Fail-Fast on Unreachable Connection
>
> - **What changed:** Added four ioredis connection options to prevent the cache client from hanging the pipeline silently when Redis is unreachable: `maxRetriesPerRequest: 0` (reject commands immediately instead of retrying 20×), `enableOfflineQueue: false` (throw instantly when not connected instead of queuing), `connectTimeout: 3000` (give up TCP handshake after 3s), `lazyConnect: true` (defer connection until first actual use, not at module import time). The existing `try/catch` in `getCached` and `setCached` now actually fires and falls back to the in-memory cache.
> - **Why:** The architecture node was observed hanging indefinitely at the cache check step. With default ioredis settings, `await redis.get()` never rejects when Redis is unreachable — commands queue up and retry with exponential backoff, silently blocking the entire LangGraph pipeline with no error logged.
> - **Files:**
>   - `lib/cache.ts`

---

> ### Package Dependency Enforcement (`getInstalledPackages` + `checkPackageImports`)
>
> - **What changed:** Added a three-layer package dependency enforcement system to prevent generated code from importing npm packages absent from the target project's `package.json`:
>   1. **`getInstalledPackages()`** — New function in `lib/project-context.ts` that deterministically parses `package.json` (dependencies + devDependencies + peerDependencies) into a `string[]`. Falls back to `[]` on failure (non-blocking).
>   2. **`installedPackages` state field** — Propagated through `AgentState` from `architectureNode` → `engineerNode` (prompt injection) → `validationNode` (AST check). Reducer keeps non-empty updates, defaults to `[]`.
>   3. **`checkPackageImports(files, installedPackages)`** — New AST-based function in `lib/graph/ts-cross-file-check.ts`. Extracts bare package names from import statements (handles scoped packages, skips Node.js builtins, relative paths, and `@/` aliases), checks against the installed set. Integrated into `validationNode` as part of the deterministic pre-LLM static check tier alongside `checkCrossFileImports`.
> - **Why:** `lucide-react` was missing from the target project's `package.json` and had to be manually installed after pulling generated code. The system had no mechanism to verify that imported packages existed in the project.
> - **Files:**
>   - `lib/project-context.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/nodes/architectureNode.ts`
>   - `lib/graph/ts-cross-file-check.ts`
>   - `lib/graph/nodes/validationNode.ts`

> ### Deterministic Cross-File Import Checker (`ts-cross-file-check.ts`)
>
> - **What changed:** Created `lib/graph/ts-cross-file-check.ts` with `checkCrossFileImports(allGeneratedFiles, filesToCheck)`. Uses the TypeScript AST API (`ts.createSourceFile`, `ts.forEachChild`) to build an export catalog for every generated file, then validates each import statement in `filesToCheck` against that catalog. Integrated into `validationNode.ts` as a deterministic pre-LLM tier: runs before the LLM batch, results are merged into `validationResults` after the LLM pass (additive, wrapped in `try/catch` so any checker failure is non-fatal).
> - **What it catches (zero false positives):**
>   - Named import `{ Foo }` from a generated file that only has `export default` — flags with exact line number and a ready-to-paste fix
>   - Named import `{ Foo }` from a generated file that has no export named `Foo` — lists all available exports
>   - Default import `Foo` from a generated file that has no default export
> - **What it ignores:** External packages, project files not in the generated set, and files with `export * from '...'` (wildcard re-exports cannot be enumerated)
> - **Why:** Wrong import style (named vs default) across generated files is the #1 recurring cross-file error category. A deterministic < 10ms AST check guarantees these errors surface with actionable repair hints every round — even when the LLM validation times out.
> - **Files:**
>   - `lib/graph/ts-cross-file-check.ts` (new)
>   - `lib/graph/nodes/validationNode.ts`

> ### Engineer Node Factory Pattern (`createEngineerNode`)
>
> - **What changed:** Extracted all engineer node logic from `frontendEngineerNode.ts` into a new generic `createEngineerNode(config: EngineerConfig)` factory in `lib/graph/nodes/engineerNode.ts`. `frontendEngineerNode.ts` is now an 8-line thin wrapper. The factory accepts a `config` object with `engineerType`, `getSystemPrompt`, `getUserPrompt`, `getPatchPrompt?`, and `modelName?`. Added `engineerType: z.enum(["frontend", "backend", "ai"]).default("frontend")` to `ExecutionPlanSchema` so the EM can specify which engineer to invoke.
> - **Why:** Previously, adding a new engineer type (backend, AI) would require copy-pasting the entire ~700-line engineer node including all retry logic, patch mode, concurrency, inline validation, and sibling context injection. The factory centralises all of that — new engineer types are thin 8-line wrappers with their own prompt configs.
> - **Files:**
>   - `lib/graph/nodes/engineerNode.ts` (new — factory + `EngineerConfig` interface)
>   - `lib/graph/nodes/frontendEngineerNode.ts` (refactored to thin wrapper)
>   - `lib/graph/schema.ts` (`engineerType` field added to `ExecutionPlanSchema`)

> ### Multi-Engineer-Type Routing in Graph
>
> - **What changed:** Updated `lib/graph/index.ts` to dynamically route to different engineer node types based on the EM's `engineerType` output. Added `getEngineerNodeName(state)` helper and `ENGINEER_TARGETS` array. All conditional edges from `designNode`, `validationNode`, `updateJiraMetadataNode`, and `emNode` now use the helper instead of hardcoding `"frontendEngineerNode"`.
> - **Why:** The graph previously had `frontendEngineerNode` hardcoded in all routing. With the factory pattern in place, the graph needed to dynamically resolve which engineer node to invoke.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Engineer Type Selection in EM Prompt
>
> - **What changed:** Added an `ENGINEER SELECTION` block to `EM_SYSTEM_PROMPT` instructing the EM to set `engineerType` based on the nature of the work: `"frontend"` for UI/React/Tailwind/browser-side logic, `"backend"` for API routes/database/auth/server-side, `"ai"` for ML pipelines/model integrations/vector stores. Defaults to `"frontend"` when uncertain.
> - **Why:** The EM outputs `ExecutionPlanSchema` which now includes `engineerType`. Without explicit guidance the EM would not populate this field correctly.
> - **Files:**
>   - `lib/graph/prompts/emPrompts.ts`

> ### Fix Perpetual Timeout Loop
>
> - **What changed:** Four targeted fixes to break the infinite Engineer → Validation loop caused by files that consistently timeout during API validation:
>   1. **Strip sibling context on retries**: On `attempt > 1` inside `processBatch`, sibling export context is omitted. The combined prompt (17 sibling files × 30 lines + file content) was the primary cause of 300s timeouts. Retries now send only the file itself — dramatically smaller prompt, much higher completion rate.
>   2. **Lenient mode accepts timeout-only failures**: In round ≥ 5, files whose only critical errors are `"Validation process failed"` (pure API timeouts, no real TypeScript errors) are accepted as-is. The engineer already inline-validated them 3 times; the outer validator cannot add more signal.
>   3. **Surgical context seeded from `filesNeedingRevision`**: Timeout-failing file paths were never included in `surgicalContext.failingFilePaths` because the regex parsed `"Validation process failed"` and found no embedded path. Now `failingFiles` is seeded directly from `filesNeedingRevision` before regex parsing.
>   4. **Carry forward `filesNeedingRevision` on 0-file engineer runs**: When surgical context has no files to generate (EM said "no changes needed"), the engineer returned `filesNeedingRevision: []`, which caused the validation ledger to re-validate ALL files. Now it carries forward the previous `filesNeedingRevision`.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Hard Cap Survives Surgical EM Resets (`totalRoundCount`)
>
> - **What changed:** Added `totalRoundCount` state field (never resets). The engineer node increments it alongside `roundCount`. `shouldContinue` now uses `totalRoundCount >= 15` for the hard cap instead of `roundCount`. Previously, `emNode` reset `roundCount: 0` on surgical escalation, which also reset the hard cap — allowing the pipeline to loop indefinitely through repeated EM passes.
> - **Removed:** Dead `validationCrashed: false` write from `emNode` (field was removed in session 3).
> - **Files:**
>   - `lib/graph/state.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/emNode.ts`
>   - `lib/graph/index.ts`

> ### Remove Validation Self-Loop — Crash Retries Absorbed Within Node
>
> - **What changed:** The `validationNode -.-> validationNode` self-loop has been removed from the graph. The outer `catch` block in `validationNode` previously set `validationCrashed: true` and relied on `shouldContinue` to route back for up to 3 retries. Per-file retries were already handled internally by `processBatch` (up to `MAX_FILE_RETRIES=3`). Catastrophic node-level crashes now absorb within the node: all pending files are marked as `needsRevision: true` and the normal engineer retry flow handles recovery — no graph-level self-loop needed.
> - **Why:** Nodes should be self-contained. Routing loops that exist solely to retry a node's own internal failures leak implementation detail into the graph topology and add unnecessary state fields.
> - **Removed:** `validationCrashed` and `validationCrashCount` state fields; crash-retry branch in `shouldContinue`; `"validationNode"` from conditional edges array.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/index.ts`

---

### 🧹 Refactors

---

> ### File Count Indexes in Engineer and Validation Logs
>
> - **What changed:** Added `[N/total]` file count tags to all per-file log lines inside `withConcurrency` in `engineerNode.ts` and inside `processBatch` in `validationNode.ts`. Example: `[3/19] Generating src/components/OnboardingStep.tsx...`.
> - **Why:** With 19 files processed concurrently, logs showed repeated file names with no indication of batch progress. The index tag makes it immediately clear which file is being worked on and how many remain.
> - **Files:**
>   - `lib/graph/nodes/engineerNode.ts`
>   - `lib/graph/nodes/validationNode.ts`

---

## 🗓️ **2026-02-28**
---

### ⚡ Performance

---

> ### Concurrency Pool — Throttled Parallelism (Both Nodes)
>
> - **What changed:** Replaced unbounded `Promise.all` / `Promise.allSettled` in both `frontendEngineerNode` and `validationNode` with a lightweight `withConcurrency(limit=5)` pool. New slots open immediately as any file completes — no straggler blocking the next batch.
> - **Why:** The previous approach fired all N files simultaneously (e.g. 14 concurrent Pro API calls), saturating rate limits and causing cascading timeouts. Capping at 5 concurrent calls prevents API throttling while still processing files in parallel.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/validationNode.ts`

> ### Validation Ledger — Skip Clean Files on Revision Rounds
>
> - **What changed:** `frontendEngineerNode` now returns `filesNeedingRevision: uniqueFiles` (the exact set of files regenerated that round) instead of always clearing the list to `[]`. `validationNode` already had the logic to re-validate only files in `filesNeedingRevision` — it was just never being populated.
> - **Why:** On every revision round the outer validator was re-checking all files even though only 1–2 had changed. On a 6-file ticket with 2 failing files, this was 4 unnecessary Pro API calls per revision round.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`

---

### 🛡️ Reliability

---

> ### Typed Error Classification in Surgical Context
>
> - **What changed:** Added `systemErrors: z.array(z.string())` to `SurgicalContextSchema`. In `validationNode`, `criticalErrors` are now split at source: timeout/crash strings go to `systemErrors`; real TypeScript/runtime bugs go to `errorLogs`. The EM surgical prompt now shows a `NOTE` when system errors are present, clearly labelling them as transient retries rather than code bugs.
> - **Why:** Previously, timeout strings like `"Validation process failed (timeout or crash)"` were passed directly to the EM as `errorLogs`. The EM had no way to distinguish a transient system failure from a real bug, causing it to hallucinate infrastructure fixes (e.g. patching `next.config.js`) for what were actually Gemini API timeouts.
> - **Files:**
>   - `lib/graph/schema.ts`
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/prompts/emPrompts.ts`

> ### Attention-Directed Validation for Revised Files
>
> - **What changed:** When `validationNode` re-validates a file that was in `filesNeedingRevision`, it now prepends a `FOCUS:` hint to the user prompt: "This file was revised to fix prior errors — give extra scrutiny to sections that changed, but still validate the full file."
> - **Why:** Directs the LLM's attention to where bugs were concentrated without skipping any region of the file, improving per-round catch rate on revision rounds.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`

---

### ✨ Features

---

> ### EM File Decomposition Rule
>
> - **What changed:** Added a mandatory `FILE DECOMPOSITION RULE` to `EM_SYSTEM_PROMPT`. Any component or module expected to exceed ~150 lines must be decomposed into a component shell + custom hook + sub-components. All decomposed files must be listed in `newFilesToCreate`/`filesToModify`.
> - **Why:** Large files (300+ line forms, dashboards, data tables) consistently exceeded the model's comfortable reasoning window, producing incomplete code and validation timeouts. Decomposition keeps each file under the cognitive ceiling and produces architecturally correct React (hooks separation pattern) while reusing all existing quality gates.
> - **Files:**
>   - `lib/graph/prompts/emPrompts.ts`

---

### 🐛 Fixes

---

> ### Fix EM Node Reporting Zero Tokens
>
> - **What changed:** Switched `emNode` from a dead `const tokenUsage = { prompt: 0, completion: 0, total: 0 }` placeholder to `withStructuredOutput(..., { includeRaw: true })` + `extractTokenUsage(raw)` — same pattern as `validationNode` and `frontendEngineerNode`.
> - **Why:** `emNode` always reported 0 input/output tokens in the metrics table. The fix gives accurate cost tracking for EM calls, which are Pro model calls and the most expensive in surgical escalation rounds.
> - **Files:**
>   - `lib/graph/nodes/emNode.ts`

> ### Fix `Object.keys` on UI Library Array in EM Prompt
>
> - **What changed:** Replaced `Object.keys(architectureProfile.systemIntegrity.uiLibrary).join(", ")` with `architectureProfile.systemIntegrity.uiLibrary.map((c) => c.name).join(", ")`.
> - **Why:** `systemIntegrity.uiLibrary` is `Array<{name, path}>` not a Record. `Object.keys` on an array returns `["0", "1", "2", ...]` (indices), so the EM was receiving `"0, 1, 2"` instead of `"Button, Toast, Dialog"` as the list of available UI components — silently degrading every EM prompt.
> - **Files:**
>   - `lib/graph/prompts/emPrompts.ts`

> ### Remove `joinNode` — Simplify Graph to Direct Edges
>
> - **What changed:** Deleted `joinNode` from the graph and replaced its two hops with direct edges: Low complexity now routes `updateJiraMetadataNode → frontendEngineerNode`; High/Med routes `designNode → frontendEngineerNode`. `joinNode.ts` is now unused (file preserved, but no longer wired in).
> - **Why:** `joinNode` was a vestigial "parallel sync gate" from an earlier design that had fan-out branches. The fan-out was removed in a prior refactor but the node was kept. It had no logic — both code paths always went unconditionally to `frontendEngineerNode`. Every ticket was spending one extra LangGraph node invocation for a no-op passthrough. Graph is now 10 nodes, zero orphaned nodes or redundant edges.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Extract `withConcurrency` to Shared Utility
>
> - **What changed:** Moved the `withConcurrency` pool function into a new `lib/graph/concurrency.ts` module and replaced the two identical inline definitions in `frontendEngineerNode.ts` and `validationNode.ts` with imports. The callback in `frontendEngineerNode` now pushes results into `fileResults` directly instead of returning them (adapting to `fn: (item) => Promise<void>`).
> - **Why:** The function was copy-pasted with slightly different type signatures. A single generic `withConcurrency<T>` handles both. Any future changes to the pool algorithm have one edit point.
> - **Files:**
>   - `lib/graph/concurrency.ts` (new)
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/nodes/validationNode.ts`

> ### Webhook Error Rollback — Prevent Stuck "In Progress" Tickets
>
> - **What changed:** Added a rollback block to the `webhook/route.ts` outer catch handler. On any unhandled error (graph crash, Jira/GitHub API failure, etc.) the handler now: (1) adds a failure comment to the Jira ticket, (2) transitions the ticket back to "Selected for Development", and (3) clears the `agent_update` cache flag so the ticket can be re-processed after a manual reset.
> - **Why:** Previously, any unexpected error left the ticket permanently "In Progress" with no visible indication of failure — requiring manual inspection of server logs and a manual Jira reset. The rollback mirrors the behavior already present in `process-ticket/route.ts`.
> - **Files:**
>   - `app/api/webhook/route.ts`

> ### Extract Shared Performance Logger (`logPerformanceReport`)
>
> - **What changed:** Extracted the ~55-line performance reporting block (table of per-node call counts, durations, token usage, and estimated cost) from both route handlers into a single `logPerformanceReport(metrics, ticketId, summary, extra?)` function in `lib/graph/metrics-utils.ts`. Both routes now call it with one line.
> - **Why:** The identical block was copy-pasted between `process-ticket/route.ts` and `webhook/route.ts`. Any future changes to the report format (new columns, cost model updates) would have required updating both files in sync.
> - **Files:**
>   - `lib/graph/metrics-utils.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/webhook/route.ts`

> ### Track Inline Validation Tokens Inside Engineer Node
>
> - **What changed:** Added `includeRaw: true` to `structuredValidationModel` inside `frontendEngineerNode` and extracted token usage from each inline validation call via `extractTokenUsage(validationResult.raw)`, accumulating it into `fileUsage` alongside the generation tokens.
> - **Why:** Each per-file generate→validate cycle in the engineer node fires a Pro model validation call after every generation attempt. These were previously invisible in the metrics table (reported as 0) because the structured model returned only the parsed result without the raw `BaseMessage` needed for token extraction. On a 6-file ticket with 2 attempts each, this silently hid 12 Pro model calls from cost tracking.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Standardize Token Tracking Across All Pipeline Nodes
>
> - **What changed:** Switched all remaining nodes (`pmNode`, `designNode`, `triageNode`, `architectureNode`) from the callback-based `createTokenUsageCallback` approach to `withStructuredOutput(..., { includeRaw: true })` + `extractTokenUsage(raw)`. `triageNode` sums tokens from two sequential invocations (classification + fast-path planning) when Low complexity is detected.
> - **Why:** `createTokenUsageCallback` is unreliable whenever `invoke()` is wrapped in `Promise.race` (as in the validation/engineer nodes). Standardizing on `includeRaw: true` across the entire pipeline guarantees accurate token metrics for all nodes and enables correct cost estimation in the performance table.
> - **Files:**
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/nodes/designNode.ts`
>   - `lib/graph/nodes/triageNode.ts`
>   - `lib/graph/nodes/architectureNode.ts`

---

### 🐛 Fixes

---

> ### Fix Validation Node Reporting Zero Tokens
>
> - **What changed:** Switched `validationNode` from a callback-based token tracking approach (`createTokenUsageCallback`) to `withStructuredOutput(..., { includeRaw: true })` + `extractTokenUsage(result.raw)`. Also fixed `createTokenUsageCallback` in `metrics-utils.ts` to handle Gemini's `usage_metadata` token format (`input_tokens`, `output_tokens`, `total_tokens`) and added an explicit `handleChatModelEnd` hook alongside `handleLLMEnd`.
> - **Why:** The callback system does not reliably fire when `structuredModel.invoke()` is wrapped in `Promise.race` (which all per-file validation calls are). Gemini's token usage also lives in `llmOutput.usage_metadata`, not in the OpenAI-style `llmOutput.tokenUsage` field the original callback checked. These two issues combined produced 0 input/output tokens for every validation round. Using `includeRaw: true` gives direct access to the raw `BaseMessage` — the same mechanism the engineer node already uses — bypassing the callback system entirely.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/metrics-utils.ts`

---

### ✨ Features

---

> ### Per-File Inline Validation with TypeScript Syntax Pre-Check
>
> - **What changed:** Added a new `lib/graph/ts-syntax-check.ts` utility that uses the TypeScript compiler API (`ts.createSourceFile`, `ts.createProgram`, `getSyntacticDiagnostics`) to catch structural parse errors (unclosed brackets, malformed generics, invalid JSX) synchronously — no API call required. Integrated it into `frontendEngineerNode` between the import guard and the inline LLM validation step so broken code is detected and fed back to the engineer before spending an LLM token on it.
> - **Why:** LLM-generated code sometimes contains structural TypeScript errors (missing brackets, malformed generics) that are trivial for a compiler to detect but expensive to discover only after an LLM validation call. The zero-cost pre-check short-circuits that cycle.
> - **Files:**
>   - `lib/graph/ts-syntax-check.ts` (new)
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `package.json` (`typescript` moved to `dependencies` — required at runtime for the compiler API)

> ### Cross-File Sibling Export Context in Validation
>
> - **What changed:** Before running per-file validation, `validationNode` now extracts export signatures (all `export …` lines, capped at 30, including `'use client'`/`'use server'` directives) from every generated file and injects them as a `SIBLING FILE EXPORTS` block into the user prompt of each file being validated.
> - **Why:** The validator previously saw one file in isolation. When `dashboard/page.tsx` imports `ActivityChart` (generated in the same sprint), the validator flagged every sibling import as a missing dependency — producing false-positive criticals. With sibling context, the validator can verify prop types and export styles across files in round 1 instead of discovering mismatches in round 2.
> - **Files:**
>   - `lib/graph/nodes/validationNode.ts`

---

### 🧹 Refactors

---

> ### Surgical Coding & Strict Validation Prompt Overhaul
>
> - **What changed:** Replaced the flat safety rules in `frontendEngineerPrompts.ts` and `validationPrompts.ts` with structured audit sections. Engineer prompt now includes Zero-Trust Data Failsafes (mandatory `?.`, `??`, no `!` assertions), Import Standardization Protocol (correct default vs. named imports, `@/` aliases, `import type`), Component Resilience rules, and a 3-item Pre-Flight Checklist. Validation prompt now runs three named audits: AUDIT 1 — UNDEFINED SAFETY, AUDIT 2 — IMPORT/EXPORT INTEGRITY, AUDIT 3 — NEXT.JS & REACT LIFECYCLE, each with explicit CRITICAL/WARNING thresholds and REPAIR HINT requirements.
> - **Why:** Runtime crashes like `slots.forEach is not a function` and import errors like `{ Card }` on a default-export component were passing validation. The structured audits give the LLM an explicit checklist to run against every file rather than relying on implicit understanding.
> - **Files:**
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/prompts/validationPrompts.ts`

---

## 🗓️ **2026-02-27**

---

### 🔧 DevOps / Build

---

> ### Zero-Trust & Import Standardization Protocols
>
> - **What changed:** Implemented strict "Zero-Trust" coding standards and "Import Standardization" protocols. Enhanced the Import Guard to perform real-time file scanning, verifying that imported members actually exist in the target files (Default vs Named exports).
> - **Why:** To eliminate runtime "undefined" crashes and build-time "module has no exported member" errors by enforcing defensive coding and ensuring import validity before compilation.
> - **Files:**
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/import-guard.ts`

---

### ✨ Features

---

> ### Real-Time LLM Cost Estimation
>
> - **What changed:** Implemented granular cost calculation for Gemini 3.1 Pro (Context-Based Pricing: $2/1M input < 200k, $4/1M input > 200k) and Gemini 3 Flash ($0.50/1M input). Added "Est. LLM Cost" column to the monitoring table and a final "Total Estimated LLM Cost" summary log.
> - **Why:** To provide immediate visibility into the financial impact of each agent execution, allowing for better budget tracking and model usage optimization.
> - **Files:**
>   - `lib/graph/metrics-utils.ts`
>   - `app/api/process-ticket/route.ts`
>   - `app/api/webhook/route.ts`

---

### 🐛 Fixes

---

> ### Gemini Schema Compatibility Fix
>
> - **What changed:** Refactored `ArchitectureProfileSchema` to use an array of objects for `uiLibrary` instead of a record map.
> - **Why:** The Gemini API does not support JSON Schema `propertyNames` constraint generated by Zod records, causing 400 Bad Request errors during architecture analysis.
> - **Files:**
>   - `lib/graph/schema.ts`

> ### Runtime Safety & Logic Verification
>
> - **What changed:** Enhanced Validation and Engineer prompts to explicitly check for runtime errors (unsafe array access, JSON parsing) and logic bugs (step index off-by-one).
> - **Why:** To prevent runtime crashes (e.g., `slots.forEach is not a function`) and logic errors (e.g., "starts on 2nd question") from passing validation.
> - **Files:**
>   - `lib/graph/prompts/validationPrompts.ts`
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/prompts/emPrompts.ts`

---

### ✨ Features

---

> ### The UX Totality & Architectural Sync
>
> - **What changed:** Implemented comprehensive system integrity checks across Architecture, PM, EM, and Engineer nodes to enforce layout, navigation, and UI consistency.
> - **Why:** To ensure seamless integration of new features ("Stitching") and prevent UX fragmentation or architectural drift.
> - **Files:**
>   - `lib/graph/schema.ts`
>   - `lib/graph/prompts/architecturePrompts.ts`
>   - `lib/graph/prompts/pmPrompts.ts`
>   - `lib/graph/nodes/pmNode.ts`
>   - `lib/graph/prompts/emPrompts.ts`
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Surgical Delta Context Masking
>
> - **What changed:** Implemented "Surgical Delta" logic in Validation, EM, Design, and Engineer nodes to optimize error recovery after round 5.
> - **Why:** To reduce token costs, prevent context drift, and speed up critical fixes by narrowing the scope to only failing components.
> - **Files:**
>   - `lib/graph/schema.ts`
>   - `lib/graph/state.ts`
>   - `lib/graph/nodes/validationNode.ts`
>   - `lib/graph/nodes/emNode.ts`
>   - `lib/graph/prompts/emPrompts.ts`
>   - `lib/graph/nodes/frontendEngineerNode.ts`
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`
>   - `lib/graph/nodes/designNode.ts`
>   - `lib/graph/prompts/designPrompts.ts`

> ### Model Standardization
>
> - **What changed:** Replaced environment variable-based model selection with hardcoded Gemini models. Pro nodes (EM, Design, Engineer, Architecture) use `gemini-3.1-pro-preview`, while others use `gemini-3-flash-preview`.
> - **Why:** Enforce strictly defined intelligence tiers for each agent role, ensuring cost-efficiency for simple tasks and maximum reasoning power for complex ones.
> - **Files:**
>   - `lib/graph/nodes/*.ts`

### 🧹 Refactors

---

> ### Enhanced Node Logging
>
> - **What changed:** Added comprehensive start/end/error logging and execution duration timing to all graph nodes.
> - **Why:** Improve observability and debugging of the autonomous workflow execution.
> - **Files:**
>   - `lib/graph/nodes/*.ts`

### 🔧 DevOps / Build

---

> ### Environment Cleanup
>
> - **What changed:** Removed `GEMINI_MODEL` from `.env` and `.env.example`.
> - **Why:** Prevent configuration drift and confusion now that models are hardcoded per node.
> - **Files:**
>   - `.env`
>   - `.env.example`

### 📚 Docs

---

> ### Adaptive Workflow Visualization
>
> - **What changed:** Updated `README.md` to reflect the new "Adaptive Workflow" with parallel execution and synchronization, replacing the static diagram with a CLI generation command.
> - **Why:** Ensure documentation accurately reflects the new high-performance architecture.
> - **Files:**
>   - `README.md`

---

### ✨ Features

---

> ### Adaptive Sync & Bypass Workflow
>
> - **What changed:** Implemented a parallel routing architecture where Low Complexity tickets fast-track to execution (bypassing PM/Design) while High Complexity tickets undergo full planning, synchronized by a new `joinNode` barrier.
> - **Why:** Drastically reduce latency for simple tasks (< 6 mins) while maintaining rigor for complex ones.
> - **Files:**
>   - `lib/graph/index.ts`
>   - `lib/graph/nodes/joinNode.ts`
>   - `lib/graph/nodes/updateJiraMetadataNode.ts`

> ### Engineer Self-Planning for Fast-Track
>
> - **What changed:** Added fallback logic for the Engineer Node to generate its own lightweight execution plan using `ExecutionPlanSchema` when no PM plan exists (Low Complexity).
> - **Why:** Enable the Engineer to function autonomously and correctly even when skipping the formal planning phase.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Blueprint Safety Valve (Escalation)
>
> - **What changed:** Implemented an escalation logic in `lib/graph/index.ts`: if the Engineer fails validation 5 times, the ticket is routed back to the Engineering Manager (`emNode`) for a full blueprint revision.
> - **Why:** Prevent infinite loops on "Dead End" tasks where the initial plan was flawed.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Explicit PR and Jira Status Nodes
>
> - **What changed:** Added `createPrNode` and `updateJiraStatusNode` to the graph, moving PR creation and final Jira transition/commenting logic out of the API route and into the workflow.
> - **Why:** Ensure the entire lifecycle (including delivery) is managed, logged, and retryable within the LangGraph architecture.
> - **Files:**
>   - `lib/graph/nodes/createPrNode.ts`
>   - `lib/graph/nodes/updateJiraStatusNode.ts`
>   - `lib/graph/index.ts`

---

### 🧹 Refactors

---

> ### Engineer Model Upgrade to Gemini 3.1
>
> - **What changed:** Hardcoded the Frontend Engineer Node to use `gemini-3.1-pro-preview`.
> - **Why:** Improve code generation quality and instruction following capabilities.
> - **Files:**
>   - `lib/graph/nodes/frontendEngineerNode.ts`

> ### Strict Contract Enforcement Prompting
>
> - **What changed:** Updated Engineer prompts to explicitly enforce adherence to the technical contract (execution plan) interfaces, with specific instructions for Low Complexity handling.
> - **Why:** Reduce "hallucinated" code and ensure alignment with the architectural plan.
> - **Files:**
>   - `lib/graph/prompts/frontendEngineerPrompts.ts`

> ### Deterministic Triage & Validation Routing
>
> - **What changed:** Updated `triageNode` and `validationNode` conditional edges to explicitly restrict destinations, pruning unused paths.
> - **Why:** Enforce deterministic routing by removing ambiguous "dotted line" edges in the graph visualization and execution, ensuring strict adherence to High/Low complexity flows and binary Validation outcomes.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Sequential Triage-Admin Flow
>
> - **What changed:** Restructured the graph start to a strict sequential path: `triageNode` -> `updateJiraMetadataNode` -> [Split].
> - **Why:** Eliminate race conditions between Triage and Jira updates, ensuring metadata is always synced before any planning or execution begins.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Route Handler Cleanup
>
> - **What changed:** Removed business logic from `app/api/process-ticket/route.ts`, delegating all work to the graph nodes.
> - **Why:** Improve separation of concerns and make the API layer a thin wrapper around the autonomous agent.
> - **Files:**
>   - `app/api/process-ticket/route.ts`

---

### ⚡ Performance

---

> ### Implement Fast-Track Architecture for Low Complexity Tickets
>
> - **What changed:** Updated graph routing to skip planning nodes (PM, EM, Design) for "Low" complexity tickets and route directly to execution.
> - **Why:** Reduces overhead and execution time for simple tasks by avoiding unnecessary planning steps ("Spiderweb" to "Fast-Track").
> - **Files:**
>   - `lib/graph/index.ts`
>   - `lib/graph/nodes/joinNode.ts`

> ### Streamline Fast-Track Routing
>
> - **What changed:** Simplified `triageNode` routing for Low complexity tickets to follow a strictly linear path (`triage` → `updateJiraMetadata` → `join`), removing the redundant parallel edge to `joinNode`.
> - **Why:** Align with the optimized "Clean & Fast" flow diagram and reduce graph complexity while maintaining functionality.
> - **Files:**
>   - `lib/graph/index.ts`

> ### Consolidate Join Node with Command API
>
> - **What changed:** Refactored `joinNode` to use LangGraph's `Command` API for dynamic navigation, replacing the external `checkJoin` conditional edge.
> - **Why:** Enforce a strict "Sync Gate" pattern where the join node halts execution until all parallel branches (Admin & Planning) are complete, removing complex routing logic from the graph definition.
> - **Files:**
>   - `lib/graph/nodes/joinNode.ts`
>   - `lib/graph/index.ts`

> ### Strict Validation Exit Strategy
>
> - **What changed:** Refactored `validationNode` routing to enforce a strict binary outcome: Success (`END`) or Failure (`frontendEngineerNode`). Removed the internal validation retry loop and ensured no paths lead back to architecture or triage nodes.
> - **Why:** Prevent "context drift" and ensure that code failures are always handled by the Engineer (who generates the code) rather than restarting the architectural planning or looping on flaky validation calls.
> - **Files:**
>   - `lib/graph/index.ts`

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
