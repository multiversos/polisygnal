import {
  getEstimateQuality,
  getMarketProbabilityPair,
  getMissingEstimateReasons,
  getRealPolySignalProbabilities,
  hasRealPolySignalEstimate,
  type MarketEstimateQualityInput,
} from "./marketEstimateQuality";
import { normalizeProbability, type ProbabilityValue } from "./marketProbabilities";
import {
  extractSoccerMatchContext,
  getSoccerContextReadiness,
  type SoccerMatchContextInput,
} from "./soccerMatchContext";

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

export type EstimateReadinessScoreFactor = {
  available: boolean;
  label: string;
  maxPoints: number;
  points: number;
  reason: string;
};

export type EstimateReadinessScore = {
  disclaimer: string;
  factors: EstimateReadinessScoreFactor[];
  label: "Datos insuficientes" | "Datos parciales" | "Datos suficientes para estimacion" | "Preparacion media";
  level: "insufficient" | "medium" | "partial" | "ready";
  score: number;
};

export type EstimationSignalInput = MarketEstimateQualityInput & SoccerMatchContextInput;

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

export function collectMarketSignals(market: EstimationSignalInput): EstimationSignal[] {
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

export function collectIndependentSignals(market: EstimationSignalInput): EstimationSignal[] {
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
  const soccerContext = extractSoccerMatchContext(market);
  const soccerReadiness = getSoccerContextReadiness(soccerContext);
  const sport = (soccerContext.sport || market.market?.sport_type || market.sport_type || "").toLowerCase();
  if (sport === "soccer" && soccerReadiness.hasTeams) {
    signals.push({
      confidence: soccerContext.teamA?.confidence ?? "low",
      direction: "NEUTRAL",
      id: "soccer-teams-identified",
      isIndependent: true,
      label: "Equipos identificados",
      reason: "El partido y los equipos fueron identificados desde datos del evento; no define ventaja por si solo.",
      source: "sports_stats",
      strength: soccerContext.teamA?.confidence === "high" ? "medium" : "low",
      value: `${soccerContext.teamA?.name} vs ${soccerContext.teamB?.name}`,
    });
  }
  if (sport === "soccer" && soccerReadiness.hasDate) {
    signals.push({
      confidence: soccerContext.dateConfidence === "high" ? "medium" : "low",
      direction: "NEUTRAL",
      id: "soccer-match-date",
      isIndependent: true,
      label: "Fecha del partido",
      reason: "La fecha ayuda a preparar investigacion deportiva futura, pero no genera probabilidad.",
      source: "sports_stats",
      strength: "low",
      updatedAt: soccerContext.startTime,
      value: soccerContext.startTime,
    });
  }
  if (sport === "soccer" && soccerContext.league) {
    signals.push({
      confidence: "medium",
      direction: "NEUTRAL",
      id: "soccer-league",
      isIndependent: true,
      label: "Liga o competicion",
      reason: "La competicion esta disponible como contexto deportivo, sin crear prediccion.",
      source: "sports_stats",
      strength: "low",
      value: soccerContext.league,
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

export function getEstimateReadiness(market: EstimationSignalInput): EstimateReadiness {
  const independentSignalCount = collectIndependentSignals(market).length;
  const quality = getEstimateQuality(market);
  const soccerContext = extractSoccerMatchContext(market);
  const soccerReadiness = getSoccerContextReadiness(soccerContext);
  const sport = (soccerContext.sport || market.market?.sport_type || market.sport_type || "").toLowerCase();
  const missing = [
    ...getMissingEstimateReasons(market),
    ...(sport === "soccer" ? soccerReadiness.missing : []),
  ];
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

export function shouldAllowPolySignalEstimate(market: EstimationSignalInput): boolean {
  return getEstimateReadiness(market).ready;
}

export function explainMissingEstimateData(market: EstimationSignalInput): string[] {
  const readiness = getEstimateReadiness(market);
  return [...new Set([...readiness.missing, ...readiness.warnings])];
}

function hasActivity(market: EstimationSignalInput): boolean {
  return normalizeCount(market.latest_snapshot?.volume) > 0 || normalizeCount(market.latest_snapshot?.liquidity) > 0;
}

function hasRecentData(market: EstimationSignalInput): boolean {
  return Boolean(
    market.latest_snapshot?.captured_at ||
      market.latest_prediction?.run_at ||
      market.evidence_summary?.latest_evidence_at ||
      market.data_quality?.has_snapshot,
  );
}

function scoreLabel(score: number): Pick<EstimateReadinessScore, "label" | "level"> {
  if (score >= 76) {
    return { label: "Datos suficientes para estimacion", level: "ready" };
  }
  if (score >= 51) {
    return { label: "Preparacion media", level: "medium" };
  }
  if (score >= 26) {
    return { label: "Datos parciales", level: "partial" };
  }
  return { label: "Datos insuficientes", level: "insufficient" };
}

export function getEstimateReadinessScore(market: EstimationSignalInput): EstimateReadinessScore {
  const soccerContext = extractSoccerMatchContext(market);
  const soccerReadiness = getSoccerContextReadiness(soccerContext);
  const independentSignals = collectIndependentSignals(market);
  const externalSignals = independentSignals.filter(
    (signal) => !signal.id.startsWith("soccer-") && signal.id !== "real-polysignal-estimate",
  );
  const factors: EstimateReadinessScoreFactor[] = [
    {
      available: Boolean(getMarketProbabilityPair(market)),
      label: "Probabilidad del mercado",
      maxPoints: 15,
      points: getMarketProbabilityPair(market) ? 15 : 0,
      reason: "Referencia de precio disponible; no es prediccion PolySignal.",
    },
    {
      available: hasActivity(market),
      label: "Actividad del mercado",
      maxPoints: 15,
      points: hasActivity(market) ? 15 : 0,
      reason: "Volumen o liquidez ayudan a evaluar si el mercado tiene actividad suficiente.",
    },
    {
      available: hasRecentData(market),
      label: "Datos recientes",
      maxPoints: 15,
      points: hasRecentData(market) ? 15 : 0,
      reason: "La frescura permite decidir si conviene investigar ahora.",
    },
    {
      available: soccerReadiness.hasTeams,
      label: "Equipos identificados",
      maxPoints: 15,
      points: soccerReadiness.hasTeams ? 15 : soccerReadiness.teamCount > 0 ? 7 : 0,
      reason: "Los equipos se usan para preparar busqueda deportiva futura.",
    },
    {
      available: soccerReadiness.hasDate,
      label: "Fecha del partido",
      maxPoints: 10,
      points: soccerReadiness.hasDate ? 10 : 0,
      reason: "La fecha permite ubicar forma reciente, lesiones y calendario.",
    },
    {
      available: externalSignals.length > 0,
      label: "Senales independientes externas",
      maxPoints: 20,
      points: Math.min(20, externalSignals.length * 10),
      reason: "Evidencia, noticias u odds externas ya cargadas.",
    },
    {
      available: false,
      label: "Historial y calibracion",
      maxPoints: 10,
      points: 0,
      reason: "La calibracion historica persistente todavia no esta disponible.",
    },
  ];
  const score = Math.min(100, factors.reduce((total, factor) => total + factor.points, 0));
  const label = scoreLabel(score);
  return {
    disclaimer: "Esto mide datos disponibles, no probabilidad del resultado.",
    factors,
    label: label.label,
    level: label.level,
    score,
  };
}
