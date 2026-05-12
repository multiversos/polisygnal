"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AnalyzeLoadingPanel,
  type AnalyzeLoadingPhase,
} from "../components/AnalyzeLoadingPanel";
import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson } from "../lib/api";
import { getPolySignalDecision } from "../lib/analysisDecision";
import {
  getPolymarketUrlValidationMessage,
  extractPolymarketSlug,
} from "../lib/polymarketLink";
import {
  rankAnalyzerMatches,
  type AnalyzerMatchCandidate,
} from "../lib/analyzerMatchRanking";
import {
  formatProbability as formatPublicProbability,
  getMarketImpliedProbabilities,
  getProbabilityDisplayState,
  normalizeProbability,
} from "../lib/marketProbabilities";
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
import { getWalletIntelligenceForMarket } from "../lib/walletIntelligenceAdapter";
import { getMarketActivityLabel, getMarketReviewReason } from "../lib/publicMarketInsights";
import { getPublicMarketStatus } from "../lib/publicMarketStatus";
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
import type { MarketOverviewItem, MarketOverviewResponse } from "../lib/marketOverview";
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

type MatchResult = AnalyzerMatchCandidate<AnalyzeMarketItem>;

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

const MARKET_PAGE_SIZE = 50;
const MAX_MARKETS_TO_COMPARE = 100;

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

async function fetchComparableMarkets(): Promise<AnalyzeMarketItem[]> {
  const allItems: AnalyzeMarketItem[] = [];
  let total = 0;
  for (let offset = 0; offset < MAX_MARKETS_TO_COMPARE; offset += MARKET_PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(MARKET_PAGE_SIZE),
      offset: String(offset),
      sport_type: "soccer",
    });
    const response = await fetchApiJson<MarketOverviewResponse>(
      `/markets/overview?${params.toString()}`,
    );
    const items = response.items ?? [];
    total = response.total_count ?? items.length;
    allItems.push(...items);
    if (allItems.length >= total || items.length === 0) {
      break;
    }
  }
  return allItems;
}

async function enrichMatchWithWalletIntelligence(match: MatchResult): Promise<MatchResult> {
  if (!match.item.market?.id) {
    return match;
  }
  const summary = await getWalletIntelligenceForMarket({
    eventSlug: match.item.market.event_slug ?? undefined,
    marketId: String(match.item.market.id),
    marketSlug: match.item.market.market_slug ?? undefined,
    remoteId: match.item.market.remote_id ?? undefined,
  });
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
    available: summary.available,
    checkedAt: summary.checkedAt,
    confidence: summary.confidence,
    noCapitalUsd: summary.noCapitalUsd,
    reason: summary.reason,
    relevantWalletsCount: summary.relevantWalletsCount,
    signalDirection: summary.signalDirection,
    source: summary.source,
    thresholdUsd: summary.thresholdUsd,
    warnings: summary.warnings.slice(0, 6),
    yesCapitalUsd: summary.yesCapitalUsd,
  };
}

function historyPayloadFromMarket(
  item: MarketOverviewItem,
  normalizedUrl: string,
  analyzerResult: AnalyzerResult,
) {
  const marketProbabilities = getMarketImpliedProbabilities({
    marketNoPrice: item.latest_snapshot?.no_price,
    marketYesPrice: item.latest_snapshot?.yes_price,
  });
  const estimateQuality = getEstimateQuality(item);
  const polySignalProbabilities = getRealPolySignalProbabilities(item);
  const confidenceScore =
    estimateQuality === "real_polysignal_estimate"
      ? normalizeProbability(item.latest_prediction?.confidence_score)
      : null;
  const reviewReason = getMarketReviewReason(insightInput(item));
  const activity = getMarketActivityLabel(insightInput(item));
  const decision = getPolySignalDecision({
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
  });
  const predictionReason =
    estimateQuality === "market_price_only"
      ? "Solo habia probabilidad del mercado; no se guardo prediccion PolySignal."
      : estimateQuality !== "real_polysignal_estimate"
        ? "Sin estimacion PolySignal suficiente."
        : decision.predictedSide === "UNKNOWN"
          ? decision.evaluationReason
          : "Prediccion clara guardada solo cuando la estimacion PolySignal supera 55%.";
  const analyzerSummary = getAnalyzerSummary(analyzerResult);
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
      confidenceScore === null
        ? ("Desconocida" as const)
        : confidenceScore >= 0.7
          ? ("Alta" as const)
          : confidenceScore >= 0.4
            ? ("Media" as const)
            : ("Baja" as const),
    conditionId: undefined,
    decision: decision.decision,
    decisionThreshold: decision.decisionThreshold,
    eventSlug: item.market?.event_slug || undefined,
    estimateQuality,
    evaluationReason:
      estimateQuality === "market_price_only"
        ? "Solo habia probabilidad del mercado."
        : estimateQuality === "real_polysignal_estimate"
          ? decision.evaluationReason
          : "Sin estimacion PolySignal suficiente.",
    evaluationStatus: decision.evaluationStatus,
    id: `link-${item.market?.id ?? "market"}-${Date.now()}`,
    marketId: item.market?.id ? String(item.market.id) : undefined,
    marketSlug: item.market?.market_slug || undefined,
    marketNoProbability: marketProbabilities?.no,
    marketYesProbability: marketProbabilities?.yes,
    outcome: "UNKNOWN" as const,
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
    predictedSide: decision.predictedSide,
    reasons: [analyzerSummary.headline, reviewReason.reason, activity?.detail, predictionReason].filter(
      (reason): reason is string => Boolean(reason),
    ),
    result: "pending" as const,
    remoteId: item.market?.remote_id || undefined,
    source: "link_analyzer" as const,
    sport: item.market?.sport_type || undefined,
    status: "open" as const,
    title: marketTitle(item),
    url: normalizedUrl,
    walletIntelligenceSummary: safeWalletSummaryForHistory(item),
  };
}

function pendingHistoryPayload(normalizedUrl: string) {
  const slug = extractPolymarketSlug(normalizedUrl);
  const prefix = new URL(normalizedUrl).pathname.split("/").filter(Boolean)[0];
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
    reasons: ["Todavia no encontramos coincidencia dentro de los mercados cargados."],
    result: "unknown" as const,
    source: "link_analyzer" as const,
    status: "unknown" as const,
    title: slug ? `Enlace Polymarket: ${slug.replaceAll("-", " ")}` : "Enlace Polymarket pendiente",
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

function MarketSelectionPanel({
  busy,
  matches,
  message,
  normalizedUrl,
  onAnalyze,
  onSavePending,
  status,
}: {
  busy: boolean;
  matches: MatchResult[];
  message: string;
  normalizedUrl: string;
  onAnalyze: (match: MatchResult) => void;
  onSavePending: () => void;
  status: "needs_selection" | "no_exact_match";
}) {
  const title =
    status === "needs_selection"
      ? "Mercado detectado"
      : "No encontramos una coincidencia exacta";
  const copy =
    status === "needs_selection"
      ? "Selecciona que mercado quieres analizar. PolySignal preparara una sola lectura profunda despues de tu confirmacion."
      : "Puedes elegir una posible coincidencia o revisar el enlace. No vamos a abrir analisis profundos de mercados dudosos.";
  return (
    <section className="dashboard-panel analyzer-selection-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Detectar -&gt; Confirmar -&gt; Analizar</p>
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
        <span className="badge muted">{matches.length} opciones</span>
      </div>
      <div className="empty-state compact">
        <strong>{copy}</strong>
        <p>
          Enlace normalizado: <span>{normalizedUrl}</span>
        </p>
      </div>
      {matches.length > 0 ? (
        <div className="analyzer-selection-list">
          {matches.slice(0, 5).map((match) => {
            const statusInfo = getPublicMarketStatus(insightInput(match.item));
            return (
              <article className="analyzer-selection-card" key={`${match.marketId}-${match.score}`}>
                <div>
                  <span className={`market-status-badge ${statusInfo.tone}`}>{statusInfo.label}</span>
                  <span className="badge muted">{matchStrengthLabel(match.strength)} · score {match.score}</span>
                </div>
                <h3>{match.title}</h3>
                <p>{match.eventTitle || eventTitle(match.item)}</p>
                <div className="history-card-metrics">
                  <span>Precio Si {formatPublicProbability(match.item.latest_snapshot?.yes_price)}</span>
                  <span>Precio No {formatPublicProbability(match.item.latest_snapshot?.no_price)}</span>
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
      ) : (
        <div className="empty-state compact">
          <strong>No hay mercados cargados que coincidan con suficiente confianza.</strong>
          <p>
            Puedes guardar el enlace como pendiente sin inventar mercado, fecha ni precio.
          </p>
          <button
            className="watchlist-button"
            disabled={busy}
            onClick={onSavePending}
            type="button"
          >
            Guardar como pendiente
          </button>
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
          {watchlisted ? "Siguiendo" : "Seguir mercado"}
        </button>
        {item.market?.id ? (
          <a className="analysis-link" href={`/markets/${item.market.id}`}>
            Ver detalle
          </a>
        ) : null}
        <a className="analysis-link secondary" href="/sports/soccer">
          Ver futbol
        </a>
      </div>
    </article>
  );
}

export default function AnalyzePage() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<AnalyzeLoadingPhase>("validating");
  const [analysisHistoryItems, setAnalysisHistoryItems] = useState<AnalysisHistoryItem[]>([]);
  const [savedHistoryKeys, setSavedHistoryKeys] = useState<Set<string>>(new Set());
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const analysisRunRef = useRef(0);

  const watchlistByMarketId = useMemo(() => {
    return new Set(watchlistItems.map((item) => item.market_id));
  }, [watchlistItems]);

  useEffect(() => {
    void fetchWatchlistItems().then(setWatchlistItems);
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
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get("url");
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

  const runAnalysis = useCallback(async (value = input) => {
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
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
    if (!validation.ok || !validation.normalizedUrl) {
      setState({ message: validation.message, status: "invalid" });
      return;
    }
    setLoading(true);
    setState({
      message: "Detectando mercado o evento en los datos cargados.",
      normalizedUrl: validation.normalizedUrl,
      status: "detecting",
    });
    try {
      if (!(await advancePhase("matching"))) {
        return;
      }
      const markets = await fetchComparableMarkets();
      if (!isCurrentRun()) {
        return;
      }
      const ranking = rankAnalyzerMatches(markets, validation.normalizedUrl);
      const matches = ranking.candidates;
      const hasExactOrStrong = matches.some((match) => match.strength === "exact" || match.strength === "strong");
      if (hasExactOrStrong) {
        setState({
          matches,
          message:
            matches.length > 1
              ? "Este enlace parece corresponder a un evento con varios mercados. Selecciona uno para analizar."
              : "Detectamos un mercado probable. Confirma que quieres analizarlo antes de preparar la lectura.",
          normalizedUrl: validation.normalizedUrl,
          status: "needs_selection",
        });
      } else if (matches.length > 0) {
        setState({
          matches,
          message: "No encontramos una coincidencia exacta. Revisa estas opciones compactas antes de analizar una.",
          normalizedUrl: validation.normalizedUrl,
          status: "no_exact_match",
        });
      } else {
        setState({
          matches: [],
          message:
            "No encontramos una coincidencia exacta ni una posible coincidencia confiable en los mercados cargados.",
          normalizedUrl: validation.normalizedUrl,
          status: "no_exact_match",
        });
      }
    } catch {
      if (!isCurrentRun()) {
        return;
      }
      setState({
        message:
          "No pudimos comparar el enlace ahora. Intenta de nuevo en unos segundos.",
        status: "invalid",
      });
    } finally {
      if (isCurrentRun()) {
        setLoading(false);
      }
    }
  }, [input]);

  const analyzeSelectedMarket = useCallback(async (match: MatchResult, normalizedUrl: string) => {
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
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
    setLoading(true);
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

      if (!(await advancePhase("research"))) {
        return;
      }
      getResearchCoverage(match.item, []);
      const enrichedMatch = await enrichMatchWithWalletIntelligence(match);
      if (!isCurrentRun()) {
        return;
      }
      getWalletIntelligenceSummary(enrichedMatch.item);

      if (!(await advancePhase("preparing"))) {
        return;
      }
      setState({
        match: enrichedMatch,
        message: "Lectura preparada para el mercado seleccionado.",
        normalizedUrl,
        status: "result",
      });
    } catch {
      if (!isCurrentRun()) {
        return;
      }
      setState({
        message: "No pudimos preparar la lectura de este mercado ahora. Intenta de nuevo en unos segundos.",
        status: "invalid",
      });
    } finally {
      if (isCurrentRun()) {
        setLoading(false);
      }
    }
  }, []);

  const handleSaveHistory = useCallback(async (item: MarketOverviewItem) => {
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
      const payload = historyPayloadFromMarket(item, state.normalizedUrl, analyzerResult);
      const savedItem = await saveAnalysisHistoryItem(payload);
      setAnalysisHistoryItems((current) => [savedItem, ...current.filter((entry) => entry.id !== savedItem.id)]);
      setSavedHistoryKeys((current) => new Set(current).add(String(item.market?.id ?? payload.id)));
      setActionMessage("Analisis guardado en Historial.");
    } catch {
      setActionMessage("No pudimos guardar este analisis ahora.");
    } finally {
      setActionBusy(false);
    }
  }, [analysisHistoryItems, state]);

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
      setActionMessage(updated ? "Mercado agregado a Mi lista." : "Mercado quitado de Mi lista.");
    } catch {
      setActionMessage("No pudimos actualizar Mi lista ahora.");
    } finally {
      setActionBusy(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    analysisRunRef.current += 1;
    setInput("");
    setState({ status: "idle" });
    setLoading(false);
    setLoadingPhase("validating");
    setActionMessage(null);
  }, []);

  const matches = state.status === "needs_selection" || state.status === "no_exact_match" ? state.matches : [];
  const analyzedNormalizedUrl =
    state.status === "needs_selection" || state.status === "no_exact_match" || state.status === "result"
      ? state.normalizedUrl
      : "";

  return (
    <main className="dashboard-shell analyze-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Analizar enlace</p>
          <h1>Analizar enlace</h1>
          <p className="subtitle">
            Pega un enlace de Polymarket. PolySignal detectara el mercado o
            evento y te pedira confirmar que quieres analizar antes de preparar
            la lectura.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Flujo responsable:</strong>
        <span>
          Detectar -&gt; Confirmar -&gt; Analizar. No usamos capturas, OCR ni imagenes;
          tampoco abrimos analisis profundos de mercados secundarios sin que
          elijas uno. Si guardas una lectura, queda en el historial local de este navegador.
        </span>
      </section>

      <section className="dashboard-panel analyze-form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Polymarket</p>
            <h2>Pegar enlace</h2>
            <p>Puede ser un enlace de evento, mercado o deporte de Polymarket.</p>
          </div>
        </div>
        <div className="analyze-form">
          <label>
            Enlace de Polymarket
            <input
              aria-label="Enlace de Polymarket"
              onChange={(event) => setInput(event.target.value)}
              placeholder="https://polymarket.com/event/..."
              value={input}
            />
          </label>
          <div className="watchlist-actions">
            <button
              className="watchlist-button active"
              disabled={loading}
              onClick={() => void runAnalysis()}
              type="button"
            >
              {loading ? "Analizando" : "Analizar"}
            </button>
            <button className="watchlist-button" onClick={handleClear} type="button">
              Limpiar
            </button>
          </div>
        </div>
      </section>

      {state.status === "idle" ? (
        <section className="empty-state compact">
          <strong>Listo para comparar un enlace.</strong>
          <p>
            Primero detectamos el evento o mercado exacto. Si hay varias opciones
            del mismo evento, te pediremos seleccionar una antes del analisis profundo.
          </p>
        </section>
      ) : null}

      {state.status === "invalid" ? (
        <section className="alert-panel compact" role="status">
          <strong>No pudimos analizar ese enlace</strong>
          <span>{state.message}</span>
        </section>
      ) : null}

      {state.status === "detecting" || state.status === "analyzing_selected" ? (
        <AnalyzeLoadingPanel isVisible={loading} phase={loadingPhase} />
      ) : null}

      {state.status === "needs_selection" || state.status === "no_exact_match" ? (
        <MarketSelectionPanel
          busy={actionBusy || loading}
          matches={matches}
          message={state.message}
          normalizedUrl={state.normalizedUrl}
          onAnalyze={(match) => void analyzeSelectedMarket(match, state.normalizedUrl)}
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
                <div className="analyze-match-shell" key={`${match.item.market?.id}-${match.score}`}>
                  <div className="data-health-notes">
                    <span className="badge muted">Coincidencia {match.score}</span>
                    <span className="badge">Seleccionado por usuario</span>
                    {match.reasons.slice(0, 2).map((reason) => (
                      <span className="badge" key={reason}>{reason}</span>
                    ))}
                  </div>
                  <MatchCard
                    busy={actionBusy}
                    item={match.item}
                    matchScore={match.score}
                    normalizedUrl={analyzedNormalizedUrl}
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

      {actionMessage ? (
        <section className="focus-notice active" role="status">
          <strong>Resultado</strong>
          <span>
            {actionMessage} <a href="/history">Ver historial</a>
          </span>
        </section>
      ) : null}
    </main>
  );
}
