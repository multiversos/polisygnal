"use client";

export type AnalysisHistoryConfidence = "Alta" | "Baja" | "Desconocida" | "Media";
export type AnalysisHistoryOutcome = "CANCELLED" | "NO" | "UNKNOWN" | "YES";
export type AnalysisHistoryPredictedSide = "NO" | "UNKNOWN" | "YES";
export type AnalysisHistoryResult = "hit" | "miss" | "pending" | "unknown";
export type AnalysisHistorySource = "link_analyzer" | "manual" | "market_detail" | "unknown";
export type AnalysisHistoryStatus = "open" | "resolved" | "unknown";

export type AnalysisHistoryItem = {
  analyzedAt: string;
  confidence?: AnalysisHistoryConfidence;
  id: string;
  marketId?: string;
  marketNoProbability?: number;
  marketYesProbability?: number;
  outcome?: AnalysisHistoryOutcome;
  polySignalNoProbability?: number;
  polySignalYesProbability?: number;
  predictedSide?: AnalysisHistoryPredictedSide;
  reasons?: string[];
  result?: AnalysisHistoryResult;
  source: AnalysisHistorySource;
  sport?: string;
  status: AnalysisHistoryStatus;
  title: string;
  url?: string;
};

export type AnalysisHistoryStats = {
  accuracyRate: number | null;
  averageMarketYes: number | null;
  averagePolySignalYes: number | null;
  completedByMonth: Array<{ label: string; hits: number; misses: number; resolved: number }>;
  finalized: number;
  highConfidenceAccuracy: number | null;
  hits: number;
  lowConfidenceAccuracy: number | null;
  mediumConfidenceAccuracy: number | null;
  misses: number;
  noPredictions: number;
  pending: number;
  resolved: number;
  total: number;
  unknown: number;
  yesPredictions: number;
};

const ANALYSIS_HISTORY_STORAGE_KEY = "polysignal-analysis-history-v1";
export const ANALYSIS_HISTORY_STORAGE_EVENT = "polysignal:analysis-history-updated";

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

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  if (parsed < 0) {
    return undefined;
  }
  if (parsed <= 1) {
    return parsed;
  }
  if (parsed <= 100) {
    return parsed / 100;
  }
  return undefined;
}

function normalizeConfidence(value: unknown): AnalysisHistoryConfidence {
  if (value === "Alta" || value === "Media" || value === "Baja") {
    return value;
  }
  return "Desconocida";
}

function normalizePredictedSide(value: unknown): AnalysisHistoryPredictedSide {
  if (value === "YES" || value === "NO") {
    return value;
  }
  return "UNKNOWN";
}

function normalizeOutcome(value: unknown): AnalysisHistoryOutcome {
  if (value === "YES" || value === "NO" || value === "CANCELLED") {
    return value;
  }
  return "UNKNOWN";
}

function normalizeStatus(value: unknown): AnalysisHistoryStatus {
  if (value === "open" || value === "resolved") {
    return value;
  }
  return "unknown";
}

function normalizeResult(value: unknown, status: AnalysisHistoryStatus): AnalysisHistoryResult {
  if (value === "hit" || value === "miss" || value === "pending") {
    return value;
  }
  if (status === "open") {
    return "pending";
  }
  return "unknown";
}

function normalizeSource(value: unknown): AnalysisHistorySource {
  if (
    value === "market_detail" ||
    value === "link_analyzer" ||
    value === "manual" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeItem(value: Partial<AnalysisHistoryItem>): AnalysisHistoryItem | null {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) {
    return null;
  }
  const status = normalizeStatus(value.status);
  const result = normalizeResult(value.result, status);
  return {
    analyzedAt: value.analyzedAt || nowIso(),
    confidence: normalizeConfidence(value.confidence),
    id: value.id || randomId(),
    marketId: value.marketId ? String(value.marketId) : undefined,
    marketNoProbability: normalizeNumber(value.marketNoProbability),
    marketYesProbability: normalizeNumber(value.marketYesProbability),
    outcome: normalizeOutcome(value.outcome),
    polySignalNoProbability: normalizeNumber(value.polySignalNoProbability),
    polySignalYesProbability: normalizeNumber(value.polySignalYesProbability),
    predictedSide: normalizePredictedSide(value.predictedSide),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "")
      : [],
    result,
    source: normalizeSource(value.source),
    sport: value.sport || undefined,
    status,
    title,
    url: value.url || undefined,
  };
}

function readLocalHistory(): AnalysisHistoryItem[] {
  const storage = browserStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(ANALYSIS_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeItem(item as Partial<AnalysisHistoryItem>))
      .filter((item): item is AnalysisHistoryItem => Boolean(item))
      .sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt));
  } catch {
    storage.removeItem(ANALYSIS_HISTORY_STORAGE_KEY);
    return [];
  }
}

function writeLocalHistory(items: AnalysisHistoryItem[]): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  storage.setItem(ANALYSIS_HISTORY_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(ANALYSIS_HISTORY_STORAGE_EVENT, { detail: { items } }));
}

export async function getAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  return readLocalHistory();
}

export async function saveAnalysisHistoryItem(
  item: Partial<AnalysisHistoryItem> & { title: string },
): Promise<AnalysisHistoryItem> {
  const normalized = normalizeItem(item);
  if (!normalized) {
    throw new Error("Analysis history item requires a title");
  }
  const items = readLocalHistory();
  const withoutExisting = items.filter((existing) => existing.id !== normalized.id);
  writeLocalHistory([normalized, ...withoutExisting]);
  return normalized;
}

export async function removeAnalysisHistoryItem(id: string): Promise<null> {
  writeLocalHistory(readLocalHistory().filter((item) => item.id !== id));
  return null;
}

export async function clearAnalysisHistory(): Promise<null> {
  writeLocalHistory([]);
  return null;
}

export async function updateAnalysisHistoryItem(
  id: string,
  patch: Partial<AnalysisHistoryItem>,
): Promise<AnalysisHistoryItem> {
  const items = readLocalHistory();
  const existing = items.find((item) => item.id === id);
  if (!existing) {
    throw new Error("Analysis history item not found");
  }
  const updated = normalizeItem({ ...existing, ...patch, id });
  if (!updated) {
    throw new Error("Analysis history item requires a title");
  }
  writeLocalHistory(items.map((item) => (item.id === id ? updated : item)));
  return updated;
}

function average(values: Array<number | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  if (usable.length === 0) {
    return null;
  }
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function accuracyFor(items: AnalysisHistoryItem[]): number | null {
  const hits = items.filter((item) => item.result === "hit").length;
  const misses = items.filter((item) => item.result === "miss").length;
  const resolved = hits + misses;
  return resolved > 0 ? hits / resolved : null;
}

export function calculateAnalysisHistoryStats(items: AnalysisHistoryItem[]): AnalysisHistoryStats {
  const hits = items.filter((item) => item.result === "hit").length;
  const misses = items.filter((item) => item.result === "miss").length;
  const pending = items.filter((item) => item.result === "pending" || item.status === "open").length;
  const resolved = hits + misses;
  const finalized = items.filter((item) => item.status === "resolved").length;
  const unknown = items.filter(
    (item) => item.result === "unknown" || item.status === "unknown" || item.outcome === "UNKNOWN",
  ).length;
  const byMonth = new Map<string, { hits: number; misses: number; resolved: number }>();
  for (const item of items) {
    if (item.result !== "hit" && item.result !== "miss") {
      continue;
    }
    const date = new Date(item.analyzedAt);
    const label = Number.isNaN(date.getTime())
      ? "Sin fecha"
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = byMonth.get(label) ?? { hits: 0, misses: 0, resolved: 0 };
    if (item.result === "hit") {
      bucket.hits += 1;
    } else {
      bucket.misses += 1;
    }
    bucket.resolved += 1;
    byMonth.set(label, bucket);
  }

  return {
    accuracyRate: resolved > 0 ? hits / resolved : null,
    averageMarketYes: average(items.map((item) => item.marketYesProbability)),
    averagePolySignalYes: average(items.map((item) => item.polySignalYesProbability)),
    completedByMonth: Array.from(byMonth.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, ...value })),
    finalized,
    highConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Alta")),
    hits,
    lowConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Baja")),
    mediumConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Media")),
    misses,
    noPredictions: items.filter((item) => item.predictedSide === "NO").length,
    pending,
    resolved,
    total: items.length,
    unknown,
    yesPredictions: items.filter((item) => item.predictedSide === "YES").length,
  };
}
