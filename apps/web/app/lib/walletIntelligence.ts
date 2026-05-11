import type {
  WalletIntelligenceReadiness,
  WalletIntelligenceSummary,
  WalletMarketPosition,
  WalletPerformanceProfile,
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
    ...cleanPositions(input.walletIntelligence?.positions),
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
      thresholdUsd: savedSummary.thresholdUsd ?? thresholdUsd,
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
    thresholdUsd,
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
