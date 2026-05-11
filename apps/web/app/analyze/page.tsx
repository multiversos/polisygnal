"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson } from "../lib/api";
import { getDecisionLabel, getPolySignalDecision } from "../lib/analysisDecision";
import {
  getPolymarketUrlValidationMessage,
  extractPossibleMarketTerms,
  extractPolymarketSlug,
} from "../lib/polymarketLink";
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
  extractSoccerMatchContext,
  formatSoccerMatchContext,
  getSoccerContextReadiness,
} from "../lib/soccerMatchContext";
import { getResearchCoverage } from "../lib/researchReadiness";
import { getMarketActivityLabel, getMarketReviewReason } from "../lib/publicMarketInsights";
import { getPublicMarketStatus } from "../lib/publicMarketStatus";
import { saveAnalysisHistoryItem } from "../lib/analysisHistory";
import {
  fetchWatchlistItems,
  toggleWatchlistMarket,
  type WatchlistItem,
  type WatchlistMarketDraft,
} from "../lib/watchlist";
import type { MarketOverviewItem, MarketOverviewResponse } from "../lib/marketOverview";

type MatchResult = {
  item: MarketOverviewItem;
  reasons: string[];
  score: number;
};

type SearchState =
  | { status: "idle" }
  | { message: string; status: "invalid" }
  | { message: string; normalizedUrl: string; status: "searching" }
  | {
      matches: MatchResult[];
      message: string;
      normalizedUrl: string;
      status: "matched" | "possible" | "not_found";
    };

const MARKET_PAGE_SIZE = 50;
const MAX_MARKETS_TO_COMPARE = 100;

function normalizeText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function scoreMarketMatch(item: MarketOverviewItem, normalizedUrl: string, terms: string[]): MatchResult {
  const market = item.market;
  const haystack = normalizeText(
    [
      market?.question,
      market?.event_title,
      market?.event_slug,
      market?.market_slug,
      market?.remote_id,
      market?.id,
    ].join(" "),
  );
  const normalizedUrlText = normalizeText(normalizedUrl);
  const urlNumbers = Array.from(normalizedUrl.matchAll(/\d{4,}/g)).map((match) => match[0]);
  let score = 0;
  const reasons: string[] = [];

  if (market?.remote_id && normalizedUrl.includes(String(market.remote_id))) {
    score += 100;
    reasons.push("El identificador del mercado coincide.");
  }
  if (market?.id && urlNumbers.includes(String(market.id))) {
    score += 70;
    reasons.push("El enlace incluye el mercado local.");
  }
  if (market?.market_slug && normalizedUrlText.includes(normalizeText(market.market_slug))) {
    score += 85;
    reasons.push("El slug del mercado coincide.");
  }
  if (market?.event_slug && normalizedUrlText.includes(normalizeText(market.event_slug))) {
    score += 70;
    reasons.push("El evento coincide con el enlace.");
  }

  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (terms.length > 0 && matchedTerms.length > 0) {
    const ratio = matchedTerms.length / terms.length;
    score += Math.round(ratio * 70);
    reasons.push(`${matchedTerms.length} terminos coinciden con mercado o evento.`);
  }

  return { item, reasons, score };
}

async function fetchComparableMarkets(): Promise<MarketOverviewItem[]> {
  const allItems: MarketOverviewItem[] = [];
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

function findMatches(items: MarketOverviewItem[], normalizedUrl: string): MatchResult[] {
  const terms = extractPossibleMarketTerms(normalizedUrl);
  return items
    .map((item) => scoreMarketMatch(item, normalizedUrl, terms))
    .filter((match) => match.score >= 35)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function historyPayloadFromMarket(item: MarketOverviewItem, normalizedUrl: string) {
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
  return {
    analyzedAt: new Date().toISOString(),
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
    id: `link-${item.market?.id ?? Date.now()}`,
    marketId: item.market?.id ? String(item.market.id) : undefined,
    marketSlug: item.market?.market_slug || undefined,
    marketNoProbability: marketProbabilities?.no,
    marketYesProbability: marketProbabilities?.yes,
    outcome: "UNKNOWN" as const,
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
    predictedSide: decision.predictedSide,
    reasons: [reviewReason.reason, activity?.detail, predictionReason].filter(
      (reason): reason is string => Boolean(reason),
    ),
    result: "pending" as const,
    remoteId: item.market?.remote_id || undefined,
    source: "link_analyzer" as const,
    sport: item.market?.sport_type || undefined,
    status: "open" as const,
    title: marketTitle(item),
    url: normalizedUrl,
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

function MatchCard({
  busy,
  item,
  onSaveHistory,
  onToggleWatchlist,
  saved,
  watchlisted,
}: {
  busy: boolean;
  item: MarketOverviewItem;
  onSaveHistory: (item: MarketOverviewItem) => void;
  onToggleWatchlist: (item: MarketOverviewItem) => void;
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
      <h3>{marketTitle(item)}</h3>
      <p className="section-note">{eventTitle(item)}</p>
      <p>{reason.reason}</p>
      <SoccerContextBlock item={item} />
      <ExternalResearchBlock item={item} />
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
          <strong>{getDecisionLabel(decision.decision, decision.predictedSide)}</strong>
          <p>{decision.detail}</p>
          <small>
            Para medir aciertos, PolySignal solo cuenta mercados donde su estimacion supera
            el umbral de decision del 55%. El resultado final se verificara con Polymarket
            cuando el mercado cierre.
          </small>
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
          {saved ? "Guardado en historial" : "Guardar analisis"}
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
  const [savedHistoryKeys, setSavedHistoryKeys] = useState<Set<string>>(new Set());
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const watchlistByMarketId = useMemo(() => {
    return new Set(watchlistItems.map((item) => item.market_id));
  }, [watchlistItems]);

  useEffect(() => {
    void fetchWatchlistItems().then(setWatchlistItems);
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
    const validation = getPolymarketUrlValidationMessage(value);
    setActionMessage(null);
    if (!validation.ok || !validation.normalizedUrl) {
      setState({ message: validation.message, status: "invalid" });
      return;
    }
    setLoading(true);
    setState({
      message: "Buscando coincidencias en los mercados cargados.",
      normalizedUrl: validation.normalizedUrl,
      status: "searching",
    });
    try {
      const markets = await fetchComparableMarkets();
      const matches = findMatches(markets, validation.normalizedUrl);
      if (matches[0]?.score >= 65) {
        setState({
          matches,
          message: "Encontramos una coincidencia fuerte con los mercados cargados.",
          normalizedUrl: validation.normalizedUrl,
          status: "matched",
        });
      } else if (matches.length > 0) {
        setState({
          matches,
          message: "Encontramos posibles coincidencias. Revisa cual corresponde al enlace.",
          normalizedUrl: validation.normalizedUrl,
          status: "possible",
        });
      } else {
        setState({
          matches: [],
          message:
            "Todavia no encontramos este mercado dentro de los datos cargados.",
          normalizedUrl: validation.normalizedUrl,
          status: "not_found",
        });
      }
    } catch {
      setState({
        message:
          "No pudimos comparar el enlace ahora. Intenta de nuevo en unos segundos.",
        status: "invalid",
      });
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleSaveHistory = useCallback(async (item: MarketOverviewItem) => {
    if (state.status !== "matched" && state.status !== "possible") {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const payload = historyPayloadFromMarket(item, state.normalizedUrl);
      await saveAnalysisHistoryItem(payload);
      setSavedHistoryKeys((current) => new Set(current).add(String(item.market?.id ?? payload.id)));
      setActionMessage("Analisis guardado en Historial.");
    } catch {
      setActionMessage("No pudimos guardar este analisis ahora.");
    } finally {
      setActionBusy(false);
    }
  }, [state]);

  const handleSavePending = useCallback(async () => {
    if (state.status !== "not_found") {
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
    setInput("");
    setState({ status: "idle" });
    setActionMessage(null);
  }, []);

  const matches = state.status === "matched" || state.status === "possible" ? state.matches : [];

  return (
    <main className="dashboard-shell analyze-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Analizar enlace</p>
          <h1>Analizar enlace</h1>
          <p className="subtitle">
            Pega un enlace de Polymarket para revisar si PolySignal ya tiene
            informacion sobre ese mercado.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Primera version:</strong>
        <span>
          Comparamos el enlace con mercados que PolySignal ya tiene cargados. No
          buscamos fuentes externas todavia. Si guardas el analisis, queda en el
          historial local de este navegador.
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
            Esta primera version compara el enlace con mercados que PolySignal ya
            tiene cargados. Si no hay coincidencia, te lo diremos claramente.
          </p>
        </section>
      ) : null}

      {state.status === "invalid" ? (
        <section className="alert-panel compact" role="status">
          <strong>No pudimos analizar ese enlace</strong>
          <span>{state.message}</span>
        </section>
      ) : null}

      {state.status === "searching" ? (
        <section className="empty-state compact">
          <strong>Comparando enlace</strong>
          <p>{state.message}</p>
        </section>
      ) : null}

      {state.status === "not_found" ? (
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sin coincidencia</p>
              <h2>Mercado no encontrado</h2>
              <p>{state.message}</p>
            </div>
          </div>
          <div className="empty-state compact">
            <strong>No vamos a inventar una lectura.</strong>
            <p>
              Puedes revisar los mercados deportivos disponibles o volver a
              intentarlo mas tarde cuando haya mas datos cargados.
            </p>
            <div className="empty-state-actions">
              <a className="analysis-link" href="/sports/soccer">
                Ver futbol
              </a>
              <button
                className="watchlist-button"
                disabled={actionBusy}
                onClick={() => void handleSavePending()}
                type="button"
              >
                Guardar como pendiente
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {matches.length > 0 ? (
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {state.status === "matched" ? "Coincidencia encontrada" : "Posibles coincidencias"}
              </p>
              <h2>{"message" in state ? state.message : "Coincidencias"}</h2>
              <p>
                Revisa la tarjeta antes de guardar el analisis. Solo usamos datos
                ya visibles en PolySignal.
              </p>
            </div>
            <span className="badge muted">{matches.length} resultados</span>
          </div>
          <div className="analyze-results-list">
            {matches.map((match) => (
              <div className="analyze-match-shell" key={`${match.item.market?.id}-${match.score}`}>
                <div className="data-health-notes">
                  <span className="badge muted">Coincidencia {match.score}</span>
                  {match.reasons.slice(0, 2).map((reason) => (
                    <span className="badge" key={reason}>{reason}</span>
                  ))}
                </div>
                <MatchCard
                  busy={actionBusy}
                  item={match.item}
                  onSaveHistory={handleSaveHistory}
                  onToggleWatchlist={handleToggleWatchlist}
                  saved={savedHistoryKeys.has(String(match.item.market?.id))}
                  watchlisted={Boolean(match.item.market?.id && watchlistByMarketId.has(match.item.market.id))}
                />
              </div>
            ))}
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
