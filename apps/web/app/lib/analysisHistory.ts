"use client";

import {
  getPolySignalDecision,
  hasClearPrediction,
  shouldCountForAccuracy,
  type AnalysisDecision,
  type AnalysisEvaluationStatus,
} from "./analysisDecision";
import {
  getEstimateQuality,
  type EstimateQuality,
} from "./marketEstimateQuality";

export type AnalysisHistoryConfidence = "Alta" | "Baja" | "Desconocida" | "Media";
export type AnalysisHistoryDecision = AnalysisDecision;
export type AnalysisHistoryEvaluationStatus = AnalysisEvaluationStatus;
export type AnalysisHistoryEstimateQuality = EstimateQuality;
export type AnalysisHistoryOutcome = "CANCELLED" | "NO" | "UNKNOWN" | "YES";
export type AnalysisHistoryPredictedSide = "NO" | "UNKNOWN" | "YES";
export type AnalysisHistoryResolutionConfidence = "high" | "low" | "medium";
export type AnalysisHistoryResolutionSource = "clob" | "gamma" | "polymarket" | "polysignal" | "polysignal_market" | "unknown";
export type AnalysisHistoryResult = "cancelled" | "hit" | "miss" | "pending" | "unknown";
export type AnalysisHistorySource = "link_analyzer" | "manual" | "market_detail" | "unknown";
export type AnalysisHistoryStatus = "open" | "resolved" | "unknown";
export type AnalysisHistoryAnalyzerLayerStatus = "available" | "error" | "partial" | "pending" | "unavailable";
export type AnalysisHistoryTrackingStatus =
  | "analyzing"
  | "awaiting_resolution"
  | "cancelled"
  | "created"
  | "no_clear_decision"
  | "resolved_hit"
  | "resolved_miss"
  | "saved"
  | "tracking"
  | "unknown";
export type AnalysisHistoryResolutionStatus =
  | "cancelled"
  | "not_countable"
  | "pending"
  | "resolved"
  | "unknown";

export type AnalysisHistoryAnalyzerLayer = {
  id: string;
  label: string;
  status: AnalysisHistoryAnalyzerLayerStatus;
  summary: string;
  warnings: string[];
};

export type AnalysisHistoryMarketOutcome = {
  label: string;
  price?: number;
  side?: string;
};

export type AnalysisHistoryWalletSignalDirection = "BOTH" | "NEUTRAL" | "NO" | "UNKNOWN" | "YES";

export type AnalysisHistoryWalletSummary = {
  analyzedCapitalUsd?: number;
  available: boolean;
  checkedAt?: string;
  confidence: "high" | "low" | "medium" | "none";
  noCapitalUsd?: number;
  reason: string;
  relevantWalletsCount: number;
  signalDirection: AnalysisHistoryWalletSignalDirection;
  source?: "backend" | "local" | "unavailable";
  thresholdUsd: number;
  warnings: string[];
  yesCapitalUsd?: number;
};

export type AnalysisHistoryItem = {
  analyzedAt: string;
  analyzerLayers?: AnalysisHistoryAnalyzerLayer[];
  confidence?: AnalysisHistoryConfidence;
  conditionId?: string;
  decision?: AnalysisHistoryDecision;
  decisionThreshold?: number;
  eventSlug?: string;
  estimateQuality?: AnalysisHistoryEstimateQuality;
  evaluationReason?: string;
  evaluationStatus?: AnalysisHistoryEvaluationStatus;
  id: string;
  lastCheckedAt?: string;
  marketId?: string;
  marketSlug?: string;
  marketNoProbability?: number;
  nextCheckHint?: string;
  marketOutcomes?: AnalysisHistoryMarketOutcome[];
  marketYesProbability?: number;
  outcome?: AnalysisHistoryOutcome;
  polySignalNoProbability?: number;
  polySignalYesProbability?: number;
  predictedSide?: AnalysisHistoryPredictedSide;
  reasons?: string[];
  resolutionConfidence?: AnalysisHistoryResolutionConfidence;
  resolutionReason?: string;
  resolutionSource?: AnalysisHistoryResolutionSource;
  resolutionStatus?: AnalysisHistoryResolutionStatus;
  resolvedAt?: string;
  result?: AnalysisHistoryResult;
  remoteId?: string;
  source: AnalysisHistorySource;
  sport?: string;
  status: AnalysisHistoryStatus;
  title: string;
  trackingStatus?: AnalysisHistoryTrackingStatus;
  url?: string;
  verifiedAt?: string;
  walletIntelligenceSummary?: AnalysisHistoryWalletSummary;
};

export type AnalysisHistoryStats = {
  accuracyRate: number | null;
  averageMarketYes: number | null;
  averagePolySignalYes: number | null;
  completedByMonth: Array<{ label: string; hits: number; misses: number; resolved: number }>;
  cancelled: number;
  clearPredictions: number;
  countableResolved: number;
  finalized: number;
  highConfidenceAccuracy: number | null;
  hits: number;
  lowConfidenceAccuracy: number | null;
  mediumConfidenceAccuracy: number | null;
  misses: number;
  marketPriceOnly: number;
  noPolySignalEstimate: number;
  noAccuracy: number | null;
  noPredictions: number;
  pending: number;
  realPolySignalEstimates: number;
  resolved: number;
  total: number;
  unknown: number;
  weakDecisions: number;
  yesAccuracy: number | null;
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

function normalizeTrackingStatus(value: unknown): AnalysisHistoryTrackingStatus | undefined {
  if (
    value === "analyzing" ||
    value === "awaiting_resolution" ||
    value === "cancelled" ||
    value === "created" ||
    value === "no_clear_decision" ||
    value === "resolved_hit" ||
    value === "resolved_miss" ||
    value === "saved" ||
    value === "tracking" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function normalizeResolutionStatus(value: unknown): AnalysisHistoryResolutionStatus | undefined {
  if (
    value === "cancelled" ||
    value === "not_countable" ||
    value === "pending" ||
    value === "resolved" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function normalizeResult(value: unknown, status: AnalysisHistoryStatus): AnalysisHistoryResult {
  if (
    value === "cancelled" ||
    value === "hit" ||
    value === "miss" ||
    value === "pending" ||
    value === "unknown"
  ) {
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

function normalizeResolutionSource(value: unknown): AnalysisHistoryResolutionSource {
  if (
    value === "clob" ||
    value === "gamma" ||
    value === "polymarket" ||
    value === "polysignal" ||
    value === "polysignal_market" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeResolutionConfidence(value: unknown): AnalysisHistoryResolutionConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeMarketOutcomes(value: unknown): AnalysisHistoryMarketOutcome[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const outcomes: AnalysisHistoryMarketOutcome[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Partial<AnalysisHistoryMarketOutcome>;
    const label = normalizeString(record.label);
    if (!label) {
      continue;
    }
    outcomes.push({
      label,
      price: normalizeNumber(record.price),
      side: normalizeString(record.side),
    });
    if (outcomes.length >= 12) {
      break;
    }
  }
  return outcomes.length > 0 ? outcomes : undefined;
}

function normalizeAnalyzerLayerStatus(value: unknown): AnalysisHistoryAnalyzerLayerStatus {
  if (
    value === "available" ||
    value === "error" ||
    value === "partial" ||
    value === "pending" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unavailable";
}

function normalizeAnalyzerLayers(value: unknown): AnalysisHistoryAnalyzerLayer[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const layers = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<AnalysisHistoryAnalyzerLayer>;
      const id = normalizeString(candidate.id);
      const label = normalizeString(candidate.label);
      const summary = normalizeString(candidate.summary);
      if (!id || !label || !summary) {
        return null;
      }
      return {
        id,
        label,
        status: normalizeAnalyzerLayerStatus(candidate.status),
        summary,
        warnings: normalizeStringList(candidate.warnings, 6),
      };
    })
    .filter((item): item is AnalysisHistoryAnalyzerLayer => Boolean(item))
    .slice(0, 12);
  return layers.length > 0 ? layers : undefined;
}

function normalizeWalletSignalDirection(value: unknown): AnalysisHistoryWalletSignalDirection {
  if (
    value === "BOTH" ||
    value === "NEUTRAL" ||
    value === "NO" ||
    value === "UNKNOWN" ||
    value === "YES"
  ) {
    return value;
  }
  return "UNKNOWN";
}

function normalizeWalletConfidence(value: unknown): AnalysisHistoryWalletSummary["confidence"] {
  if (value === "high" || value === "medium" || value === "low" || value === "none") {
    return value;
  }
  return "none";
}

function normalizeWalletSource(value: unknown): AnalysisHistoryWalletSummary["source"] {
  if (value === "backend" || value === "local" || value === "unavailable") {
    return value;
  }
  return undefined;
}

function normalizeWalletSummary(value: unknown): AnalysisHistoryWalletSummary | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const summary = value as Partial<AnalysisHistoryWalletSummary>;
  return {
    analyzedCapitalUsd: normalizeNumber(summary.analyzedCapitalUsd),
    available: summary.available === true,
    checkedAt: normalizeString(summary.checkedAt),
    confidence: normalizeWalletConfidence(summary.confidence),
    noCapitalUsd: normalizeNumber(summary.noCapitalUsd),
    reason:
      normalizeString(summary.reason) ||
      "Wallet Intelligence no tenia datos suficientes al guardar el analisis.",
    relevantWalletsCount: normalizeNumber(summary.relevantWalletsCount) ?? 0,
    signalDirection: normalizeWalletSignalDirection(summary.signalDirection),
    source: normalizeWalletSource(summary.source),
    thresholdUsd: normalizeNumber(summary.thresholdUsd) ?? 100,
    warnings: normalizeStringList(summary.warnings, 8),
    yesCapitalUsd: normalizeNumber(summary.yesCapitalUsd),
  };
}

function normalizeEstimateQuality(value: unknown): AnalysisHistoryEstimateQuality | undefined {
  if (
    value === "insufficient_data" ||
    value === "market_price_only" ||
    value === "real_polysignal_estimate" ||
    value === "saved_without_evidence" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function normalizeItem(value: Partial<AnalysisHistoryItem>): AnalysisHistoryItem | null {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) {
    return null;
  }
  const status = normalizeStatus(value.status);
  const rawPolySignalNoProbability = normalizeNumber(value.polySignalNoProbability);
  const rawPolySignalYesProbability = normalizeNumber(value.polySignalYesProbability);
  const marketNoProbability = normalizeNumber(value.marketNoProbability);
  const marketYesProbability = normalizeNumber(value.marketYesProbability);
  const estimateQuality = getEstimateQuality({
    estimateQuality: normalizeEstimateQuality(value.estimateQuality),
    marketNoProbability,
    marketYesProbability,
    polySignalNoProbability: rawPolySignalNoProbability,
    polySignalYesProbability: rawPolySignalYesProbability,
  });
  const polySignalNoProbability =
    estimateQuality === "real_polysignal_estimate" ? rawPolySignalNoProbability : undefined;
  const polySignalYesProbability =
    estimateQuality === "real_polysignal_estimate" ? rawPolySignalYesProbability : undefined;
  const decision = getPolySignalDecision({
    polySignalNoProbability,
    polySignalYesProbability,
  });
  const rawResult = normalizeResult(value.result, status);
  const result =
    (rawResult === "hit" || rawResult === "miss") && decision.decision !== "clear"
      ? "unknown"
      : rawResult;
  return {
    analyzedAt: value.analyzedAt || nowIso(),
    analyzerLayers: normalizeAnalyzerLayers(value.analyzerLayers),
    confidence: normalizeConfidence(value.confidence),
    conditionId: normalizeString(value.conditionId),
    decision: decision.decision,
    decisionThreshold: decision.decisionThreshold,
    eventSlug: normalizeString(value.eventSlug),
    estimateQuality,
    evaluationReason:
      normalizeString(value.evaluationReason) ||
      (estimateQuality === "market_price_only"
        ? "Solo habia probabilidad del mercado."
        : estimateQuality === "saved_without_evidence"
          ? "Guardado sin evidencia de estimacion propia."
          : decision.evaluationReason),
    evaluationStatus: decision.evaluationStatus,
    id: value.id || randomId(),
    lastCheckedAt: normalizeString(value.lastCheckedAt),
    marketId: value.marketId ? String(value.marketId) : undefined,
    marketSlug: normalizeString(value.marketSlug),
    marketNoProbability,
    nextCheckHint: normalizeString(value.nextCheckHint),
    marketOutcomes: normalizeMarketOutcomes(value.marketOutcomes),
    marketYesProbability,
    outcome: normalizeOutcome(value.outcome),
    polySignalNoProbability,
    polySignalYesProbability,
    predictedSide: decision.predictedSide,
    reasons: Array.isArray(value.reasons)
      ? value.reasons.filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "")
      : [],
    resolutionConfidence: normalizeResolutionConfidence(value.resolutionConfidence),
    resolutionReason: normalizeString(value.resolutionReason),
    resolutionSource: normalizeResolutionSource(value.resolutionSource),
    resolutionStatus: normalizeResolutionStatus(value.resolutionStatus),
    resolvedAt: normalizeString(value.resolvedAt),
    result,
    remoteId: normalizeString(value.remoteId),
    source: normalizeSource(value.source),
    sport: value.sport || undefined,
    status,
    title,
    trackingStatus: normalizeTrackingStatus(value.trackingStatus),
    url: value.url || undefined,
    verifiedAt: normalizeString(value.verifiedAt),
    walletIntelligenceSummary: normalizeWalletSummary(value.walletIntelligenceSummary),
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

export async function replaceAnalysisHistory(items: AnalysisHistoryItem[]): Promise<AnalysisHistoryItem[]> {
  const normalizedItems = items
    .map((item) => normalizeItem(item))
    .filter((item): item is AnalysisHistoryItem => Boolean(item))
    .sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt));
  writeLocalHistory(normalizedItems);
  return normalizedItems;
}

function average(values: Array<number | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  if (usable.length === 0) {
    return null;
  }
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function accuracyFor(items: AnalysisHistoryItem[]): number | null {
  const hits = items.filter((item) => shouldCountForAccuracy(item) && item.result === "hit").length;
  const misses = items.filter((item) => shouldCountForAccuracy(item) && item.result === "miss").length;
  const resolved = hits + misses;
  return resolved > 0 ? hits / resolved : null;
}

export function calculateAnalysisHistoryStats(items: AnalysisHistoryItem[]): AnalysisHistoryStats {
  const countableItems = items.filter(shouldCountForAccuracy);
  const hits = countableItems.filter((item) => item.result === "hit").length;
  const misses = countableItems.filter((item) => item.result === "miss").length;
  const cancelled = items.filter((item) => item.result === "cancelled" || item.outcome === "CANCELLED").length;
  const clearPredictions = items.filter(hasClearPrediction).length;
  const weakDecisions = items.filter((item) => item.decision === "weak" || item.decision === "unknown").length;
  const realPolySignalEstimates = items.filter((item) => item.estimateQuality === "real_polysignal_estimate").length;
  const marketPriceOnly = items.filter((item) => item.estimateQuality === "market_price_only").length;
  const noPolySignalEstimate = items.filter(
    (item) => item.estimateQuality !== "real_polysignal_estimate" || item.decision === "none",
  ).length;
  const pending = items.filter((item) => item.result === "pending" || item.status === "open").length;
  const resolved = hits + misses;
  const countableResolved = resolved;
  const finalized = resolved + cancelled;
  const unknown = items.filter(
    (item) => item.result === "unknown" || item.status === "unknown",
  ).length;
  const byMonth = new Map<string, { hits: number; misses: number; resolved: number }>();
  for (const item of items) {
    if (!shouldCountForAccuracy(item)) {
      continue;
    }
    const date = new Date(item.resolvedAt || item.verifiedAt || item.analyzedAt);
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
    cancelled,
    clearPredictions,
    countableResolved,
    completedByMonth: Array.from(byMonth.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, ...value })),
    finalized,
    highConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Alta")),
    hits,
    lowConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Baja")),
    mediumConfidenceAccuracy: accuracyFor(items.filter((item) => item.confidence === "Media")),
    marketPriceOnly,
    misses,
    noPolySignalEstimate,
    noAccuracy: accuracyFor(items.filter((item) => item.predictedSide === "NO")),
    noPredictions: items.filter((item) => item.predictedSide === "NO").length,
    pending,
    realPolySignalEstimates,
    resolved,
    total: items.length,
    unknown,
    weakDecisions,
    yesAccuracy: accuracyFor(items.filter((item) => item.predictedSide === "YES")),
    yesPredictions: items.filter((item) => item.predictedSide === "YES").length,
  };
}
