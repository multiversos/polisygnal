"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  buildAnalyzerResult,
  getAnalyzerDecisionCopy,
  getAnalyzerSummary,
  type AnalyzerLayer,
  type AnalyzerResult,
} from "../lib/analyzerResult";
import {
  buildDeepAnalysisFromPolymarketMarket,
  mergeSamanthaResearchLayer,
  mergeWalletIntelligenceLayer,
  summarizeDeepAnalysis,
} from "../lib/deepAnalyzerEngine";
import {
  getJobProgressSummary,
  jobStepStatusLabel,
  markJobSamanthaReportLoaded,
  type DeepAnalysisJob,
} from "../lib/deepAnalysisJob";
import { updateDeepAnalysisJob } from "../lib/deepAnalysisJobStorage";
import type { DeepAnalysisLayerStatus } from "../lib/deepAnalyzerTypes";
import type { AnalysisHistoryItem } from "../lib/analysisHistory";
import {
  collectIndependentSignals,
  collectMarketSignals,
  explainMissingEstimateData,
  getEstimateReadiness as getSignalEstimateReadiness,
  getEstimateReadinessScore,
} from "../lib/estimationSignals";
import {
  getEstimateQuality,
  getEstimateQualityLabel,
  getRealPolySignalProbabilities,
} from "../lib/marketEstimateQuality";
import type { MarketOverviewItem } from "../lib/marketOverview";
import {
  formatProbability,
  getProbabilityDisplayState,
} from "../lib/marketProbabilities";
import {
  getMarketActivityLabel,
  getMarketReviewReason,
} from "../lib/publicMarketInsights";
import { getPublicMarketStatus } from "../lib/publicMarketStatus";
import { getResearchCoverage } from "../lib/researchReadiness";
import {
  buildSamanthaResearchBrief,
  serializeResearchBrief,
  validateResearchBrief,
} from "../lib/samanthaResearchBrief";
import {
  convertSamanthaReportToEvidence,
  convertSamanthaReportToSignals,
  parseSamanthaResearchReport,
  shouldAcceptSuggestedEstimate,
} from "../lib/samanthaResearchReport";
import type { SamanthaResearchParseResult } from "../lib/samanthaResearchTypes";
import {
  extractSoccerMatchContext,
  formatSoccerMatchContext,
  getSoccerContextReadiness,
} from "../lib/soccerMatchContext";
import {
  getWalletIntelligenceReadiness,
  getWalletIntelligenceSummary,
  getWalletSignalSummary,
} from "../lib/walletIntelligence";
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

type AnalyzerReportProps = {
  busy: boolean;
  deepAnalysisJob?: DeepAnalysisJob | null;
  item: AnalyzeMarketItem;
  matchScore: number;
  normalizedUrl: string;
  onDeepAnalysisJobChange?: (job: DeepAnalysisJob) => void;
  onSaveHistory: (item: MarketOverviewItem) => void;
  onToggleWatchlist: (item: MarketOverviewItem) => void;
  relatedHistory: AnalysisHistoryItem[];
  saved: boolean;
  watchlisted: boolean;
};

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

function outcomePriceSummary(item: MarketOverviewItem): string | null {
  const outcomes = item.market?.outcomes ?? [];
  const priced = outcomes
    .filter((outcome) => outcome.label)
    .slice(0, 4)
    .map((outcome) => {
      const price =
        outcome.price === null || outcome.price === undefined
          ? "precio no disponible"
          : formatProbability(outcome.price);
      return `${outcome.label}: ${price}`;
    });
  return priced.length > 0 ? priced.join(" | ") : null;
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

function layerStatusLabel(status: AnalyzerLayer["status"]): string {
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

function deepLayerStatusLabel(status: DeepAnalysisLayerStatus): string {
  if (status === "available") {
    return "Disponible";
  }
  if (status === "partial") {
    return "Parcial";
  }
  if (status === "blocked") {
    return "Pendiente de integracion";
  }
  if (status === "running") {
    return "En revision";
  }
  if (status === "error") {
    return "No consultado";
  }
  if (status === "pending") {
    return "Pendiente";
  }
  return "No disponible";
}

function findLayer(result: AnalyzerResult, id: AnalyzerLayer["id"]): AnalyzerLayer {
  return (
    result.layers.find((layer) => layer.id === id) ?? {
      id,
      label: "Capa",
      status: "unavailable",
      summary: "No disponible en este analisis.",
      warnings: [],
    }
  );
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

function sourceLabel(summary: WalletIntelligenceSummary): string {
  if (!summary.available) {
    return "no disponible para este mercado";
  }
  if (summary.source === "backend") {
    return "datos publicos Polymarket/Gamma de solo lectura";
  }
  return "datos publicos cargados";
}

function shortDirectionLabel(value: string): string {
  if (value === "YES" || value === "NO") {
    return value;
  }
  if (value === "NEUTRAL") {
    return "Neutral";
  }
  return "Desconocido";
}

function compactWarnings(warnings: string[], limit = 3): string[] {
  return [...new Set(warnings.filter(Boolean))].slice(0, limit);
}

function AnalyzerLayerDetails({
  children,
  layer,
}: {
  children: ReactNode;
  layer: AnalyzerLayer;
}) {
  return (
    <details className={`analyzer-report-layer ${layer.status}`}>
      <summary>
        <span>
          <strong>{layer.label}</strong>
          <small>{layer.summary}</small>
        </span>
        <em>{layerStatusLabel(layer.status)}</em>
      </summary>
      <div className="analyzer-report-layer-body">{children}</div>
    </details>
  );
}

export function AnalyzerReport({
  busy,
  deepAnalysisJob,
  item,
  matchScore,
  normalizedUrl,
  onDeepAnalysisJobChange,
  onSaveHistory,
  onToggleWatchlist,
  relatedHistory,
  saved,
  watchlisted,
}: AnalyzerReportProps) {
  const [samanthaReportInput, setSamanthaReportInput] = useState("");
  const [samanthaReportResult, setSamanthaReportResult] =
    useState<SamanthaResearchParseResult | null>(null);
  const [samanthaActionMessage, setSamanthaActionMessage] = useState("");
  const status = getPublicMarketStatus(insightInput(item));
  const reason = getMarketReviewReason(insightInput(item));
  const activity = getMarketActivityLabel(insightInput(item));
  const realPolySignalProbabilities = getRealPolySignalProbabilities(item);
  const probabilityState = getProbabilityDisplayState({
    marketNoPrice: item.latest_snapshot?.no_price,
    marketYesPrice: item.latest_snapshot?.yes_price,
    polySignalNoProbability: realPolySignalProbabilities?.no,
    polySignalYesProbability: realPolySignalProbabilities?.yes,
  });
  const outcomePrices = outcomePriceSummary(item);
  const analyzerResult = buildAnalyzerResult({
    item,
    matchScore,
    normalizedUrl,
    relatedHistory,
    url: normalizedUrl,
  });
  const analyzerSummary = getAnalyzerSummary(analyzerResult);
  const analyzerDecision = getAnalyzerDecisionCopy(analyzerResult);
  const estimateQuality = getEstimateQuality(item);
  const readiness = getSignalEstimateReadiness(item);
  const readinessScore = getEstimateReadinessScore(item);
  const marketSignals = collectMarketSignals(item);
  const independentSignals = collectIndependentSignals(item);
  const missingEstimateData = explainMissingEstimateData(item);
  const context = extractSoccerMatchContext(item);
  const contextReadiness = getSoccerContextReadiness(context);
  const research = getResearchCoverage(item, []);
  const walletSummary = getWalletIntelligenceSummary(item);
  const walletReading = getWalletSignalSummary(walletSummary);
  const walletReadiness = getWalletIntelligenceReadiness(item);
  const samanthaBrief = useMemo(
    () =>
      buildSamanthaResearchBrief({
        item,
        normalizedUrl,
        url: normalizedUrl,
        walletSummary,
      }),
    [item, normalizedUrl, walletSummary],
  );
  const samanthaBriefText = useMemo(() => serializeResearchBrief(samanthaBrief), [samanthaBrief]);
  const samanthaBriefValidation = useMemo(() => validateResearchBrief(samanthaBrief), [samanthaBrief]);
  const samanthaReport = samanthaReportResult?.valid ? samanthaReportResult.report : undefined;
  const samanthaEvidence = samanthaReport ? convertSamanthaReportToEvidence(samanthaReport) : [];
  const samanthaSignals = samanthaReport ? convertSamanthaReportToSignals(samanthaReport) : [];
  const samanthaEstimateAccepted = samanthaReport ? shouldAcceptSuggestedEstimate(samanthaReport) : false;
  const deepAnalysis = mergeSamanthaResearchLayer(
    mergeWalletIntelligenceLayer(
      buildDeepAnalysisFromPolymarketMarket({
        item,
        normalizedUrl,
        url: normalizedUrl,
      }),
      walletSummary,
    ),
    samanthaReport,
  );
  const deepAnalysisSummary = summarizeDeepAnalysis(deepAnalysis);
  const deepLayers = deepAnalysis.layers.filter((layer) =>
    [
      "polymarket_market",
      "market_movement",
      "wallet_intelligence",
      "wallet_profiles",
      "external_research",
      "odds_comparison",
      "kalshi_comparison",
      "category_context",
      "evidence_scoring",
      "history_tracking",
      "resolution",
    ].includes(layer.id),
  );
  const topWallets = walletSummary.topWallets ?? [];
  const latestHistory = relatedHistory[0];
  const marketLayer = findLayer(analyzerResult, "market");
  const probabilityLayer = findLayer(analyzerResult, "probabilities");
  const estimateLayer = findLayer(analyzerResult, "polysignal_estimate");
  const contextLayer = findLayer(analyzerResult, "event_context");
  const researchLayer = findLayer(analyzerResult, "research");
  const walletLayer = findLayer(analyzerResult, "wallet_intelligence");
  const historyLayer = findLayer(analyzerResult, "history");
  const resolutionLayer = findLayer(analyzerResult, "resolution");
  const saveActionLabel = saved
    ? "Guardar nuevo analisis"
    : analyzerResult.polySignalEstimateAvailable
      ? "Guardar analisis"
      : "Guardar como seguimiento";
  const nextActionCopy = saved
    ? "Ya esta guardado en Historial. Puedes revisar su estado o guardar una lectura nueva si quieres comparar cambios."
    : analyzerResult.polySignalEstimateAvailable
      ? "Guarda esta lectura para medirla cuando el mercado tenga resultado confiable."
      : "No hay estimacion propia suficiente; puedes guardarlo como seguimiento sin convertirlo en prediccion.";
  const jobSummary = deepAnalysisJob ? getJobProgressSummary(deepAnalysisJob) : null;

  function handleLoadSamanthaReport() {
    const result = parseSamanthaResearchReport(samanthaReportInput);
    setSamanthaReportResult(result);
    if (result.valid && result.report && deepAnalysisJob) {
      const nextJob = markJobSamanthaReportLoaded(deepAnalysisJob, {
        acceptedEstimate: shouldAcceptSuggestedEstimate(result.report),
        signalCount: convertSamanthaReportToSignals(result.report).length,
      });
      const storedJob = updateDeepAnalysisJob(nextJob) ?? nextJob;
      onDeepAnalysisJobChange?.(storedJob);
    }
    setSamanthaActionMessage(
      result.valid
        ? "Reporte de Samantha cargado y validado localmente."
        : "El reporte de Samantha no paso la validacion.",
    );
  }

  async function handleCopySamanthaBrief() {
    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(samanthaBriefText);
      setSamanthaActionMessage("Brief copiado para Samantha.");
    } catch {
      setSamanthaActionMessage("No pudimos copiar el brief; puedes descargarlo.");
    }
  }

  function handleDownloadSamanthaBrief() {
    if (typeof window === "undefined") {
      return;
    }
    const blob = new Blob([samanthaBriefText], { type: "application/json" });
    const href = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "samantha-research-brief.json";
    anchor.rel = "noopener";
    anchor.click();
    window.URL.revokeObjectURL(href);
    setSamanthaActionMessage("Brief descargado para flujo manual.");
  }

  return (
    <article className="analyzer-report-card">
      <header className="analyzer-report-header">
        <div className="analyzer-report-title">
          <div className="analyzer-report-badges">
            <span className={`market-status-badge ${status.tone}`}>{status.label}</span>
            <span className={`market-intent-badge ${reason.tone}`}>{reason.label}</span>
            {activity ? (
              <span className={`market-activity-badge ${activity.tone}`}>{activity.label}</span>
            ) : null}
          </div>
          <p className="eyebrow">Centro de analisis</p>
          <h3>{marketTitle(item)}</h3>
          <p>{eventTitle(item)}</p>
          <small>
            Fuente principal: datos leidos desde Polymarket - {formatDate(latestUpdate(item))} - Coincidencia {matchScore}
          </small>
        </div>
        <div className="analyzer-report-actions">
          {saved ? (
            <span className="saved-pill">Ya guardado</span>
          ) : null}
          <button
            className={`watchlist-button ${saved ? "" : "active"}`}
            disabled={busy}
            onClick={() => onSaveHistory(item)}
            type="button"
          >
            {saveActionLabel}
          </button>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
          {item.market?.id ? (
            <>
              <a className="analysis-link" href={`/markets/${item.market.id}`}>
                Ver detalle
              </a>
              <button
                className={`watchlist-button ${watchlisted ? "active" : ""}`}
                disabled={busy}
                onClick={() => onToggleWatchlist(item)}
                type="button"
              >
                {watchlisted ? "En seguimiento local" : "Seguir en local"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section className="analyzer-executive-summary" aria-label="Resumen ejecutivo del analisis">
        <div className="analyzer-executive-copy">
          <p className="eyebrow">Resumen del analisis</p>
          <h4>Que encontro PolySignal</h4>
          <strong>{analyzerSummary.headline}</strong>
          <p>{analyzerSummary.detail}</p>
        </div>
        <div className="analyzer-executive-grid">
          <div className="analyzer-executive-card primary">
            <span>Probabilidad del mercado</span>
            {probabilityState.market ? (
              <strong>
                YES {formatProbability(probabilityState.market.yes)} - NO {formatProbability(probabilityState.market.no)}
              </strong>
            ) : outcomePrices ? (
              <strong>{outcomePrices}</strong>
            ) : (
              <strong>Sin precio visible suficiente</strong>
            )}
            <small>Precio de Polymarket; no es prediccion PolySignal.</small>
          </div>
          <div className="analyzer-executive-card">
            <span>Estimacion PolySignal</span>
            {probabilityState.polySignal ? (
              <strong>
                YES {formatProbability(probabilityState.polySignal.yes)} - NO {formatProbability(probabilityState.polySignal.no)}
              </strong>
            ) : (
              <strong>Sin estimacion propia suficiente</strong>
            )}
            <small>{getEstimateQualityLabel(estimateQuality)}</small>
          </div>
          <div className="analyzer-executive-card">
            <span>Decision de PolySignal</span>
            <strong>{analyzerDecision.label}</strong>
            <small>{analyzerResult.decisionReason}</small>
          </div>
          <div className="analyzer-executive-card">
            <span>Cuenta para Historial</span>
            <strong>{analyzerResult.canCountForAccuracy ? "Si, cuando cierre" : "No, falta estimacion propia"}</strong>
            <small>{analyzerDecision.note}</small>
          </div>
        </div>
        <p className="analyzer-report-note">
          PolySignal separa el precio del mercado de su estimacion propia. Si no hay senales
          independientes suficientes, no genera prediccion.
        </p>
      </section>

      <section className="analyzer-source-strip" aria-label="Fuentes del analisis">
        <strong>Fuentes del analisis</strong>
        <span>Precio: Polymarket</span>
        <span>Mercado/evento: datos publicos de Polymarket</span>
        <span>Billeteras: {sourceLabel(walletSummary)}</span>
        <span>Resolucion: Polymarket si aplica</span>
        <span>Investigacion externa: {research.verifiedVisibleCount > 0 ? "fuentes verificadas" : "pendiente"}</span>
        <span>Historial: este navegador</span>
      </section>

      {deepAnalysisJob && jobSummary ? (
        <section className="analyzer-deep-job-state" aria-label="Estado del analisis profundo">
          <div className="probability-display-heading">
            <div>
              <p className="eyebrow">Estado del analisis profundo</p>
              <h4>{jobSummary.headline}</h4>
            </div>
            <span>
              {jobSummary.completedSteps}/{jobSummary.totalSteps} pasos
            </span>
          </div>
          <p className="analyzer-report-note">{jobSummary.detail}</p>
          <ol className="deep-job-step-list">
            {deepAnalysisJob.steps.map((step) => (
              <li className={step.status} key={step.id}>
                <span>{jobStepStatusLabel(step.status)}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.summary}</small>
                  {step.requiresManualInput ? <em>Requiere accion manual</em> : null}
                  {step.requiresExternalIntegration ? <em>Pendiente de integracion segura</em> : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="section-note">
            El analisis profundo no esta completo hasta cargar evidencia externa suficiente o
            contar con fuentes independientes validadas.
          </p>
          <p className="section-note">
            Estado manual: Esperando reporte de Samantha cuando el brief ya esta listo y la
            investigacion externa aun no fue cargada.
          </p>
          <div className="watchlist-actions">
            <button
              className="watchlist-button"
              disabled={!samanthaBriefValidation.valid}
              onClick={handleCopySamanthaBrief}
              type="button"
            >
              Copiar brief para Samantha
            </button>
            <a className="analysis-link secondary" href="#samantha-research">
              Pegar reporte de Samantha
            </a>
            <button
              className="watchlist-button"
              disabled={busy}
              onClick={() => onSaveHistory(item)}
              type="button"
            >
              Guardar en Historial como pendiente
            </button>
          </div>
          <p className="section-note">{jobSummary.nextAction}</p>
        </section>
      ) : null}

      <section className="analyzer-deep-readiness" aria-label="Analisis profundo">
        <div className="probability-display-heading">
          <div>
            <p className="eyebrow">Analisis profundo</p>
            <h4>Capas del motor</h4>
          </div>
          <span>{deepAnalysis.decision.available ? "Decision disponible" : "Decision pendiente"}</span>
        </div>
        <p className="analyzer-report-note">{deepAnalysisSummary}</p>
        <div className="analyzer-deep-layer-grid">
          {deepLayers.map((layer) => (
            <article className={`analyzer-deep-layer ${layer.status}`} key={layer.id}>
              <span>{deepLayerStatusLabel(layer.status)}</span>
              <strong>{layer.label}</strong>
              <p>{layer.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="samantha-research-panel" id="samantha-research" aria-label="Investigacion con Samantha">
        <div className="probability-display-heading">
          <div>
            <p className="eyebrow">Investigacion externa manual</p>
            <h4>Investigacion con Samantha</h4>
          </div>
          <span>
            {samanthaReportResult?.valid
              ? "Evidencia cargada"
              : samanthaReportResult
                ? "Reporte invalido"
                : "Brief listo"}
          </span>
        </div>
        <p className="analyzer-report-note">
          PolySignal prepara un brief local para Samantha. No ejecuta agentes, no envia datos a terceros y no
          convierte el reporte en prediccion sin validacion.
        </p>
        <div className="samantha-action-row">
          <button
            className="watchlist-button"
            disabled={!samanthaBriefValidation.valid}
            onClick={handleCopySamanthaBrief}
            type="button"
          >
            Copiar brief para Samantha
          </button>
          <button
            className="watchlist-button"
            disabled={!samanthaBriefValidation.valid}
            onClick={handleDownloadSamanthaBrief}
            type="button"
          >
            Descargar brief
          </button>
          <span>{samanthaBriefValidation.valid ? "Brief validado" : "Brief no disponible"}</span>
        </div>
        {samanthaBriefValidation.errors.length > 0 ? (
          <div className="wallet-warning-list">
            {samanthaBriefValidation.errors.map((error) => (
              <span className="warning-chip" key={error}>{error}</span>
            ))}
          </div>
        ) : null}
        <label className="samantha-report-input">
          <span>Pegar reporte estructurado de Samantha</span>
          <textarea
            onChange={(event) => setSamanthaReportInput(event.target.value)}
            placeholder='{"version":"1.0","status":"partial","marketUrl":"https://polymarket.com/...","evidence":[],"warnings":[]}'
            value={samanthaReportInput}
          />
        </label>
        <div className="samantha-action-row">
          <button
            className="watchlist-button active"
            disabled={!samanthaReportInput.trim()}
            onClick={handleLoadSamanthaReport}
            type="button"
          >
            Cargar reporte
          </button>
          <button
            className="watchlist-button"
            disabled={!samanthaReportInput && !samanthaReportResult}
            onClick={() => {
              setSamanthaReportInput("");
              setSamanthaReportResult(null);
              setSamanthaActionMessage("Reporte de Samantha limpiado.");
            }}
            type="button"
          >
            Limpiar reporte
          </button>
          {samanthaActionMessage ? <span>{samanthaActionMessage}</span> : null}
        </div>
        {samanthaReportResult && !samanthaReportResult.valid ? (
          <div className="wallet-warning-list">
            {samanthaReportResult.errors.slice(0, 5).map((error) => (
              <span className="warning-chip" key={error}>{error}</span>
            ))}
          </div>
        ) : null}
        {samanthaReport ? (
          <div className="samantha-evidence-summary">
            <div className="wallet-report-summary">
              <div>
                <span>Fuentes revisadas</span>
                <strong>{samanthaEvidence.length}</strong>
              </div>
              <div>
                <span>Senales estructuradas</span>
                <strong>{samanthaSignals.length}</strong>
              </div>
              <div>
                <span>Odds externas</span>
                <strong>{samanthaReport.oddsComparison?.found ? "comparadas" : "sin match"}</strong>
              </div>
              <div>
                <span>Kalshi</span>
                <strong>
                  {samanthaReport.kalshiComparison?.found && samanthaReport.kalshiComparison.equivalent
                    ? "equivalente"
                    : "no aceptado"}
                </strong>
              </div>
              <div>
                <span>Estimacion sugerida</span>
                <strong>{samanthaEstimateAccepted ? "validada" : "no aceptada"}</strong>
              </div>
            </div>
            {samanthaEstimateAccepted && samanthaReport.suggestedEstimate ? (
              <div className="samantha-estimate-card">
                <strong>Estimacion sugerida por investigacion</strong>
                <span>
                  {samanthaReport.suggestedEstimate.decision} · YES {samanthaReport.suggestedEstimate.yesProbability}% · NO{" "}
                  {samanthaReport.suggestedEstimate.noProbability}%
                </span>
                <p>{samanthaReport.suggestedEstimate.reason}</p>
              </div>
            ) : (
              <p className="section-note">
                La investigacion aporta contexto, pero no alcanza para una prediccion clara.
              </p>
            )}
            <div className="samantha-evidence-list">
              {samanthaEvidence.slice(0, 6).map((evidence) => (
                <article className="samantha-evidence-card" key={evidence.id}>
                  <span>{shortDirectionLabel(evidence.direction)} · {evidence.reliability}</span>
                  <strong>{evidence.title}</strong>
                  <p>{evidence.summary}</p>
                  <small>{evidence.sourceName}</small>
                </article>
              ))}
            </div>
            {samanthaReport.warnings.length > 0 ? (
              <div className="wallet-warning-list">
                {compactWarnings(samanthaReport.warnings, 4).map((warning) => (
                  <span className="warning-chip" key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="analyzer-report-layers" aria-label="Capas revisadas">
        <div className="probability-display-heading">
          <h4>Capas revisadas</h4>
          <span>Detalles compactos</span>
        </div>
        <div className="analyzer-layer-summary-row">
          <span>{marketLayer.summary}</span>
          <span>{probabilityLayer.summary}</span>
          <span>{estimateLayer.summary}</span>
        </div>

        <AnalyzerLayerDetails layer={contextLayer}>
          <div className="analyzer-layer-metrics">
            <span>Contexto: {formatSoccerMatchContext(context)}</span>
            <span>Equipos: {context.teamA?.name && context.teamB?.name ? `${context.teamA.name} / ${context.teamB.name}` : "pendientes"}</span>
            <span>Fecha: {context.startTime ? formatDate(context.startTime) : "pendiente"}</span>
            <span>Liga: {context.league ?? "no confirmada"}</span>
          </div>
          <p className="section-note">
            {contextReadiness.readyForExternalResearch
              ? "Contexto suficiente para preparar investigacion futura."
              : "El contexto esta incompleto y no genera una prediccion por si solo."}
          </p>
          {compactWarnings([...contextReadiness.missing, ...context.warnings], 5).length > 0 ? (
            <div className="data-health-notes">
              {compactWarnings([...contextReadiness.missing, ...context.warnings], 5).map((warning) => (
                <span className="badge muted" key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={findLayer(analyzerResult, "probabilities")}>
          <div className="analyzer-layer-metrics">
            {probabilityState.market ? (
              <>
                <span>Precio Si {formatProbability(item.latest_snapshot?.yes_price)}</span>
                <span>Precio No {formatProbability(item.latest_snapshot?.no_price)}</span>
              </>
            ) : (
              <span>{outcomePrices ?? "Precios no disponibles"}</span>
            )}
            <span>Volumen {formatMetric(item.latest_snapshot?.volume)}</span>
            <span>Liquidez {formatMetric(item.latest_snapshot?.liquidity)}</span>
          </div>
          <p className="section-note">
            {probabilityState.marketDetail} {probabilityState.disclaimer}
          </p>
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={findLayer(analyzerResult, "polysignal_estimate")}>
          <div className="analyzer-layer-metrics">
            <span>Preparacion de datos: {readinessScore.score}/100</span>
            <span>Estado: {readiness.ready ? "estimacion disponible" : readiness.level === "partial" ? "datos parciales" : "sin estimacion suficiente"}</span>
            <span>Senales de mercado: {marketSignals.length}</span>
            <span>Senales independientes: {independentSignals.length}</span>
          </div>
          <p className="section-note">
            Preparacion de estimacion PolySignal: {readinessScore.disclaimer}
          </p>
          {missingEstimateData.length > 0 ? (
            <div className="data-health-notes">
              {missingEstimateData.slice(0, 5).map((reason) => (
                <span className="badge muted" key={reason}>{reason}</span>
              ))}
            </div>
          ) : null}
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={researchLayer}>
          <div className="analyzer-layer-metrics">
            <span>{research.label}</span>
            <span>Fuentes verificadas: {research.verifiedVisibleCount}</span>
            <span>Categorias disponibles: {research.availableCategories}</span>
          </div>
          <p className="section-note">
            Sin fuentes externas verificadas todavia si no aparecen hallazgos reales en esta capa.
          </p>
          <div className="data-health-notes">
            {research.categories.slice(0, 6).map((category) => (
              <span
                className={category.status === "available" ? "badge external-hint" : "badge muted"}
                key={category.id}
              >
                {category.label}: {category.status === "available" ? "disponible" : category.status === "partial" ? "parcial" : "pendiente"}
              </span>
            ))}
          </div>
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={walletLayer}>
          <div className="wallet-report-summary">
            <div>
              <span>Billeteras relevantes</span>
              <strong>{walletSummary.relevantWalletsCount}</strong>
            </div>
            <div>
              <span>Capital observado</span>
              <strong>{formatUsd(walletSummary.analyzedCapitalUsd)}</strong>
            </div>
            <div>
              <span>Sesgo observado</span>
              <strong>{walletReading.biasLabel}</strong>
            </div>
            <div>
              <span>Confianza</span>
              <strong>{walletReading.confidenceLabel}</strong>
            </div>
            <div>
              <span>Umbral</span>
              <strong>${walletSummary.thresholdUsd}+</strong>
            </div>
            <div>
              <span>Fuente</span>
              <strong>{sourceLabel(walletSummary)}</strong>
            </div>
          </div>
          <p className="section-note">{walletReading.explanation}</p>
          {topWallets.length > 0 ? (
            <details className="wallet-report-drilldown">
              <summary>Ver todas las billeteras analizadas</summary>
              <div className="wallet-report-table" role="list">
                {topWallets.map((wallet) => (
                  <div
                    className="wallet-report-row"
                    key={`${wallet.shortAddress}-${wallet.side}-${wallet.amountUsd}`}
                    role="listitem"
                  >
                    <strong>{wallet.shortAddress}</strong>
                    <span>{wallet.side === "UNKNOWN" ? "lado no confirmado" : wallet.side}</span>
                    <span>{formatUsd(wallet.amountUsd)}</span>
                    {typeof wallet.unrealizedPnlUsd === "number" ? (
                      <span>PnL publico {formatUsd(wallet.unrealizedPnlUsd)}</span>
                    ) : (
                      <span>PnL no disponible</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="section-note">
                Datos publicos solo lectura. No identifica personas reales ni recomienda copiar traders.
              </p>
            </details>
          ) : (
            <p className="section-note">
              No hay suficiente actividad publica de billeteras para este mercado.
            </p>
          )}
          <div className="data-health-notes">
            {walletReadiness.checklist.slice(0, 5).map((entry) => (
              <span className={entry.available ? "badge external-hint" : "badge muted"} key={entry.label}>
                {entry.label}: {entry.available ? "disponible" : "pendiente"}
              </span>
            ))}
          </div>
          {walletReading.warnings.length > 0 ? (
            <div className="wallet-warning-list">
              {compactWarnings(walletReading.warnings, 4).map((warning) => (
                <span className="warning-chip" key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={historyLayer}>
          {latestHistory ? (
            <div className="related-history-card compact">
              <div>
                <strong>Ya analizaste este mercado</strong>
                <span>{formatDate(latestHistory.analyzedAt)}</span>
              </div>
              <div className="data-health-notes">
                <span className="badge">{historyDecisionLabel(latestHistory)}</span>
                <span className="badge muted">{historyResultLabel(latestHistory)}</span>
                {latestHistory.resolutionSource && latestHistory.resolutionSource !== "unknown" ? (
                  <span className="badge external-hint">Verificado</span>
                ) : null}
              </div>
              <p className="section-note">
                Puedes guardar una nueva lectura si quieres dejar constancia de una revision mas reciente.
              </p>
            </div>
          ) : (
            <p className="section-note">
              Este mercado aun no esta en tu historial. Si guardas el analisis, queda como lectura local.
            </p>
          )}
        </AnalyzerLayerDetails>

        <AnalyzerLayerDetails layer={resolutionLayer}>
          <p className="section-note">{resolutionLayer.summary}</p>
          {resolutionLayer.warnings.length > 0 ? (
            <div className="data-health-notes">
              {compactWarnings(resolutionLayer.warnings, 4).map((warning) => (
                <span className="badge muted" key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
        </AnalyzerLayerDetails>
      </section>

      <section className="analyzer-next-actions" aria-label="Que puedes hacer ahora">
        <div>
          <p className="eyebrow">Siguiente paso</p>
          <h4>Que puedes hacer ahora</h4>
          <p>{nextActionCopy}</p>
        </div>
        <div className="watchlist-actions">
          <button
            className={`watchlist-button ${saved ? "" : "active"}`}
            disabled={busy}
            onClick={() => onSaveHistory(item)}
            type="button"
          >
            {saveActionLabel}
          </button>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
          {item.market?.id ? (
            <a className="analysis-link secondary" href={`/markets/${item.market.id}`}>
              Ver detalle del mercado
            </a>
          ) : null}
          {item.market?.id ? (
            <button
              className={`watchlist-button ${watchlisted ? "active" : ""}`}
              disabled={busy}
              onClick={() => onToggleWatchlist(item)}
              type="button"
            >
              {watchlisted ? "En seguimiento local" : "Seguir en local"}
            </button>
          ) : null}
          <a className="analysis-link secondary" href="/analyze">
            Analizar otro enlace
          </a>
        </div>
      </section>
    </article>
  );
}
