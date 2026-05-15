import { CLEAR_DECISION_THRESHOLD } from "./analysisDecision";
import type { ExternalOddsComparison } from "./externalOddsTypes";
import { normalizeProbability, type ProbabilityPair, type ProbabilityValue } from "./marketProbabilities";
import {
  convertSamanthaReportToSignals,
  shouldAcceptSuggestedEstimate,
} from "./samanthaResearchReport";
import type {
  SamanthaDirection,
  SamanthaEvidenceItem,
  SamanthaReliability,
  SamanthaResearchReport,
} from "./samanthaResearchTypes";
import type {
  WalletIntelligenceSummary,
  WalletProfileSummary,
  WalletSignalDirection,
} from "./walletIntelligenceTypes";

export type PolySignalSignalDirection = "NO" | "PENDING" | "YES";

export type EstimateConfidence = "high" | "low" | "medium" | "none";

export type EstimateBlockerCode =
  | "missing_market_reference"
  | "missing_samantha_report"
  | "samantha_estimate_not_accepted"
  | "missing_independent_support"
  | "estimate_below_decision_threshold";

export type EstimateBlocker = {
  code: EstimateBlockerCode;
  detail: string;
  label: string;
};

export type EstimateReadiness = {
  auxiliarySupportCount: number;
  gatesPassed: boolean;
  independentSupportCount: number;
  marketReferenceAvailable: boolean;
  missing: EstimateBlocker[];
  samanthaEstimateAccepted: boolean;
  samanthaReportValid: boolean;
};

export type SignalContribution = {
  confidence: "high" | "low" | "medium" | "unknown";
  direction: "NEUTRAL" | "NO" | "UNKNOWN" | "YES";
  isReal: boolean;
  label: string;
  source:
    | "external_evidence"
    | "kalshi_comparison"
    | "market_reference"
    | "odds_comparison"
    | "samantha_research"
    | "wallet_intelligence"
    | "wallet_profile";
  strength: "high" | "low" | "medium";
  summary: string;
  usedForEstimate: boolean;
};

export type PolySignalEstimateInput = {
  externalOddsComparison?: ExternalOddsComparison | null;
  marketImpliedProbability?: {
    no?: ProbabilityValue;
    yes?: ProbabilityValue;
  } | null;
  marketRead?: boolean;
  samanthaReport?: SamanthaResearchReport | null;
  walletSignal?: WalletIntelligenceSummary | null;
};

export type PolySignalEstimateResult = {
  available: boolean;
  blockers: EstimateBlocker[];
  confidence: EstimateConfidence;
  contributions: SignalContribution[];
  countsForHistoryAccuracy: boolean;
  decisionSide: "NO" | "YES" | "neutral" | "unavailable";
  estimateNoProbability?: number;
  estimateYesProbability?: number;
  explanation: string;
  marketImpliedProbability?: ProbabilityPair;
  readiness: EstimateReadiness;
  warnings: string[];
};

export type PolySignalSignalMixInput = {
  externalOddsSignalAvailable?: boolean;
  externalOddsComparison?: ExternalOddsComparison | null;
  marketImpliedProbability?: {
    no?: ProbabilityValue;
    yes?: ProbabilityValue;
  } | null;
  samanthaResearchSignalCount?: number;
  samanthaReport?: SamanthaResearchReport | null;
  walletProfileSignalAvailable?: boolean;
  walletSignal?: WalletIntelligenceSummary | null;
};

export type PolySignalSignalMix = {
  confidence: EstimateConfidence;
  finalEstimateAvailable: boolean;
  marketImpliedProbability?: ProbabilityPair;
  reason: string;
  signalCount: number;
  status: "estimate_pending" | "ready_for_decision";
  walletProfileSignalAvailable: boolean;
  walletSignalAvailable: boolean;
};

function blocker(code: EstimateBlockerCode, label: string, detail: string): EstimateBlocker {
  return { code, detail, label };
}

function probabilityPair(input?: PolySignalEstimateInput["marketImpliedProbability"]): ProbabilityPair | null {
  const yes = normalizeProbability(input?.yes);
  const no = normalizeProbability(input?.no);
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

function normalizeReliability(value: SamanthaReliability): SignalContribution["confidence"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "unknown";
}

function strengthFromReliability(value: SamanthaReliability): SignalContribution["strength"] {
  if (value === "high") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return "low";
}

function directionFromWallet(value: WalletSignalDirection): SignalContribution["direction"] {
  if (value === "YES" || value === "NO" || value === "NEUTRAL") {
    return value;
  }
  if (value === "BOTH") {
    return "NEUTRAL";
  }
  return "UNKNOWN";
}

function walletSignalIsSufficient(summary?: WalletIntelligenceSummary | null): boolean {
  if (!summary?.available || summary.confidence === "none") {
    return false;
  }
  const observedCapital = summary.analyzedCapitalUsd ?? 0;
  const threshold = summary.thresholdUsd || 100;
  return (
    summary.relevantWalletsCount >= 2 &&
    observedCapital >= threshold * 2 &&
    directionFromWallet(summary.signalDirection) !== "UNKNOWN"
  );
}

function walletProfileIsSufficient(profile: WalletProfileSummary): boolean {
  return Boolean(
    profile.profileAvailable &&
      typeof profile.wins === "number" &&
      typeof profile.losses === "number" &&
      (profile.resolvedMarketsCount ?? 0) >= 5,
  );
}

function profileSignalIsSufficient(summary?: WalletIntelligenceSummary | null): boolean {
  return Boolean(summary?.profileSummaries?.some(walletProfileIsSufficient));
}

function comparisonIsUsable(input?: {
  direction: SamanthaDirection;
  found: boolean;
  reliability: SamanthaReliability;
  summary: string;
} | null): boolean {
  return Boolean(
    input?.found &&
      input.summary &&
      input.direction !== "UNKNOWN" &&
      input.reliability !== "unknown",
  );
}

function externalOddsComparisonIsUsable(input?: ExternalOddsComparison | null): boolean {
  return Boolean(
    input?.status === "available" &&
      input.matchedMarket === true &&
      input.outcomes.length >= 2 &&
      (input.matchConfidence === "high" || input.matchConfidence === "medium"),
  );
}

function strongExternalEvidence(report?: SamanthaResearchReport | null): SamanthaEvidenceItem[] {
  if (!report || report.status === "failed") {
    return [];
  }
  return report.evidence.filter(
    (item) =>
      (item.direction === "YES" || item.direction === "NO") &&
      item.sourceType !== "reddit" &&
      item.sourceType !== "social" &&
      (item.reliability === "high" || item.reliability === "medium"),
  );
}

function comparisonContribution(
  source: "kalshi_comparison" | "odds_comparison",
  label: string,
  comparison?: {
    direction: SamanthaDirection;
    found: boolean;
    reliability: SamanthaReliability;
    summary: string;
  } | null,
  usedForEstimate = false,
): SignalContribution | null {
  if (!comparison?.found) {
    return null;
  }
  return {
    confidence: normalizeReliability(comparison.reliability),
    direction: comparison.direction,
    isReal: true,
    label,
    source,
    strength: strengthFromReliability(comparison.reliability),
    summary: comparison.summary || "Comparacion reportada sin detalle suficiente.",
    usedForEstimate,
  };
}

function estimateDirection(yes: number, no: number): PolySignalEstimateResult["decisionSide"] {
  if (yes >= CLEAR_DECISION_THRESHOLD && yes > no) {
    return "YES";
  }
  if (no >= CLEAR_DECISION_THRESHOLD && no > yes) {
    return "NO";
  }
  return "neutral";
}

function confidenceForEstimate(
  report: SamanthaResearchReport,
  independentSupportCount: number,
): EstimateConfidence {
  const confidence = report.suggestedEstimate?.confidence ?? "none";
  if (confidence === "none") {
    return "none";
  }
  if (confidence === "high" && independentSupportCount >= 3) {
    return "high";
  }
  if ((confidence === "high" || confidence === "medium") && independentSupportCount >= 2) {
    return "medium";
  }
  return "low";
}

function dedupeWarnings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, 10);
}

export function buildConservativePolySignalEstimate(input: PolySignalEstimateInput): PolySignalEstimateResult {
  const marketImpliedProbability = probabilityPair(input.marketImpliedProbability);
  const report = input.samanthaReport ?? null;
  const marketReferenceAvailable = Boolean(input.marketRead !== false && marketImpliedProbability);
  const samanthaReportValid = Boolean(report && report.status !== "failed" && report.evidence.length > 0);
  const samanthaEstimateAccepted = report ? shouldAcceptSuggestedEstimate(report) : false;
  const walletSufficient = walletSignalIsSufficient(input.walletSignal);
  const profileSufficient = profileSignalIsSufficient(input.walletSignal);
  const directExternalOddsUsable = externalOddsComparisonIsUsable(input.externalOddsComparison);
  const oddsUsable = comparisonIsUsable(report?.oddsComparison);
  const kalshiUsable = Boolean(
    report?.kalshiComparison?.found &&
      report.kalshiComparison.equivalent &&
      comparisonIsUsable(report.kalshiComparison),
  );
  const strongEvidence = strongExternalEvidence(report);
  const strongExternalEvidenceSufficient = strongEvidence.length >= 2;
  const auxiliarySupportCount = [walletSufficient, profileSufficient].filter(Boolean).length;
  const independentSupportCount = [
    directExternalOddsUsable || oddsUsable,
    kalshiUsable,
    strongExternalEvidenceSufficient,
  ].filter(Boolean).length;
  const blockers: EstimateBlocker[] = [];
  const contributions: SignalContribution[] = [];

  if (marketImpliedProbability) {
    contributions.push({
      confidence: "unknown",
      direction:
        marketImpliedProbability.yes > marketImpliedProbability.no
          ? "YES"
          : marketImpliedProbability.no > marketImpliedProbability.yes
            ? "NO"
            : "NEUTRAL",
      isReal: true,
      label: "Probabilidad del mercado",
      source: "market_reference",
      strength: "low",
      summary: "Referencia de precio visible en Polymarket; no se usa como estimacion propia.",
      usedForEstimate: false,
    });
  }

  if (input.walletSignal?.available) {
    contributions.push({
      confidence: input.walletSignal.confidence === "none" ? "unknown" : input.walletSignal.confidence,
      direction: directionFromWallet(input.walletSignal.signalDirection),
      isReal: true,
      label: "Wallet Intelligence",
      source: "wallet_intelligence",
      strength: walletSufficient ? "medium" : "low",
      summary: walletSufficient
        ? "Actividad publica de billeteras suficiente como senal auxiliar."
        : "Actividad publica de billeteras observada, pero insuficiente como senal fuerte.",
      usedForEstimate: false,
    });
  }

  const usableProfiles = input.walletSignal?.profileSummaries?.filter(walletProfileIsSufficient) ?? [];
  if ((input.walletSignal?.profileSummaries ?? []).length > 0) {
    const profileDirection = usableProfiles.find(
      (profile) => profile.commonSideBias === "YES" || profile.commonSideBias === "NO",
    )?.commonSideBias;
    contributions.push({
      confidence: usableProfiles.length > 0 ? "low" : "unknown",
      direction: profileDirection ? directionFromWallet(profileDirection) : "UNKNOWN",
      isReal: true,
      label: "Perfil de billeteras",
      source: "wallet_profile",
      strength: profileSufficient ? "medium" : "low",
      summary: profileSufficient
        ? "Al menos una billetera tiene historial publico cerrado suficiente."
        : "No hay historial publico cerrado suficiente para usar perfiles como senal.",
      usedForEstimate: false,
    });
  }

  if (report) {
    const signals = convertSamanthaReportToSignals(report);
    const directionalSignals = signals.filter(
      (signal) => signal.direction === "YES" || signal.direction === "NO",
    );
    contributions.push({
      confidence: report.suggestedEstimate?.confidence === "none" ? "unknown" : report.suggestedEstimate?.confidence ?? "unknown",
      direction:
        report.suggestedEstimate?.decision === "YES" || report.suggestedEstimate?.decision === "NO"
          ? report.suggestedEstimate.decision
          : directionalSignals[0]?.direction === "YES" || directionalSignals[0]?.direction === "NO"
            ? directionalSignals[0].direction
            : "UNKNOWN",
      isReal: true,
      label: "Reporte Samantha",
      source: "samantha_research",
      strength: samanthaEstimateAccepted ? "high" : "low",
      summary: samanthaEstimateAccepted
        ? report.suggestedEstimate?.reason || "Reporte validado con evidencia estructurada suficiente."
        : "Reporte cargado, pero sin estimacion aceptada por las compuertas.",
      usedForEstimate: samanthaEstimateAccepted,
    });
  }

  const oddsContribution: SignalContribution | null = directExternalOddsUsable
    ? {
        confidence:
          input.externalOddsComparison?.matchConfidence === "high" ||
          input.externalOddsComparison?.matchConfidence === "medium" ||
          input.externalOddsComparison?.matchConfidence === "low"
            ? input.externalOddsComparison.matchConfidence
            : "unknown",
        direction: "UNKNOWN",
        isReal: true,
        label: "Odds externas comparables",
        source: "odds_comparison",
        strength:
          input.externalOddsComparison?.matchConfidence === "high"
            ? "high"
            : input.externalOddsComparison?.matchConfidence === "medium"
              ? "medium"
              : "low",
        summary: `${input.externalOddsComparison?.providerName || "Proveedor externo"} / ${
          input.externalOddsComparison?.sportsbook || "sportsbook"
        } devolvio comparacion usable para este mercado.`,
        usedForEstimate: true,
      }
    : comparisonContribution(
        "odds_comparison",
        "Odds externas comparables",
        report?.oddsComparison,
        oddsUsable,
      );
  if (oddsContribution) {
    contributions.push(oddsContribution);
  }
  const kalshiContribution = comparisonContribution(
    "kalshi_comparison",
    "Kalshi equivalente",
    report?.kalshiComparison,
    kalshiUsable,
  );
  if (kalshiContribution) {
    contributions.push(kalshiContribution);
  }
  if (strongEvidence.length > 0) {
    contributions.push({
      confidence: strongExternalEvidenceSufficient ? "medium" : "low",
      direction: strongEvidence[0].direction,
      isReal: true,
      label: "Evidencia externa validada",
      source: "external_evidence",
      strength: strongExternalEvidenceSufficient ? "high" : "low",
      summary: `${strongEvidence.length} evidencia(s) externa(s) direccionales con confiabilidad media/alta.`,
      usedForEstimate: strongExternalEvidenceSufficient,
    });
  }

  if (!marketReferenceAvailable) {
    blockers.push(
      blocker(
        "missing_market_reference",
        "Falta lectura completa del mercado",
        "Necesitamos el mercado leido desde Polymarket y su probabilidad visible como referencia, no como estimacion propia.",
      ),
    );
  }
  if (!report) {
    blockers.push(
      blocker(
        "missing_samantha_report",
        "Falta reporte Samantha validado",
        "PolySignal no genera porcentaje propio sin investigacion externa estructurada y validada.",
      ),
    );
  } else if (!samanthaEstimateAccepted) {
    blockers.push(
      blocker(
        "samantha_estimate_not_accepted",
        "Samantha no paso compuertas",
        "El reporte puede aportar contexto, pero no trae una estimacion aceptable con evidencia suficiente.",
      ),
    );
  }
  if (independentSupportCount === 0) {
    blockers.push(
      blocker(
        "missing_independent_support",
        "Faltan soportes independientes",
        "Hace falta al menos una fuente independiente real adicional, como odds comparables, Kalshi equivalente o evidencia externa fuerte. Wallet Intelligence y perfiles solo cuentan como apoyo auxiliar.",
      ),
    );
  }

  const gatesPassed = marketReferenceAvailable && samanthaEstimateAccepted && independentSupportCount > 0;
  const readiness: EstimateReadiness = {
    auxiliarySupportCount,
    gatesPassed,
    independentSupportCount,
    marketReferenceAvailable,
    missing: blockers,
    samanthaEstimateAccepted,
    samanthaReportValid,
  };

  if (!gatesPassed || !report?.suggestedEstimate) {
    const explanation =
      independentSupportCount > 0
        ? "Estimacion PolySignal pendiente: ya hay soporte independiente parcial disponible, pero la lectura todavia no supera las compuertas conservadoras. El precio de mercado sigue solo como referencia y las wallets permanecen como senal auxiliar."
        : "Estimacion PolySignal pendiente: falta reporte Samantha validado o soporte independiente suficiente. El precio de mercado queda solo como referencia y las wallets permanecen como senal auxiliar.";
    return {
      available: false,
      blockers,
      confidence: "none",
      contributions,
      countsForHistoryAccuracy: false,
      decisionSide: "unavailable",
      explanation,
      marketImpliedProbability: marketImpliedProbability ?? undefined,
      readiness,
      warnings: dedupeWarnings([
        ...(input.walletSignal?.warnings ?? []),
        ...(report?.warnings ?? []),
        "No se usa el precio de mercado como estimacion PolySignal.",
      ]),
    };
  }

  const yes = normalizeProbability(report.suggestedEstimate.yesProbability);
  const no = normalizeProbability(report.suggestedEstimate.noProbability);
  if (yes === null || no === null) {
    const nextBlockers = [
      ...blockers,
      blocker(
        "samantha_estimate_not_accepted",
        "Probabilidad Samantha invalida",
        "El reporte validado no trae probabilidades YES/NO dentro de rango.",
      ),
    ];
    return {
      available: false,
      blockers: nextBlockers,
      confidence: "none",
      contributions,
      countsForHistoryAccuracy: false,
      decisionSide: "unavailable",
      explanation: "Estimacion PolySignal pendiente: el reporte no trae probabilidades validas.",
      marketImpliedProbability: marketImpliedProbability ?? undefined,
      readiness: { ...readiness, gatesPassed: false, missing: nextBlockers },
      warnings: dedupeWarnings(report.warnings),
    };
  }

  const decisionSide = estimateDirection(yes, no);
  const confidence = confidenceForEstimate(report, independentSupportCount);
  const decisionBlockers =
    decisionSide === "neutral"
      ? [
          blocker(
            "estimate_below_decision_threshold",
            "Porcentaje sin decision fuerte",
            "La estimacion existe, pero no supera el umbral de 55% para YES o NO.",
          ),
        ]
      : [];
  const countsForHistoryAccuracy = decisionSide === "YES" || decisionSide === "NO";

  return {
    available: true,
    blockers: decisionBlockers,
    confidence,
    contributions,
    countsForHistoryAccuracy,
    decisionSide,
    estimateNoProbability: no,
    estimateYesProbability: yes,
    explanation:
      decisionSide === "neutral"
        ? "PolySignal genero un porcentaje conservador desde reporte Samantha validado, pero queda sin decision fuerte."
        : `PolySignal genero un porcentaje conservador desde reporte Samantha validado y ${independentSupportCount} soporte(s) independiente(s).`,
    marketImpliedProbability: marketImpliedProbability ?? undefined,
    readiness: {
      ...readiness,
      missing: decisionBlockers,
    },
    warnings: dedupeWarnings([
      ...(input.walletSignal?.warnings ?? []),
      ...(report.warnings ?? []),
      "El precio de mercado se muestra solo como referencia.",
      "Esto no es consejo financiero ni garantia.",
    ]),
  };
}

export function buildConservativePolySignalSignalMix(input: PolySignalSignalMixInput): PolySignalSignalMix {
  const estimate = buildConservativePolySignalEstimate({
    externalOddsComparison: input.externalOddsComparison,
    marketImpliedProbability: input.marketImpliedProbability,
    samanthaReport: input.samanthaReport,
    walletSignal: input.walletSignal,
  });
  const walletSignalAvailable = Boolean(input.walletSignal?.available && input.walletSignal.relevantWalletsCount > 0);
  const walletProfileSignalAvailable =
    input.walletProfileSignalAvailable === true ||
    Boolean(input.walletSignal?.profileSummaries?.some((profile) => profile.profileAvailable));
  const signalCount =
    estimate.contributions.filter((contribution) => contribution.usedForEstimate).length +
    Math.max(0, input.samanthaResearchSignalCount ?? 0);

  return {
    confidence: estimate.confidence,
    finalEstimateAvailable: estimate.available,
    marketImpliedProbability: estimate.marketImpliedProbability,
    reason: estimate.explanation,
    signalCount,
    status: estimate.available ? "ready_for_decision" : "estimate_pending",
    walletProfileSignalAvailable,
    walletSignalAvailable,
  };
}
