import {
  getPolySignalDecision,
  type PolySignalDecision,
} from "./analysisDecision";
import type { AnalysisHistoryItem } from "./analysisHistory";
import { getEstimateQuality, getRealPolySignalProbabilities } from "./marketEstimateQuality";
import { getMarketImpliedProbabilities } from "./marketProbabilities";
import type { MarketOverviewItem } from "./marketOverview";
import { extractPolymarketSlug } from "./polymarketLink";
import {
  collectIndependentSignals,
  getEstimateReadiness,
  getEstimateReadinessScore,
} from "./estimationSignals";
import { getPolySignalEstimate } from "./polySignalEstimateEngine";
import { getResearchCoverage } from "./researchReadiness";
import { extractOutcomeFromMarketData } from "./marketResolution";
import {
  extractSoccerMatchContext,
  getSoccerContextReadiness,
} from "./soccerMatchContext";
import {
  getWalletIntelligenceSummary,
  getWalletSignalSummary,
  shouldUseWalletAsAuxiliarySignal,
} from "./walletIntelligence";

export type AnalyzerLayerStatus = "available" | "error" | "partial" | "pending" | "unavailable";

export type AnalyzerLayerId =
  | "event_context"
  | "history"
  | "market"
  | "polysignal_estimate"
  | "probabilities"
  | "research"
  | "resolution"
  | "wallet_intelligence";

export type AnalyzerLayer = {
  id: AnalyzerLayerId;
  label: string;
  status: AnalyzerLayerStatus;
  summary: string;
  warnings: string[];
};

export type AnalyzerDecision = "NONE" | "NO" | "WEAK" | "YES";

export type AnalyzerResult = {
  canCountForAccuracy: boolean;
  decision: AnalyzerDecision;
  decisionReason: string;
  layers: AnalyzerLayer[];
  marketProbabilityAvailable: boolean;
  marketTitle?: string;
  matchedMarketId?: string;
  matchConfidence: "high" | "low" | "medium" | "none";
  normalizedUrl: string;
  polySignalEstimateAvailable: boolean;
  saveableToHistory: boolean;
  url: string;
};

export type AnalyzerSummary = {
  detail: string;
  found: string[];
  headline: string;
  missing: string[];
  nextSteps: string[];
};

export type AnalyzerDecisionCopy = {
  detail: string;
  label: string;
  note: string;
};

type BuildAnalyzerResultInput = {
  item?: MarketOverviewItem | null;
  matchScore?: number;
  normalizedUrl: string;
  relatedHistory?: AnalysisHistoryItem[];
  url: string;
};

type RelatedHistoryInput = {
  eventSlug?: string | null;
  historyItems: AnalysisHistoryItem[];
  marketId?: string | number | null;
  marketSlug?: string | null;
  normalizedUrl?: string | null;
  remoteId?: string | null;
};

function confidenceFromScore(score?: number): AnalyzerResult["matchConfidence"] {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return "none";
  }
  if (score >= 65) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }
  return "low";
}

function cleanText(value?: string | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function lower(value?: string | number | null): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim().toLowerCase();
  return text || undefined;
}

function marketTitle(item: MarketOverviewItem): string {
  return (
    cleanText(item.market?.question) ||
    cleanText(item.market?.event_title) ||
    cleanText(item.market?.market_slug)?.replaceAll("-", " ") ||
    "Mercado Polymarket"
  );
}

function marketStatusSummary(item: MarketOverviewItem): string {
  if (item.market?.closed === true || item.market?.active === false) {
    return "Mercado cerrado o pendiente de resultado verificable.";
  }
  if (item.market?.active === true) {
    return "Mercado abierto en los datos disponibles.";
  }
  return "Estado del mercado pendiente de confirmacion.";
}

function layer(
  id: AnalyzerLayerId,
  label: string,
  status: AnalyzerLayerStatus,
  summary: string,
  warnings: string[] = [],
): AnalyzerLayer {
  return {
    id,
    label,
    status,
    summary,
    warnings: warnings.filter(Boolean),
  };
}

function toAnalyzerDecision(decision: PolySignalDecision): AnalyzerDecision {
  if (decision.decision === "clear" && decision.predictedSide === "YES") {
    return "YES";
  }
  if (decision.decision === "clear" && decision.predictedSide === "NO") {
    return "NO";
  }
  if (decision.decision === "weak") {
    return "WEAK";
  }
  return "NONE";
}

function buildDecisionReason(input: {
  analyzerDecision: AnalyzerDecision;
  decisionDetail: string;
  hasWalletSignal: boolean;
  polySignalEstimateAvailable: boolean;
}): string {
  if (input.analyzerDecision === "YES") {
    return "Prediccion clara de PolySignal hacia YES. Contara para historial solo cuando haya resultado final confiable.";
  }
  if (input.analyzerDecision === "NO") {
    return "Prediccion clara de PolySignal hacia NO. Contara para historial solo cuando haya resultado final confiable.";
  }
  if (input.analyzerDecision === "WEAK") {
    return "Hay estimacion PolySignal real, pero no supera el umbral de decision fuerte.";
  }
  if (input.hasWalletSignal) {
    return "Hay senales auxiliares, pero no son suficientes para emitir una estimacion propia responsable.";
  }
  if (!input.polySignalEstimateAvailable) {
    return "No hay evidencia suficiente para emitir una estimacion propia responsable.";
  }
  return input.decisionDetail;
}

function buildResolutionLayer(
  item: MarketOverviewItem,
  relatedHistory: AnalysisHistoryItem[],
): AnalyzerLayer {
  const resolvedHistory = relatedHistory.find(
    (entry) => entry.result === "hit" || entry.result === "miss" || entry.result === "cancelled",
  );
  if (resolvedHistory) {
    return layer(
      "resolution",
      "Resultado/verificacion",
      "available",
      `Historial relacionado con estado ${resolvedHistory.result}.`,
      resolvedHistory.resolutionReason ? [resolvedHistory.resolutionReason] : [],
    );
  }

  const pendingHistory = relatedHistory.find((entry) => entry.result === "pending");
  const currentResolution = extractOutcomeFromMarketData(
    item.market ? (item.market as Record<string, unknown>) : undefined,
  );
  if (currentResolution.status === "resolved") {
    return layer(
      "resolution",
      "Resultado/verificacion",
      "available",
      currentResolution.reason,
      ["El resultado debe venir de Polymarket o una fuente estructurada confiable."],
    );
  }
  if (pendingHistory || currentResolution.status === "open") {
    return layer(
      "resolution",
      "Resultado/verificacion",
      "pending",
      "Mercado pendiente o sin resultado final verificable todavia.",
      ["Pendiente no cuenta como fallo."],
    );
  }
  return layer(
    "resolution",
    "Resultado/verificacion",
    "unavailable",
    "No hay resultado final confiable disponible en este analisis.",
    ["No se inventa outcome."],
  );
}

export function buildAnalyzerResult(input: BuildAnalyzerResultInput): AnalyzerResult {
  const item = input.item;
  const matchConfidence = confidenceFromScore(input.matchScore);
  const relatedHistory = input.relatedHistory ?? [];
  if (!item) {
    return {
      canCountForAccuracy: false,
      decision: "NONE",
      decisionReason: "No hay mercado cargado para analizar sin inventar datos.",
      layers: [
        layer("market", "Mercado detectado", "unavailable", "No encontramos coincidencia en los mercados cargados."),
        layer("probabilities", "Probabilidad del mercado", "unavailable", "No hay precio visible disponible."),
        layer("polysignal_estimate", "Estimacion PolySignal", "unavailable", "Sin estimacion PolySignal suficiente."),
        layer("event_context", "Contexto del evento", "pending", "Contexto pendiente de mercado cargado."),
        layer("research", "Investigacion externa", "pending", "Cobertura externa pendiente o no disponible."),
        layer("wallet_intelligence", "Wallet Intelligence", "unavailable", "Sin datos publicos de billeteras para este enlace."),
        layer("history", "Historial relacionado", "unavailable", "Este enlace aun no tiene historial relacionado."),
        layer("resolution", "Resultado/verificacion", "unavailable", "No hay resultado verificable."),
      ],
      marketProbabilityAvailable: false,
      matchConfidence,
      normalizedUrl: input.normalizedUrl,
      polySignalEstimateAvailable: false,
      saveableToHistory: Boolean(input.normalizedUrl),
      url: input.url,
    };
  }

  const marketProbabilities = getMarketImpliedProbabilities({
    marketNoPrice: item.latest_snapshot?.no_price,
    marketYesPrice: item.latest_snapshot?.yes_price,
  });
  const estimateQuality = getEstimateQuality(item);
  const polySignalProbabilities = getRealPolySignalProbabilities(item);
  const polySignalEstimateAvailable =
    estimateQuality === "real_polysignal_estimate" && Boolean(polySignalProbabilities);
  const polySignalDecision = getPolySignalDecision({
    polySignalNoProbability: polySignalProbabilities?.no,
    polySignalYesProbability: polySignalProbabilities?.yes,
  });
  const analyzerDecision = polySignalEstimateAvailable
    ? toAnalyzerDecision(polySignalDecision)
    : "NONE";
  const context = extractSoccerMatchContext(item);
  const contextReadiness = getSoccerContextReadiness(context);
  const readiness = getEstimateReadiness(item);
  const readinessScore = getEstimateReadinessScore(item);
  const estimateResult = getPolySignalEstimate(item);
  const research = getResearchCoverage(item, []);
  const walletSummary = getWalletIntelligenceSummary(item);
  const walletSignal = getWalletSignalSummary(walletSummary);
  const independentSignals = collectIndependentSignals(item);
  const hasWalletSignal = shouldUseWalletAsAuxiliarySignal(walletSummary);

  const layers: AnalyzerLayer[] = [
    layer(
      "market",
      "Mercado detectado",
      "available",
      `${marketTitle(item)}. ${marketStatusSummary(item)}`,
      matchConfidence === "low" ? ["La coincidencia necesita revision visual antes de guardar."] : [],
    ),
    layer(
      "probabilities",
      "Probabilidad del mercado",
      marketProbabilities ? "available" : "unavailable",
      marketProbabilities
        ? "Precio visible YES/NO disponible como referencia de mercado."
        : "No hay precio visible suficiente para calcular probabilidad de mercado.",
      ["El precio del mercado no es una prediccion PolySignal."],
    ),
    layer(
      "polysignal_estimate",
      "Estimacion PolySignal",
      polySignalEstimateAvailable ? (analyzerDecision === "WEAK" ? "partial" : "available") : "unavailable",
      polySignalEstimateAvailable
        ? estimateResult.reason
        : "Sin estimacion PolySignal real suficiente para este mercado.",
      polySignalEstimateAvailable
        ? analyzerDecision === "WEAK"
          ? ["No supera el umbral de decision fuerte del 55%."]
          : []
        : ["No se usa el precio del mercado como estimacion propia."],
    ),
    layer(
      "event_context",
      "Contexto del evento",
      contextReadiness.level === "ready" ? "available" : contextReadiness.level === "partial" ? "partial" : "pending",
      contextReadiness.readyForExternalResearch
        ? "Evento y fecha suficientes para preparar investigacion futura."
        : "Contexto del evento parcial o pendiente.",
      contextReadiness.missing.slice(0, 4),
    ),
    layer(
      "research",
      "Investigacion externa",
      research.verifiedVisibleCount > 0 ? "available" : research.availableCategories > 0 ? "partial" : "pending",
      research.verifiedVisibleCount > 0
        ? `${research.verifiedVisibleCount} hallazgos externos visibles.`
        : "No hay fuentes externas verificadas visibles para este mercado.",
      research.missing.slice(0, 4),
    ),
    layer(
      "wallet_intelligence",
      "Wallet Intelligence",
      walletSummary.available ? "available" : "unavailable",
      walletSummary.available
        ? `${walletSignal.biasLabel}. ${walletSignal.confidenceLabel}.`
        : "No hay suficiente actividad publica de billeteras para este mercado.",
      walletSignal.warnings.slice(0, 4),
    ),
    layer(
      "history",
      "Historial relacionado",
      relatedHistory.length > 0 ? "available" : "unavailable",
      relatedHistory.length > 0
        ? `Encontramos ${relatedHistory.length} analisis relacionado(s) en este navegador.`
        : "Este mercado aun no esta en tu historial local.",
      [],
    ),
    buildResolutionLayer(item, relatedHistory),
  ];

  return {
    canCountForAccuracy: polySignalEstimateAvailable && (analyzerDecision === "YES" || analyzerDecision === "NO"),
    decision: analyzerDecision,
    decisionReason: buildDecisionReason({
      analyzerDecision,
      decisionDetail: polySignalDecision.detail,
      hasWalletSignal,
      polySignalEstimateAvailable,
    }),
    layers,
    marketProbabilityAvailable: Boolean(marketProbabilities),
    marketTitle: marketTitle(item),
    matchedMarketId: item.market?.id ? String(item.market.id) : undefined,
    matchConfidence,
    normalizedUrl: input.normalizedUrl,
    polySignalEstimateAvailable,
    saveableToHistory: Boolean(input.normalizedUrl),
    url: input.url,
  };
}

export function getAnalyzerSummary(result: AnalyzerResult): AnalyzerSummary {
  const available = result.layers.filter((item) => item.status === "available");
  const partial = result.layers.filter((item) => item.status === "partial");
  const pending = result.layers.filter(
    (item) => item.status === "pending" || item.status === "unavailable",
  );
  const hasEstimate = result.polySignalEstimateAvailable;
  const headline = hasEstimate
    ? "PolySignal encontro una estimacion propia disponible."
    : "PolySignal reviso las capas disponibles sin emitir una estimacion propia.";
  const detail = hasEstimate
    ? result.decisionReason
    : "No hay evidencia suficiente para emitir una estimacion propia responsable. Aun asi, el analizador muestra que reviso, que encontro y que falta.";
  return {
    detail,
    found: available.map((item) => `${item.label}: ${item.summary}`),
    headline,
    missing: [...partial, ...pending].map((item) => `${item.label}: ${item.summary}`),
    nextSteps: result.canCountForAccuracy
      ? ["Guardar en Historial para verificar el resultado cuando Polymarket resuelva."]
      : [
          "Guardar como lectura de referencia si quieres seguir el mercado.",
          "Esperar mas evidencia estructurada antes de medir precision.",
        ],
  };
}

export function getAnalyzerDecisionCopy(result: AnalyzerResult): AnalyzerDecisionCopy {
  if (result.decision === "YES") {
    return {
      detail: result.decisionReason,
      label: "Prediccion clara: YES",
      note: "Cuenta para historial solo cuando Polymarket o una fuente confiable resuelva el mercado.",
    };
  }
  if (result.decision === "NO") {
    return {
      detail: result.decisionReason,
      label: "Prediccion clara: NO",
      note: "Cuenta para historial solo cuando Polymarket o una fuente confiable resuelva el mercado.",
    };
  }
  if (result.decision === "WEAK") {
    return {
      detail: result.decisionReason,
      label: "Sin decision fuerte",
      note: "No cuenta para precision hasta que exista una postura clara.",
    };
  }
  return {
    detail: result.decisionReason,
    label: "Sin estimacion PolySignal suficiente",
    note: "Solo se muestra la probabilidad del mercado y las senales auxiliares disponibles.",
  };
}

export function getAnalyzerLayerStatus(
  result: AnalyzerResult,
  layerId: AnalyzerLayerId,
): AnalyzerLayerStatus {
  return result.layers.find((item) => item.id === layerId)?.status ?? "unavailable";
}

export function getRelatedAnalyzerHistory(input: RelatedHistoryInput): AnalysisHistoryItem[] {
  const normalizedUrl = lower(input.normalizedUrl);
  const slug = input.normalizedUrl ? extractPolymarketSlug(input.normalizedUrl) : undefined;
  const marketId = lower(input.marketId);
  const marketSlug = lower(input.marketSlug);
  const eventSlug = lower(input.eventSlug);
  const remoteId = lower(input.remoteId);
  const slugKey = lower(slug);
  const seen = new Set<string>();
  return input.historyItems.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    const itemUrl = lower(item.url);
    const itemMarketId = lower(item.marketId);
    const itemMarketSlug = lower(item.marketSlug);
    const itemEventSlug = lower(item.eventSlug);
    const itemRemoteId = lower(item.remoteId);
    const matched =
      (marketId && itemMarketId === marketId) ||
      (remoteId && itemRemoteId === remoteId) ||
      (marketSlug && itemMarketSlug === marketSlug) ||
      (eventSlug && itemEventSlug === eventSlug) ||
      (normalizedUrl && itemUrl === normalizedUrl) ||
      (slugKey && (itemMarketSlug === slugKey || itemEventSlug === slugKey || Boolean(itemUrl?.includes(slugKey))));
    if (matched) {
      seen.add(item.id);
    }
    return Boolean(matched);
  });
}
