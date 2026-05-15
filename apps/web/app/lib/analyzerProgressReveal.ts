export const ANALYZE_PROGRESS_MIN_STEP_MS = 700;

const TERMINAL_ANALYZE_STEP_STATUSES = new Set([
  "attention",
  "completed",
  "completed_empty",
  "completed_with_data",
  "error",
  "failed_safe",
  "limited",
  "skipped",
  "timeout",
  "unavailable",
  "warning",
]);

const IMMEDIATE_ANALYZE_STEP_STATUSES = new Set([
  "error",
  "failed_safe",
  "timeout",
]);

export function isTerminalAnalyzeStepStatus(status?: string | null): boolean {
  return Boolean(status && TERMINAL_ANALYZE_STEP_STATUSES.has(status));
}

export function isImmediateAnalyzeStepStatus(status?: string | null): boolean {
  return Boolean(status && IMMEDIATE_ANALYZE_STEP_STATUSES.has(status));
}

export function remainingStepRevealMs(input: {
  elapsedMs: number;
  minStepMs?: number;
  status?: string | null;
}): number {
  if (isImmediateAnalyzeStepStatus(input.status)) {
    return 0;
  }
  const minStepMs = input.minStepMs ?? ANALYZE_PROGRESS_MIN_STEP_MS;
  return Math.max(0, minStepMs - Math.max(0, input.elapsedMs));
}
