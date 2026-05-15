"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AnalyzeLoadingPanel,
  type AnalyzeLoadingPhase,
  type AnalyzeProgressIssue,
  type AnalyzeProgressStepOverrides,
} from "../components/AnalyzeLoadingPanel";
import { AnalyzeHero } from "../components/analyze/AnalyzeHero";
import { AnalyzeSteps } from "../components/analyze/AnalyzeSteps";
import {
  AnalysisPreview,
  type AnalysisPreviewProps,
} from "../components/analyze/AnalysisPreview";
import { AnalyzerReport } from "../components/AnalyzerReport";
import { MainNavigation } from "../components/MainNavigation";
import { MarketDataDetails } from "../components/MarketDataDetails";
import { WalletIntelligenceDetails } from "../components/WalletIntelligenceDetails";
import { getPolySignalDecision } from "../lib/analysisDecision";
import {
  getPolymarketUrlValidationMessage,
  extractPolymarketSlug,
  parsePolymarketLink,
} from "../lib/polymarketLink";
import {
  resolvedMarketToOverviewItem,
  type PolymarketLinkResolveResult,
} from "../lib/polymarketLinkResolver";
import {
  formatProbability as formatPublicProbability,
  getMarketImpliedProbabilities,
  getProbabilityDisplayState,
  normalizeProbability,
} from "../lib/marketProbabilities";
import { getDisplayMarketPrices } from "../lib/marketDataDisplay";
import {
  getEstimateQuality,
  getEstimateQualityLabel,
  getRealPolySignalProbabilities,
} from "../lib/marketEstimateQuality";
import {
  collectIndependentSignals,
  collectMarketSignals,
  explainMissingEstimateData,
  getEstimateReadinessScore,
  getEstimateReadiness as getSignalEstimateReadiness,
} from "../lib/estimationSignals";
import { getPolySignalEstimate } from "../lib/polySignalEstimateEngine";
import {
  buildAnalyzerResult,
  getAnalyzerDecisionCopy,
  getAnalyzerSummary,
  getRelatedAnalyzerHistory,
  type AnalyzerResult,
} from "../lib/analyzerResult";
import {
  createDeepAnalysisJob,
  markJobFailed,
  markJobMarketAnalyzed,
  markJobPolymarketRead,
  markJobReceivingSamanthaReport,
  markJobSamanthaBriefReady,
  markJobSamanthaBridgeFallback,
  markJobSamanthaReportLoaded,
  markJobSamanthaResearching,
  markJobSendingToSamantha,
  markJobValidatingSamanthaReport,
  markJobWalletsAnalyzed,
  type DeepAnalysisJob,
} from "../lib/deepAnalysisJob";
import {
  DEEP_ANALYSIS_JOB_STORAGE_EVENT,
  getDeepAnalysisJob,
  getLatestDeepAnalysisJobForUrl,
  saveDeepAnalysisJob,
} from "../lib/deepAnalysisJobStorage";
import {
  extractSoccerMatchContext,
  formatSoccerMatchContext,
  getSoccerContextReadiness,
} from "../lib/soccerMatchContext";
import { getResearchCoverage } from "../lib/researchReadiness";
import {
  getWalletIntelligenceReadiness,
  getWalletSignalSummary,
  getWalletIntelligenceSummary,
} from "../lib/walletIntelligence";
import {
  getPolymarketWalletIntelligence,
  unavailablePolymarketWalletIntelligenceSummary,
} from "../lib/polymarketWalletIntelligence";
import {
  getHighlightedProfiles,
  saveHighlightedProfilesFromWalletSummary,
} from "../lib/highlightedProfiles";
import {
  fetchPersistentHighlightedProfiles,
  mergePersistentAndLocalProfiles,
  syncLocalHighlightedProfilesToBackend,
} from "../lib/persistentHighlightedProfiles";
import {
  saveProfileAlertsFromWalletSummary,
  type ProfileAlert,
} from "../lib/profileAlerts";
import {
  buildConservativePolySignalEstimate,
  type PolySignalEstimateResult,
} from "../lib/polySignalSignalMixer";
import { getMarketActivityLabel, getMarketReviewReason } from "../lib/publicMarketInsights";
import { getPublicMarketStatus } from "../lib/publicMarketStatus";
import { buildSamanthaResearchBrief } from "../lib/samanthaResearchBrief";
import {
  convertSamanthaReportToEvidence,
  convertSamanthaReportToSignals,
  parseSamanthaResearchReport,
} from "../lib/samanthaResearchReport";
import type { SamanthaResearchParseResult, SamanthaResearchReport } from "../lib/samanthaResearchTypes";
import {
  ANALYSIS_HISTORY_STORAGE_EVENT,
  getAnalysisHistory,
  saveAnalysisHistoryItem,
  type AnalysisHistoryItem,
} from "../lib/analysisHistory";
import {
  fetchWatchlistItems,
  toggleWatchlistMarket,
  type WatchlistItem,
  type WatchlistMarketDraft,
} from "../lib/watchlist";
import type { MarketOverviewItem } from "../lib/marketOverview";
import type {
  WalletIntelligenceSummary,
  WalletMarketPosition,
} from "../lib/walletIntelligenceTypes";

type AnalyzeMarketItem = MarketOverviewItem & {
  walletIntelligence?: {
    positions?: WalletMarketPosition[] | null;
    summary?: WalletIntelligenceSummary | null;
  } | null;
};

type MatchStrength = "exact" | "possible" | "strong" | "weak" | "reject";

type MatchResult = {
  eventSlug?: string;
  eventTitle?: string;
  item: AnalyzeMarketItem;
  marketId: string;
  marketSlug?: string;
  reasons: string[];
  score: number;
  strength: MatchStrength;
  title: string;
  warnings: string[];
};

type SearchState =
  | { status: "idle" }
  | { message: string; status: "invalid" }
  | { message: string; normalizedUrl: string; status: "detecting" }
  | { message: string; normalizedUrl: string; selected: MatchResult; status: "analyzing_selected" }
  | {
      matches: MatchResult[];
      message: string;
      normalizedUrl: string;
      status: "needs_selection" | "no_exact_match";
    }
  | {
      match: MatchResult;
      message: string;
      normalizedUrl: string;
      status: "result";
    };

type AnalysisAgentRouteResult = {
  agentId?: string;
  agentName?: string;
  automaticAvailable?: boolean;
  fallbackRequired?: boolean;
  reason?: string;
  report?: unknown;
  status?: string;
  taskId?: string;
  validationErrors?: string[];
  warnings?: string[];
};

type AnalysisAgentConfigRouteResult = {
  agentId?: string;
  agentName?: string;
  enabled?: boolean;
};

const LINK_RESOLVE_TIMEOUT_MS = 45_000;
const WALLET_INTELLIGENCE_TIMEOUT_MS = 45_000;
const ANALYSIS_AGENT_TIMEOUT_MS = 45_000;

class AnalyzeRequestTimeoutError extends Error {
  constructor(label: string) {
    super(label);
    this.name = "AnalyzeRequestTimeoutError";
  }
}

class AnalyzeRequestCancelledError extends Error {
  constructor() {
    super("analysis_cancelled");
    this.name = "AnalyzeRequestCancelledError";
  }
}

function isAnalyzeTimeout(error: unknown): boolean {
  return error instanceof AnalyzeRequestTimeoutError;
}

function isAnalyzeCancelled(error: unknown): boolean {
  return error instanceof AnalyzeRequestCancelledError;
}

async function withRequestTimeout<T>(
  timeoutMs: number,
  parentSignal: AbortSignal,
  label: string,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) {
    throw new AnalyzeRequestCancelledError();
  }
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  try {
    return await task(controller.signal);
  } catch (error) {
    if (timedOut) {
      throw new AnalyzeRequestTimeoutError(label);
    }
    if (parentSignal.aborted) {
      throw new AnalyzeRequestCancelledError();
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMetric(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: parsed >= 100 ? 0 : 1,
    notation: parsed >= 100000 ? "compact" : "standard",
  }).format(parsed);
}

function formatUsd(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    currency: "USD",
    maximumFractionDigits: parsed >= 100 ? 0 : 2,
    style: "currency",
  }).format(parsed);
}

function formatPercentValue(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(parsed);
}

function formatMarketPriceValue(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin precio";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 3,
    minimumFractionDigits: parsed > 0 && parsed < 0.1 ? 3 : 0,
  }).format(parsed);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "sin fecha";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function marketTitle(item: MarketOverviewItem): string {
  return item.market?.question || item.market?.event_title || "Mercado sin titulo";
}

function eventTitle(item: MarketOverviewItem): string {
  return item.market?.event_title || "Evento por confirmar";
}

function latestUpdate(item: MarketOverviewItem): string | null {
  return (
    item.latest_prediction?.run_at ||
    item.latest_snapshot?.captured_at ||
    item.market?.end_date ||
    null
  );
}

function insightInput(item: MarketOverviewItem) {
  return {
    active: item.market?.active,
    closeTime: item.market?.close_time ?? item.market?.end_date ?? null,
    closed: item.market?.closed,
    hasAnalysis: Boolean(item.latest_prediction),
    hasPrice:
      item.latest_snapshot?.yes_price !== null &&
      item.latest_snapshot?.yes_price !== undefined,
    isPartial: !item.latest_snapshot || !item.latest_prediction,
    liquidity: item.latest_snapshot?.liquidity,
    updatedAt: latestUpdate(item),
    volume: item.latest_snapshot?.volume,
  };
}

function buildMarketDataProgress(item: MarketOverviewItem): AnalyzeProgressStepOverrides["loading_polymarket"] {
  const displayPrices = getDisplayMarketPrices(item, 4);
  const pricedCards = displayPrices.cards.filter((card) => card.price !== null);
  const priceSummary = pricedCards
    .slice(0, 2)
    .map((card) => `${card.name} ${formatMarketPriceValue(card.price)}`)
    .join(" | ");
  const priceAvailable = displayPrices.mode !== "unavailable" && pricedCards.length > 0;
  const volume = toNumber(item.latest_snapshot?.volume);
  const liquidity = toNumber(item.latest_snapshot?.liquidity);
  const stateKnown = item.market?.active !== undefined || item.market?.closed !== undefined;
  const hasMarketData = priceAvailable || volume !== null || liquidity !== null || stateKnown;
  if (priceAvailable || volume !== null || liquidity !== null) {
    return {
      detail: "Polymarket devolvio datos estructurados para este mercado seleccionado.",
      status: "completed_with_data",
      statusLabel: "Datos cargados",
      summary: [
        priceAvailable ? priceSummary || "precio visible" : null,
        volume !== null ? `volumen ${formatMetric(volume)}` : null,
        liquidity !== null ? `liquidez ${formatMetric(liquidity)}` : null,
      ].filter(Boolean).join(" | "),
    };
  }
  if (hasMarketData || item.market?.question || item.market?.market_slug) {
    return {
      detail: "Tenemos metadata del mercado, pero precio, volumen o liquidez son limitados.",
      status: "limited",
      statusLabel: "Datos basicos cargados",
      summary: "Titulo, slug o estado disponible; sin datos suficientes para tratarlo como analisis completo.",
    };
  }
  return {
    detail: "No hay precio, volumen, liquidez ni estado suficientes para este mercado.",
    status: "limited",
    statusLabel: "Sin datos suficientes",
    summary: "PolySignal no inventa datos de mercado faltantes.",
  };
}

function buildWalletProgress(summary: WalletIntelligenceSummary): AnalyzeProgressStepOverrides["reviewing_wallets"] {
  if (summary.queryStatus === "timeout") {
    return {
      detail: summary.reason,
      status: "timeout",
      statusLabel: "No respondio a tiempo",
      summary: "Wallet Intelligence no se usa como senal fuerte en esta lectura.",
    };
  }
  if (summary.queryStatus === "error" || summary.queryStatus === "unavailable" || summary.source === "unavailable") {
    return {
      detail: summary.reason,
      status: "unavailable",
      statusLabel: "Fuente no disponible",
      summary: "No se pudo consultar actividad publica de billeteras para este mercado.",
    };
  }
  if (summary.available && summary.relevantWalletsCount > 0) {
    const observedCapital = toNumber(summary.analyzedCapitalUsd);
    return {
      detail: "La consulta termino y encontro actividad publica sobre el umbral configurado.",
      status: "completed_with_data",
      statusLabel: "Actividad encontrada",
      summary: observedCapital !== null
        ? `${summary.relevantWalletsCount} billetera(s) relevante(s), capital observado ${formatUsd(observedCapital)}.`
        : `${summary.relevantWalletsCount} billetera(s) relevante(s); la fuente no entrego capital observado agregado.`,
    };
  }
  return {
    detail: summary.reason || "La consulta termino sin actividad publica relevante sobre el umbral.",
    status: "completed_empty",
    statusLabel: "Sin actividad relevante",
    summary: "La fuente respondio, pero no encontro wallets utiles para una senal auxiliar.",
  };
}

function shouldUseExpandedWalletAnalysis(item: MarketOverviewItem, summary: WalletIntelligenceSummary): boolean {
  const volume = toNumber(item.latest_snapshot?.volume) ?? 0;
  const liquidity = toNumber(item.latest_snapshot?.liquidity) ?? 0;
  const observedCapital = toNumber(summary.analyzedCapitalUsd) ?? 0;
  return volume >= 1_000_000 || liquidity >= 500_000 || observedCapital >= 50_000;
}

function buildWalletExpandedSummary(
  item: MarketOverviewItem,
  summary: WalletIntelligenceSummary,
  savedProfilesCount: number,
): WalletIntelligenceSummary {
  const publicActivities = summary.publicActivities ?? [];
  const profileCount = publicActivities.filter((activity) => activity.profile).length;
  const historyAvailableCount =
    summary.historyAvailableCount ??
    publicActivities.filter(
      (activity) => (activity.marketHistory?.length ?? 0) > 0 || typeof activity.closedMarkets === "number",
    ).length;
  const highlightedProfilesCount =
    summary.highlightedProfilesCount ??
    publicActivities.filter((activity) => activity.highlightedProfile).length;
  const largeMarket = shouldUseExpandedWalletAnalysis(item, summary);
  const consistencyWarnings: string[] = [];
  if (largeMarket && summary.available && summary.relevantWalletsCount < 5) {
    consistencyWarnings.push(
      "El mercado tiene alto volumen, liquidez o capital observado, pero la fuente devolvio pocas wallets. Puede ser limite de fuente o datos incompletos.",
    );
  }
  if (largeMarket && summary.available && publicActivities.length < Math.min(summary.relevantWalletsCount, 5)) {
    consistencyWarnings.push(
      "La fuente reporto billeteras relevantes, pero entrego pocas actividades detalladas para validarlas.",
    );
  }
  return {
    ...summary,
    expandedAnalysis: {
      consistencyWarnings,
      highlightedProfilesCount: Math.max(highlightedProfilesCount, savedProfilesCount),
      historyAvailableCount,
      largeMarket,
      profileCount,
    },
    highlightedProfilesCount: Math.max(highlightedProfilesCount, savedProfilesCount),
    historyAvailableCount,
    warnings: [...summary.warnings, ...consistencyWarnings].slice(0, 12),
  };
}

function buildProfileProgress(summary: WalletIntelligenceSummary): AnalyzeProgressStepOverrides["enriching_profiles"] {
  const count = summary.expandedAnalysis?.profileCount ?? 0;
  return {
    detail: count > 0
      ? "La fuente entrego datos publicos de perfil para algunas wallets completas."
      : "La fuente no entrego perfiles publicos enriquecidos para estas wallets.",
    status: count > 0 ? "completed_with_data" : "completed_empty",
    statusLabel: count > 0 ? "Perfiles publicos revisados" : "Sin perfiles enriquecidos",
    summary: count > 0 ? `${count} perfil(es) publico(s) detectado(s).` : "No se inventan nombres, avatares ni pseudonimos.",
  };
}

function buildWalletHistoryProgress(summary: WalletIntelligenceSummary): AnalyzeProgressStepOverrides["building_wallet_history"] {
  const count = summary.expandedAnalysis?.historyAvailableCount ?? summary.historyAvailableCount ?? 0;
  const highlighted = summary.expandedAnalysis?.highlightedProfilesCount ?? summary.highlightedProfilesCount ?? 0;
  return {
    detail: count > 0
      ? "Se encontro historial publico cerrado para algunas wallets."
      : "No hay historial publico cerrado suficiente desde la fuente actual.",
    status: count > 0 ? "completed_with_data" : "completed_empty",
    statusLabel: count > 0 ? "Historial revisado" : "Historial no disponible",
    summary: count > 0
      ? `${count} wallet(s) con historial; ${highlighted} perfil(es) destacado(s) guardado(s) o elegible(s).`
      : "Win rate y PnL quedan como no disponibles si no vienen reales.",
  };
}

function buildWalletConsistencyProgress(summary: WalletIntelligenceSummary): AnalyzeProgressStepOverrides["validating_wallet_consistency"] {
  const warnings = summary.expandedAnalysis?.consistencyWarnings ?? [];
  if (warnings.length > 0) {
    return {
      detail: warnings[0],
      status: "warning",
      statusLabel: "Datos limitados",
      summary: "La lectura queda parcial por limite de fuente.",
    };
  }
  return {
    detail: "Capital observado, actividades y conteos de wallets son consistentes con lo que entrego la fuente.",
    status: "completed_with_data",
    statusLabel: "Consistencia revisada",
    summary: `${summary.relevantWalletsCount} billetera(s), ${summary.publicActivities?.length ?? 0} actividad(es) publicas.`,
  };
}

function walletDetailsButtonLabel(summary?: WalletIntelligenceSummary | null): string {
  if (!summary) {
    return "Consultando...";
  }
  if (summary.available && summary.relevantWalletsCount > 0) {
    return "Ver billeteras";
  }
  if (summary.queryStatus === "empty" || summary.source === "polymarket_data") {
    return "Ver detalle";
  }
  if (summary.queryStatus === "timeout" || summary.queryStatus === "error" || summary.queryStatus === "unavailable") {
    return "Ver estado";
  }
  return "Ver detalle";
}

function marketDetailsButtonLabel(item?: MarketOverviewItem | null): string {
  if (!item) {
    return "Ver estado";
  }
  const progress = buildMarketDataProgress(item);
  return progress?.status === "completed_with_data" || progress?.statusLabel === "Datos cargados"
    ? "Ver datos"
    : "Ver estado";
}

function buildAgentProgress(input: {
  agentName: string;
  job?: DeepAnalysisJob | null;
  message?: string;
}): AnalyzeProgressStepOverrides["preparing_samantha"] {
  const status = input.job?.analysisAgent?.status;
  if (status === "completed") {
    return {
      detail: `${input.agentName} devolvio una lectura validada por PolySignal.`,
      status: "completed_with_data",
      statusLabel: "Lectura validada",
      summary: "Solo cuenta como decision si las compuertas de evidencia pasan.",
    };
  }
  if (status === "partial") {
    return {
      detail: input.message || `${input.agentName} devolvio datos parciales o insuficientes para decision.`,
      status: "warning",
      statusLabel: "Lectura parcial preparada",
      summary: "No hay estimacion propia si las senales no alcanzan.",
    };
  }
  if (status === "failed_safe") {
    return {
      detail: input.message || `${input.agentName} no pudo completar todas las fuentes automaticas.`,
      status: "failed_safe",
      statusLabel: "Fallo seguro",
      summary: "PolySignal conserva una lectura parcial sin mostrar errores tecnicos.",
    };
  }
  if (status === "unavailable") {
    return {
      detail: input.message || `${input.agentName} automatico no esta conectado todavia.`,
      status: "unavailable",
      statusLabel: "Agente no conectado",
      summary: "PolySignal muestra una lectura parcial con las fuentes disponibles.",
    };
  }
  return {
    detail: `${input.agentName} revisa fuentes automaticas disponibles y responde sin inventar evidencia.`,
    status: "running",
    statusLabel: `${input.agentName} analizando`,
    summary: "Esperando respuesta del agente analizador.",
  };
}

function watchlistDraftFromMatch(item: MarketOverviewItem): WatchlistMarketDraft {
  return {
    active: item.market?.active ?? true,
    close_time: item.market?.close_time ?? item.market?.end_date ?? null,
    closed: item.market?.closed ?? false,
    latest_no_price: item.latest_snapshot?.no_price ?? null,
    latest_yes_price: item.latest_snapshot?.yes_price ?? null,
    liquidity: item.latest_snapshot?.liquidity ?? null,
    market_shape: item.market?.evidence_shape || item.market?.market_type || null,
    market_slug: item.market?.market_slug || String(item.market?.id ?? ""),
    question: item.market?.question ?? null,
    sport: item.market?.sport_type ?? null,
    title: marketTitle(item),
    updated_at: latestUpdate(item),
    volume: item.latest_snapshot?.volume ?? null,
  };
}

async function resolvePolymarketLinkForAnalyze(
  url: string,
  signal?: AbortSignal,
): Promise<PolymarketLinkResolveResult> {
  const response = await fetch("/api/analyze-polymarket-link", {
    body: JSON.stringify({ url }),
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    throw new Error("link_resolve_failed");
  }
  return (await response.json()) as PolymarketLinkResolveResult;
}

function outcomeSummary(item: MarketOverviewItem): string {
  const outcomes = item.market?.outcomes ?? [];
  const priced = outcomes
    .filter((outcome) => outcome.label)
    .slice(0, 4)
    .map((outcome) => {
      const price =
        outcome.price === null || outcome.price === undefined
          ? "precio no disponible"
          : formatPublicProbability(outcome.price);
      return `${outcome.label}: ${price}`;
    });
  if (priced.length > 0) {
    return priced.join(" | ");
  }
  return `Precio Si ${formatPublicProbability(item.latest_snapshot?.yes_price)} | Precio No ${formatPublicProbability(item.latest_snapshot?.no_price)}`;
}

function buildMatchesFromPolymarketResult(result: PolymarketLinkResolveResult): MatchResult[] {
  return result.markets.map((market, index) => {
    const item = resolvedMarketToOverviewItem(result, market) as AnalyzeMarketItem;
    const eventExact = Boolean(result.eventSlug && market.eventSlug === result.eventSlug);
    const marketExact = Boolean(result.marketSlug && market.slug === result.marketSlug);
    const strength: MatchStrength = marketExact || result.markets.length === 1 ? "exact" : eventExact ? "strong" : "possible";
    const score = marketExact ? 100 : result.markets.length === 1 ? 96 : eventExact ? 90 : 72;
    const reasons = [
      marketExact ? "slug de mercado exacto desde Polymarket" : null,
      eventExact ? "mismo evento devuelto por Polymarket" : null,
      result.source === "gamma" ? "fuente Gamma/Polymarket read-only" : "fuente Polymarket read-only",
    ].filter((reason): reason is string => Boolean(reason));
    return {
      eventSlug: market.eventSlug ?? result.eventSlug,
      eventTitle: result.event?.title,
      item,
      marketId: market.id ?? market.remoteId ?? market.conditionId ?? market.slug ?? `resolved-${index}`,
      marketSlug: market.slug,
      reasons,
      score,
      strength,
      title: market.question,
      warnings: result.warnings,
    };
  });
}

async function enrichMatchWithWalletIntelligence(
  match: MatchResult,
  normalizedUrl: string,
  signal?: AbortSignal,
): Promise<MatchResult> {
  const market = match.item.market;
  const tokenIds = (market?.outcomes ?? [])
    .map((outcome) => outcome.token_id)
    .filter((tokenId): tokenId is string => Boolean(tokenId));
  const summary = await getPolymarketWalletIntelligence({
    conditionId: market?.condition_id ?? undefined,
    eventSlug: market?.event_slug ?? undefined,
    marketSlug: market?.market_slug ?? undefined,
    marketUrl: normalizedUrl,
    tokenIds,
  }, undefined, { signal });
  return {
    ...match,
    item: {
      ...match.item,
      walletIntelligence: {
        positions: summary.topWallets ?? [],
        summary,
      },
    },
  };
}

function safeWalletSummaryForHistory(item: MarketOverviewItem) {
  const summary = getWalletIntelligenceSummary(item);
  return {
    analyzedCapitalUsd: summary.analyzedCapitalUsd,
    allActivitiesCount: summary.allActivitiesCount,
    available: summary.available,
    checkedAt: summary.checkedAt,
    confidence: summary.confidence,
    largePositionsCount: summary.largePositions?.length,
    largeTradesCount: summary.largeTrades?.length,
    neutralCapitalUsd: summary.neutralCapitalUsd,
    notableWalletsCount: summary.notableWallets?.length,
    noCapitalUsd: summary.noCapitalUsd,
    profileSummaries: (summary.profileSummaries ?? []).slice(0, 5).map((profile) => ({
      commonSideBias: profile.commonSideBias,
      confidence: profile.confidence,
      losses: profile.losses,
      observedMarketsCount: profile.observedMarketsCount,
      profileAvailable: profile.profileAvailable,
      reason: profile.reason,
      resolvedMarketsCount: profile.resolvedMarketsCount,
      shortAddress: profile.shortAddress,
      volumeObservedUsd: profile.volumeObservedUsd,
      warnings: profile.warnings.slice(0, 4),
      winRate: profile.winRate,
      wins: profile.wins,
    })),
    reason: summary.reason,
    relevantWalletsCount: summary.relevantWalletsCount,
    signalDirection: summary.signalDirection,
    source: summary.source,
    thresholdUsd: summary.thresholdUsd,
    warnings: summary.warnings.slice(0, 6),
    yesCapitalUsd: summary.yesCapitalUsd,
  };
}

function safeOutcomesForHistory(item: MarketOverviewItem) {
  return (item.market?.outcomes ?? [])
    .filter((outcome) => outcome.label)
    .slice(0, 12)
    .map((outcome) => ({
      label: String(outcome.label),
      price: toNumber(outcome.price) ?? undefined,
      side: outcome.side ? String(outcome.side) : undefined,
    }));
}

function safeTokenIdsForHistory(item: MarketOverviewItem): string[] | undefined {
  const tokenIds = (item.market?.outcomes ?? [])
    .map((outcome) => outcome.token_id)
    .filter((tokenId): tokenId is string => Boolean(tokenId))
    .slice(0, 8);
  return tokenIds.length > 0 ? tokenIds : undefined;
}

function tokenIdForSide(item: MarketOverviewItem, side: "NO" | "YES"): string | undefined {
  return (item.market?.outcomes ?? []).find((outcome) => outcome.side === side)?.token_id ?? undefined;
}

function confidenceForHistory(estimate?: PolySignalEstimateResult): "Alta" | "Baja" | "Desconocida" | "Media" {
  if (!estimate?.available) {
    return "Desconocida";
  }
  if (estimate.confidence === "high") {
    return "Alta";
  }
  if (estimate.confidence === "medium") {
    return "Media";
  }
  if (estimate.confidence === "low") {
    return "Baja";
  }
  return "Desconocida";
}

function jobAwaitsResearch(job?: DeepAnalysisJob | null): boolean {
  return Boolean(
    job &&
      [
        "awaiting_samantha",
        "ready_to_score",
        "receiving_samantha_report",
        "samantha_researching",
        "sending_to_samantha",
        "validating_samantha_report",
      ].includes(job.status),
  );
}

function deepJobSupportsPersistentRadar(job?: DeepAnalysisJob | null): boolean {
  return Boolean(
    job &&
      [
        "idle",
        "running",
        "awaiting_samantha",
        "ready_to_score",
        "receiving_samantha_report",
        "samantha_researching",
        "sending_to_samantha",
        "validating_samantha_report",
      ].includes(job.status),
  );
}

function loadingPhaseFromJob(job?: DeepAnalysisJob | null): AnalyzeLoadingPhase | null {
  if (!job) {
    return null;
  }
  if (job.status === "sending_to_samantha") {
    return "sending_samantha";
  }
  if (job.status === "samantha_researching") {
    return "samantha_researching";
  }
  if (job.status === "receiving_samantha_report" || job.status === "validating_samantha_report") {
    return "validating_report";
  }
  if (job.status === "awaiting_samantha") {
    return "awaiting_samantha";
  }
  if (job.status === "ready_to_score") {
    return "ready_to_score";
  }
  if (job.briefReady) {
    return "preparing_samantha";
  }
  return null;
}

function historyPayloadFromMarket(
  item: MarketOverviewItem,
  normalizedUrl: string,
  analyzerResult: AnalyzerResult,
  deepJob?: DeepAnalysisJob | null,
  polySignalEstimate?: PolySignalEstimateResult,
  samanthaReportResult?: SamanthaResearchParseResult | null,
) {
  const marketProbabilities = getMarketImpliedProbabilities({
    marketNoPrice: item.latest_snapshot?.no_price,
    marketYesPrice: item.latest_snapshot?.yes_price,
  });
  const hasConservativeEstimate = Boolean(polySignalEstimate?.available);
  const estimateQuality = hasConservativeEstimate ? "real_polysignal_estimate" : getEstimateQuality(item);
  const polySignalProbabilities = hasConservativeEstimate
    ? {
        no: polySignalEstimate?.estimateNoProbability,
        yes: polySignalEstimate?.estimateYesProbability,
      }
    : getRealPolySignalProbabilities(item);
  const confidenceScore =
    estimateQuality === "real_polysignal_estimate" && !hasConservativeEstimate
      ? normalizeProbability(item.latest_prediction?.confidence_score)
      : null;
  const reviewReason = getMarketReviewReason(insightInput(item));
  const activity = getMarketActivityLabel(insightInput(item));
  const decision = getPolySignalDecision({
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
  });
  const predictionReason =
    hasConservativeEstimate
      ? polySignalEstimate?.explanation || "Estimacion PolySignal generada con reporte Samantha validado y compuertas conservadoras."
      : estimateQuality === "market_price_only"
      ? "Solo habia probabilidad del mercado; no se guardo prediccion PolySignal."
      : estimateQuality !== "real_polysignal_estimate"
        ? "Sin estimacion PolySignal suficiente."
        : decision.predictedSide === "UNKNOWN"
          ? decision.evaluationReason
          : "Prediccion clara guardada solo cuando la estimacion PolySignal supera 55%.";
  const analyzerSummary = getAnalyzerSummary(analyzerResult);
  const samanthaReport = samanthaReportResult?.valid ? samanthaReportResult.report : undefined;
  const samanthaEvidence = samanthaReport ? convertSamanthaReportToEvidence(samanthaReport) : [];
  const agentSourcesUsed = [
    deepJob?.analysisAgent?.agentName,
    "Polymarket",
    safeWalletSummaryForHistory(item)?.available ? "Wallet Intelligence" : null,
    ...samanthaEvidence.map((evidence) => evidence.sourceName),
    samanthaReport?.oddsComparison?.found ? "Odds externas" : null,
    samanthaReport?.kalshiComparison?.found ? "Kalshi" : null,
  ].filter((source): source is string => Boolean(source));
  const agentLimitations = [
    samanthaReport?.status === "partial"
      ? "Lectura parcial: faltan senales independientes suficientes."
      : null,
    samanthaReport?.status === "failed" ? "Sin senales suficientes." : null,
    !polySignalEstimate?.available
      ? "No hay estimacion propia de PolySignal para este mercado."
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    analyzedAt: new Date().toISOString(),
    analyzerLayers: analyzerResult.layers.map((layer) => ({
      id: layer.id,
      label: layer.label,
      status: layer.status,
      summary: layer.summary,
      warnings: layer.warnings.slice(0, 4),
    })),
    confidence:
      hasConservativeEstimate
        ? confidenceForHistory(polySignalEstimate)
        : confidenceScore === null
        ? ("Desconocida" as const)
        : confidenceScore >= 0.7
          ? ("Alta" as const)
          : confidenceScore >= 0.4
            ? ("Media" as const)
            : ("Baja" as const),
    conditionId: item.market?.condition_id || undefined,
    clobTokenIds: safeTokenIdsForHistory(item),
    decision: decision.decision,
    decisionThreshold: decision.decisionThreshold,
    eventSlug: item.market?.event_slug || undefined,
    estimateQuality,
    evaluationReason:
      hasConservativeEstimate
        ? polySignalEstimate?.explanation
        : estimateQuality === "market_price_only"
        ? "Solo habia probabilidad del mercado."
        : estimateQuality === "real_polysignal_estimate"
          ? decision.evaluationReason
          : "Sin estimacion PolySignal suficiente.",
    evaluationStatus: decision.evaluationStatus,
    awaitingResearch: jobAwaitsResearch(deepJob),
    agentId: deepJob?.analysisAgent?.agentId,
    agentName: deepJob?.analysisAgent?.agentName,
    agentKeySignals: samanthaEvidence.slice(0, 8).map((evidence) => ({
      confidence: evidence.reliability,
      direction: evidence.direction,
      label: evidence.title,
      source: evidence.sourceName,
      summary: evidence.summary,
    })),
    agentLimitations,
    agentRisks: [
      ...(samanthaReport?.warnings ?? []),
      ...(!polySignalEstimate?.available
        ? ["No hay senales independientes suficientes para una estimacion propia."]
        : []),
    ],
    agentSourcesUsed: [...new Set(agentSourcesUsed)].slice(0, 10),
    agentStatus: agentStatusForHistory(samanthaReport, deepJob),
    agentSummary:
      samanthaEvidence[0]?.summary ||
      (samanthaReport
        ? "Lectura automatica guardada con evidencia compacta y limitaciones visibles."
        : undefined),
    bridgeMode: deepJob?.samanthaBridge?.bridgeMode,
    bridgeStatus: deepJob?.samanthaBridge?.bridgeStatus,
    bridgeTaskId: deepJob?.samanthaBridge?.bridgeTaskId ?? deepJob?.samanthaBridge?.taskId,
    deepAnalysisJobId: deepJob?.id,
    id: `link-${item.market?.id ?? item.market?.remote_id ?? item.market?.market_slug ?? "market"}-${Date.now()}`,
    lastCheckedAt: deepJob?.updatedAt,
    marketId: item.market?.id ? String(item.market.id) : undefined,
    marketSlug: item.market?.market_slug || undefined,
    marketNoProbability: marketProbabilities?.no,
    marketOutcomes: safeOutcomesForHistory(item),
    marketYesProbability: marketProbabilities?.yes,
    outcome: "UNKNOWN" as const,
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
    predictedSide: decision.predictedSide,
    reasons: [
      analyzerSummary.headline,
      reviewReason.reason,
      activity?.detail,
      predictionReason,
      ...samanthaEvidence
        .slice(0, 2)
        .map((evidence) => `${evidence.title}: ${evidence.summary}`),
      ...(polySignalEstimate?.available
        ? polySignalEstimate.contributions
            .filter((contribution) => contribution.usedForEstimate)
            .slice(0, 3)
            .map((contribution) => `${contribution.label}: ${contribution.summary}`)
        : polySignalEstimate?.blockers.slice(0, 3).map((entry) => entry.detail) ?? []),
    ].filter((reason): reason is string => Boolean(reason)),
    nextCheckHint: "Revisar cuando Polymarket confirme el resultado final.",
    noTokenId: tokenIdForSide(item, "NO"),
    result: "pending" as const,
    polySignalEstimateAvailable: Boolean(polySignalEstimate?.available),
    polySignalEstimateBlockers: polySignalEstimate?.blockers.map((entry) => entry.label),
    polySignalEstimateContributions: polySignalEstimate?.contributions
      .filter((contribution) => contribution.usedForEstimate)
      .slice(0, 8)
      .map((contribution) => ({
        confidence: contribution.confidence,
        direction: contribution.direction,
        label: contribution.label,
        source: contribution.source,
        summary: contribution.summary,
      })),
    polySignalEstimateExplanation: polySignalEstimate?.explanation,
    researchBriefReadyAt: deepJob?.steps.find((step) => step.id === "preparing_samantha_research")?.completedAt,
    researchStatus: deepJob?.status,
    resolutionStatus: "pending" as const,
    remoteId: item.market?.remote_id || undefined,
    source: "link_analyzer" as const,
    sentToSamanthaAt: deepJob?.samanthaBridge?.sentToSamanthaAt,
    sport: item.market?.sport_type || undefined,
    status: "open" as const,
    title: marketTitle(item),
    trackingStatus:
      jobAwaitsResearch(deepJob)
        ? ("analyzing" as const)
        : decision.predictedSide === "UNKNOWN"
          ? ("no_clear_decision" as const)
          : ("awaiting_resolution" as const),
    url: normalizedUrl,
    walletIntelligenceSummary: safeWalletSummaryForHistory(item),
    yesTokenId: tokenIdForSide(item, "YES"),
  };
}

function agentStatusForHistory(
  report: SamanthaResearchReport | undefined,
  deepJob?: DeepAnalysisJob | null,
): AnalysisHistoryItem["agentStatus"] {
  if (report?.status === "completed") {
    return "completed";
  }
  if (report?.status === "partial") {
    return "partial";
  }
  if (report?.status === "failed") {
    return "insufficient_data";
  }
  if (deepJob?.samanthaBridge?.fallbackRequired) {
    return "unavailable";
  }
  if (deepJob?.status === "samantha_researching" || deepJob?.status === "awaiting_samantha") {
    return "researching";
  }
  return deepJob?.analysisAgent?.status === "unavailable" ? "unavailable" : undefined;
}

function pendingHistoryPayload(normalizedUrl: string) {
  const slug = extractPolymarketSlug(normalizedUrl);
  const segments = new URL(normalizedUrl).pathname.split("/").filter(Boolean);
  const prefix = segments.find((segment) => segment === "event" || segment === "market" || segment === "markets");
  return {
    analyzedAt: new Date().toISOString(),
    confidence: "Desconocida" as const,
    decision: "none" as const,
    decisionThreshold: 55,
    eventSlug: prefix === "event" ? slug || undefined : undefined,
    estimateQuality: "insufficient_data" as const,
    evaluationReason: "Sin estimacion PolySignal.",
    evaluationStatus: "not_countable" as const,
    id: `link-pending-${Date.now()}`,
    outcome: "UNKNOWN" as const,
    marketSlug: prefix === "market" ? slug || undefined : undefined,
    predictedSide: "UNKNOWN" as const,
    nextCheckHint: "Reintentar desde el analizador cuando el enlace vuelva a estar disponible.",
    reasons: ["No pudimos obtener este mercado desde Polymarket sin inventar datos."],
    result: "unknown" as const,
    resolutionStatus: "unknown" as const,
    source: "link_analyzer" as const,
    status: "unknown" as const,
    title: slug ? `Enlace Polymarket: ${slug.replaceAll("-", " ")}` : "Enlace Polymarket pendiente",
    trackingStatus: "unknown" as const,
    url: normalizedUrl,
  };
}

function EstimateReadinessBlock({ item }: { item: MarketOverviewItem }) {
  const readiness = getSignalEstimateReadiness(item);
  const readinessScore = getEstimateReadinessScore(item);
  const marketSignals = collectMarketSignals(item);
  const independentSignals = collectIndependentSignals(item);
  const missing = explainMissingEstimateData(item);
  return (
    <div className="data-health-notes" aria-label="Datos necesarios para estimacion propia">
      <span className={`badge ${readinessScore.level === "ready" ? "external-hint" : "muted"}`}>
        Preparacion de datos: {readinessScore.score}/100
      </span>
      <span className={`badge ${readiness.ready ? "external-hint" : "muted"}`}>
        Estado: {readiness.ready ? "estimacion disponible" : readiness.level === "partial" ? "datos parciales" : "sin estimacion suficiente"}
      </span>
      <span className="badge muted">Senales de mercado: {marketSignals.length}</span>
      <span className={independentSignals.length > 0 ? "badge external-hint" : "badge muted"}>
        Senales independientes: {independentSignals.length}
      </span>
      {missing.slice(0, 3).map((reason) => (
        <span className="badge muted" key={reason}>{reason}</span>
      ))}
    </div>
  );
}

function SoccerContextBlock({ item }: { item: MarketOverviewItem }) {
  const context = extractSoccerMatchContext(item);
  const readiness = getSoccerContextReadiness(context);
  const isSoccer = (item.market?.sport_type || context.sport || "").toLowerCase() === "soccer";
  if (!isSoccer) {
    return null;
  }
  return (
    <div className="empty-state compact">
      <strong>Contexto del partido</strong>
      <p>
        Este contexto ayuda a preparar una estimacion futura, pero por si solo no genera
        una prediccion PolySignal.
      </p>
      <div className="history-card-metrics">
        <span>Partido {formatSoccerMatchContext(context)}</span>
        <span>
          Equipos {context.teamA?.name && context.teamB?.name ? `${context.teamA.name} / ${context.teamB.name}` : "pendientes"}
        </span>
        <span>Fecha {context.startTime ? formatDate(context.startTime) : "pendiente"}</span>
        <span>Deporte futbol</span>
        <span>Liga {context.league ?? "no disponible"}</span>
        <span>Confianza {readiness.level === "ready" ? "media" : readiness.level === "partial" ? "baja" : "pendiente"}</span>
      </div>
      <div className="data-health-notes">
        <span className={readiness.hasTeams ? "badge external-hint" : "badge muted"}>
          Equipos: {readiness.hasTeams ? "disponibles" : "pendientes"}
        </span>
        <span className={readiness.hasDate ? "badge external-hint" : "badge muted"}>
          Fecha: {readiness.hasDate ? "disponible" : "pendiente"}
        </span>
        <span className={readiness.hasLeague ? "badge external-hint" : "badge muted"}>
          Liga: {readiness.hasLeague ? "disponible" : "pendiente"}
        </span>
        {readiness.missing.slice(0, 5).map((reason) => (
          <span className="badge muted" key={reason}>{reason}</span>
        ))}
      </div>
    </div>
  );
}

function ExternalResearchBlock({ item }: { item: MarketOverviewItem }) {
  const coverage = getResearchCoverage(item, []);
  return (
    <div className="empty-state compact">
      <strong>Investigacion externa</strong>
      <p>
        PolySignal todavia no tiene investigacion externa suficiente para este mercado.
        Por eso no muestra una estimacion propia.
      </p>
      <div className="data-health-notes">
        <span className="badge muted">{coverage.label}</span>
        <span className="badge muted">Fuentes verificadas: {coverage.verifiedVisibleCount}</span>
        {coverage.categories.slice(0, 6).map((category) => (
          <span
            className={category.status === "available" ? "badge external-hint" : "badge muted"}
            key={category.id}
          >
            {category.label}: {category.status === "available" ? "disponible" : category.status === "partial" ? "parcial" : "pendiente"}
          </span>
        ))}
      </div>
      <p className="section-note">
        No hay noticias, lesiones, forma reciente ni odds externas verificadas cargadas para este mercado.
      </p>
    </div>
  );
}

function WalletIntelligenceBlock({ item }: { item: MarketOverviewItem }) {
  const summary = getWalletIntelligenceSummary(item);
  const readiness = getWalletIntelligenceReadiness(item);
  const reading = getWalletSignalSummary(summary);
  const topWallets = summary.topWallets ?? [];
  return (
    <div className="wallet-signal-panel empty-state compact">
      <div className="wallet-signal-heading">
        <div>
          <strong>Inteligencia de billeteras</strong>
          <p>{reading.explanation}</p>
        </div>
        <span className={summary.available ? "badge external-hint" : "badge muted"}>
          {summary.available ? "Read-only conectado" : "Pendiente"}
        </span>
      </div>
      {summary.available ? (
        <div className="wallet-signal-hero">
          <span>{reading.auxiliaryLabel}</span>
          <strong>{reading.headline}</strong>
          <small>{reading.confidenceLabel}</small>
        </div>
      ) : (
        <p>
          No hay suficientes datos publicos de billeteras para este mercado. PolySignal
          puede revisar wallets publicas con movimientos relevantes de $100 o mas cuando
          la fuente estructurada traiga actividad.
        </p>
      )}
      <div className="analysis-stat-grid wallet-signal-summary">
        <div>
          <span>Billeteras relevantes</span>
          <strong>{summary.relevantWalletsCount}</strong>
        </div>
        <div>
          <span>Umbral usado</span>
          <strong>${summary.thresholdUsd}+</strong>
        </div>
        <div>
          <span>Sesgo observado</span>
          <strong>{reading.biasLabel}</strong>
        </div>
        <div>
          <span>Confianza</span>
          <strong>{reading.confidenceLabel}</strong>
        </div>
        {summary.analyzedCapitalUsd !== undefined ? (
          <div>
            <span>Capital observado</span>
            <strong>{formatUsd(summary.analyzedCapitalUsd)}</strong>
          </div>
        ) : null}
        {summary.yesCapitalUsd !== undefined ? (
          <div>
            <span>Capital YES</span>
            <strong>{formatUsd(summary.yesCapitalUsd)}</strong>
          </div>
        ) : null}
        {summary.noCapitalUsd !== undefined ? (
          <div>
            <span>Capital NO</span>
            <strong>{formatUsd(summary.noCapitalUsd)}</strong>
          </div>
        ) : null}
      </div>
      <div className="data-health-notes">
        {readiness.checklist.slice(0, 5).map((item) => (
          <span className={item.available ? "badge external-hint" : "badge muted"} key={item.label}>
            {item.label}: {item.available ? "disponible" : "pendiente"}
          </span>
        ))}
      </div>
      {topWallets.length > 0 ? (
        <div className="wallet-activity-list compact">
          <h4>Billeteras destacadas</h4>
          {topWallets.slice(0, 5).map((wallet) => (
            <article className="wallet-activity-card compact" key={`${wallet.shortAddress}-${wallet.side}-${wallet.amountUsd}`}>
              <div className="wallet-activity-heading">
                <strong>{wallet.shortAddress}</strong>
                <span>{wallet.side === "UNKNOWN" ? "lado no confirmado" : wallet.side}</span>
              </div>
              <div className="wallet-activity-metrics">
                <span>{formatUsd(wallet.amountUsd)}</span>
                {typeof wallet.unrealizedPnlUsd === "number" ? (
                  <span>PnL publico {formatUsd(wallet.unrealizedPnlUsd)}</span>
                ) : null}
                <span>Senal auxiliar</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {reading.warnings.length > 0 ? (
        <div className="wallet-warning-list">
          {reading.warnings.slice(0, 4).map((warning) => (
            <span className="warning-chip" key={warning}>
              {warning}
            </span>
          ))}
        </div>
      ) : null}
      <p className="section-note">
        Esta senal usa actividad publica de wallets y no intenta identificar personas reales.
        Wallet Intelligence ayuda a contextualizar el mercado, pero no basta para una estimacion propia.
      </p>
      <p className="section-note">
        {summary.available
          ? "No se muestra ROI ni tasa de acierto si no hay historial cerrado confiable."
          : summary.reason}
      </p>
    </div>
  );
}

function profileAlertTypeLabel(type: ProfileAlert["type"]): string {
  if (type === "high_winrate_profile_seen") {
    return "Perfil con winRate alto volvio a aparecer";
  }
  if (type === "large_position_detected") {
    return "Wallet destacada con posición relevante";
  }
  if (type === "new_market_activity") {
    return "Nueva actividad publica relevante";
  }
  if (type === "profile_refresh_change") {
    return "Cambio al actualizar perfil";
  }
  return "Perfil destacado detectado";
}

function ProfileAlertsBlock({
  alerts,
  onOpenWalletDetails,
}: {
  alerts: ProfileAlert[];
  onOpenWalletDetails: () => void;
}) {
  if (alerts.length === 0) {
    return null;
  }
  return (
    <section className="profile-alerts-panel" aria-label="Alertas de perfiles">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Alertas de perfiles</p>
          <h3>Perfiles destacados en este análisis</h3>
          <p>
            Coincidencias con perfiles públicos destacados detectadas en Wallet Intelligence.
            No son recomendaciones de operacion.
          </p>
        </div>
        <a className="analysis-link secondary" href="/alerts">
          Ver alertas
        </a>
      </div>
      <div className="profile-alerts-list compact">
        {alerts.slice(0, 4).map((alert) => (
          <article className={`profile-alert-card ${alert.severity}`} key={alert.id}>
            <div className="profile-alert-card-header">
              <span className="profile-avatar" aria-hidden="true">
                {alert.profileImageUrl ? <img alt="" src={alert.profileImageUrl} /> : alert.shortAddress.slice(2, 3).toUpperCase()}
              </span>
              <div>
                <strong>{profileAlertTypeLabel(alert.type)}</strong>
                <span>{alert.pseudonym || alert.shortAddress}</span>
              </div>
              <span className={`badge ${alert.severity === "important" ? "external-hint" : "muted"}`}>
                {alert.severity === "important" ? "Importante" : alert.severity === "watch" ? "Observar" : "Info"}
              </span>
            </div>
            <p>{alert.reason}</p>
            <div className="profile-alert-metrics">
              <span>Outcome {alert.outcome || "No disponible"}</span>
              <span>Monto {formatUsd(alert.amountUsd)}</span>
              <span>Posicion {alert.positionSize !== null ? formatMetric(alert.positionSize) : "sin dato"}</span>
              <span>Win rate {formatPercentValue(alert.winRate)}</span>
              <span>Cerrados {alert.closedMarkets ?? "sin dato"}</span>
            </div>
            <div className="profile-alert-actions">
              {alert.profileUrl ? (
                <a href={alert.profileUrl} rel="noopener noreferrer" target="_blank">
                  Ver perfil público
                </a>
              ) : null}
              {alert.marketUrl ? (
                <a href={alert.marketUrl} rel="noopener noreferrer" target="_blank">
                  Ver mercado
                </a>
              ) : null}
              <button onClick={onOpenWalletDetails} type="button">
                Ver billeteras
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function mergeProfileAlertsForRun(existing: ProfileAlert[], created: ProfileAlert[]): ProfileAlert[] {
  const byId = new Map<string, ProfileAlert>();
  for (const alert of [...created, ...existing]) {
    byId.set(alert.id, alert);
  }
  return [...byId.values()]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8);
}

function analyzerStatusLabel(status: AnalyzerResult["layers"][number]["status"]): string {
  if (status === "available") {
    return "Disponible";
  }
  if (status === "partial") {
    return "Parcial";
  }
  if (status === "pending") {
    return "Pendiente";
  }
  if (status === "error") {
    return "No consultado";
  }
  return "No disponible";
}

function historyDecisionLabel(item: AnalysisHistoryItem): string {
  if (item.decision === "clear" && (item.predictedSide === "YES" || item.predictedSide === "NO")) {
    return `Prediccion clara ${item.predictedSide}`;
  }
  if (item.decision === "weak") {
    return "Sin decision fuerte";
  }
  if (item.estimateQuality === "market_price_only") {
    return "Solo probabilidad de mercado";
  }
  return "Sin estimacion PolySignal";
}

function historyResultLabel(item: AnalysisHistoryItem): string {
  if (item.result === "hit") {
    return "Acerto";
  }
  if (item.result === "miss") {
    return "Fallo";
  }
  if (item.result === "cancelled") {
    return "Cancelado";
  }
  if (item.result === "unknown") {
    return "Desconocido";
  }
  return "Pendiente";
}

function AnalyzerSummaryBlock({ result }: { result: AnalyzerResult }) {
  const summary = getAnalyzerSummary(result);
  return (
    <section className="analyzer-center-summary" aria-label="Resumen del centro de analisis">
      <div>
        <p className="eyebrow">Centro de analisis</p>
        <h4>Que encontro PolySignal</h4>
        <strong>{summary.headline}</strong>
        <p>{summary.detail}</p>
      </div>
      <div className="analyzer-summary-columns">
        <div>
          <span>Encontrado</span>
          <ul>
            {summary.found.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Falta o esta pendiente</span>
          <ul>
            {summary.missing.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Que puedes hacer ahora</span>
          <ul>
            {summary.nextSteps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AnalyzerLayersBlock({ result }: { result: AnalyzerResult }) {
  return (
    <section className="analyzer-layers-section" aria-label="Capas de analisis revisadas">
      <div className="probability-display-heading">
        <h4>Capas revisadas</h4>
        <span>Lectura responsable</span>
      </div>
      <div className="analyzer-layer-grid">
        {result.layers.map((layer) => (
          <article className={`analyzer-layer-card ${layer.status}`} key={layer.id}>
            <div>
              <strong>{layer.label}</strong>
              <span>{analyzerStatusLabel(layer.status)}</span>
            </div>
            <p>{layer.summary}</p>
            {layer.warnings.length > 0 ? (
              <small>{layer.warnings.slice(0, 2).join(" | ")}</small>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function RelatedHistoryBlock({ items }: { items: AnalysisHistoryItem[] }) {
  const latest = items[0];
  return (
    <section className="related-history-panel" aria-label="Historial relacionado">
      <div className="probability-display-heading">
        <h4>Historial relacionado</h4>
        <span>{items.length > 0 ? `${items.length} analisis` : "Sin historial"}</span>
      </div>
      {latest ? (
        <div className="related-history-card">
          <div>
            <strong>Ya analizaste este mercado</strong>
            <span>{formatDate(latest.analyzedAt)}</span>
          </div>
          <div className="data-health-notes">
            <span className="badge">{historyDecisionLabel(latest)}</span>
            <span className="badge muted">{historyResultLabel(latest)}</span>
            {latest.resolutionSource && latest.resolutionSource !== "unknown" ? (
              <span className="badge external-hint">Verificado</span>
            ) : null}
          </div>
          <p className="section-note">
            Puedes guardar una nueva lectura si quieres dejar constancia de una revision mas reciente.
          </p>
        </div>
      ) : (
        <div className="empty-state compact">
          <strong>Este mercado aun no esta en tu historial.</strong>
          <p>Si guardas el analisis, quedara como lectura local de este navegador.</p>
        </div>
      )}
    </section>
  );
}

function matchStrengthLabel(strength: MatchResult["strength"]): string {
  if (strength === "exact") {
    return "Exacta";
  }
  if (strength === "strong") {
    return "Fuerte";
  }
  if (strength === "possible") {
    return "Posible";
  }
  if (strength === "weak") {
    return "Debil";
  }
  return "Descartada";
}

function marketGroupLabel(match: MatchResult): string {
  const text = `${match.title} ${match.marketSlug ?? ""}`.toLowerCase();
  if (/\b(o\/u|over|under|total)\b/.test(text)) {
    return "Total";
  }
  if (/\b(spread|handicap)\b|\([+-]?\d/.test(text)) {
    return "Spread";
  }
  if (/\b(draw|empate|win|winner|moneyline)\b|\bvs\.?\b/.test(text)) {
    return "Ganador";
  }
  return "Otros";
}

function searchableMarketText(match: MatchResult): string {
  return [
    match.title,
    match.eventTitle,
    match.marketSlug,
    match.eventSlug,
    marketGroupLabel(match),
    outcomeSummary(match.item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function MarketSelectionPanel({
  busy,
  matches,
  message,
  normalizedUrl,
  onAnalyze,
  onReviewLink,
  onRetry,
  onSavePending,
  status,
}: {
  busy: boolean;
  matches: MatchResult[];
  message: string;
  normalizedUrl: string;
  onAnalyze: (match: MatchResult) => void;
  onReviewLink: () => void;
  onRetry: () => void;
  onSavePending: () => void;
  status: "needs_selection" | "no_exact_match";
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const linkInfo = useMemo(() => parsePolymarketLink(normalizedUrl), [normalizedUrl]);
  const recommended =
    matches.length === 1 &&
    (matches[0].strength === "exact" || matches[0].strength === "strong");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMatches = useMemo(() => {
    if (!normalizedQuery) {
      return matches;
    }
    return matches.filter((match) => searchableMarketText(match).includes(normalizedQuery));
  }, [matches, normalizedQuery]);
  const selectionLimit = matches.length > 8 ? 8 : 5;
  const visibleMatches = showAll ? filteredMatches : filteredMatches.slice(0, selectionLimit);
  const title =
    status === "needs_selection"
      ? "Confirma que mercado quieres analizar"
      : "No encontramos una coincidencia exacta";
  const copy =
    status === "needs_selection"
      ? recommended
        ? "Polymarket devolvio una opcion recomendada para este enlace. Confirma antes de preparar la lectura profunda."
        : "Polymarket devolvio estas opciones para el evento real del enlace. Elige una para preparar una sola lectura profunda."
      : "No usamos mercados internos como alternativa. Puedes guardar el enlace como pendiente o revisarlo.";
  return (
    <section className="dashboard-panel analyzer-selection-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Detectar -&gt; Confirmar -&gt; Analizar</p>
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
        <span className="badge muted">
          {recommended ? "Seleccion recomendada" : `${matches.length} opciones`}
        </span>
      </div>
      <div className="empty-state compact">
        <strong>{copy}</strong>
        <p>
          Enlace normalizado: <span>{normalizedUrl}</span>
        </p>
        {linkInfo ? (
          <div className="data-health-notes">
            {linkInfo.category ? <span className="badge muted">Categoria {linkInfo.category}</span> : null}
            {linkInfo.sportOrLeague ? <span className="badge muted">Deporte/liga {linkInfo.sportOrLeague}</span> : null}
            {linkInfo.rawSlug ? <span className="badge muted">Slug {linkInfo.rawSlug}</span> : null}
          </div>
        ) : null}
      </div>
      {matches.length > 0 ? (
        <>
          {matches.length > 8 ? (
            <label className="analyzer-selection-search">
              Buscar dentro del evento
              <input
                aria-label="Buscar mercado dentro del evento"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowAll(false);
                }}
                placeholder="Ganador, spread, total, equipo..."
                value={query}
              />
            </label>
          ) : null}
          <div className="analyzer-selection-list">
            {visibleMatches.map((match) => {
              const statusInfo = getPublicMarketStatus(insightInput(match.item));
              return (
                <article className="analyzer-selection-card" key={`${match.marketId}-${match.score}`}>
                  <div>
                    <span className={`market-status-badge ${statusInfo.tone}`}>{statusInfo.label}</span>
                    <span className="badge muted">{matchStrengthLabel(match.strength)} - score {match.score}</span>
                    <span className="badge muted">{marketGroupLabel(match)}</span>
                    {recommended ? <span className="badge external-hint">Recomendado</span> : null}
                  </div>
                  <h3>{match.title}</h3>
                  <p>{match.eventTitle || eventTitle(match.item)}</p>
                  <div className="history-card-metrics">
                    <span>Fecha {formatDate(latestUpdate(match.item))}</span>
                    <span>{outcomeSummary(match.item)}</span>
                    <span>Volumen {formatMetric(match.item.latest_snapshot?.volume)}</span>
                    <span>Liquidez {formatMetric(match.item.latest_snapshot?.liquidity)}</span>
                  </div>
                  <div className="data-health-notes">
                    {match.reasons.slice(0, 3).map((reason) => (
                      <span className="badge" key={reason}>{reason}</span>
                    ))}
                    {match.warnings.slice(0, 2).map((warning) => (
                      <span className="badge muted" key={warning}>{warning}</span>
                    ))}
                  </div>
                  <div className="watchlist-actions">
                    <button
                      className="watchlist-button active"
                      disabled={busy}
                      onClick={() => onAnalyze(match)}
                      type="button"
                    >
                      Analizar este mercado
                    </button>
                    {match.item.market?.id ? (
                      <a className="analysis-link secondary" href={`/markets/${match.item.market.id}`}>
                        Ver detalle
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {filteredMatches.length === 0 ? (
            <div className="empty-state compact">
              <strong>No hay mercados que coincidan con ese filtro.</strong>
              <p>La busqueda solo filtra las opciones que Polymarket devolvio para este evento.</p>
            </div>
          ) : null}
          {filteredMatches.length > selectionLimit ? (
            <button
              className="watchlist-button"
              onClick={() => setShowAll((current) => !current)}
              type="button"
            >
              {showAll ? "Mostrar menos" : `Ver mas mercados (${filteredMatches.length - selectionLimit})`}
            </button>
          ) : null}
        </>
      ) : (
        <div className="empty-state compact">
          <strong>No pudimos obtener este mercado desde Polymarket.</strong>
          <p>
            No vamos a buscar un mercado parecido en los datos internos ni a mezclar deportes.
            Puedes guardar el enlace como pendiente sin inventar mercado, fecha ni precio.
          </p>
          <div className="watchlist-actions">
            <button
              className="watchlist-button"
              disabled={busy}
              onClick={onRetry}
              type="button"
            >
              Intentar de nuevo
            </button>
            <button
              className="watchlist-button"
              disabled={busy}
              onClick={onSavePending}
              type="button"
            >
              Guardar como pendiente
            </button>
            <button
              className="watchlist-button"
              disabled={busy}
              onClick={onReviewLink}
              type="button"
            >
              Revisar enlace
            </button>
            <a className="analysis-link secondary" href={normalizedUrl} rel="noreferrer" target="_blank">
              Abrir Polymarket
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function MatchCard({
  busy,
  item,
  matchScore,
  normalizedUrl,
  onSaveHistory,
  onToggleWatchlist,
  relatedHistory,
  saved,
  watchlisted,
}: {
  busy: boolean;
  item: MarketOverviewItem;
  matchScore: number;
  normalizedUrl: string;
  onSaveHistory: (item: MarketOverviewItem) => void;
  onToggleWatchlist: (item: MarketOverviewItem) => void;
  relatedHistory: AnalysisHistoryItem[];
  saved: boolean;
  watchlisted: boolean;
}) {
  const input = insightInput(item);
  const status = getPublicMarketStatus(input);
  const reason = getMarketReviewReason(input);
  const activity = getMarketActivityLabel(input);
  const estimateQuality = getEstimateQuality(item);
  const estimateResult = getPolySignalEstimate(item);
  const realPolySignalProbabilities = getRealPolySignalProbabilities(item);
  const probabilityState = getProbabilityDisplayState({
    marketNoPrice: item.latest_snapshot?.no_price,
    marketYesPrice: item.latest_snapshot?.yes_price,
    polySignalNoProbability: realPolySignalProbabilities?.no,
    polySignalYesProbability: realPolySignalProbabilities?.yes,
  });
  const decision = getPolySignalDecision({
    polySignalNoProbability: probabilityState.polySignal?.no,
    polySignalYesProbability: probabilityState.polySignal?.yes,
  });
  const analyzerResult = buildAnalyzerResult({
    item,
    matchScore,
    normalizedUrl,
    relatedHistory,
    url: normalizedUrl,
  });
  const analyzerDecision = getAnalyzerDecisionCopy(analyzerResult);
  return (
    <article className="analyze-result-card">
      <div className="history-card-header">
        <div>
          <span className={`market-status-badge ${status.tone}`}>{status.label}</span>
          <span className={`market-intent-badge ${reason.tone}`}>{reason.label}</span>
          {activity ? <span className={`market-activity-badge ${activity.tone}`}>{activity.label}</span> : null}
        </div>
        <span className="timestamp-pill">{formatDate(latestUpdate(item))}</span>
      </div>
      <div className="analyzer-result-hero">
        <div>
          <h3>{marketTitle(item)}</h3>
          <p className="section-note">{eventTitle(item)}</p>
          <p>{analyzerResult.decisionReason}</p>
        </div>
        <div className="data-health-notes">
          <span className="badge">Confianza match: {analyzerResult.matchConfidence}</span>
          {analyzerResult.matchedMarketId ? (
            <span className="badge muted">Market ID {analyzerResult.matchedMarketId}</span>
          ) : null}
          <span className={analyzerResult.canCountForAccuracy ? "badge external-hint" : "badge muted"}>
            {analyzerResult.canCountForAccuracy ? "Puede contar luego" : "No cuenta todavia"}
          </span>
        </div>
      </div>
      <AnalyzerSummaryBlock result={analyzerResult} />
      <div className="probability-display-panel">
        <div className="probability-display-heading">
          <h4>Lectura del mercado</h4>
          <span>YES / NO</span>
        </div>
        <div className="probability-display-grid">
          <div className="probability-display-card">
            <span>Probabilidad del mercado</span>
            {probabilityState.market ? (
              <div className="probability-values">
                <strong>YES {formatPublicProbability(probabilityState.market.yes)}</strong>
                <strong>NO {formatPublicProbability(probabilityState.market.no)}</strong>
              </div>
            ) : (
              <p>No hay precio visible suficiente para calcularlo.</p>
            )}
            <small>{probabilityState.marketDetail}</small>
          </div>
          <div className="probability-display-card muted">
            <span>Estimacion PolySignal</span>
            {probabilityState.polySignal ? (
              <div className="probability-values">
                <strong>YES {formatPublicProbability(probabilityState.polySignal.yes)}</strong>
                <strong>NO {formatPublicProbability(probabilityState.polySignal.no)}</strong>
              </div>
            ) : (
              <p>Aun no hay estimacion PolySignal suficiente para este mercado.</p>
            )}
            <small>
              {probabilityState.polySignal
                ? probabilityState.polySignalDetail
                : "Por ahora solo mostramos la probabilidad del mercado. Este analisis no contara para precision hasta que exista una estimacion propia clara."}
            </small>
          </div>
        </div>
        {probabilityState.gap ? (
          <p className="probability-gap-note">{probabilityState.gap.label}</p>
        ) : null}
        <div className={`probability-decision-card ${decision.decision}`}>
          <span>Decision de PolySignal</span>
          <strong>{analyzerDecision.label}</strong>
          <p>{analyzerDecision.detail}</p>
          <small>{analyzerDecision.note}</small>
        </div>
        <p className="section-note">{probabilityState.disclaimer}</p>
        <div className="empty-state compact">
          <strong>Preparacion de estimacion PolySignal</strong>
          <p>
            PolySignal necesita senales independientes para mostrar una estimacion propia. Si solo
            tenemos el precio del mercado, lo mostramos como referencia, pero no lo contamos como prediccion.
          </p>
          <EstimateReadinessBlock item={item} />
          <p className="section-note">Estado actual: {getEstimateQualityLabel(estimateQuality)}.</p>
          <p className="section-note">Motor v0: {estimateResult.reason}</p>
          <p className="section-note">
            Preparacion de datos no es probabilidad de ganar ni recomendacion.
          </p>
        </div>
      </div>
      <AnalyzerLayersBlock result={analyzerResult} />
      <section className="analyzer-depth-section" aria-label="Capas profundas del analisis">
        <div className="probability-display-heading">
          <h4>Lectura por capas</h4>
          <span>Datos reales y pendientes</span>
        </div>
        <SoccerContextBlock item={item} />
        <ExternalResearchBlock item={item} />
        <WalletIntelligenceBlock item={item} />
        <RelatedHistoryBlock items={relatedHistory} />
      </section>
      <div className="history-card-metrics">
        <span>Precio Si {formatPublicProbability(item.latest_snapshot?.yes_price)}</span>
        <span>Precio No {formatPublicProbability(item.latest_snapshot?.no_price)}</span>
        <span>Volumen {formatMetric(item.latest_snapshot?.volume)}</span>
        <span>Liquidez {formatMetric(item.latest_snapshot?.liquidity)}</span>
        <span>
          PolySignal YES {probabilityState.polySignal ? formatPublicProbability(probabilityState.polySignal.yes) : "sin estimacion"}
        </span>
      </div>
      <div className="watchlist-actions">
        <button
          className={`watchlist-button ${saved ? "active" : ""}`}
          disabled={busy}
          onClick={() => onSaveHistory(item)}
          type="button"
        >
          {saved ? "Guardar nueva lectura" : "Guardar analisis"}
        </button>
        <button
          className={`watchlist-button ${watchlisted ? "active" : ""}`}
          disabled={busy}
          onClick={() => onToggleWatchlist(item)}
          type="button"
        >
          {watchlisted ? "En seguimiento local" : "Seguir en local"}
        </button>
        {item.market?.id ? (
          <a className="analysis-link" href={`/markets/${item.market.id}`}>
            Ver detalle
          </a>
        ) : null}
        <a className="analysis-link secondary" href="/analyze">
          Analizar otro enlace
        </a>
      </div>
    </article>
  );
}

function previewPropsForState({
  deepAnalysisJob,
  state,
}: {
  deepAnalysisJob?: DeepAnalysisJob | null;
  state: SearchState;
}): AnalysisPreviewProps {
  if (state.status === "result") {
    const marketProbability = getMarketImpliedProbabilities({
      marketNoPrice: state.match.item.latest_snapshot?.no_price,
      marketYesPrice: state.match.item.latest_snapshot?.yes_price,
    });
    const polySignalProbability = getRealPolySignalProbabilities(state.match.item);
    const warnings = [
      ...state.match.warnings,
      ...(deepAnalysisJob?.steps ?? [])
        .filter((step) => step.status === "blocked")
        .map((step) => step.summary || step.label),
    ].filter(Boolean);
    return {
      marketProbability: marketProbability ? marketProbability.yes * 100 : null,
      marketProbabilityCopy: marketProbability
        ? `Precio visible: YES ${formatPublicProbability(marketProbability.yes)} / NO ${formatPublicProbability(marketProbability.no)}.`
        : "Se mostrará al detectar el mercado.",
      polySignalCopy: polySignalProbability
        ? `Estimación real disponible: YES ${formatPublicProbability(polySignalProbability.yes)} / NO ${formatPublicProbability(polySignalProbability.no)}.`
        : "Disponible solo con señales suficientes.",
      polySignalReady: Boolean(polySignalProbability),
      riskCopy: warnings[0] || "Samantha revisará riesgos relevantes.",
      riskTone: warnings.length > 0 ? "warning" : "neutral",
      samanthaCopy:
        deepAnalysisJob?.status === "completed"
          ? "Reporte validado y listo para revisar."
          : jobAwaitsResearch(deepAnalysisJob)
            ? "Lectura parcial hasta que haya fuentes automaticas suficientes."
            : "Lectura clara en 2–3 líneas.",
    };
  }

  if (state.status === "invalid") {
    return {
      marketProbability: null,
      marketProbabilityCopy: "Se mostrará al detectar el mercado.",
      polySignalCopy: "Disponible solo con señales suficientes.",
      riskCopy: "Revisa que el enlace sea de Polymarket y esté completo.",
      riskTone: "warning",
      samanthaCopy: "Lectura clara en 2–3 líneas.",
    };
  }

  if (state.status === "needs_selection" || state.status === "no_exact_match") {
    return {
      marketProbability: null,
      marketProbabilityCopy: "Se mostrará al confirmar un mercado.",
      polySignalCopy: "Disponible solo con señales suficientes.",
      riskCopy:
        state.status === "no_exact_match"
          ? "No se encontró mercado validable; no se inventan datos."
          : "Samantha revisará riesgos relevantes.",
      riskTone: state.status === "no_exact_match" ? "warning" : "neutral",
      samanthaCopy: "Confirma un mercado para preparar la lectura.",
    };
  }

  return {
    marketProbability: null,
    marketProbabilityCopy: "Se mostrará al detectar el mercado.",
    polySignalCopy: "Disponible solo con señales suficientes.",
    riskCopy: "Samantha revisará riesgos relevantes.",
    samanthaCopy: "Lectura clara en 2–3 líneas.",
  };
}

export default function AnalyzePage() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<AnalyzeLoadingPhase>("validating");
  const [analysisHistoryItems, setAnalysisHistoryItems] = useState<AnalysisHistoryItem[]>([]);
  const [savedHistoryKeys, setSavedHistoryKeys] = useState<Set<string>>(new Set());
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [deepAnalysisJob, setDeepAnalysisJob] = useState<DeepAnalysisJob | null>(null);
  const [analysisAgent, setAnalysisAgent] = useState({ id: "samantha", name: "Samantha" });
  const [samanthaAutoReportResult, setSamanthaAutoReportResult] =
    useState<SamanthaResearchParseResult | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null);
  const [progressElapsedSeconds, setProgressElapsedSeconds] = useState(0);
  const [progressIssue, setProgressIssue] = useState<AnalyzeProgressIssue>(null);
  const [progressStepOverrides, setProgressStepOverrides] = useState<AnalyzeProgressStepOverrides>({});
  const [marketDetailsItem, setMarketDetailsItem] = useState<MarketOverviewItem | null>(null);
  const [marketDetailsOpen, setMarketDetailsOpen] = useState(false);
  const [walletDetailsSummary, setWalletDetailsSummary] = useState<WalletIntelligenceSummary | null>(null);
  const [walletDetailsOpen, setWalletDetailsOpen] = useState(false);
  const [profileAlerts, setProfileAlerts] = useState<ProfileAlert[]>([]);
  const [lastWorkingUrl, setLastWorkingUrl] = useState("");
  const analysisRunRef = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);

  const watchlistByMarketId = useMemo(() => {
    return new Set(watchlistItems.map((item) => item.market_id));
  }, [watchlistItems]);

  useEffect(() => {
    void fetchWatchlistItems().then(setWatchlistItems);
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/analysis-agent/config", {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      method: "GET",
      redirect: "error",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: AnalysisAgentConfigRouteResult | null) => {
        if (!mounted || !config) {
          return;
        }
        setAnalysisAgent({
          id: config.agentId || "samantha",
          name: config.agentName || "Samantha",
        });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const refreshHistory = () => {
      void getAnalysisHistory().then((items) => {
        if (mounted) {
          setAnalysisHistoryItems(items);
        }
      });
    };
    refreshHistory();
    window.addEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, refreshHistory);
    window.addEventListener("storage", refreshHistory);
    return () => {
      mounted = false;
      window.removeEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, refreshHistory);
      window.removeEventListener("storage", refreshHistory);
    };
  }, []);

  useEffect(() => {
    const refreshJobs = () => {
      if (deepAnalysisJob) {
        setDeepAnalysisJob(getDeepAnalysisJob(deepAnalysisJob.id));
      }
    };
    window.addEventListener(DEEP_ANALYSIS_JOB_STORAGE_EVENT, refreshJobs);
    window.addEventListener("storage", refreshJobs);
    return () => {
      window.removeEventListener(DEEP_ANALYSIS_JOB_STORAGE_EVENT, refreshJobs);
      window.removeEventListener("storage", refreshJobs);
    };
  }, [deepAnalysisJob]);

  useEffect(() => {
    if (progressStartedAt === null) {
      setProgressElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => {
      setProgressElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - progressStartedAt) / 1000)),
      );
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [progressStartedAt]);

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get("url");
    const queryJobId = params.get("job");
    if (queryJobId) {
      const storedJob = getDeepAnalysisJob(queryJobId);
      if (storedJob) {
        setDeepAnalysisJob(storedJob);
      }
    }
    if (queryUrl) {
      setInput(queryUrl);
      if (params.get("auto") === "1") {
        window.setTimeout(() => {
          void runAnalysis(queryUrl);
        }, 0);
      }
    }
    // This effect intentionally runs once to support smoke-test URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistDeepAnalysisJob = useCallback((job: DeepAnalysisJob): DeepAnalysisJob => {
    const stored = saveDeepAnalysisJob(job) ?? job;
    setDeepAnalysisJob(stored);
    return stored;
  }, []);

  const tryAutomaticAnalysisAgentBridge = useCallback(
    async (input: {
      isCurrentRun: () => boolean;
      item: AnalyzeMarketItem;
      job: DeepAnalysisJob;
      normalizedUrl: string;
      signal: AbortSignal;
      walletSummary: WalletIntelligenceSummary;
    }): Promise<{ job: DeepAnalysisJob; message: string; reportResult: SamanthaResearchParseResult | null }> => {
      let job = persistDeepAnalysisJob(markJobSendingToSamantha(input.job, {
        agentId: analysisAgent.id,
        agentName: analysisAgent.name,
      }));
      if (!input.isCurrentRun()) {
        return {
          job,
          message: `El analisis cambio antes de enviar a ${analysisAgent.name}.`,
          reportResult: null,
        };
      }
      try {
        const brief = buildSamanthaResearchBrief({
          item: input.item,
          normalizedUrl: input.normalizedUrl,
          url: input.normalizedUrl,
          walletSummary: input.walletSummary,
        });
        const response = await withRequestTimeout(
          ANALYSIS_AGENT_TIMEOUT_MS,
          input.signal,
          "analysis_agent_timeout",
          (signal) =>
            fetch("/api/analysis-agent/send-research", {
              body: JSON.stringify({
                brief,
                deepAnalysisJobId: job.id,
                normalizedUrl: input.normalizedUrl,
              }),
              cache: "no-store",
              credentials: "omit",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              method: "POST",
              redirect: "error",
              signal,
            }),
        );
        const result = (await response.json().catch(() => ({}))) as AnalysisAgentRouteResult;
        const agentId = result.agentId || analysisAgent.id;
        const agentName = result.agentName || analysisAgent.name;
        if (result.agentName && result.agentName !== analysisAgent.name) {
          setAnalysisAgent({ id: agentId, name: agentName });
        }
        if (!input.isCurrentRun()) {
          return {
            job,
            message: `El analisis cambio antes de recibir respuesta de ${agentName}.`,
            reportResult: null,
          };
        }
        if (!response.ok || result.fallbackRequired || result.status === "disabled" || result.status === "fallback_required") {
          const reason =
            !result.reason || /bridge|fallback/i.test(result.reason)
              ? `${agentName} automatico no esta conectado todavia; prepararemos una lectura parcial con las fuentes disponibles.`
              : result.reason;
          job = persistDeepAnalysisJob(
            markJobSamanthaBridgeFallback(job, {
              agentId,
              agentName,
              automaticAvailable: result.automaticAvailable,
              reason,
              warnings: result.warnings ?? result.validationErrors ?? [],
            }),
          );
          return {
            job,
            message: reason,
            reportResult: null,
          };
        }
        if (result.report) {
          job = persistDeepAnalysisJob(markJobReceivingSamanthaReport(job, { agentId, agentName }));
          job = persistDeepAnalysisJob(markJobValidatingSamanthaReport(job));
          const reportResult = parseSamanthaResearchReport(result.report);
          if (!reportResult.valid || !reportResult.report) {
            const reason =
              reportResult.errors[0] ||
              `${agentName} devolvio un reporte, pero no paso la validacion PolySignal.`;
            job = persistDeepAnalysisJob(
              markJobSamanthaBridgeFallback(job, {
                agentId,
                agentName,
                automaticAvailable: true,
                reason,
                warnings: reportResult.errors.slice(0, 4),
              }),
            );
            return {
              job,
              message: reason,
              reportResult,
            };
          }
          job = persistDeepAnalysisJob(
            markJobSamanthaReportLoaded(job, {
              acceptedEstimate: buildConservativePolySignalEstimate({
                marketImpliedProbability: getMarketImpliedProbabilities({
                  marketNoPrice: input.item.latest_snapshot?.no_price,
                  marketYesPrice: input.item.latest_snapshot?.yes_price,
                }),
                samanthaReport: reportResult.report,
                walletSignal: input.walletSummary,
              }).countsForHistoryAccuracy,
              agentId,
              agentName,
              kalshiEquivalent:
                reportResult.report.kalshiComparison?.found === true &&
                reportResult.report.kalshiComparison.equivalent === true,
              oddsFound: reportResult.report.oddsComparison?.found === true,
              reportStatus: reportResult.report.status,
              signalCount: convertSamanthaReportToSignals(reportResult.report).length,
            }),
          );
          return {
            job,
            message: `${agentName} devolvio un reporte validado; PolySignal actualizo las senales del job.`,
            reportResult,
          };
        }
        job = persistDeepAnalysisJob(
          markJobSamanthaResearching(job, {
            agentId,
            agentName,
            reason: result.reason || `${agentName} recibio la tarea; la investigacion sigue pendiente.`,
            taskId: result.taskId,
          }),
        );
        return {
          job,
          message: result.reason || `${agentName} recibio la tarea; esperando reporte estructurado.`,
          reportResult: null,
        };
      } catch (error) {
        if (isAnalyzeCancelled(error)) {
          return {
            job,
            message: `El analisis se cancelo antes de recibir respuesta de ${analysisAgent.name}.`,
            reportResult: null,
          };
        }
        const reason = isAnalyzeTimeout(error)
          ? `${analysisAgent.name} esta tardando mas de lo normal; puedes guardar la lectura parcial o volver a consultar despues.`
          : `${analysisAgent.name} automatico no respondio de forma segura; la lectura queda parcial con las fuentes disponibles.`;
        job = persistDeepAnalysisJob(
          markJobSamanthaBridgeFallback(job, {
            agentId: analysisAgent.id,
            agentName: analysisAgent.name,
            automaticAvailable: true,
            reason,
          }),
        );
        return {
          job,
          message: reason,
          reportResult: null,
        };
      }
    },
    [analysisAgent, persistDeepAnalysisJob],
  );

  const runAnalysis = useCallback(async (value = input) => {
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    analysisAbortRef.current?.abort();
    const runController = new AbortController();
    analysisAbortRef.current = runController;
    const isCurrentRun = () => analysisRunRef.current === runId;
    const advancePhase = async (phase: AnalyzeLoadingPhase) => {
      if (!isCurrentRun()) {
        return false;
      }
      setLoadingPhase(phase);
      await Promise.resolve();
      return isCurrentRun();
    };

    setLoadingPhase("validating");
    const validation = getPolymarketUrlValidationMessage(value);
    setActionMessage(null);
    setSamanthaAutoReportResult(null);
    setProgressIssue(null);
    setProgressStepOverrides({});
    setMarketDetailsItem(null);
    setMarketDetailsOpen(false);
    setWalletDetailsSummary(null);
    setWalletDetailsOpen(false);
    setProfileAlerts([]);
    if (!validation.ok || !validation.normalizedUrl) {
      setProgressStartedAt(null);
      if (analysisAbortRef.current === runController) {
        analysisAbortRef.current = null;
      }
      setState({ message: validation.message, status: "invalid" });
      return;
    }
    const normalizedUrl = validation.normalizedUrl;
    setLastWorkingUrl(normalizedUrl);
    setProgressStepOverrides({
      reading_link: {
        detail: "El enlace es de Polymarket y paso validacion local.",
        status: "completed_with_data",
        statusLabel: "Validado",
        summary: "Listo para consultar Polymarket.",
      },
    });
    let job = persistDeepAnalysisJob(
      getLatestDeepAnalysisJobForUrl(normalizedUrl) ??
        createDeepAnalysisJob(normalizedUrl),
    );
    setProgressStartedAt(Date.now());
    setLoading(true);
    setState({
      message: "Resolviendo mercado o evento directamente desde Polymarket.",
      normalizedUrl,
      status: "detecting",
    });
    try {
      if (!(await advancePhase("matching"))) {
        return;
      }
      const resolved = await withRequestTimeout(
        LINK_RESOLVE_TIMEOUT_MS,
        runController.signal,
        "polymarket_link_timeout",
        (signal) => resolvePolymarketLinkForAnalyze(normalizedUrl, signal),
      );
      if (!isCurrentRun()) {
        return;
      }
      job = persistDeepAnalysisJob(
        markJobPolymarketRead(job, {
          eventSlug: resolved.eventSlug ?? resolved.event?.slug,
          marketSlug: resolved.marketSlug,
          marketTitle: resolved.event?.title,
          normalizedUrl,
        }),
      );
      if (resolved.status === "ok" && resolved.markets.length > 0) {
        const matches = buildMatchesFromPolymarketResult(resolved);
        setState({
          matches,
          message:
            matches.length > 1
              ? "Polymarket devolvio este evento con varios mercados. Selecciona uno para analizar."
              : `Mercado unico detectado. Continuamos automaticamente con Polymarket, Wallet Intelligence y ${analysisAgent.name}.`,
          normalizedUrl,
          status: "needs_selection",
        });
        setProgressStepOverrides((current) => ({
          ...current,
          detecting_market: {
            detail:
              matches.length > 1
                ? "Polymarket devolvio varias opciones reales para este evento."
                : "Polymarket devolvio un mercado unico para este enlace.",
            status: "completed_with_data",
            statusLabel: matches.length > 1 ? "Opciones encontradas" : "Mercado detectado",
            summary:
              matches.length > 1
                ? `${matches.length} opciones requieren seleccion.`
                : "Se continuara automaticamente con el mercado detectado.",
          },
        }));
        setProgressStartedAt(null);
      } else if (resolved.status === "unsupported") {
        persistDeepAnalysisJob(
          markJobFailed(
            job,
            resolved.warnings[0] || "Este tipo de enlace todavia no esta soportado.",
          ),
        );
        setState({
          matches: [],
          message:
            resolved.warnings[0] ||
            "Este tipo de enlace todavia no esta soportado por el analizador.",
          normalizedUrl,
          status: "no_exact_match",
        });
        setProgressStartedAt(null);
      } else {
        persistDeepAnalysisJob(
          markJobFailed(
            job,
            resolved.warnings[0] || "No pudimos obtener este mercado desde Polymarket.",
          ),
        );
        setState({
          matches: [],
          message:
            resolved.warnings[0] ||
            "No pudimos obtener este mercado desde Polymarket. No buscamos una alternativa en mercados internos.",
          normalizedUrl,
          status: "no_exact_match",
        });
        setProgressStartedAt(null);
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return;
      }
      if (isAnalyzeCancelled(error)) {
        return;
      }
      const timedOut = isAnalyzeTimeout(error);
      persistDeepAnalysisJob(
        markJobFailed(
          job,
          timedOut
            ? "La consulta a Polymarket tardo mas de lo esperado."
            : "No pudimos consultar Polymarket ahora. Intenta de nuevo en unos segundos.",
        ),
      );
      setProgressIssue(timedOut ? "timeout" : "error");
      setState({
        message:
          timedOut
            ? "No pudimos completar esta busqueda ahora. Puedes reintentar o revisar el enlace."
            : "No pudimos consultar Polymarket ahora. Intenta de nuevo en unos segundos.",
        status: "invalid",
      });
    } finally {
      if (isCurrentRun()) {
        setLoading(false);
        if (analysisAbortRef.current === runController) {
          analysisAbortRef.current = null;
        }
      }
    }
  }, [analysisAgent.name, input, persistDeepAnalysisJob]);

  const analyzeSelectedMarket = useCallback(async (match: MatchResult, normalizedUrl: string) => {
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    analysisAbortRef.current?.abort();
    const runController = new AbortController();
    analysisAbortRef.current = runController;
    const isCurrentRun = () => analysisRunRef.current === runId;
    const advancePhase = async (phase: AnalyzeLoadingPhase) => {
      if (!isCurrentRun()) {
        return false;
      }
      setLoadingPhase(phase);
      await Promise.resolve();
      return isCurrentRun();
    };

    setActionMessage(null);
    setSamanthaAutoReportResult(null);
    setProgressIssue(null);
    setLastWorkingUrl(normalizedUrl);
    setMarketDetailsItem(match.item);
    setMarketDetailsOpen(false);
    setWalletDetailsSummary(null);
    setWalletDetailsOpen(false);
    setProfileAlerts([]);
    setProgressStepOverrides({
      detecting_market: {
        detail: "El mercado seleccionado viene de la respuesta real de Polymarket/Gamma.",
        status: "completed_with_data",
        statusLabel: "Mercado detectado",
        summary: marketTitle(match.item),
      },
      loading_polymarket: buildMarketDataProgress(match.item),
      reading_link: {
        detail: "El enlace es de Polymarket y paso validacion local.",
        status: "completed_with_data",
        statusLabel: "Validado",
        summary: "Listo para analizar el mercado seleccionado.",
      },
      reviewing_wallets: {
        detail: "Esperando consulta read-only de actividad publica de billeteras.",
        status: "pending",
        statusLabel: "Pendiente",
        summary: "No se marca como revisada hasta que la fuente responda.",
      },
    });
    let job =
      getLatestDeepAnalysisJobForUrl(normalizedUrl) ??
      createDeepAnalysisJob(normalizedUrl);
    job = persistDeepAnalysisJob(
      markJobPolymarketRead(job, {
        eventSlug: match.eventSlug ?? match.item.market?.event_slug ?? undefined,
        marketId: match.item.market?.id ?? match.item.market?.remote_id ?? match.marketId,
        marketSlug: match.marketSlug ?? match.item.market?.market_slug ?? undefined,
        marketTitle: marketTitle(match.item),
        normalizedUrl,
      }),
    );
    setLoading(true);
    setProgressStartedAt(Date.now());
    setLoadingPhase("context");
    setState({
      message: "Analizando solo el mercado seleccionado.",
      normalizedUrl,
      selected: match,
      status: "analyzing_selected",
    });
    try {
      if (!(await advancePhase("context"))) {
        return;
      }
      extractSoccerMatchContext(match.item);

      if (!(await advancePhase("readiness"))) {
        return;
      }
      getEstimateQuality(match.item);
      getSignalEstimateReadiness(match.item);
      getEstimateReadinessScore(match.item);
      getPolySignalEstimate(match.item);
      job = persistDeepAnalysisJob(markJobMarketAnalyzed(job));
      setProgressStepOverrides((current) => ({
        ...current,
        loading_polymarket: buildMarketDataProgress(match.item),
      }));

      if (!(await advancePhase("research"))) {
        return;
      }
      getResearchCoverage(match.item, []);
      setProgressStepOverrides((current) => ({
        ...current,
        reviewing_wallets: {
          detail: "Consultando actividad publica de billeteras para el mercado seleccionado.",
          status: "running",
          statusLabel: "Consultando billeteras",
          summary: "Todavia no hay resultado de Wallet Intelligence.",
        },
      }));
      let enrichedMatch = match;
      let walletSummary: WalletIntelligenceSummary;
      try {
        enrichedMatch = await withRequestTimeout(
          WALLET_INTELLIGENCE_TIMEOUT_MS,
          runController.signal,
          "wallet_intelligence_timeout",
          (signal) => enrichMatchWithWalletIntelligence(match, normalizedUrl, signal),
        );
        walletSummary = getWalletIntelligenceSummary(enrichedMatch.item);
      } catch (error) {
        if (isAnalyzeCancelled(error)) {
          return;
        }
        walletSummary = unavailablePolymarketWalletIntelligenceSummary(
          isAnalyzeTimeout(error)
            ? "Wallet Intelligence no respondio a tiempo para este mercado."
            : "Wallet Intelligence no pudo completar la consulta para este mercado.",
          undefined,
          isAnalyzeTimeout(error) ? "timeout" : "error",
        );
        enrichedMatch = {
          ...match,
          item: {
            ...match.item,
            walletIntelligence: {
              positions: [],
              summary: walletSummary,
            },
          },
        };
      }
      if (!isCurrentRun()) {
        return;
      }
      const profileContext = {
        observedCapitalUsd: walletSummary.analyzedCapitalUsd ?? null,
        source: "Polymarket Data API / Wallet Intelligence",
        sourceMarketSlug: enrichedMatch.item.market?.market_slug ?? null,
        sourceMarketTitle: marketTitle(enrichedMatch.item),
        sourceMarketUrl: normalizedUrl,
      };
      const highlightedProfiles = saveHighlightedProfilesFromWalletSummary(walletSummary, profileContext);
      if (highlightedProfiles.saved.length > 0) {
        void syncLocalHighlightedProfilesToBackend(highlightedProfiles.saved);
      }
      const profileAlertResult = saveProfileAlertsFromWalletSummary(
        walletSummary,
        {
          marketSlug: profileContext.sourceMarketSlug,
          marketTitle: profileContext.sourceMarketTitle,
          marketUrl: profileContext.sourceMarketUrl,
          observedCapitalUsd: profileContext.observedCapitalUsd,
          source: "analyze",
        },
        getHighlightedProfiles(),
      );
      setProfileAlerts(profileAlertResult.created);
      void fetchPersistentHighlightedProfiles()
        .then((persistentProfiles) => {
          if (!isCurrentRun()) {
            return;
          }
          const persistentAlertResult = saveProfileAlertsFromWalletSummary(
            walletSummary,
            {
              marketSlug: profileContext.sourceMarketSlug,
              marketTitle: profileContext.sourceMarketTitle,
              marketUrl: profileContext.sourceMarketUrl,
              observedCapitalUsd: profileContext.observedCapitalUsd,
              source: "analyze",
            },
            mergePersistentAndLocalProfiles(persistentProfiles.profiles, getHighlightedProfiles()),
          );
          if (persistentAlertResult.created.length > 0) {
            setProfileAlerts((current) => mergeProfileAlertsForRun(current, persistentAlertResult.created));
          }
        })
        .catch(() => undefined);
      walletSummary = buildWalletExpandedSummary(enrichedMatch.item, walletSummary, highlightedProfiles.saved.length);
      enrichedMatch = {
        ...enrichedMatch,
        item: {
          ...enrichedMatch.item,
          walletIntelligence: {
            positions: walletSummary.topWallets ?? [],
            summary: walletSummary,
          },
        },
      };
      setProgressStepOverrides((current) => ({
        ...current,
        reviewing_wallets: buildWalletProgress(walletSummary),
      }));
      setWalletDetailsSummary(walletSummary);
      job = persistDeepAnalysisJob(
        markJobWalletsAnalyzed(job, {
          available: walletSummary.available,
          summary: walletSummary.available
            ? "Wallet Intelligence revisada en modo read-only para el mercado seleccionado."
            : walletSummary.reason,
          warnings: walletSummary.warnings.slice(0, 4),
        }),
      );

      if (walletSummary.expandedAnalysis?.largeMarket || (walletSummary.expandedAnalysis?.profileCount ?? 0) > 0) {
        if (!(await advancePhase("wallet_profiles"))) {
          return;
        }
        setProgressStepOverrides((current) => ({
          ...current,
          enriching_profiles: buildProfileProgress(walletSummary),
        }));
      }
      if (walletSummary.expandedAnalysis?.largeMarket || (walletSummary.expandedAnalysis?.historyAvailableCount ?? 0) > 0) {
        if (!(await advancePhase("wallet_history"))) {
          return;
        }
        setProgressStepOverrides((current) => ({
          ...current,
          building_wallet_history: buildWalletHistoryProgress(walletSummary),
        }));
      }
      if (walletSummary.expandedAnalysis?.largeMarket) {
        if (!(await advancePhase("wallet_consistency"))) {
          return;
        }
        setProgressStepOverrides((current) => ({
          ...current,
          validating_wallet_consistency: buildWalletConsistencyProgress(walletSummary),
        }));
      }

      if (!(await advancePhase("preparing_samantha"))) {
        return;
      }
      setProgressStepOverrides((current) => ({
        ...current,
        preparing_samantha: buildAgentProgress({ agentName: analysisAgent.name, job }),
      }));
      job = persistDeepAnalysisJob(markJobSamanthaBriefReady(job, {
        agentId: analysisAgent.id,
        agentName: analysisAgent.name,
      }));
      const existingBridgeTaskId =
        job.samanthaBridge?.bridgeTaskId ?? job.samanthaBridge?.taskId;
      if (
        existingBridgeTaskId ||
        [
          "awaiting_samantha",
          "ready_to_score",
          "receiving_samantha_report",
          "samantha_researching",
          "validating_samantha_report",
        ].includes(job.status)
      ) {
        if (job.status === "awaiting_samantha" && !(await advancePhase("awaiting_samantha"))) {
          return;
        }
        if (job.status === "samantha_researching" && !(await advancePhase("samantha_researching"))) {
          return;
        }
        if (job.status === "ready_to_score" && !(await advancePhase("ready_to_score"))) {
          return;
        }
        setState({
          match: enrichedMatch,
          message:
            existingBridgeTaskId
              ? `Analisis profundo restaurado: ${analysisAgent.name} ya recibio la tarea y la investigacion sigue pendiente.`
              : "Analisis profundo restaurado: la investigacion externa sigue pendiente.",
          normalizedUrl,
          status: "result",
        });
        return;
      }
      if (!(await advancePhase("sending_samantha"))) {
        return;
      }
      setProgressStepOverrides((current) => ({
        ...current,
        preparing_samantha: buildAgentProgress({ agentName: analysisAgent.name, job }),
      }));
      const bridgeResult = await tryAutomaticAnalysisAgentBridge({
        isCurrentRun,
        item: enrichedMatch.item,
        job,
        normalizedUrl,
        signal: runController.signal,
        walletSummary,
      });
      if (!isCurrentRun()) {
        return;
      }
      job = bridgeResult.job;
      setSamanthaAutoReportResult(bridgeResult.reportResult);
      setProgressStepOverrides((current) => ({
        ...current,
        preparing_samantha: buildAgentProgress({
          agentName: job.analysisAgent?.agentName || analysisAgent.name,
          job,
          message: bridgeResult.message,
        }),
      }));
      if (job.status === "awaiting_samantha" && !(await advancePhase("awaiting_samantha"))) {
        return;
      }
      if (job.status === "samantha_researching" && !(await advancePhase("samantha_researching"))) {
        return;
      }
      if (
        (job.status === "receiving_samantha_report" || job.status === "validating_samantha_report") &&
        !(await advancePhase("validating_report"))
      ) {
        return;
      }
      if (job.status === "ready_to_score" && !(await advancePhase("ready_to_score"))) {
        return;
      }
      setState({
        match: enrichedMatch,
        message:
          job.status === "completed"
            ? `Analisis profundo actualizado con reporte de ${analysisAgent.name} validado.`
            : `Analisis profundo iniciado: Polymarket leido, Wallet Intelligence revisada y ${bridgeResult.message}`,
        normalizedUrl,
        status: "result",
      });
      if (!jobAwaitsResearch(job)) {
        setProgressStartedAt(null);
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return;
      }
      if (isAnalyzeCancelled(error)) {
        return;
      }
      const timedOut = isAnalyzeTimeout(error);
      persistDeepAnalysisJob(
        markJobFailed(
          job,
          timedOut
            ? "La preparacion del analisis tardo mas de lo esperado."
            : "No pudimos preparar el job profundo de este mercado ahora.",
        ),
      );
      setProgressIssue(timedOut ? "timeout" : "error");
      setState({
        message: timedOut
          ? "No pudimos completar esta busqueda ahora. Puedes reintentar o revisar el enlace."
          : "No pudimos preparar la lectura de este mercado ahora. Intenta de nuevo en unos segundos.",
        status: "invalid",
      });
    } finally {
      if (isCurrentRun()) {
        setLoading(false);
        if (analysisAbortRef.current === runController) {
          analysisAbortRef.current = null;
        }
      }
    }
  }, [analysisAgent, persistDeepAnalysisJob, tryAutomaticAnalysisAgentBridge]);

  useEffect(() => {
    if (
      loading ||
      state.status !== "needs_selection" ||
      state.matches.length !== 1
    ) {
      return;
    }
    void analyzeSelectedMarket(state.matches[0], state.normalizedUrl);
  }, [analyzeSelectedMarket, loading, state]);

  const handleSaveHistory = useCallback(async (item: MarketOverviewItem, polySignalEstimate?: PolySignalEstimateResult) => {
    if (state.status !== "result") {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const relatedHistory = getRelatedAnalyzerHistory({
        eventSlug: item.market?.event_slug,
        historyItems: analysisHistoryItems,
        marketId: item.market?.id,
        marketSlug: item.market?.market_slug,
        normalizedUrl: state.normalizedUrl,
        remoteId: item.market?.remote_id,
      });
      const analyzerResult = buildAnalyzerResult({
        item,
        matchScore: state.match.score,
        normalizedUrl: state.normalizedUrl,
        relatedHistory,
        url: state.normalizedUrl,
      });
      const payload = historyPayloadFromMarket(
        item,
        state.normalizedUrl,
        analyzerResult,
        deepAnalysisJob,
        polySignalEstimate,
        samanthaAutoReportResult,
      );
      const savedItem = await saveAnalysisHistoryItem(payload);
      setAnalysisHistoryItems((current) => [savedItem, ...current.filter((entry) => entry.id !== savedItem.id)]);
      setSavedHistoryKeys((current) => new Set(current).add(String(item.market?.id ?? payload.id)));
      setActionMessage("Analisis guardado en Historial.");
    } catch {
      setActionMessage("No pudimos guardar este analisis ahora.");
    } finally {
      setActionBusy(false);
    }
  }, [analysisHistoryItems, deepAnalysisJob, samanthaAutoReportResult, state]);

  const handleSaveCurrentAnalysis = useCallback(() => {
    if (state.status !== "result") {
      return;
    }
    void handleSaveHistory(state.match.item);
  }, [handleSaveHistory, state]);

  const handleSavePending = useCallback(async () => {
    if (state.status !== "no_exact_match") {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      await saveAnalysisHistoryItem(pendingHistoryPayload(state.normalizedUrl));
      setActionMessage("Enlace guardado en Historial como pendiente de coincidencia.");
    } catch {
      setActionMessage("No pudimos guardar este enlace ahora.");
    } finally {
      setActionBusy(false);
    }
  }, [state]);

  const handleToggleWatchlist = useCallback(async (item: MarketOverviewItem) => {
    if (!item.market?.id) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const updated = await toggleWatchlistMarket(item.market.id, {
        market: watchlistDraftFromMatch(item),
      });
      setWatchlistItems((current) => {
        const withoutMarket = current.filter((entry) => entry.market_id !== item.market?.id);
        return updated ? [updated, ...withoutMarket] : withoutMarket;
      });
      setActionMessage(updated ? "Mercado agregado al seguimiento local." : "Mercado quitado del seguimiento local.");
    } catch {
      setActionMessage("No pudimos actualizar el seguimiento local ahora.");
    } finally {
      setActionBusy(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setInput("");
    setState({ status: "idle" });
    setLoading(false);
    setLoadingPhase("validating");
    setProgressIssue(null);
    setProgressStartedAt(null);
    setProgressStepOverrides({});
    setMarketDetailsItem(null);
    setMarketDetailsOpen(false);
    setWalletDetailsSummary(null);
    setWalletDetailsOpen(false);
    setProfileAlerts([]);
    setLastWorkingUrl("");
    setActionMessage(null);
    setSamanthaAutoReportResult(null);
    setDeepAnalysisJob(null);
  }, []);

  const handleEditLink = useCallback(() => {
    analysisRunRef.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setState({ status: "idle" });
    setLoading(false);
    setLoadingPhase("validating");
    setProgressIssue(null);
    setProgressStartedAt(null);
    setProgressStepOverrides({});
    setMarketDetailsOpen(false);
    setWalletDetailsOpen(false);
    setProfileAlerts([]);
    setActionMessage(null);
    setSamanthaAutoReportResult(null);
  }, []);

  const matches = state.status === "needs_selection" || state.status === "no_exact_match" ? state.matches : [];
  const analyzedNormalizedUrl =
    state.status === "needs_selection" || state.status === "no_exact_match" || state.status === "result"
      ? state.normalizedUrl
      : "";
  const samanthaProgressPending = state.status === "result" && jobAwaitsResearch(deepAnalysisJob);
  const radarVisible = loading || Boolean(progressIssue) || samanthaProgressPending;
  const radarPhase = loadingPhaseFromJob(deepAnalysisJob) ?? loadingPhase;
  const previewProps = previewPropsForState({ deepAnalysisJob, state });
  const canSaveProgressForLater =
    state.status === "result" && Boolean(state.match.item.market?.id || state.match.item.market?.market_slug);
  const handleProgressRetry = () => {
    if (loading) {
      return;
    }
    if (state.status === "result") {
      void analyzeSelectedMarket(state.match, state.normalizedUrl);
      return;
    }
    void runAnalysis(lastWorkingUrl || input);
  };

  return (
    <main className="dashboard-shell analyze-page">
      <MainNavigation />
      <AnalyzeHero
        input={input}
        loading={loading}
        onClear={handleClear}
        onInputChange={setInput}
        onSubmit={() => void runAnalysis()}
      />
      <AnalyzeSteps />
      <AnalysisPreview {...previewProps} />

      {state.status === "invalid" ? (
        <section className="alert-panel compact" role="status">
          <strong>No pudimos analizar ese enlace</strong>
          <span>{state.message}</span>
        </section>
      ) : null}

      {radarVisible ? (
        <AnalyzeLoadingPanel
          agentName={deepAnalysisJob?.analysisAgent?.agentName || analysisAgent.name}
          canSaveForLater={canSaveProgressForLater}
          elapsedSeconds={progressElapsedSeconds}
          isBusy={loading}
          isVisible={radarVisible}
          issue={progressIssue}
          jobSteps={deepAnalysisJob?.steps}
          onEditLink={handleEditLink}
          onRetry={handleProgressRetry}
          onSaveForLater={handleSaveCurrentAnalysis}
          phase={radarPhase}
          progressKey={analysisRunRef.current}
          stepActions={{
            loading_polymarket: {
              disabled: !marketDetailsItem,
              label: marketDetailsButtonLabel(marketDetailsItem),
              onClick: () => setMarketDetailsOpen(true),
            },
            reviewing_wallets: {
              disabled: !walletDetailsSummary,
              label: walletDetailsButtonLabel(walletDetailsSummary),
              onClick: () => setWalletDetailsOpen(true),
            },
          }}
          stepOverrides={progressStepOverrides}
          samanthaPending={samanthaProgressPending}
        />
      ) : null}

      {state.status === "needs_selection" || state.status === "no_exact_match" ? (
        <MarketSelectionPanel
          busy={actionBusy || loading}
          matches={matches}
          message={state.message}
          normalizedUrl={state.normalizedUrl}
          onAnalyze={(match) => void analyzeSelectedMarket(match, state.normalizedUrl)}
          onReviewLink={handleClear}
          onRetry={() => void runAnalysis(state.normalizedUrl)}
          onSavePending={() => void handleSavePending()}
          status={state.status}
        />
      ) : null}

      {state.status === "result" ? (
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Analisis seleccionado</p>
              <h2>{state.message}</h2>
              <p>
                Esta es una sola ficha profunda para el mercado que confirmaste.
              </p>
            </div>
            <span className="badge muted">1 mercado</span>
          </div>
          <div className="analyze-results-list">
            {(() => {
              const match = state.match;
              const relatedHistory = getRelatedAnalyzerHistory({
                eventSlug: match.item.market?.event_slug,
                historyItems: analysisHistoryItems,
                marketId: match.item.market?.id,
                marketSlug: match.item.market?.market_slug,
                normalizedUrl: analyzedNormalizedUrl,
                remoteId: match.item.market?.remote_id,
              });
              const saved =
                relatedHistory.length > 0 || savedHistoryKeys.has(String(match.item.market?.id));
              return (
                <div className="analyze-match-shell" key={`${match.item.market?.id ?? match.item.market?.remote_id ?? match.item.market?.market_slug}-${match.score}`}>
                  <div className="data-health-notes">
                    <span className="badge muted">Coincidencia {match.score}</span>
                    <span className="badge">Seleccionado por usuario</span>
                    {match.reasons.slice(0, 2).map((reason) => (
                      <span className="badge" key={reason}>{reason}</span>
                    ))}
                  </div>
                  <ProfileAlertsBlock
                    alerts={profileAlerts}
                    onOpenWalletDetails={() => setWalletDetailsOpen(true)}
                  />
                  <AnalyzerReport
                    busy={actionBusy}
                    deepAnalysisJob={deepAnalysisJob}
                    analysisAgentName={deepAnalysisJob?.analysisAgent?.agentName || analysisAgent.name}
                    initialSamanthaReportResult={samanthaAutoReportResult}
                    item={match.item}
                    matchScore={match.score}
                    normalizedUrl={analyzedNormalizedUrl}
                    onDeepAnalysisJobChange={persistDeepAnalysisJob}
                    onOpenMarketDetails={() => setMarketDetailsOpen(true)}
                    onOpenWalletDetails={() => setWalletDetailsOpen(true)}
                    onSaveHistory={handleSaveHistory}
                    onToggleWatchlist={handleToggleWatchlist}
                    relatedHistory={relatedHistory}
                    saved={saved}
                    watchlisted={Boolean(match.item.market?.id && watchlistByMarketId.has(match.item.market.id))}
                  />
                </div>
              );
            })()}
          </div>
        </section>
      ) : null}

      <section className="analyze-bottom-disclaimer" aria-label="Aviso responsable">
        <span>
          PolySignal no garantiza resultados. Las predicciones del mercado pueden cambiar rápidamente.
        </span>
        <a href="/methodology">Conoce más en Metodología →</a>
      </section>

      {actionMessage ? (
        <section className="focus-notice active" role="status">
          <strong>Resultado</strong>
          <span>
            {actionMessage} <a href="/history">Ver historial</a>
          </span>
        </section>
      ) : null}
      <MarketDataDetails
        item={marketDetailsItem}
        onClose={() => setMarketDetailsOpen(false)}
        open={marketDetailsOpen}
      />
      <WalletIntelligenceDetails
        onClose={() => setWalletDetailsOpen(false)}
        onRetry={() => {
          setWalletDetailsOpen(false);
          handleProgressRetry();
        }}
        open={walletDetailsOpen}
        summary={walletDetailsSummary}
        sourceMarketSlug={
          state.status === "result" ? state.match.item.market?.market_slug ?? null : null
        }
        sourceMarketTitle={state.status === "result" ? marketTitle(state.match.item) : null}
        sourceMarketUrl={analyzedNormalizedUrl || lastWorkingUrl || input}
      />
    </main>
  );
}
