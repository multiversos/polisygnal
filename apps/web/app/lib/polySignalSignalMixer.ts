import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";

export type PolySignalSignalDirection = "NO" | "PENDING" | "YES";

export type PolySignalSignalMixInput = {
  externalOddsSignalAvailable?: boolean;
  marketImpliedProbability?: {
    no?: number;
    yes?: number;
  } | null;
  samanthaResearchSignalCount?: number;
  walletProfileSignalAvailable?: boolean;
  walletSignal?: WalletIntelligenceSummary | null;
};

export type PolySignalSignalMix = {
  confidence: "high" | "low" | "medium" | "none";
  finalEstimateAvailable: boolean;
  marketImpliedProbability?: {
    no?: number;
    yes?: number;
  };
  reason: string;
  signalCount: number;
  status: "estimate_pending" | "ready_for_decision";
  walletProfileSignalAvailable: boolean;
  walletSignalAvailable: boolean;
};

export function buildConservativePolySignalSignalMix(input: PolySignalSignalMixInput): PolySignalSignalMix {
  const walletSignalAvailable = Boolean(input.walletSignal?.available && input.walletSignal.relevantWalletsCount > 0);
  const walletProfileSignalAvailable =
    input.walletProfileSignalAvailable === true ||
    Boolean(input.walletSignal?.profileSummaries?.some((profile) => profile.profileAvailable));
  const samanthaSignalCount = Math.max(0, input.samanthaResearchSignalCount ?? 0);
  const signalCount =
    (walletSignalAvailable ? 1 : 0) +
    (walletProfileSignalAvailable ? 1 : 0) +
    (input.externalOddsSignalAvailable ? 1 : 0) +
    samanthaSignalCount;
  const enoughIndependentEvidence =
    walletSignalAvailable &&
    walletProfileSignalAvailable &&
    samanthaSignalCount > 0 &&
    input.externalOddsSignalAvailable === true;

  if (!enoughIndependentEvidence) {
    return {
      confidence: "none",
      finalEstimateAvailable: false,
      marketImpliedProbability: input.marketImpliedProbability ?? undefined,
      reason:
        "Estimacion pendiente: faltan investigacion externa validada, perfiles publicos suficientes u odds comparables.",
      signalCount,
      status: "estimate_pending",
      walletProfileSignalAvailable,
      walletSignalAvailable,
    };
  }

  return {
    confidence: "low",
    finalEstimateAvailable: false,
    marketImpliedProbability: input.marketImpliedProbability ?? undefined,
    reason:
      "Senales preparadas para una decision futura, pero el motor aun no genera porcentaje sin compuertas adicionales.",
    signalCount,
    status: "ready_for_decision",
    walletProfileSignalAvailable,
    walletSignalAvailable,
  };
}
