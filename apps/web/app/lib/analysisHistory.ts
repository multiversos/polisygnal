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
export type AnalysisHistoryResearchStatus =
  | "awaiting_samantha"
  | "completed"
  | "failed"
  | "idle"
  | "receiving_samantha_report"
  | "ready_to_score"
  | "samantha_researching"
  | "sending_to_samantha"
  | "validating_samantha_report"
  | "running";
export type AnalysisHistoryBridgeMode = "automatic" | "local" | "manual_fallback";
export type AnalysisHistoryBridgeStatus =
  | "accepted"
  | "completed"
  | "failed_safe"
  | "manual_needed"
  | "pending"
  | "processing"
  | "queued";

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
  profileSummaries?: Array<{
    commonSideBias?: AnalysisHistoryWalletSignalDirection;
    confidence: "high" | "low" | "medium" | "unknown";
    losses?: number;
    observedMarketsCount?: number;
    profileAvailable: boolean;
    reason: string;
    resolvedMarketsCount?: number;
    shortAddress: string;
    volumeObservedUsd?: number;
    warnings: string[];
    winRate?: number;
    wins?: number;
  }>;
  reason: string;
  relevantWalletsCount: number;
  signalDirection: AnalysisHistoryWalletSignalDirection;
  source?: "backend" | "local" | "polymarket_data" | "unavailable";
  thresholdUsd: number;
  warnings: string[];
  yesCapitalUsd?: number;
};

export type AnalysisHistoryItem = {
  analyzedAt: string;
  analyzerLayers?: AnalysisHistoryAnalyzerLayer[];
  awaitingResearch?: boolean;
  bridgeMode?: AnalysisHistoryBridgeMode;
  bridgeStatus?: AnalysisHistoryBridgeStatus;
  bridgeTaskId?: string;
  clobTokenIds?: string[];
  confidence?: AnalysisHistoryConfidence;
  conditionId?: string;
  decision?: AnalysisHistoryDecision;
  decisionThreshold?: number;
  deepAnalysisJobId?: string;
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
  researchBriefReadyAt?: string;
  researchStatus?: AnalysisHistoryResearchStatus;
  sentToSamanthaAt?: string;
  remoteId?: string;
  source: AnalysisHistorySource;
  sport?: string;
  status: AnalysisHistoryStatus;
  title: string;
  trackingStatus?: AnalysisHistoryTrackingStatus;
  url?: string;
  verifiedAt?: string;
  walletIntelligenceSummary?: AnalysisHistoryWalletSummary;
  noTokenId?: string;
  yesTokenId?: string;
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
  researchPending: number;
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
const FULL_WALLET_PATTERN = /0x[a-fA-F0-9]{40}/g;

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

function normalizeResearchStatus(value: unknown): AnalysisHistoryResearchStatus | undefined {
  if (
    value === "awaiting_samantha" ||
    value === "completed" ||
    value === "failed" ||
    value === "idle" ||
    value === "receiving_samantha_report" ||
    value === "ready_to_score" ||
    value === "samantha_researching" ||
    value === "sending_to_samantha" ||
    value === "validating_samantha_report" ||
    value === "running"
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

function normalizeString(value: unknown, limit = 600): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(FULL_WALLET_PATTERN, "[wallet redacted]").trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function normalizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.replace(FULL_WALLET_PATTERN, "[wallet redacted]").trim().slice(0, 600))
    .slice(0, limit);
}

function normalizeBridgeMode(value: unknown): AnalysisHistoryBridgeMode | undefined {
  if (value === "automatic" || value === "local" || value === "manual_fallback") {
    return value;
  }
  return undefined;
}

function normalizeBridgeStatus(value: unknown): AnalysisHistoryBridgeStatus | undefined {
  if (
    value === "accepted" ||
    value === "completed" ||
    value === "failed_safe" ||
    value === "manual_needed" ||
    value === "pending" ||
    value === "processing" ||
    value === "queued"
  ) {
    return value;
  }
  return undefined;
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
  if (value === "backend" || value === "local" || value === "polymarket_data" || value === "unavailable") {
    return value;
  }
  return undefined;
}

function normalizeWalletReliability(value: unknown): "high" | "low" | "medium" | "unknown" {
  if (value === "high" || value === "medium" || value === "low" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function normalizeWalletProfileSummaries(
  value: unknown,
): AnalysisHistoryWalletSummary["profileSummaries"] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const profiles = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const profile = item as NonNullable<AnalysisHistoryWalletSummary["profileSummaries"]>[number];
      const shortAddress = normalizeString(profile.shortAddress, 32);
      if (!shortAddress) {
        return null;
      }
      return {
        commonSideBias: normalizeWalletSignalDirection(profile.commonSideBias),
        confidence: normalizeWalletReliability(profile.confidence),
        losses: normalizeNumber(profile.losses),
        observedMarketsCount: normalizeNumber(profile.observedMarketsCount),
        profileAvailable: profile.profileAvailable === true,
        reason: normalizeString(profile.reason) || "No hay historial publico suficiente para calificar esta billetera.",
        resolvedMarketsCount: normalizeNumber(profile.resolvedMarketsCount),
        shortAddress,
        volumeObservedUsd: normalizeNumber(profile.volumeObservedUsd),
        warnings: normalizeStringList(profile.warnings, 4),
        winRate: normalizeNumber(profile.winRate),
        wins: normalizeNumber(profile.wins),
      };
    })
    .filter(Boolean)
    .slice(0, 5) as NonNullable<AnalysisHistoryWalletSummary["profileSummaries"]>;
  return profiles.length > 0 ? profiles : undefined;
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
    profileSummaries: normalizeWalletProfileSummaries(summary.profileSummaries),
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
    awaitingResearch: value.awaitingResearch === true,
    bridgeMode: normalizeBridgeMode(value.bridgeMode),
    bridgeStatus: normalizeBridgeStatus(value.bridgeStatus),
    bridgeTaskId: normalizeString(value.bridgeTaskId, 160),
    clobTokenIds: normalizeStringList(value.clobTokenIds, 8),
    confidence: normalizeConfidence(value.confidence),
    conditionId: normalizeString(value.conditionId),
    decision: decision.decision,
    decisionThreshold: decision.decisionThreshold,
    deepAnalysisJobId: normalizeString(value.deepAnalysisJobId),
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
    researchBriefReadyAt: normalizeString(value.researchBriefReadyAt),
    researchStatus: normalizeResearchStatus(value.researchStatus),
    remoteId: normalizeString(value.remoteId),
    source: normalizeSource(value.source),
    sentToSamanthaAt: normalizeString(value.sentToSamanthaAt),
    sport: value.sport || undefined,
    status,
    title,
    trackingStatus: normalizeTrackingStatus(value.trackingStatus),
    url: value.url || undefined,
    verifiedAt: normalizeString(value.verifiedAt),
    walletIntelligenceSummary: normalizeWalletSummary(value.walletIntelligenceSummary),
    noTokenId: normalizeString(value.noTokenId),
    yesTokenId: normalizeString(value.yesTokenId),
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
  const researchPending = items.filter(
    (item) =>
      item.awaitingResearch ||
      item.researchStatus === "awaiting_samantha" ||
      item.researchStatus === "ready_to_score" ||
      item.researchStatus === "sending_to_samantha" ||
      item.researchStatus === "samantha_researching" ||
      item.researchStatus === "receiving_samantha_report" ||
      item.researchStatus === "validating_samantha_report" ||
      item.bridgeStatus === "accepted" ||
      item.bridgeStatus === "queued" ||
      item.bridgeStatus === "pending" ||
      item.bridgeStatus === "processing" ||
      item.bridgeStatus === "manual_needed",
  ).length;
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
    researchPending,
    realPolySignalEstimates,
    resolved,
    total: items.length,
    unknown,
    weakDecisions,
    yesAccuracy: accuracyFor(items.filter((item) => item.predictedSide === "YES")),
    yesPredictions: items.filter((item) => item.predictedSide === "YES").length,
  };
}
