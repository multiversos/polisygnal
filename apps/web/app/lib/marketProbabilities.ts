export type ProbabilityValue = number | string | null | undefined;

export type ProbabilityPair = {
  no: number;
  yes: number;
};

export type MarketProbabilityInput = {
  marketNoPrice?: ProbabilityValue;
  marketYesPrice?: ProbabilityValue;
};

export type PolySignalProbabilityInput = {
  confidence?: ProbabilityValue;
  polySignalNoProbability?: ProbabilityValue;
  polySignalYesProbability?: ProbabilityValue;
};

export type ProbabilityGap = {
  absPoints: number;
  label: string;
  yesPoints: number;
};

export type ProbabilityDisplayState = {
  disclaimer: string;
  gap: ProbabilityGap | null;
  market: ProbabilityPair | null;
  marketDetail: string;
  polySignal: ProbabilityPair | null;
  polySignalDetail: string;
};

export function normalizeProbability(value: ProbabilityValue): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  if (parsed <= 1) {
    return parsed;
  }
  if (parsed <= 100) {
    return parsed / 100;
  }
  return null;
}

export function formatProbability(value: ProbabilityValue): string {
  const probability = normalizeProbability(value);
  if (probability === null) {
    return "sin dato";
  }
  const percent = probability * 100;
  const rounded = Math.abs(percent - Math.round(percent)) < 0.05 ? Math.round(percent) : Number(percent.toFixed(1));
  return `${rounded}%`;
}

function probabilityPairFromValues(yesValue?: ProbabilityValue, noValue?: ProbabilityValue): ProbabilityPair | null {
  const yes = normalizeProbability(yesValue);
  const no = normalizeProbability(noValue);

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

export function getMarketImpliedProbabilities(input: MarketProbabilityInput): ProbabilityPair | null {
  return probabilityPairFromValues(input.marketYesPrice, input.marketNoPrice);
}

export function getPolySignalProbabilities(input: PolySignalProbabilityInput): ProbabilityPair | null {
  return probabilityPairFromValues(input.polySignalYesProbability, input.polySignalNoProbability);
}

export function getProbabilityGap(
  marketProbability: ProbabilityPair | null,
  polySignalProbability: ProbabilityPair | null,
): ProbabilityGap | null {
  if (!marketProbability || !polySignalProbability) {
    return null;
  }
  const yesPoints = (polySignalProbability.yes - marketProbability.yes) * 100;
  const absPoints = Math.abs(yesPoints);
  if (absPoints < 0.5) {
    return {
      absPoints,
      label: "PolySignal esta alineado con el mercado en YES.",
      yesPoints,
    };
  }
  return {
    absPoints,
    label: `PolySignal esta ${formatGapPoints(absPoints)} puntos ${
      yesPoints > 0 ? "por encima" : "por debajo"
    } del mercado en YES.`,
    yesPoints,
  };
}

export function getProbabilityDisplayState(
  input: MarketProbabilityInput & PolySignalProbabilityInput,
): ProbabilityDisplayState {
  const market = getMarketImpliedProbabilities(input);
  const polySignal = getPolySignalProbabilities(input);
  return {
    disclaimer: "No es una garantia ni recomendacion de apuesta.",
    gap: getProbabilityGap(market, polySignal),
    market,
    marketDetail: market
      ? "Esto refleja el precio visible del mercado, no una prediccion de PolySignal."
      : "No hay precio visible suficiente para calcularlo.",
    polySignal,
    polySignalDetail: polySignal
      ? "Lectura disponible en PolySignal."
      : "Aun no hay estimacion PolySignal suficiente para este mercado.",
  };
}

function formatGapPoints(points: number): string {
  return Math.abs(points - Math.round(points)) < 0.05 ? String(Math.round(points)) : points.toFixed(1);
}
