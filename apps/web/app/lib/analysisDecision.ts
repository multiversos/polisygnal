import { normalizeProbability, type ProbabilityValue } from "./marketProbabilities";

export const CLEAR_DECISION_THRESHOLD = 0.55;
export const CLEAR_DECISION_THRESHOLD_PERCENT = 55;
export const WEAK_DECISION_LOW = 0.45;
export const WEAK_DECISION_HIGH = 0.55;

export type AnalysisDecision = "clear" | "none" | "unknown" | "weak";
export type AnalysisEvaluationStatus = "countable" | "not_countable";
export type AnalysisPredictedSide = "NO" | "UNKNOWN" | "YES";

export type PolySignalDecisionInput = {
  polySignalNoProbability?: ProbabilityValue;
  polySignalYesProbability?: ProbabilityValue;
};

export type PolySignalDecision = {
  decision: AnalysisDecision;
  decisionThreshold: number;
  detail: string;
  evaluationReason: string;
  evaluationStatus: AnalysisEvaluationStatus;
  label: string;
  predictedSide: AnalysisPredictedSide;
  strength: "clear" | "none" | "weak";
};

function probabilityPair(input: PolySignalDecisionInput): { no: number; yes: number } | null {
  const yes = normalizeProbability(input.polySignalYesProbability);
  const no = normalizeProbability(input.polySignalNoProbability);
  if (yes === null && no === null) {
    return null;
  }
  if (yes !== null && no !== null) {
    return { no, yes };
  }
  if (yes !== null) {
    return { no: 1 - yes, yes };
  }
  if (no !== null) {
    return { no, yes: 1 - no };
  }
  return null;
}

export function getPolySignalDecision(input: PolySignalDecisionInput): PolySignalDecision {
  const probabilities = probabilityPair(input);
  if (!probabilities) {
    return {
      decision: "none",
      decisionThreshold: CLEAR_DECISION_THRESHOLD_PERCENT,
      detail: "Aun no hay estimacion PolySignal suficiente para tomar postura.",
      evaluationReason: "Sin estimacion PolySignal.",
      evaluationStatus: "not_countable",
      label: "Sin estimacion PolySignal",
      predictedSide: "UNKNOWN",
      strength: "none",
    };
  }

  if (
    probabilities.yes >= CLEAR_DECISION_THRESHOLD &&
    probabilities.yes > probabilities.no
  ) {
    return {
      decision: "clear",
      decisionThreshold: CLEAR_DECISION_THRESHOLD_PERCENT,
      detail: "PolySignal supera el umbral de decision en YES.",
      evaluationReason: "Prediccion clara de PolySignal.",
      evaluationStatus: "countable",
      label: "Prediccion clara: YES",
      predictedSide: "YES",
      strength: "clear",
    };
  }

  if (
    probabilities.no >= CLEAR_DECISION_THRESHOLD &&
    probabilities.no > probabilities.yes
  ) {
    return {
      decision: "clear",
      decisionThreshold: CLEAR_DECISION_THRESHOLD_PERCENT,
      detail: "PolySignal supera el umbral de decision en NO.",
      evaluationReason: "Prediccion clara de PolySignal.",
      evaluationStatus: "countable",
      label: "Prediccion clara: NO",
      predictedSide: "NO",
      strength: "clear",
    };
  }

  if (
    probabilities.yes >= WEAK_DECISION_LOW &&
    probabilities.yes <= WEAK_DECISION_HIGH &&
    probabilities.no >= WEAK_DECISION_LOW &&
    probabilities.no <= WEAK_DECISION_HIGH
  ) {
    return {
      decision: "weak",
      decisionThreshold: CLEAR_DECISION_THRESHOLD_PERCENT,
      detail: "La lectura esta dentro de la zona 45/55.",
      evaluationReason: "Sin decision fuerte.",
      evaluationStatus: "not_countable",
      label: "Sin decision fuerte",
      predictedSide: "UNKNOWN",
      strength: "weak",
    };
  }

  return {
    decision: "unknown",
    decisionThreshold: CLEAR_DECISION_THRESHOLD_PERCENT,
    detail: "La lectura no alcanza el umbral de decision clara.",
    evaluationReason: "En observacion.",
    evaluationStatus: "not_countable",
    label: "En observacion",
    predictedSide: "UNKNOWN",
    strength: "weak",
  };
}

export function getDecisionStrength(input: PolySignalDecisionInput): PolySignalDecision["strength"] {
  return getPolySignalDecision(input).strength;
}

export function getDecisionLabel(decision: AnalysisDecision, predictedSide?: AnalysisPredictedSide): string {
  if (decision === "clear" && (predictedSide === "YES" || predictedSide === "NO")) {
    return `Prediccion clara: ${predictedSide}`;
  }
  if (decision === "weak") {
    return "Sin decision fuerte";
  }
  if (decision === "none") {
    return "Sin estimacion PolySignal";
  }
  return "En observacion";
}

export function hasClearPrediction(item: {
  decision?: AnalysisDecision;
  predictedSide?: AnalysisPredictedSide;
}): boolean {
  return item.decision === "clear" && (item.predictedSide === "YES" || item.predictedSide === "NO");
}

export function shouldCountForAccuracy(item: {
  decision?: AnalysisDecision;
  predictedSide?: AnalysisPredictedSide;
  result?: string;
}): boolean {
  return (
    item.decision === "clear" &&
    (item.predictedSide === "YES" || item.predictedSide === "NO") &&
    (item.result === "hit" || item.result === "miss")
  );
}
