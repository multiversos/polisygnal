import {
  getEstimateQuality,
  getMarketProbabilityPair,
  getMissingEstimateReasons,
  getRealPolySignalProbabilities,
  hasRealPolySignalEstimate,
  type MarketEstimateQualityInput,
} from "./marketEstimateQuality";
import { normalizeProbability, type ProbabilityValue } from "./marketProbabilities";

export type EstimationSignalSource =
  | "external_news"
  | "historical_results"
  | "market"
  | "odds_reference"
  | "polysignal"
  | "sports_stats"
  | "unknown";

export type EstimationSignalDirection = "NEUTRAL" | "NO" | "UNKNOWN" | "YES";
export type EstimationSignalStrength = "high" | "low" | "medium";

export type EstimationSignal = {
  confidence?: EstimationSignalStrength;
  direction?: EstimationSignalDirection;
  id: string;
  isIndependent: boolean;
  label: string;
  reason: string;
  source: EstimationSignalSource;
  strength?: EstimationSignalStrength;
  updatedAt?: string;
  value?: boolean | number | string;
};

export type EstimateReadiness = {
  independentSignalCount: number;
  level: "low" | "none" | "partial" | "ready";
  missing: string[];
  ready: boolean;
  warnings: string[];
};

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function signalStrength(value: ProbabilityValue): EstimationSignalStrength {
  const normalized = normalizeProbability(value);
  if (normalized === null) {
    return "low";
  }
  if (normalized >= 0.7) {
    return "high";
  }
  if (normalized >= 0.4) {
    return "medium";
  }
  return "low";
}

export function collectMarketSignals(market: MarketEstimateQualityInput): EstimationSignal[] {
  const signals: EstimationSignal[] = [];
  const marketProbability = getMarketProbabilityPair(market);
  if (marketProbability) {
    signals.push({
      direction: marketProbability.yes > marketProbability.no ? "YES" : marketProbability.no > marketProbability.yes ? "NO" : "NEUTRAL",
      id: "market-price",
      isIndependent: false,
      label: "Probabilidad del mercado",
      reason: "Viene del precio visible de Polymarket y se usa solo como referencia.",
      source: "market",
      strength: "medium",
      value: `${Math.round(marketProbability.yes * 1000) / 10}% YES`,
    });
  }
  if (normalizeCount(market.latest_snapshot?.volume) > 0) {
    signals.push({
      id: "market-volume",
      isIndependent: false,
      label: "Volumen",
      reason: "Ayuda a interpretar actividad, pero no crea una prediccion por si solo.",
      source: "market",
      strength: "low",
      value: String(market.latest_snapshot?.volume),
    });
  }
  if (normalizeCount(market.latest_snapshot?.liquidity) > 0) {
    signals.push({
      id: "market-liquidity",
      isIndependent: false,
      label: "Liquidez",
      reason: "Ayuda a evaluar calidad del mercado, pero no es una senal independiente de resultado.",
      source: "market",
      strength: "low",
      value: String(market.latest_snapshot?.liquidity),
    });
  }
  if (market.latest_snapshot?.captured_at || market.latest_prediction?.run_at) {
    signals.push({
      id: "freshness",
      isIndependent: false,
      label: "Datos recientes",
      reason: "Indica frescura de los datos cargados.",
      source: "market",
      strength: "low",
      updatedAt: market.latest_snapshot?.captured_at ?? market.latest_prediction?.run_at ?? undefined,
    });
  }
  return signals;
}

export function collectIndependentSignals(market: MarketEstimateQualityInput): EstimationSignal[] {
  const signals: EstimationSignal[] = [];
  const prediction = market.latest_prediction;
  const oddsCount = normalizeCount(prediction?.used_odds_count);
  const newsCount = normalizeCount(prediction?.used_news_count);
  const evidenceCount =
    normalizeCount(market.evidence_summary?.evidence_count) +
    normalizeCount(market.evidence_summary?.odds_evidence_count) +
    normalizeCount(market.evidence_summary?.news_evidence_count);

  if (oddsCount > 0) {
    signals.push({
      confidence: signalStrength(prediction?.confidence_score),
      direction: "UNKNOWN",
      id: "odds-reference",
      isIndependent: true,
      label: "Referencia de odds externa",
      reason: "Fue usada como senal comparativa independiente del precio de Polymarket.",
      source: "odds_reference",
      strength: oddsCount >= 2 ? "medium" : "low",
      value: oddsCount,
      updatedAt: prediction?.run_at ?? undefined,
    });
  }
  if (newsCount > 0) {
    signals.push({
      confidence: signalStrength(prediction?.confidence_score),
      direction: "UNKNOWN",
      id: "external-news",
      isIndependent: true,
      label: "Noticias o contexto externo",
      reason: "Aporta informacion fuera del precio del mercado.",
      source: "external_news",
      strength: newsCount >= 2 ? "medium" : "low",
      value: newsCount,
      updatedAt: prediction?.run_at ?? undefined,
    });
  }
  if (evidenceCount > 0) {
    signals.push({
      direction: "UNKNOWN",
      id: "evidence-summary",
      isIndependent: true,
      label: "Evidencia guardada",
      reason: "Hay evidencia estructurada disponible para revisar.",
      source: "polysignal",
      strength: evidenceCount >= 3 ? "medium" : "low",
      value: evidenceCount,
      updatedAt: market.evidence_summary?.latest_evidence_at ?? undefined,
    });
  }
  if (hasRealPolySignalEstimate(market)) {
    const estimate = getRealPolySignalProbabilities(market);
    signals.push({
      confidence: signalStrength(prediction?.confidence_score ?? market.polysignal_score?.confidence),
      direction: estimate && estimate.yes > estimate.no ? "YES" : estimate && estimate.no > estimate.yes ? "NO" : "NEUTRAL",
      id: "real-polysignal-estimate",
      isIndependent: true,
      label: "Estimacion PolySignal real",
      reason: "La estimacion paso la compuerta de calidad y no replica solo el precio del mercado.",
      source: "polysignal",
      strength: "medium",
      value: estimate ? `${Math.round(estimate.yes * 1000) / 10}% YES` : undefined,
      updatedAt: prediction?.run_at ?? undefined,
    });
  }
  return signals;
}

export function getEstimateReadiness(market: MarketEstimateQualityInput): EstimateReadiness {
  const independentSignalCount = collectIndependentSignals(market).length;
  const quality = getEstimateQuality(market);
  const missing = getMissingEstimateReasons(market);
  const warnings: string[] = [];

  if (quality === "market_price_only") {
    warnings.push("Solo hay probabilidad del mercado; no es una estimacion propia.");
  }
  if (quality === "saved_without_evidence") {
    warnings.push("Hay una lectura guardada, pero falta evidencia independiente suficiente.");
  }
  if (independentSignalCount === 0) {
    warnings.push("Faltan senales independientes.");
  }

  if (hasRealPolySignalEstimate(market)) {
    return {
      independentSignalCount,
      level: "ready",
      missing: [],
      ready: true,
      warnings,
    };
  }
  if (independentSignalCount > 0) {
    return {
      independentSignalCount,
      level: "partial",
      missing,
      ready: false,
      warnings,
    };
  }
  return {
    independentSignalCount,
    level: collectMarketSignals(market).length > 0 ? "low" : "none",
    missing,
    ready: false,
    warnings,
  };
}

export function shouldAllowPolySignalEstimate(market: MarketEstimateQualityInput): boolean {
  return getEstimateReadiness(market).ready;
}

export function explainMissingEstimateData(market: MarketEstimateQualityInput): string[] {
  const readiness = getEstimateReadiness(market);
  return [...new Set([...readiness.missing, ...readiness.warnings])];
}
