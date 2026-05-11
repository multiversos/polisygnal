import {
  getMarketImpliedProbabilities,
  getPolySignalProbabilities,
  normalizeProbability,
  type ProbabilityPair,
  type ProbabilityValue,
} from "./marketProbabilities";

export type EstimateQuality =
  | "insufficient_data"
  | "market_price_only"
  | "real_polysignal_estimate"
  | "saved_without_evidence"
  | "unknown";

type PredictionLike = {
  confidence_score?: ProbabilityValue;
  edge_magnitude?: ProbabilityValue;
  edge_signed?: ProbabilityValue;
  model_version?: string | null;
  no_probability?: ProbabilityValue;
  prediction_family?: string | null;
  research_run_id?: number | string | null;
  run_at?: string | null;
  used_evidence_in_scoring?: boolean | null;
  used_news_count?: number | string | null;
  used_odds_count?: number | string | null;
  yes_probability?: ProbabilityValue;
};

type SnapshotLike = {
  captured_at?: string | null;
  liquidity?: ProbabilityValue;
  no_price?: ProbabilityValue;
  volume?: ProbabilityValue;
  yes_price?: ProbabilityValue;
};

type ScoreComponentLike = {
  adjustment?: ProbabilityValue;
  confidence?: ProbabilityValue;
  name?: string | null;
  probability?: ProbabilityValue;
};

type ScoreLike = {
  components?: ScoreComponentLike[];
  confidence?: ProbabilityValue;
  edge_signed?: ProbabilityValue;
  market_yes_price?: ProbabilityValue;
  score_probability?: ProbabilityValue;
  source?: string | null;
  warnings?: string[];
};

type EvidenceSummaryLike = {
  evidence_count?: number | string | null;
  latest_evidence_at?: string | null;
  news_evidence_count?: number | string | null;
  odds_evidence_count?: number | string | null;
};

export type EstimateReadinessItem = {
  available: boolean;
  label: string;
  status: "available" | "missing" | "pending";
};

export type MarketEstimateQualityInput = {
  data_quality?: {
    has_external_signal?: boolean | null;
    has_prediction?: boolean | null;
    has_research?: boolean | null;
    has_snapshot?: boolean | null;
    has_volume?: boolean | null;
    has_liquidity?: boolean | null;
  } | null;
  estimateQuality?: EstimateQuality | null;
  evidence_items?: unknown[] | null;
  evidence_summary?: EvidenceSummaryLike | null;
  external_signals?: unknown[] | null;
  latest_prediction?: PredictionLike | null;
  latest_snapshot?: SnapshotLike | null;
  marketNoProbability?: ProbabilityValue;
  marketYesProbability?: ProbabilityValue;
  polySignalNoProbability?: ProbabilityValue;
  polySignalYesProbability?: ProbabilityValue;
  polysignal_score?: ScoreLike | null;
  prediction_reports?: unknown[] | null;
  research_findings?: unknown[] | null;
  research_runs?: unknown[] | null;
};

const EPSILON = 0.005;

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

function normalizeSignedProbability(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (Math.abs(parsed) <= 1) {
    return parsed;
  }
  if (Math.abs(parsed) <= 100) {
    return parsed / 100;
  }
  return null;
}

function normalizedSource(value?: string | null): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function isEstimateQuality(value: unknown): value is EstimateQuality {
  return (
    value === "insufficient_data" ||
    value === "market_price_only" ||
    value === "real_polysignal_estimate" ||
    value === "saved_without_evidence" ||
    value === "unknown"
  );
}

function arrayHasItems(value: unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function getMarketProbabilityPair(input: MarketEstimateQualityInput): ProbabilityPair | null {
  return getMarketImpliedProbabilities({
    marketNoPrice: input.latest_snapshot?.no_price ?? input.marketNoProbability,
    marketYesPrice: input.latest_snapshot?.yes_price ?? input.marketYesProbability ?? input.polysignal_score?.market_yes_price,
  });
}

export function getRawPolySignalProbabilityPair(input: MarketEstimateQualityInput): ProbabilityPair | null {
  if (input.latest_prediction) {
    return getPolySignalProbabilities({
      polySignalNoProbability: input.latest_prediction.no_probability,
      polySignalYesProbability: input.latest_prediction.yes_probability,
    });
  }
  if (input.polysignal_score?.score_probability !== null && input.polysignal_score?.score_probability !== undefined) {
    return getPolySignalProbabilities({
      polySignalYesProbability: input.polysignal_score.score_probability,
    });
  }
  return getPolySignalProbabilities({
    polySignalNoProbability: input.polySignalNoProbability,
    polySignalYesProbability: input.polySignalYesProbability,
  });
}

function hasIndependentEvidence(input: MarketEstimateQualityInput): boolean {
  const prediction = input.latest_prediction;
  if (prediction?.used_evidence_in_scoring) {
    return true;
  }
  if (normalizeCount(prediction?.used_odds_count) + normalizeCount(prediction?.used_news_count) > 0) {
    return true;
  }
  if (prediction?.research_run_id !== null && prediction?.research_run_id !== undefined) {
    return true;
  }
  const family = normalizedSource(prediction?.prediction_family);
  if (family.includes("research") || family.includes("codex")) {
    return true;
  }
  if (
    normalizeCount(input.evidence_summary?.evidence_count) +
      normalizeCount(input.evidence_summary?.odds_evidence_count) +
      normalizeCount(input.evidence_summary?.news_evidence_count) >
    0
  ) {
    return true;
  }
  if (
    arrayHasItems(input.research_findings) ||
    arrayHasItems(input.evidence_items) ||
    arrayHasItems(input.prediction_reports) ||
    arrayHasItems(input.research_runs)
  ) {
    return true;
  }
  if (input.data_quality?.has_external_signal || input.data_quality?.has_research) {
    return true;
  }
  return Boolean(
    input.polysignal_score?.components?.some((component) => {
      const name = normalizedSource(component.name);
      return name.includes("external_signal") && normalizeProbability(component.probability) !== null;
    }),
  );
}

function hasActivityData(input: MarketEstimateQualityInput): boolean {
  return (
    normalizeCount(input.latest_snapshot?.volume) > 0 ||
    normalizeCount(input.latest_snapshot?.liquidity) > 0 ||
    Boolean(input.data_quality?.has_volume) ||
    Boolean(input.data_quality?.has_liquidity)
  );
}

function hasRecentData(input: MarketEstimateQualityInput): boolean {
  return Boolean(
    input.latest_snapshot?.captured_at ||
      input.latest_prediction?.run_at ||
      input.latest_prediction?.model_version ||
      input.evidence_summary?.latest_evidence_at ||
      input.data_quality?.has_snapshot,
  );
}

function hasMeaningfulEdge(input: MarketEstimateQualityInput, market: ProbabilityPair | null, estimate: ProbabilityPair): boolean {
  const explicitEdge = normalizeProbability(input.latest_prediction?.edge_magnitude);
  if (explicitEdge !== null && explicitEdge >= EPSILON) {
    return true;
  }
  const signedEdge =
    normalizeSignedProbability(input.latest_prediction?.edge_signed) ??
    normalizeSignedProbability(input.polysignal_score?.edge_signed);
  if (signedEdge !== null && Math.abs(signedEdge) >= EPSILON) {
    return true;
  }
  return Boolean(market && Math.abs(estimate.yes - market.yes) >= EPSILON);
}

export function getEstimateQuality(input: MarketEstimateQualityInput): EstimateQuality {
  const storedQuality = isEstimateQuality(input.estimateQuality) ? input.estimateQuality : null;
  const estimate = getRawPolySignalProbabilityPair(input);
  if (!estimate) {
    return storedQuality ?? "insufficient_data";
  }
  if (storedQuality === "real_polysignal_estimate") {
    return "real_polysignal_estimate";
  }
  if (storedQuality && storedQuality !== "unknown") {
    return storedQuality;
  }

  const market = getMarketProbabilityPair(input);
  const independentEvidence = hasIndependentEvidence(input);
  const meaningfulEdge = hasMeaningfulEdge(input, market, estimate);

  if (independentEvidence && meaningfulEdge) {
    return "real_polysignal_estimate";
  }
  if (independentEvidence && !market) {
    return "real_polysignal_estimate";
  }
  if (market && Math.abs(estimate.yes - market.yes) < EPSILON && !independentEvidence) {
    return "market_price_only";
  }
  return "saved_without_evidence";
}

export function hasRealPolySignalEstimate(input: MarketEstimateQualityInput): boolean {
  return getEstimateQuality(input) === "real_polysignal_estimate";
}

export function shouldShowPolySignalEstimate(input: MarketEstimateQualityInput): boolean {
  return hasRealPolySignalEstimate(input);
}

export function getRealPolySignalProbabilities(input: MarketEstimateQualityInput): ProbabilityPair | null {
  return hasRealPolySignalEstimate(input) ? getRawPolySignalProbabilityPair(input) : null;
}

export function getMissingEstimateReasons(input: MarketEstimateQualityInput): string[] {
  const reasons: string[] = [];
  if (!getMarketProbabilityPair(input)) {
    reasons.push("Falta probabilidad visible del mercado.");
  }
  if (!hasActivityData(input)) {
    reasons.push("Falta actividad suficiente de mercado.");
  }
  if (!hasRecentData(input)) {
    reasons.push("Faltan datos recientes.");
  }
  if (!hasIndependentEvidence(input)) {
    reasons.push("Faltan senales independientes para una estimacion propia.");
  }
  if (!hasRealPolySignalEstimate(input)) {
    reasons.push("La estimacion PolySignal independiente todavia no esta disponible.");
  }
  return [...new Set(reasons)];
}

export function getEstimateReadiness(input: MarketEstimateQualityInput): EstimateReadinessItem[] {
  const hasMarket = Boolean(getMarketProbabilityPair(input));
  const hasActivity = hasActivityData(input);
  const hasRecent = hasRecentData(input);
  const hasExternal = hasIndependentEvidence(input);
  const hasEstimate = hasRealPolySignalEstimate(input);
  return [
    { available: hasMarket, label: "Probabilidad del mercado", status: hasMarket ? "available" : "missing" },
    { available: hasActivity, label: "Actividad del mercado", status: hasActivity ? "available" : "missing" },
    { available: hasRecent, label: "Datos recientes", status: hasRecent ? "available" : "missing" },
    {
      available: hasEstimate,
      label: "Estimacion PolySignal independiente",
      status: hasEstimate ? "available" : "missing",
    },
    { available: hasExternal, label: "Datos externos", status: hasExternal ? "available" : "pending" },
    { available: false, label: "Historial/calibracion", status: "pending" },
  ];
}

export function getEstimateQualityLabel(quality: EstimateQuality): string {
  if (quality === "real_polysignal_estimate") {
    return "Estimacion PolySignal real";
  }
  if (quality === "market_price_only") {
    return "Solo probabilidad del mercado";
  }
  if (quality === "saved_without_evidence") {
    return "Guardado sin evidencia propia";
  }
  if (quality === "insufficient_data") {
    return "Sin estimacion suficiente";
  }
  return "Calidad no confirmada";
}
