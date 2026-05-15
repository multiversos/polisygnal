import type {
  WalletPublicMarketHistoryItem,
  WalletPublicProfile,
  WalletProfileSummary,
  WalletReliability,
  WalletSignalDirection,
} from "./walletIntelligenceTypes";

export type WalletPublicHistoryPosition = {
  conditionId?: string;
  marketSlug?: string;
  marketTitle?: string;
  marketUrl?: string;
  outcome?: string;
  realizedPnlUsd?: number;
  side?: string;
  timestamp?: string;
  volumeUsd?: number;
  averagePrice?: number;
};

export type WalletProfileBuildInput = {
  closedPositions?: WalletPublicHistoryPosition[];
  currentSide?: WalletSignalDirection;
  observedCapitalUsd?: number;
  profile?: WalletPublicProfile | null;
  shortAddress: string;
  walletAddress?: string | null;
};

const MIN_RESOLVED_MARKETS_FOR_PROFILE = 5;

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeDirection(value: unknown): WalletSignalDirection | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "YES" || normalized === "NO" || normalized === "NEUTRAL") {
    return normalized;
  }
  if (normalized === "BOTH") {
    return "NEUTRAL";
  }
  return undefined;
}

function reliabilityForResolvedCount(count: number): WalletReliability {
  if (count >= 20) {
    return "high";
  }
  if (count >= 10) {
    return "medium";
  }
  if (count >= MIN_RESOLVED_MARKETS_FOR_PROFILE) {
    return "low";
  }
  return "unknown";
}

function uniqueMarketCount(positions: WalletPublicHistoryPosition[]): number {
  const keys = new Set<string>();
  for (const position of positions) {
    const key = position.conditionId || position.marketTitle;
    if (key) {
      keys.add(key);
    }
  }
  return keys.size;
}

function volumeObserved(positions: WalletPublicHistoryPosition[], currentCapital?: number): number | undefined {
  const total = positions.reduce((sum, position) => sum + (normalizeNumber(position.volumeUsd) ?? 0), 0);
  const current = normalizeNumber(currentCapital) ?? 0;
  const combined = total + current;
  return combined > 0 ? combined : undefined;
}

function resultFromPnl(value?: number): WalletPublicMarketHistoryItem["result"] {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  if (value > 0) {
    return "won";
  }
  if (value < 0) {
    return "lost";
  }
  return "unknown";
}

export function buildWalletMarketHistoryItems(
  positions: WalletPublicHistoryPosition[],
): WalletPublicMarketHistoryItem[] {
  return positions.slice(0, 25).map((position) => ({
    amountUsd: normalizeNumber(position.volumeUsd) ?? null,
    averagePrice: normalizeNumber(position.averagePrice) ?? null,
    conditionId: position.conditionId ?? null,
    marketSlug: position.marketSlug ?? null,
    marketTitle: position.marketTitle ?? null,
    marketUrl: position.marketUrl ?? null,
    outcome: position.outcome ?? position.side ?? null,
    realizedPnl: normalizeNumber(position.realizedPnlUsd) ?? null,
    result: resultFromPnl(position.realizedPnlUsd),
    source: "polymarket_data_api_closed_positions",
    timestamp: position.timestamp ?? null,
  }));
}

export function buildWalletProfileSummary(input: WalletProfileBuildInput): WalletProfileSummary {
  const closedPositions = input.closedPositions ?? [];
  const resolvedPositions = closedPositions.filter((position) => typeof position.realizedPnlUsd === "number");
  const wins = resolvedPositions.filter((position) => (position.realizedPnlUsd ?? 0) > 0).length;
  const losses = resolvedPositions.filter((position) => (position.realizedPnlUsd ?? 0) < 0).length;
  const resolvedMarketsCount = wins + losses;
  const profileAvailable = resolvedMarketsCount >= MIN_RESOLVED_MARKETS_FOR_PROFILE;
  const observedMarketsCount = uniqueMarketCount(closedPositions);
  const winRate = resolvedMarketsCount > 0 ? wins / resolvedMarketsCount : undefined;
  const commonSideBias = normalizeDirection(input.currentSide);
  const warnings = [
    profileAvailable ? "" : "No hay historial publico suficiente para calificar esta billetera.",
    "No se identifica a personas reales detras de wallets publicas.",
    "No se inventa ROI ni win rate sin mercados cerrados reales.",
  ].filter(Boolean);

  return {
    commonSideBias,
    confidence: reliabilityForResolvedCount(resolvedMarketsCount),
    losses: resolvedMarketsCount > 0 ? losses : undefined,
    observedMarketsCount: observedMarketsCount > 0 ? observedMarketsCount : undefined,
    profileAvailable,
    profile: input.profile ?? null,
    reason: profileAvailable
      ? "Perfil construido desde posiciones publicas cerradas de Polymarket."
      : "No hay historial publico suficiente para calificar esta billetera.",
    resolvedMarketsCount: resolvedMarketsCount > 0 ? resolvedMarketsCount : undefined,
    shortAddress: input.shortAddress,
    walletAddress: input.walletAddress ?? null,
    volumeObservedUsd: volumeObserved(closedPositions, input.observedCapitalUsd),
    warnings,
    winRate: resolvedMarketsCount > 0 ? winRate : undefined,
    wins: resolvedMarketsCount > 0 ? wins : undefined,
  };
}

export function buildWalletProfileSummaries(inputs: WalletProfileBuildInput[]): WalletProfileSummary[] {
  return inputs
    .filter((input) => input.shortAddress.trim())
    .slice(0, 5)
    .map(buildWalletProfileSummary);
}
