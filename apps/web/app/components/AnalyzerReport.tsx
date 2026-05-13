"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  markJobReceivingSamanthaReport,
  markJobSamanthaBridgeFallback,
  markJobSamanthaReportLoaded,
  markJobSamanthaResearching,
  markJobValidatingSamanthaReport,
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
  buildConservativePolySignalEstimate,
  buildConservativePolySignalSignalMix,
  type PolySignalEstimateResult,
} from "../lib/polySignalSignalMixer";
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
import { buildSamanthaTaskPacket } from "../lib/samanthaTaskPacket";
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
  initialSamanthaReportResult?: SamanthaResearchParseResult | null;
  item: AnalyzeMarketItem;
  matchScore: number;
  normalizedUrl: string;
  onDeepAnalysisJobChange?: (job: DeepAnalysisJob) => void;
  onSaveHistory: (item: MarketOverviewItem, estimate?: PolySignalEstimateResult) => void;
  onToggleWatchlist: (item: MarketOverviewItem) => void;
  relatedHistory: AnalysisHistoryItem[];
  saved: boolean;
  watchlisted: boolean;
};

type SamanthaStatusRouteResult = {
  automaticAvailable?: boolean;
  bridgeTaskStatus?: string;
  fallbackRequired?: boolean;
  reason?: string;
  report?: unknown;
  status?: string;
  taskId?: string;
  validationErrors?: string[];
  warnings?: string[];
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
  if (summary.source === "polymarket_data") {
    return "Polymarket Data API de solo lectura";
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

function estimateConfidenceLabel(confidence: PolySignalEstimateResult["confidence"]): string {
  if (confidence === "high") {
    return "Alta";
  }
  if (confidence === "medium") {
    return "Media";
  }
  if (confidence === "low") {
    return "Baja";
  }
  return "Sin confianza";
}

function estimateDecisionLabel(estimate: PolySignalEstimateResult): string {
  if (!estimate.available) {
    return "Decision pendiente";
  }
  if (estimate.decisionSide === "YES" || estimate.decisionSide === "NO") {
    return `Decision clara: ${estimate.decisionSide}`;
  }
  return "Sin decision fuerte";
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
  initialSamanthaReportResult,
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
  const [samanthaReportDraftResult, setSamanthaReportDraftResult] =
    useState<SamanthaResearchParseResult | null>(null);
  const [samanthaReportResult, setSamanthaReportResult] =
    useState<SamanthaResearchParseResult | null>(null);
  const [samanthaActionMessage, setSamanthaActionMessage] = useState("");
  const [samanthaLookupBusy, setSamanthaLookupBusy] = useState(false);
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
  const walletProfiles = walletSummary.profileSummaries ?? [];
  const availableWalletProfiles = walletProfiles.filter((profile) => profile.profileAvailable);
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
  const samanthaTaskPacket = useMemo(() => buildSamanthaTaskPacket(samanthaBrief), [samanthaBrief]);
  const samanthaBriefValidation = useMemo(() => validateResearchBrief(samanthaBrief), [samanthaBrief]);
  const samanthaBridgeTaskId =
    deepAnalysisJob?.samanthaBridge?.taskId ??
    deepAnalysisJob?.samanthaBridge?.bridgeTaskId;
  const samanthaNeedsManualResearch =
    deepAnalysisJob?.samanthaBridge?.bridgeStatus === "manual_needed" ||
    (deepAnalysisJob?.samanthaBridge?.fallbackRequired === true &&
      deepAnalysisJob.status === "awaiting_samantha");
  const samanthaDraftReport = samanthaReportDraftResult?.valid ? samanthaReportDraftResult.report : undefined;
  const samanthaReport = samanthaReportResult?.valid ? samanthaReportResult.report : undefined;
  const samanthaDraftEvidence = samanthaDraftReport ? convertSamanthaReportToEvidence(samanthaDraftReport) : [];
  const samanthaDraftSignals = samanthaDraftReport ? convertSamanthaReportToSignals(samanthaDraftReport) : [];
  const samanthaEvidence = samanthaReport ? convertSamanthaReportToEvidence(samanthaReport) : [];
  const samanthaSignals = samanthaReport ? convertSamanthaReportToSignals(samanthaReport) : [];
  const samanthaEstimateAccepted = samanthaReport ? shouldAcceptSuggestedEstimate(samanthaReport) : false;
  const polySignalEstimate = buildConservativePolySignalEstimate({
    marketImpliedProbability: probabilityState.market,
    samanthaReport,
    walletSignal: walletSummary,
  });
  const signalMix = buildConservativePolySignalSignalMix({
    externalOddsSignalAvailable: Boolean(samanthaReport?.oddsComparison?.found),
    marketImpliedProbability: probabilityState.market,
    samanthaReport,
    samanthaResearchSignalCount: samanthaSignals.length,
    walletSignal: walletSummary,
  });
  const displayedPolySignalProbability = polySignalEstimate.available
    ? {
        no: polySignalEstimate.estimateNoProbability,
        yes: polySignalEstimate.estimateYesProbability,
      }
    : probabilityState.polySignal;
  const displayedPolySignalDetail = polySignalEstimate.available
    ? polySignalEstimate.explanation
    : probabilityState.polySignalDetail;
  const displayedDecisionLabel = polySignalEstimate.available
    ? estimateDecisionLabel(polySignalEstimate)
    : analyzerDecision.label;
  const displayedDecisionDetail = polySignalEstimate.available
    ? polySignalEstimate.explanation
    : analyzerResult.decisionReason;
  const displayedCountsForHistory =
    polySignalEstimate.countsForHistoryAccuracy || analyzerResult.canCountForAccuracy;
  const samanthaDraftDirectionCounts = samanthaDraftEvidence.reduce(
    (counts, evidence) => ({
      ...counts,
      [evidence.direction]: (counts[evidence.direction] ?? 0) + 1,
    }),
    { NEUTRAL: 0, NO: 0, UNKNOWN: 0, YES: 0 } as Record<string, number>,
  );
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
    : polySignalEstimate.available || analyzerResult.polySignalEstimateAvailable
      ? "Guardar analisis"
      : "Guardar como seguimiento";
  const nextActionCopy = saved
    ? "Ya esta guardado en Historial. Puedes revisar su estado o guardar una lectura nueva si quieres comparar cambios."
    : polySignalEstimate.available || analyzerResult.polySignalEstimateAvailable
      ? "Guarda esta lectura para medirla cuando el mercado tenga resultado confiable."
      : "No hay estimacion propia suficiente; puedes guardarlo como seguimiento sin convertirlo en prediccion.";
  const jobSummary = deepAnalysisJob ? getJobProgressSummary(deepAnalysisJob) : null;

  useEffect(() => {
    if (!initialSamanthaReportResult) {
      return;
    }
    setSamanthaReportDraftResult(initialSamanthaReportResult);
    setSamanthaReportResult(initialSamanthaReportResult.valid ? initialSamanthaReportResult : null);
    setSamanthaActionMessage(
      initialSamanthaReportResult.valid
        ? "Reporte automatico de Samantha validado y cargado."
        : "Samantha devolvio un reporte, pero no paso la validacion.",
    );
  }, [initialSamanthaReportResult]);

  function handleValidateSamanthaReport() {
    const result = parseSamanthaResearchReport(samanthaReportInput);
    setSamanthaReportDraftResult(result);
    setSamanthaActionMessage(
      result.valid
        ? "Reporte de Samantha valido. Revisa el resumen y aplicalo al analisis."
        : "El reporte de Samantha no paso la validacion.",
    );
  }

  function handleApplySamanthaReport() {
    const result =
      samanthaReportDraftResult?.valid
        ? samanthaReportDraftResult
        : parseSamanthaResearchReport(samanthaReportInput);
    setSamanthaReportDraftResult(result);
    if (!result.valid || !result.report) {
      setSamanthaActionMessage("Primero corrige el reporte de Samantha.");
      return;
    }
    setSamanthaReportResult(result);
    if (deepAnalysisJob) {
      const nextEstimate = buildConservativePolySignalEstimate({
        marketImpliedProbability: probabilityState.market,
        samanthaReport: result.report,
        walletSignal: walletSummary,
      });
      const nextJob = markJobSamanthaReportLoaded(deepAnalysisJob, {
        acceptedEstimate: nextEstimate.countsForHistoryAccuracy,
        kalshiEquivalent: result.report.kalshiComparison?.found === true && result.report.kalshiComparison.equivalent === true,
        oddsFound: result.report.oddsComparison?.found === true,
        reportStatus: result.report.status,
        signalCount: convertSamanthaReportToSignals(result.report).length,
      });
      const storedJob = updateDeepAnalysisJob(nextJob) ?? nextJob;
      onDeepAnalysisJobChange?.(storedJob);
    }
    setSamanthaActionMessage("Reporte aplicado al analisis profundo.");
  }

  async function handleCheckSamanthaStatus() {
    if (!samanthaBridgeTaskId || !deepAnalysisJob) {
      setSamanthaActionMessage("Todavia no hay una tarea automatica de Samantha para consultar.");
      return;
    }
    setSamanthaLookupBusy(true);
    try {
      const response = await fetch("/api/samantha/research-status", {
        body: JSON.stringify({ taskId: samanthaBridgeTaskId }),
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        redirect: "error",
      });
      const result = (await response.json().catch(() => ({}))) as SamanthaStatusRouteResult;
      if (!response.ok) {
        setSamanthaActionMessage(result.reason || "No pudimos consultar el estado de Samantha.");
        return;
      }
      if (result.report) {
        let nextJob = updateDeepAnalysisJob(markJobReceivingSamanthaReport(deepAnalysisJob)) ?? markJobReceivingSamanthaReport(deepAnalysisJob);
        nextJob = updateDeepAnalysisJob(markJobValidatingSamanthaReport(nextJob)) ?? markJobValidatingSamanthaReport(nextJob);
        const reportResult = parseSamanthaResearchReport(result.report);
        setSamanthaReportDraftResult(reportResult);
        if (!reportResult.valid || !reportResult.report) {
          nextJob =
            updateDeepAnalysisJob(
              markJobSamanthaBridgeFallback(nextJob, {
                automaticAvailable: true,
                reason:
                  reportResult.errors[0] ||
                  "Samantha devolvio un reporte, pero no paso la validacion PolySignal.",
                warnings: reportResult.errors.slice(0, 4),
              }),
            ) ?? nextJob;
          onDeepAnalysisJobChange?.(nextJob);
          setSamanthaActionMessage("Samantha devolvio un reporte invalido; sigue disponible el flujo manual.");
          return;
        }
        setSamanthaReportResult(reportResult);
        const nextEstimate = buildConservativePolySignalEstimate({
          marketImpliedProbability: probabilityState.market,
          samanthaReport: reportResult.report,
          walletSignal: walletSummary,
        });
        nextJob =
          updateDeepAnalysisJob(
            markJobSamanthaReportLoaded(nextJob, {
              acceptedEstimate: nextEstimate.countsForHistoryAccuracy,
              kalshiEquivalent:
                reportResult.report.kalshiComparison?.found === true &&
                reportResult.report.kalshiComparison.equivalent === true,
              oddsFound: reportResult.report.oddsComparison?.found === true,
              reportStatus: reportResult.report.status,
              signalCount: convertSamanthaReportToSignals(reportResult.report).length,
            }),
          ) ?? nextJob;
        onDeepAnalysisJobChange?.(nextJob);
        setSamanthaActionMessage("Reporte de Samantha consultado, validado y cargado.");
        return;
      }
      if (result.status === "manual_needed" || result.fallbackRequired) {
        const nextJob =
          updateDeepAnalysisJob(
            markJobSamanthaBridgeFallback(deepAnalysisJob, {
              automaticAvailable: result.automaticAvailable,
              reason:
                result.reason ||
                "Samantha marco la tarea como pendiente de investigacion manual.",
              warnings: result.warnings ?? result.validationErrors ?? [],
            }),
          ) ?? deepAnalysisJob;
        onDeepAnalysisJobChange?.(nextJob);
        setSamanthaActionMessage(
          "Samantha recibio la tarea, pero todavia necesita investigacion externa manual para completar este analisis.",
        );
        return;
      }
      const nextJob =
        updateDeepAnalysisJob(
          markJobSamanthaResearching(deepAnalysisJob, {
            bridgeStatus:
              result.bridgeTaskStatus === "processing"
                ? "processing"
                : result.bridgeTaskStatus === "pending"
                  ? "pending"
                  : undefined,
            reason:
              result.reason ||
              "Samantha mantiene la tarea en cola; la investigacion sigue pendiente.",
            taskId: result.taskId || samanthaBridgeTaskId,
          }),
        ) ?? deepAnalysisJob;
      onDeepAnalysisJobChange?.(nextJob);
      setSamanthaActionMessage(result.reason || "Samantha todavia no devolvio un reporte.");
    } catch {
      setSamanthaActionMessage("No pudimos consultar Samantha de forma segura; usa el flujo manual.");
    } finally {
      setSamanthaLookupBusy(false);
    }
  }

  async function copyTextToClipboard(text: string, successMessage: string) {
    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(text);
      setSamanthaActionMessage(successMessage);
    } catch {
      setSamanthaActionMessage("No pudimos copiarlo; puedes descargar el archivo.");
    }
  }

  function downloadTextFile(filename: string, text: string, type: string) {
    if (typeof window === "undefined") {
      return;
    }
    const blob = new Blob([text], { type });
    const href = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.click();
    window.URL.revokeObjectURL(href);
  }

  async function handleCopySamanthaTask() {
    await copyTextToClipboard(
      samanthaTaskPacket.samanthaInstructionsText,
      "Tarea completa copiada para Samantha.",
    );
  }

  function handleDownloadSamanthaTaskJson() {
    downloadTextFile("samantha-task-packet.json", samanthaTaskPacket.taskPacketJson, "application/json");
    setSamanthaActionMessage("Tarea JSON descargada para Samantha.");
  }

  function handleDownloadSamanthaInstructions() {
    downloadTextFile("samantha-instructions.txt", samanthaTaskPacket.samanthaInstructionsText, "text/plain");
    setSamanthaActionMessage("Instrucciones TXT descargadas para Samantha.");
  }

  async function handleCopySamanthaSchema() {
    await copyTextToClipboard(
      samanthaTaskPacket.expectedReportSchema,
      "Schema de respuesta copiado.",
    );
  }

  function handleDownloadSamanthaBrief() {
    downloadTextFile("samantha-research-brief.json", samanthaBriefText, "application/json");
    setSamanthaActionMessage("Brief JSON descargado para flujo manual.");
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
            onClick={() => onSaveHistory(item, polySignalEstimate)}
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
            {displayedPolySignalProbability ? (
              <strong>
                YES {formatProbability(displayedPolySignalProbability.yes)} - NO {formatProbability(displayedPolySignalProbability.no)}
              </strong>
            ) : (
              <strong>Sin estimacion propia suficiente</strong>
            )}
            <small>
              {polySignalEstimate.available
                ? `Compuertas superadas - confianza ${estimateConfidenceLabel(polySignalEstimate.confidence)}`
                : getEstimateQualityLabel(estimateQuality)}
            </small>
          </div>
          <div className="analyzer-executive-card">
            <span>Decision de PolySignal</span>
            <strong>{displayedDecisionLabel}</strong>
            <small>{displayedDecisionDetail}</small>
          </div>
          <div className="analyzer-executive-card">
            <span>Cuenta para Historial</span>
            <strong>{displayedCountsForHistory ? "Si, cuando cierre" : "No, falta estimacion propia"}</strong>
            <small>
              {displayedCountsForHistory
                ? "Cuenta solo si Polymarket confirma resultado final verificable."
                : analyzerDecision.note}
            </small>
          </div>
        </div>
        <p className="analyzer-report-note">
          PolySignal separa el precio del mercado de su estimacion propia. Si no hay senales
          independientes suficientes, no genera prediccion.
        </p>
      </section>

      <section className="samantha-evidence-summary" aria-label="Estimacion PolySignal">
        <div className="probability-display-heading">
          <div>
            <p className="eyebrow">Estimacion PolySignal</p>
            <h4>
              {polySignalEstimate.available
                ? "Porcentaje propio generado con compuertas"
                : "Estimacion PolySignal pendiente"}
            </h4>
          </div>
          <span>{polySignalEstimate.available ? estimateConfidenceLabel(polySignalEstimate.confidence) : "Pendiente"}</span>
        </div>
        {polySignalEstimate.available ? (
          <>
            <div className="wallet-report-summary">
              <div>
                <span>YES</span>
                <strong>{formatProbability(polySignalEstimate.estimateYesProbability)}</strong>
              </div>
              <div>
                <span>NO</span>
                <strong>{formatProbability(polySignalEstimate.estimateNoProbability)}</strong>
              </div>
              <div>
                <span>Decision</span>
                <strong>{estimateDecisionLabel(polySignalEstimate)}</strong>
              </div>
              <div>
                <span>Soportes</span>
                <strong>{polySignalEstimate.readiness.independentSupportCount}</strong>
              </div>
            </div>
            <p className="section-note">{polySignalEstimate.explanation}</p>
            <div className="samantha-evidence-list">
              {polySignalEstimate.contributions.slice(0, 6).map((contribution) => (
                <article
                  className="samantha-evidence-card"
                  key={`${contribution.source}-${contribution.label}`}
                >
                  <span>
                    {shortDirectionLabel(contribution.direction)} -{" "}
                    {contribution.usedForEstimate ? "usada" : "referencia"}
                  </span>
                  <strong>{contribution.label}</strong>
                  <p>{contribution.summary}</p>
                  <small>{contribution.source.replace(/_/g, " ")}</small>
                </article>
              ))}
            </div>
            <p className="section-note">
              Esto no es consejo financiero ni garantia. El precio del mercado se mantiene como referencia separada.
            </p>
          </>
        ) : (
          <>
            <p className="section-note">
              Todavia no hay suficiente evidencia para generar un porcentaje propio.
              PolySignal necesita Samantha validada y al menos un soporte independiente real.
            </p>
            <div className="wallet-warning-list">
              {polySignalEstimate.blockers.slice(0, 5).map((entry) => (
                <span className="warning-chip" key={entry.code}>{entry.label}</span>
              ))}
            </div>
            <p className="section-note">{polySignalEstimate.explanation}</p>
          </>
        )}
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
              <p className="eyebrow">Progreso del analisis</p>
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
            Estado actual: Esperando investigacion externa.
          </p>
          <p className="section-note">
            El analisis todavia no esta terminado. Ya leimos el mercado y preparamos
            la tarea de investigacion, pero falta recibir o cargar el reporte externo
            de Samantha. Puedes guardar este analisis y continuarlo despues.
          </p>
          <div className="watchlist-actions">
            <button
              className="watchlist-button"
              disabled={!samanthaBridgeTaskId || samanthaLookupBusy}
              onClick={handleCheckSamanthaStatus}
              type="button"
            >
              {samanthaLookupBusy ? "Consultando Samantha" : "Consultar resultado de Samantha"}
            </button>
            <a className="analysis-link secondary" href="#samantha-research">
              Cargar reporte manual
            </a>
            <button
              className="watchlist-button"
              disabled={!samanthaBriefValidation.valid}
              onClick={handleDownloadSamanthaTaskJson}
              type="button"
            >
              Descargar tarea
            </button>
            <button
              className="watchlist-button"
              disabled={!samanthaBriefValidation.valid}
              onClick={() =>
                void copyTextToClipboard(
                  samanthaTaskPacket.samanthaInstructionsText,
                  "Instrucciones para Samantha copiadas.",
                )
              }
              type="button"
            >
              Copiar instrucciones
            </button>
            <button
              className="watchlist-button"
              disabled={busy}
              onClick={() => onSaveHistory(item, polySignalEstimate)}
              type="button"
            >
              Guardar y continuar despues
            </button>
            <a className="analysis-link secondary" href="/history">
              Ver en historial
            </a>
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
          Copia esta tarea y enviala a Samantha. Cuando Samantha devuelva el JSON,
          pegalo aqui para continuar el analisis. PolySignal no ejecuta agentes,
          no envia datos a terceros y no convierte el reporte en prediccion sin validacion.
        </p>
        {samanthaNeedsManualResearch ? (
          <div className="focus-notice active">
            <strong>Samantha necesita investigacion manual</strong>
            <span>
              Samantha recibio la tarea, pero todavia necesita investigacion externa
              manual para completar este analisis. Puedes cargar un reporte manual o
              volver a consultar mas tarde.
            </span>
          </div>
        ) : null}
        <p className="section-note">
          {samanthaBriefValidation.valid
            ? "Tarea de investigacion validada y lista para descargar, copiar o guardar desde el bloque de progreso."
            : "Tarea de investigacion no disponible todavia."}
        </p>
        {samanthaBridgeTaskId ? (
          <p className="section-note">
            Tarea enviada a Samantha: {samanthaBridgeTaskId}. Si Samantha responde
            pendiente o manual_needed, el analisis sigue esperando investigacion y
            el fallback manual permanece disponible.
          </p>
        ) : null}
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
            onChange={(event) => {
              setSamanthaReportInput(event.target.value);
              setSamanthaReportDraftResult(null);
            }}
            placeholder='{"version":"1.0","status":"partial","marketUrl":"https://polymarket.com/...","evidence":[{"id":"source-1","title":"Fuente revisada","sourceName":"Nombre de fuente","sourceType":"news","checkedAt":"2026-05-12T12:00:00.000Z","direction":"NEUTRAL","reliability":"medium","summary":"Resumen respaldado por fuente."}],"warnings":[]}'
            value={samanthaReportInput}
          />
        </label>
        <div className="samantha-action-row">
          <button
            className="watchlist-button"
            disabled={!samanthaReportInput.trim()}
            onClick={handleValidateSamanthaReport}
            type="button"
          >
            Validar reporte
          </button>
          <button
            className="watchlist-button active"
            disabled={!samanthaReportDraftResult?.valid}
            onClick={handleApplySamanthaReport}
            type="button"
          >
            Cargar reporte al analisis
          </button>
          <button
            className="watchlist-button"
            disabled={!samanthaReportInput && !samanthaReportDraftResult && !samanthaReportResult}
            onClick={() => {
              setSamanthaReportInput("");
              setSamanthaReportDraftResult(null);
              setSamanthaReportResult(null);
              setSamanthaActionMessage("Reporte de Samantha limpiado.");
            }}
            type="button"
          >
            Limpiar reporte
          </button>
          {samanthaActionMessage ? <span>{samanthaActionMessage}</span> : null}
        </div>
        {samanthaReportDraftResult && !samanthaReportDraftResult.valid ? (
          <div className="wallet-warning-list">
            {samanthaReportDraftResult.errors.slice(0, 8).map((error) => (
              <span className="warning-chip" key={error}>{error}</span>
            ))}
          </div>
        ) : null}
        {samanthaDraftReport ? (
          <div className="samantha-validation-preview">
            <strong>Reporte valido antes de aplicar</strong>
            <p>
              Encontramos {samanthaDraftEvidence.length} evidencias:
              {" "}YES {samanthaDraftDirectionCounts.YES ?? 0},
              {" "}NO {samanthaDraftDirectionCounts.NO ?? 0},
              {" "}NEUTRAL {samanthaDraftDirectionCounts.NEUTRAL ?? 0},
              {" "}UNKNOWN {samanthaDraftDirectionCounts.UNKNOWN ?? 0}.
              {" "}Senales estructuradas: {samanthaDraftSignals.length}.
            </p>
            <p className="section-note">
              Al aplicar, PolySignal actualiza el job profundo. Si la evidencia no pasa
              compuertas, quedara como contexto y no como prediccion.
            </p>
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
          <p className="section-note">
            Porcentaje PolySignal: {signalMix.reason}
          </p>
          <div className="data-health-notes">
            {polySignalEstimate.blockers.slice(0, 5).map((entry) => (
              <span className="badge muted" key={entry.code}>{entry.label}</span>
            ))}
            {polySignalEstimate.contributions
              .filter((contribution) => contribution.usedForEstimate)
              .slice(0, 4)
              .map((contribution) => (
                <span className="badge external-hint" key={`${contribution.source}-${contribution.label}`}>
                  {contribution.label}
                </span>
              ))}
          </div>
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
              No encontramos datos publicos suficientes de billeteras para este mercado.
              Este analisis no usara wallets como senal fuerte.
            </p>
          )}
          <div className="wallet-profile-summary">
            <strong>Perfil de billeteras</strong>
            {availableWalletProfiles.length > 0 ? (
              <div className="wallet-report-table" role="list">
                {availableWalletProfiles.slice(0, 3).map((profile) => (
                  <div className="wallet-report-row" key={profile.shortAddress} role="listitem">
                    <strong>{profile.shortAddress}</strong>
                    <span>{profile.resolvedMarketsCount ?? 0} mercados cerrados</span>
                    <span>
                      {typeof profile.winRate === "number" && typeof profile.wins === "number" && typeof profile.losses === "number"
                        ? `Win rate ${Math.round(profile.winRate * 100)}% (${profile.wins}-${profile.losses})`
                        : "Win rate no disponible"}
                    </span>
                    <span>Confianza {profile.confidence}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-note">
                No hay historial publico suficiente para calificar estas billeteras.
              </p>
            )}
          </div>
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
            onClick={() => onSaveHistory(item, polySignalEstimate)}
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
