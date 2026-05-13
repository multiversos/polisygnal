"use client";

import type { DeepAnalysisJob, DeepAnalysisJobStep } from "./deepAnalysisJob";

const DEEP_ANALYSIS_JOB_STORAGE_KEY = "polysignal-deep-analysis-jobs-v1";
const DEEP_ANALYSIS_JOB_STORAGE_EVENT = "polysignal:deep-analysis-jobs-updated";
const MAX_STORED_JOBS = 30;
const FULL_WALLET_PATTERN = /0x[a-fA-F0-9]{40}/g;

export { DEEP_ANALYSIS_JOB_STORAGE_EVENT };

function browserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeString(value: unknown, limit = 240): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(FULL_WALLET_PATTERN, "[wallet redacted]").trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeBridge(value: unknown): DeepAnalysisJob["samanthaBridge"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as NonNullable<DeepAnalysisJob["samanthaBridge"]>;
  const status = normalizeString(candidate.status, 80) as NonNullable<DeepAnalysisJob["samanthaBridge"]>["status"] | undefined;
  if (
    status !== "not_configured" &&
    status !== "fallback_manual" &&
    status !== "sending" &&
    status !== "researching" &&
    status !== "report_received" &&
    status !== "report_invalid" &&
    status !== "failed"
  ) {
    return undefined;
  }
  return {
    automaticAvailable: normalizeBoolean(candidate.automaticAvailable),
    fallbackRequired: normalizeBoolean(candidate.fallbackRequired),
    lastAttemptAt: normalizeString(candidate.lastAttemptAt, 80),
    reason: normalizeString(candidate.reason, 240),
    status,
    taskId: normalizeString(candidate.taskId, 120),
  };
}

function normalizeStep(value: unknown): DeepAnalysisJobStep | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<DeepAnalysisJobStep>;
  const id = normalizeString(candidate.id, 80) as DeepAnalysisJobStep["id"] | undefined;
  const label = normalizeString(candidate.label, 80);
  const status = normalizeString(candidate.status, 40) as DeepAnalysisJobStep["status"] | undefined;
  const summary = normalizeString(candidate.summary, 360);
  if (!id || !label || !status || !summary) {
    return null;
  }
  if (!["pending", "running", "completed", "blocked", "failed"].includes(status)) {
    return null;
  }
  return {
    completedAt: normalizeString(candidate.completedAt, 80),
    id,
    label,
    requiresExternalIntegration: normalizeBoolean(candidate.requiresExternalIntegration),
    requiresManualInput: normalizeBoolean(candidate.requiresManualInput),
    startedAt: normalizeString(candidate.startedAt, 80),
    status,
    summary,
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings
          .map((warning) => normalizeString(warning, 220))
          .filter((warning): warning is string => Boolean(warning))
          .slice(0, 6)
      : [],
  };
}

function normalizeJob(value: unknown): DeepAnalysisJob | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<DeepAnalysisJob>;
  const id = normalizeString(candidate.id, 120);
  const url = normalizeString(candidate.url, 600);
  const status = normalizeString(candidate.status, 80) as DeepAnalysisJob["status"] | undefined;
  const createdAt = normalizeString(candidate.createdAt, 80);
  const updatedAt = normalizeString(candidate.updatedAt, 80);
  if (!id || !url || !status || !createdAt || !updatedAt) {
    return null;
  }
  if (
    ![
      "idle",
      "running",
      "sending_to_samantha",
      "samantha_researching",
      "receiving_samantha_report",
      "validating_samantha_report",
      "awaiting_samantha",
      "ready_to_score",
      "completed",
      "failed",
    ].includes(status)
  ) {
    return null;
  }
  const steps = Array.isArray(candidate.steps)
    ? candidate.steps
        .map(normalizeStep)
        .filter((step): step is DeepAnalysisJobStep => Boolean(step))
        .slice(0, 12)
    : [];
  if (steps.length === 0) {
    return null;
  }
  return {
    briefReady: normalizeBoolean(candidate.briefReady),
    createdAt,
    error: normalizeString(candidate.error, 240),
    eventSlug: normalizeString(candidate.eventSlug, 160),
    id,
    marketId: normalizeString(candidate.marketId, 120),
    marketSlug: normalizeString(candidate.marketSlug, 180),
    marketTitle: normalizeString(candidate.marketTitle, 240),
    normalizedUrl: normalizeString(candidate.normalizedUrl, 600),
    resultReady: normalizeBoolean(candidate.resultReady),
    samanthaBridge: normalizeBridge(candidate.samanthaBridge),
    samanthaReportLoaded: normalizeBoolean(candidate.samanthaReportLoaded),
    status,
    steps,
    updatedAt,
    url,
  };
}

function readStoredJobs(): DeepAnalysisJob[] {
  const storage = browserStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(DEEP_ANALYSIS_JOB_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeJob)
      .filter((job): job is DeepAnalysisJob => Boolean(job))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    storage.removeItem(DEEP_ANALYSIS_JOB_STORAGE_KEY);
    return [];
  }
}

function writeStoredJobs(jobs: DeepAnalysisJob[]): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  const sanitized = jobs
    .map(normalizeJob)
    .filter((job): job is DeepAnalysisJob => Boolean(job))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_STORED_JOBS);
  storage.setItem(DEEP_ANALYSIS_JOB_STORAGE_KEY, JSON.stringify(sanitized));
  window.dispatchEvent(
    new CustomEvent(DEEP_ANALYSIS_JOB_STORAGE_EVENT, { detail: { jobs: sanitized } }),
  );
}

export function saveDeepAnalysisJob(job: DeepAnalysisJob): DeepAnalysisJob | null {
  const normalized = normalizeJob(job);
  if (!normalized) {
    return null;
  }
  const existing = readStoredJobs().filter((item) => item.id !== normalized.id);
  writeStoredJobs([normalized, ...existing]);
  return normalized;
}

export function updateDeepAnalysisJob(job: DeepAnalysisJob): DeepAnalysisJob | null {
  return saveDeepAnalysisJob(job);
}

export function getDeepAnalysisJob(id: string): DeepAnalysisJob | null {
  return readStoredJobs().find((job) => job.id === id) ?? null;
}

export function getLatestDeepAnalysisJobForUrl(url: string): DeepAnalysisJob | null {
  const normalized = normalizeString(url, 600);
  if (!normalized) {
    return null;
  }
  return (
    readStoredJobs().find(
      (job) => job.normalizedUrl === normalized || job.url === normalized,
    ) ?? null
  );
}

export function listDeepAnalysisJobs(): DeepAnalysisJob[] {
  return readStoredJobs();
}

export function clearDeepAnalysisJob(id: string): void {
  writeStoredJobs(readStoredJobs().filter((job) => job.id !== id));
}
