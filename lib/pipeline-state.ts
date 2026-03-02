import { getCached, setCached, deleteCached } from "./cache";

export interface PipelineState {
  ticketId: string;
  ticketSummary: string;
  node: string;
  nodeLabel: string;
  startedAt: number;
  updatedAt: number;
}

const NODE_LABELS: Record<string, string> = {
  architectureNode: "Analyzing Architecture",
  triageNode: "Triaging",
  updateJiraMetadataNode: "Updating Metadata",
  pmNode: "Planning (PM)",
  emNode: "Engineering Planning",
  designNode: "Designing",
  frontendEngineerNode: "Generating Code",
  validationNode: "Validating",
  createPrNode: "Creating PR",
  updateJiraStatusNode: "Updating Jira",
};

const KEY = (ticketId: string) => `pipeline_state:${ticketId}`;
const TTL = 7200; // 2 hours

export async function setPipelineState(
  ticketId: string,
  ticketSummary: string,
  node: string,
): Promise<void> {
  const existing = await getPipelineState(ticketId);
  const state: PipelineState = {
    ticketId,
    ticketSummary,
    node,
    nodeLabel: NODE_LABELS[node] ?? node,
    startedAt: existing?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await setCached(KEY(ticketId), JSON.stringify(state), TTL);
}

export async function getPipelineState(
  ticketId: string,
): Promise<PipelineState | null> {
  const raw = await getCached(KEY(ticketId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PipelineState;
  } catch {
    return null;
  }
}

export async function clearPipelineState(ticketId: string): Promise<void> {
  await deleteCached(KEY(ticketId));
  await deleteCached(PROGRESS_KEY(ticketId));
}

// ─── Validation Progress ────────────────────────────────────────────────────

const PROGRESS_KEY = (ticketId: string) => `pipeline_progress:${ticketId}`;

export interface ValidationProgress {
  passed: number;
  total: number;
  round: number;
  updatedAt: number;
}

export async function setValidationProgress(
  ticketId: string,
  passed: number,
  total: number,
  round: number,
): Promise<void> {
  try {
    const progress: ValidationProgress = { passed, total, round, updatedAt: Date.now() };
    await setCached(PROGRESS_KEY(ticketId), JSON.stringify(progress), TTL);
  } catch {
    // non-blocking
  }
}

export async function getValidationProgress(
  ticketId: string,
): Promise<ValidationProgress | null> {
  try {
    const raw = await getCached(PROGRESS_KEY(ticketId));
    return raw ? (JSON.parse(raw) as ValidationProgress) : null;
  } catch {
    return null;
  }
}
