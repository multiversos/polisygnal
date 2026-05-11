import type {
  WalletIntelligenceReadiness,
  WalletIntelligenceSummary,
  WalletMarketPosition,
  WalletPerformanceProfile,
  WalletPublicSignalSummary,
  WalletReliability,
  WalletRiskProfile,
  WalletSide,
  WalletSignalDirection,
} from "./walletIntelligenceTypes";

export const WALLET_INTELLIGENCE_THRESHOLD_USD = 100;

type WalletIntelligenceSource = {
  [key: string]: unknown;
  walletIntelligence?: {
    positions?: WalletMarketPosition[] | null;
    profiles?: WalletPerformanceProfile[] | null;
    summary?: WalletIntelligenceSummary | null;
  } | null;
  walletPositions?: WalletMarketPosition[] | null;
  walletProfiles?: WalletPerformanceProfile[] | null;
  wallet_intelligence?: {
    positions?: WalletMarketPosition[] | null;
    profiles?: WalletPerformanceProfile[] | null;
    summary?: WalletIntelligenceSummary | null;
  } | null;
  wallet_positions?: WalletMarketPosition[] | null;
  wallet_profiles?: WalletPerformanceProfile[] | null;
};

type WalletBias = {
  confidence: WalletIntelligenceSummary["confidence"];
  direction: WalletSignalDirection;
  noCapitalUsd: number;
  relevantWalletsCount: number;
  yesCapitalUsd: number;
};

function normalizeUsd(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanPositions(wallets?: WalletMarketPosition[] | null): WalletMarketPosition[] {
  if (!Array.isArray(wallets)) {
    return [];
  }
  return wallets.filter((wallet) => typeof wallet.walletAddress === "string" && wallet.walletAddress.trim());
}

function cleanProfiles(profiles?: WalletPerformanceProfile[] | null): WalletPerformanceProfile[] {
  if (!Array.isArray(profiles)) {
    return [];
  }
  return profiles.filter((profile) => typeof profile.walletAddress === "string" && profile.walletAddress.trim());
}

function getWalletPositions(input: WalletIntelligenceSource): WalletMarketPosition[] {
  return [
    ...cleanPositions(input.walletIntelligence?.summary?.topWallets),
    ...cleanPositions(input.walletIntelligence?.positions),
    ...cleanPositions(input.wallet_intelligence?.summary?.topWallets),
    ...cleanPositions(input.wallet_intelligence?.positions),
    ...cleanPositions(input.walletPositions),
    ...cleanPositions(input.wallet_positions),
  ];
}

function getWalletProfiles(input: WalletIntelligenceSource): WalletPerformanceProfile[] {
  return [
    ...cleanProfiles(input.walletIntelligence?.profiles),
    ...cleanProfiles(input.wallet_intelligence?.profiles),
    ...cleanProfiles(input.walletProfiles),
    ...cleanProfiles(input.wallet_profiles),
  ];
}

function normalizeSide(value: unknown): WalletSide {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "YES" || normalized === "SI") {
    return "YES";
  }
  if (normalized === "NO") {
    return "NO";
  }
  if (normalized === "BOTH") {
    return "BOTH";
  }
  return "UNKNOWN";
}

function reliabilityScore(value: WalletReliability): number {
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  if (value === "low") {
    return 1;
  }
  return 0;
}

export function formatWalletAddress(address?: string | null): string {
  const cleaned = address?.trim();
  if (!cleaned) {
    return "wallet desconocida";
  }
  if (cleaned.length <= 12) {
    return cleaned;
  }
  return `${cleaned.slice(0, 6)}...${cleaned.slice(-4)}`;
}

export function filterRelevantWallets(
  wallets: WalletMarketPosition[] | null | undefined,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletMarketPosition[] {
  return cleanPositions(wallets)
    .map((wallet) => {
      const amountUsd = normalizeUsd(wallet.amountUsd);
      return {
        ...wallet,
        amountUsd: amountUsd ?? undefined,
        shortAddress: wallet.shortAddress || formatWalletAddress(wallet.walletAddress),
        side: normalizeSide(wallet.side),
      };
    })
    .filter((wallet) => typeof wallet.amountUsd === "number" && wallet.amountUsd >= thresholdUsd);
}

export function classifyWalletProfile(profile?: WalletPerformanceProfile | null): WalletRiskProfile {
  if (!profile) {
    return "unknown";
  }
  const resolvedMarkets = normalizeUsd(profile.resolvedMarkets);
  const winRate = normalizeUsd(profile.winRate);
  const estimatedRoi = normalizeUsd(profile.estimatedRoi);
  if (resolvedMarkets !== null && resolvedMarkets > 0 && resolvedMarkets < 5) {
    return "new_wallet";
  }
  if (estimatedRoi !== null && estimatedRoi < 0) {
    return "unprofitable";
  }
  if (
    winRate !== null &&
    estimatedRoi !== null &&
    resolvedMarkets !== null &&
    resolvedMarkets >= 10 &&
    winRate >= 0.6 &&
    estimatedRoi > 0
  ) {
    return "consistent";
  }
  if (winRate !== null && winRate < 0.45) {
    return "volatile";
  }
  return profile.riskProfile ?? "unknown";
}

export function calculateWalletSideBias(
  positions: WalletMarketPosition[] | null | undefined,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletBias {
  const relevant = filterRelevantWallets(positions, thresholdUsd);
  const yesCapitalUsd = relevant
    .filter((position) => position.side === "YES")
    .reduce((total, position) => total + (position.amountUsd ?? 0), 0);
  const noCapitalUsd = relevant
    .filter((position) => position.side === "NO")
    .reduce((total, position) => total + (position.amountUsd ?? 0), 0);
  const totalDirectional = yesCapitalUsd + noCapitalUsd;
  if (relevant.length === 0 || totalDirectional <= 0) {
    return {
      confidence: "none",
      direction: "UNKNOWN",
      noCapitalUsd,
      relevantWalletsCount: relevant.length,
      yesCapitalUsd,
    };
  }
  const gap = Math.abs(yesCapitalUsd - noCapitalUsd) / totalDirectional;
  if (gap < 0.1) {
    return {
      confidence: "low",
      direction: "NEUTRAL",
      noCapitalUsd,
      relevantWalletsCount: relevant.length,
      yesCapitalUsd,
    };
  }
  return {
    confidence: relevant.length >= 5 && gap >= 0.3 ? "medium" : "low",
    direction: yesCapitalUsd > noCapitalUsd ? "YES" : "NO",
    noCapitalUsd,
    relevantWalletsCount: relevant.length,
    yesCapitalUsd,
  };
}

export function getWalletIntelligenceSummary(
  market: WalletIntelligenceSource | null | undefined,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletIntelligenceSummary {
  const input = market ?? {};
  const savedSummary = input.walletIntelligence?.summary ?? input.wallet_intelligence?.summary;
  if (savedSummary?.available) {
    return {
      ...savedSummary,
      source: savedSummary.source ?? "local",
      thresholdUsd: savedSummary.thresholdUsd ?? thresholdUsd,
      topWallets: filterRelevantWallets(savedSummary.topWallets, savedSummary.thresholdUsd ?? thresholdUsd),
      warnings: savedSummary.warnings ?? [],
    };
  }
  const positions = getWalletPositions(input);
  const relevantPositions = filterRelevantWallets(positions, thresholdUsd);
  const profiles = getWalletProfiles(input);
  if (relevantPositions.length === 0) {
    return {
      available: false,
      confidence: "none",
      reason: "Aun no hay datos de billeteras suficientes para este mercado.",
      relevantWalletsCount: 0,
      signalDirection: "UNKNOWN",
      source: "unavailable",
      thresholdUsd,
      warnings: [
        "No se muestran direcciones completas por defecto.",
        "No se intenta identificar personas reales detras de billeteras publicas.",
        "La inteligencia de billeteras sera una senal auxiliar, no una decision por si sola.",
      ],
    };
  }

  const bias = calculateWalletSideBias(relevantPositions, thresholdUsd);
  const reliableProfiles = profiles.filter((profile) => reliabilityScore(profile.reliability) >= 2);
  const reliableWallets = new Set(reliableProfiles.map((profile) => profile.walletAddress.toLowerCase()));
  const trustedYesWallets = relevantPositions.filter(
    (position) => position.side === "YES" && reliableWallets.has(position.walletAddress.toLowerCase()),
  ).length;
  const trustedNoWallets = relevantPositions.filter(
    (position) => position.side === "NO" && reliableWallets.has(position.walletAddress.toLowerCase()),
  ).length;

  return {
    analyzedCapitalUsd: bias.yesCapitalUsd + bias.noCapitalUsd,
    available: true,
    confidence: bias.confidence === "none" ? "low" : bias.confidence,
    noCapitalUsd: bias.noCapitalUsd,
    reason:
      "Hay posiciones publicas por encima del umbral. Esta lectura requiere validacion antes de usarse como senal de estimacion.",
    relevantWalletsCount: bias.relevantWalletsCount,
    signalDirection: bias.direction,
    source: "local",
    thresholdUsd,
    topWallets: relevantPositions.slice(0, 5),
    trustedNoWallets,
    trustedYesWallets,
    warnings: [
      "No copiar traders ciegamente.",
      "No identificar personas reales detras de direcciones publicas.",
      "No crear prediccion PolySignal solo con billeteras.",
    ],
    yesCapitalUsd: bias.yesCapitalUsd,
  };
}

const WALLET_WARNING_LABELS: Record<string, string> = {
  condition_id_unavailable:
    "Falta un identificador publico confiable para revisar actividad de billeteras.",
  concentrated_side_activity:
    "La actividad publica esta concentrada en un lado; revisarla solo como contexto.",
  large_activity_partial:
    "La fuente publica trae actividad parcial, no historial completo de desempeno.",
  no_wallet_activity:
    "No se detectaron billeteras publicas por encima del umbral configurado.",
  unavailable:
    "La fuente de billeteras no esta disponible en este momento.",
};

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
}

export function getWalletBiasLabel(summary?: WalletIntelligenceSummary | null): string {
  if (!summary?.available || summary.relevantWalletsCount <= 0) {
    return "Datos de billeteras insuficientes";
  }
  if (summary.signalDirection === "YES") {
    return "Capital observado inclinado hacia YES";
  }
  if (summary.signalDirection === "NO") {
    return "Capital observado inclinado hacia NO";
  }
  if (summary.signalDirection === "NEUTRAL" || summary.signalDirection === "BOTH") {
    return "Billeteras relevantes divididas";
  }
  return "Datos de billeteras insuficientes";
}

export function getWalletConfidenceLabel(summary?: WalletIntelligenceSummary | null): string {
  if (!summary?.available || summary.confidence === "none") {
    return "Sin confianza suficiente";
  }
  if (summary.confidence === "high") {
    return "Confianza alta";
  }
  if (summary.confidence === "medium") {
    return "Confianza media";
  }
  return "Confianza baja";
}

export function getWalletWarnings(summary?: WalletIntelligenceSummary | null): string[] {
  const warnings = (summary?.warnings ?? []).map(
    (warning) => WALLET_WARNING_LABELS[warning] ?? warning,
  );
  if (!summary?.available) {
    warnings.push("No se muestran direcciones completas por defecto.");
    warnings.push("No se intenta identificar personas reales detras de wallets publicas.");
    warnings.push("Wallet Intelligence es una senal auxiliar, no una prediccion final.");
    return uniqueWarnings(warnings);
  }
  if (summary.confidence === "low" || summary.confidence === "none") {
    warnings.push("Sin historial cerrado suficiente para elevar la confianza.");
  }
  warnings.push("Actividad publica observada, no decision final.");
  warnings.push("No se recomienda copiar operaciones de wallets.");
  warnings.push("No se intenta identificar personas reales detras de wallets publicas.");
  return uniqueWarnings(warnings);
}

export function shouldUseWalletAsAuxiliarySignal(summary?: WalletIntelligenceSummary | null): boolean {
  return Boolean(summary?.available && summary.relevantWalletsCount > 0);
}

export function getWalletPublicExplanation(summary?: WalletIntelligenceSummary | null): string {
  if (!summary?.available || summary.relevantWalletsCount <= 0) {
    return "No hay suficientes datos publicos de billeteras para este mercado.";
  }
  if (summary.signalDirection === "YES" || summary.signalDirection === "NO") {
    return `El capital publico observado se inclina hacia ${summary.signalDirection}, pero esta lectura no identifica personas ni crea una estimacion PolySignal por si sola.`;
  }
  if (summary.signalDirection === "NEUTRAL" || summary.signalDirection === "BOTH") {
    return "Las billeteras relevantes aparecen divididas; la lectura sirve como contexto y no como decision.";
  }
  return "Hay actividad publica de billeteras, pero el lado dominante no esta confirmado.";
}

export function getWalletSignalSummary(
  summary?: WalletIntelligenceSummary | null,
): WalletPublicSignalSummary {
  const warnings = getWalletWarnings(summary);
  return {
    auxiliaryLabel: "Senal auxiliar de billeteras",
    available: Boolean(summary?.available),
    biasLabel: getWalletBiasLabel(summary),
    confidenceLabel: getWalletConfidenceLabel(summary),
    explanation: getWalletPublicExplanation(summary),
    headline:
      summary?.available && summary.relevantWalletsCount > 0
        ? getWalletBiasLabel(summary)
        : "Datos de billeteras insuficientes",
    shouldUseAsAuxiliarySignal: shouldUseWalletAsAuxiliarySignal(summary),
    warnings,
  };
}

export function getWalletIntelligenceReadiness(
  market: WalletIntelligenceSource | null | undefined,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletIntelligenceReadiness {
  const input = market ?? {};
  const positions = getWalletPositions(input);
  const profiles = getWalletProfiles(input);
  const relevantPositions = filterRelevantWallets(positions, thresholdUsd);
  const checklist = [
    {
      available: positions.length > 0,
      label: "Posiciones por billetera",
      reason: positions.length > 0 ? "Hay posiciones publicas estructuradas." : "Pendiente de fuente estructurada.",
    },
    {
      available: relevantPositions.length > 0,
      label: "Monto USD minimo",
      reason:
        relevantPositions.length > 0
          ? `Hay posiciones de ${thresholdUsd} USD o mas.`
          : `No hay posiciones verificadas de ${thresholdUsd} USD o mas.`,
    },
    {
      available: relevantPositions.some((position) => position.side === "YES" || position.side === "NO"),
      label: "Lado YES/NO",
      reason: "Necesario para saber inclinacion sin inventarla.",
    },
    {
      available: profiles.some((profile) => (profile.resolvedMarkets ?? 0) > 0),
      label: "Historial cerrado",
      reason: "Necesario para medir desempeno real de una billetera.",
    },
    {
      available: profiles.some((profile) => typeof profile.winRate === "number"),
      label: "Tasa de acierto historica",
      reason: "Solo se mostrara cuando exista historial resuelto confiable.",
    },
    {
      available: profiles.some((profile) => typeof profile.estimatedRoi === "number"),
      label: "Rentabilidad historica",
      reason: "Solo se mostrara cuando exista calculo estructurado real.",
    },
    {
      available: profiles.some((profile) => classifyWalletProfile(profile) !== "unknown"),
      label: "Consistencia",
      reason: "Necesaria para no tratar una billetera nueva como confiable.",
    },
  ];
  const missing = checklist.filter((item) => !item.available).map((item) => item.label);
  return {
    available: relevantPositions.length > 0,
    checklist,
    level: relevantPositions.length > 0 && profiles.length > 0 ? "partial" : "none",
    missing,
    thresholdUsd,
    warnings: [
      "No se muestran direcciones completas por defecto.",
      "No se infiere identidad personal.",
      "No se usa como prediccion unica.",
    ],
  };
}
