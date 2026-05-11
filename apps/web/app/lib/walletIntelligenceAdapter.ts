import {
  WALLET_INTELLIGENCE_THRESHOLD_USD,
  calculateWalletSideBias,
  filterRelevantWallets,
  formatWalletAddress,
  getWalletIntelligenceSummary,
} from "./walletIntelligence";
import type {
  WalletIntelligenceSummary,
  WalletMarketPosition,
  WalletSide,
} from "./walletIntelligenceTypes";

export type WalletIntelligenceLookupInput = {
  conditionId?: string;
  eventSlug?: string;
  marketId?: string;
  marketSlug?: string;
  remoteId?: string;
  tokenIds?: string[];
};

type BackendWalletSignal = {
  avg_price?: number | string | null;
  current_price?: number | string | null;
  outcome?: string | null;
  position_size_usd?: number | string | null;
  price?: number | string | null;
  realized_pnl?: number | string | null;
  side?: string | null;
  timestamp?: string | null;
  total_pnl?: number | string | null;
  trade_size_usd?: number | string | null;
  wallet_address?: string | null;
  wallet_short?: string | null;
};

type BackendWalletIntelligenceResponse = {
  concentration_summary?: {
    sides?: Array<{
      side?: string | null;
      total_position_size_usd?: number | string | null;
      wallet_count?: number | string | null;
    }> | null;
    total_position_size_usd?: number | string | null;
  } | null;
  data_available?: boolean | null;
  generated_at?: string | null;
  large_positions?: BackendWalletSignal[] | null;
  large_trades?: BackendWalletSignal[] | null;
  limit?: number | string | null;
  notable_wallets?: BackendWalletSignal[] | null;
  threshold_usd?: number | string | null;
  warnings?: string[] | null;
};

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

function normalizeSide(value: unknown): WalletSide {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "si") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  return "UNKNOWN";
}

function safeWalletPosition(signal: BackendWalletSignal, fallbackMarketId?: string): WalletMarketPosition | null {
  const amountUsd = normalizeNumber(signal.position_size_usd ?? signal.trade_size_usd);
  if (amountUsd === undefined) {
    return null;
  }
  const shortAddress = signal.wallet_short || formatWalletAddress(signal.wallet_address);
  return {
    amountUsd,
    averageEntryPrice: normalizeNumber(signal.avg_price ?? signal.price),
    lastActivityAt: signal.timestamp ?? undefined,
    marketId: fallbackMarketId,
    shortAddress,
    side: normalizeSide(signal.side ?? signal.outcome),
    unrealizedPnlUsd: normalizeNumber(signal.total_pnl ?? signal.realized_pnl),
    walletAddress: shortAddress,
  };
}

function unavailableSummary(
  reason: string,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletIntelligenceSummary {
  return {
    ...getWalletIntelligenceSummary(null, thresholdUsd),
    checkedAt: new Date().toISOString(),
    reason,
    source: "unavailable",
    warnings: [
      "No se muestran direcciones completas por defecto.",
      "No se identifica a personas reales.",
      "No se crea prediccion PolySignal solo con billeteras.",
    ],
  };
}

function safeWarnings(warnings: string[] | null | undefined, thresholdUsd: number): string[] {
  if (warnings?.length) {
    return warnings;
  }
  return unavailableSummary("", thresholdUsd).warnings;
}

export async function getWalletIntelligenceForMarket(
  input: WalletIntelligenceLookupInput,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): Promise<WalletIntelligenceSummary> {
  if (!input.marketId || !/^\d+$/.test(input.marketId)) {
    return unavailableSummary("Falta un marketId local valido para consultar billeteras.", thresholdUsd);
  }

  try {
    const params = new URLSearchParams({
      limit: "20",
      min_usd: String(thresholdUsd),
    });
    const response = await fetch(
      `/api/backend/markets/${encodeURIComponent(input.marketId)}/wallet-intelligence?${params.toString()}`,
      {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
        method: "GET",
        redirect: "error",
      },
    );
    if (!response.ok) {
      return unavailableSummary("No pudimos consultar datos de billeteras ahora.", thresholdUsd);
    }
    const responseText = await response.text();
    if (responseText.length > 256_000) {
      return unavailableSummary("No pudimos consultar datos de billeteras ahora.", thresholdUsd);
    }
    const payload = JSON.parse(responseText) as BackendWalletIntelligenceResponse;
    const backendThreshold = normalizeNumber(payload.threshold_usd) ?? thresholdUsd;
    const positions = [
      ...(payload.large_positions ?? []),
      ...(payload.large_trades ?? []),
    ]
      .map((item) => safeWalletPosition(item, input.marketId))
      .filter((item): item is WalletMarketPosition => Boolean(item));
    const relevant = filterRelevantWallets(positions, backendThreshold);
    if (!payload.data_available || relevant.length === 0) {
      return {
        ...unavailableSummary("Aun no hay datos de billeteras suficientes para este mercado.", backendThreshold),
        warnings: safeWarnings(payload.warnings, backendThreshold),
      };
    }

    const bias = calculateWalletSideBias(relevant, backendThreshold);
    return {
      analyzedCapitalUsd: bias.yesCapitalUsd + bias.noCapitalUsd,
      available: true,
      checkedAt: payload.generated_at ?? new Date().toISOString(),
      confidence: bias.confidence === "none" ? "low" : bias.confidence,
      noCapitalUsd: bias.noCapitalUsd,
      reason:
        "Actividad publica de billeteras detectada por encima del umbral. Es una senal auxiliar, no una decision final.",
      relevantWalletsCount: relevant.length,
      signalDirection: bias.direction,
      source: "backend",
      thresholdUsd: backendThreshold,
      topWallets: relevant.slice(0, 5),
      warnings: [
        ...(payload.warnings ?? []),
        "No copiar traders ciegamente.",
        "No identificar personas reales detras de direcciones publicas.",
      ],
      yesCapitalUsd: bias.yesCapitalUsd,
    };
  } catch {
    return unavailableSummary("No pudimos consultar datos de billeteras ahora.", thresholdUsd);
  }
}
