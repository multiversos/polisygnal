import type {
  AnalysisHistoryItem,
  AnalysisHistoryPredictedSide,
  AnalysisHistoryResolutionConfidence,
  AnalysisHistoryResolutionSource,
  AnalysisHistoryResult,
  AnalysisHistoryStatus,
} from "./analysisHistory";
import type { ProbabilityPair } from "./marketProbabilities";

export type MarketOutcome = "CANCELLED" | "NO" | "OPEN" | "UNKNOWN" | "YES";

export type AnalysisResolutionResult = {
  confidence: AnalysisHistoryResolutionConfidence;
  outcome: MarketOutcome;
  reason: string;
  resolvedAt?: string;
  source: AnalysisHistoryResolutionSource;
  status: AnalysisHistoryStatus;
};

type MaybeMarketData = Record<string, unknown> & {
  active?: boolean | null;
  closed?: boolean | null;
};

const OUTCOME_FIELD_CANDIDATES = [
  "resolved_outcome",
  "winning_outcome",
  "winningOutcome",
  "final_outcome",
  "finalOutcome",
  "outcome",
  "winner",
  "result",
];

const RESOLVED_AT_FIELD_CANDIDATES = [
  "resolved_at",
  "resolvedAt",
  "closed_at",
  "closedAt",
  "end_date",
  "endDate",
];

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeOutcome(value: unknown): MarketOutcome {
  const normalized = stringValue(value)?.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "YES") {
    return "YES";
  }
  if (normalized === "NO") {
    return "NO";
  }
  if (
    normalized === "CANCELLED" ||
    normalized === "CANCELED" ||
    normalized === "INVALID" ||
    normalized === "VOID"
  ) {
    return "CANCELLED";
  }
  if (normalized === "OPEN" || normalized === "PENDING") {
    return "OPEN";
  }
  return "UNKNOWN";
}

export function calculateAnalysisResult(
  predictedSide: AnalysisHistoryPredictedSide | null | undefined,
  outcome: MarketOutcome,
): AnalysisHistoryResult {
  if (outcome === "OPEN") {
    return "pending";
  }
  if (outcome === "CANCELLED") {
    return "cancelled";
  }
  if (outcome !== "YES" && outcome !== "NO") {
    return "unknown";
  }
  if (predictedSide !== "YES" && predictedSide !== "NO") {
    return "unknown";
  }
  return predictedSide === outcome ? "hit" : "miss";
}

export function predictedSideFromProbabilities(
  probabilities: ProbabilityPair | null | undefined,
): AnalysisHistoryPredictedSide {
  if (!probabilities) {
    return "UNKNOWN";
  }
  const diff = probabilities.yes - probabilities.no;
  if (Math.abs(diff) < 0.0001) {
    return "UNKNOWN";
  }
  return diff > 0 ? "YES" : "NO";
}

export function isResolvedMarket(market: MaybeMarketData | null | undefined): boolean {
  if (!market) {
    return false;
  }
  if (market.closed === true) {
    return true;
  }
  if (market.active === false) {
    return true;
  }
  return false;
}

function extractResolvedAt(market: MaybeMarketData): string | undefined {
  for (const field of RESOLVED_AT_FIELD_CANDIDATES) {
    const value = stringValue(market[field]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function extractOutcomeFromMarketData(
  market: MaybeMarketData | null | undefined,
  source: AnalysisHistoryResolutionSource = "polysignal_market",
): AnalysisResolutionResult {
  if (!market) {
    return {
      confidence: "low",
      outcome: "UNKNOWN",
      reason: "No encontramos datos suficientes para verificar este mercado.",
      source: "unknown",
      status: "unknown",
    };
  }

  for (const field of OUTCOME_FIELD_CANDIDATES) {
    const outcome = normalizeOutcome(market[field]);
    if (outcome === "YES" || outcome === "NO") {
      return {
        confidence: "high",
        outcome,
        reason: `El mercado fue resuelto como ${outcome}.`,
        resolvedAt: extractResolvedAt(market),
        source,
        status: "resolved",
      };
    }
    if (outcome === "CANCELLED") {
      return {
        confidence: "high",
        outcome,
        reason: "El mercado figura como cancelado o invalido.",
        resolvedAt: extractResolvedAt(market),
        source,
        status: "resolved",
      };
    }
  }

  if (!isResolvedMarket(market)) {
    return {
      confidence: "medium",
      outcome: "OPEN",
      reason: "El mercado sigue abierto.",
      source,
      status: "open",
    };
  }

  return {
    confidence: "low",
    outcome: "UNKNOWN",
    reason: "El mercado parece cerrado, pero aun no hay resultado final confiable.",
    resolvedAt: extractResolvedAt(market),
    source,
    status: "unknown",
  };
}

export function resolveAnalysisAgainstOutcome(
  item: AnalysisHistoryItem,
  resolution: AnalysisResolutionResult,
): Partial<AnalysisHistoryItem> {
  const result = calculateAnalysisResult(item.predictedSide, resolution.outcome);
  const outcome = resolution.outcome === "OPEN" ? "UNKNOWN" : resolution.outcome;
  const reason =
    result === "unknown" && (resolution.outcome === "YES" || resolution.outcome === "NO")
      ? "El mercado tiene resultado final, pero no habia una estimacion PolySignal guardada para comparar."
      : resolution.reason;

  return {
    outcome,
    resolutionConfidence: resolution.confidence,
    resolutionReason: reason,
    resolutionSource: resolution.source,
    resolvedAt: resolution.resolvedAt,
    result,
    status: resolution.status,
    verifiedAt: new Date().toISOString(),
  };
}
