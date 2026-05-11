import {
  getPolySignalDecision,
  type AnalysisPredictedSide,
} from "./analysisDecision";
import {
  collectIndependentSignals,
  getEstimateReadiness,
  type EstimationSignal,
} from "./estimationSignals";
import {
  getEstimateQuality,
  getRealPolySignalProbabilities,
  type MarketEstimateQualityInput,
} from "./marketEstimateQuality";

export type PolySignalEstimateResult = {
  available: boolean;
  confidence: "high" | "low" | "medium" | "none";
  decision: "NONE" | "NO" | "WEAK" | "YES";
  missing: string[];
  noProbability?: number;
  reason: string;
  signalsUsed: EstimationSignal[];
  yesProbability?: number;
};

function confidenceFromInput(input: MarketEstimateQualityInput): PolySignalEstimateResult["confidence"] {
  const value = Number(input.latest_prediction?.confidence_score ?? input.polysignal_score?.confidence);
  if (!Number.isFinite(value)) {
    return "low";
  }
  if (value >= 0.7) {
    return "high";
  }
  if (value >= 0.4) {
    return "medium";
  }
  return "low";
}

function decisionFromPredictedSide(side: AnalysisPredictedSide): PolySignalEstimateResult["decision"] {
  if (side === "YES") {
    return "YES";
  }
  if (side === "NO") {
    return "NO";
  }
  return "WEAK";
}

export function getPolySignalEstimate(input: MarketEstimateQualityInput): PolySignalEstimateResult {
  const readiness = getEstimateReadiness(input);
  const independentSignals = collectIndependentSignals(input);
  const estimate = getRealPolySignalProbabilities(input);
  const quality = getEstimateQuality(input);

  if (!estimate || quality !== "real_polysignal_estimate") {
    const hasWalletSignal = independentSignals.some((signal) => signal.source === "wallet_intelligence");
    return {
      available: false,
      confidence: "none",
      decision: "NONE",
      missing: readiness.missing,
      reason:
        hasWalletSignal
          ? "La inteligencia de billeteras es una senal auxiliar; todavia no alcanza para mostrar una estimacion propia."
          : readiness.independentSignalCount === 0
          ? "Faltan senales independientes."
          : "Hay datos parciales, pero todavia no alcanzan para mostrar una estimacion propia.",
      signalsUsed: independentSignals,
    };
  }

  const decision = getPolySignalDecision({
    polySignalNoProbability: estimate.no,
    polySignalYesProbability: estimate.yes,
  });

  return {
    available: true,
    confidence: confidenceFromInput(input),
    decision: decision.decision === "clear" ? decisionFromPredictedSide(decision.predictedSide) : "WEAK",
    missing: [],
    noProbability: estimate.no,
    reason: "Estimacion PolySignal disponible desde senales independientes ya cargadas.",
    signalsUsed: independentSignals,
    yesProbability: estimate.yes,
  };
}
