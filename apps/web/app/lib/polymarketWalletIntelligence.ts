import {
  WALLET_INTELLIGENCE_THRESHOLD_USD,
  getWalletIntelligenceSummary,
} from "./walletIntelligence";
import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";

export type PolymarketWalletIntelligenceInput = {
  conditionId?: string | null;
  eventSlug?: string | null;
  marketSlug?: string | null;
  marketUrl?: string | null;
  tokenIds?: Array<string | null | undefined> | null;
};

export function unavailablePolymarketWalletIntelligenceSummary(
  reason: string,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
  queryStatus: WalletIntelligenceSummary["queryStatus"] = "unavailable",
): WalletIntelligenceSummary {
  return {
    ...getWalletIntelligenceSummary(null, thresholdUsd),
    checkedAt: new Date().toISOString(),
    queryStatus,
    reason,
    source: "unavailable",
    warnings: [
      "No encontramos datos publicos suficientes de billeteras para este mercado.",
      "Este analisis no usara wallets como senal fuerte.",
      "Las direcciones completas solo se muestran en el detalle cuando la fuente publica las entrega.",
    ],
  };
}

function cleanIdentifier(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 180 || /[^a-zA-Z0-9_.:-]/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function cleanTokenIds(values?: Array<string | null | undefined> | null): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => cleanIdentifier(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
}

export async function getPolymarketWalletIntelligence(
  input: PolymarketWalletIntelligenceInput,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
  options?: { signal?: AbortSignal },
): Promise<WalletIntelligenceSummary> {
  const conditionId = cleanIdentifier(input.conditionId);
  if (!conditionId) {
    return unavailablePolymarketWalletIntelligenceSummary(
      "No disponible: el mercado no trae conditionId publico compatible.",
      thresholdUsd,
      "unavailable",
    );
  }

  try {
    const response = await fetch("/api/polymarket-wallet-intelligence", {
      body: JSON.stringify({
        conditionId,
        eventSlug: cleanIdentifier(input.eventSlug),
        marketSlug: cleanIdentifier(input.marketSlug),
        marketUrl: input.marketUrl ?? undefined,
        minUsd: thresholdUsd,
        tokenIds: cleanTokenIds(input.tokenIds),
      }),
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: options?.signal,
    });
    const text = await response.text();
    if (!response.ok || text.length > 256_000) {
      return unavailablePolymarketWalletIntelligenceSummary(
        "No pudimos consultar datos publicos de billeteras para este mercado.",
        thresholdUsd,
        "error",
      );
    }
    const summary = JSON.parse(text) as WalletIntelligenceSummary;
    if (!summary || typeof summary !== "object") {
      return unavailablePolymarketWalletIntelligenceSummary(
        "No pudimos consultar datos publicos de billeteras para este mercado.",
        thresholdUsd,
        "error",
      );
    }
    return {
      ...summary,
      queryStatus:
        summary.queryStatus ??
        (summary.available && summary.relevantWalletsCount > 0
          ? "found"
          : summary.source === "polymarket_data"
            ? "empty"
            : "unavailable"),
      source: summary.source ?? (summary.available ? "polymarket_data" : "unavailable"),
      thresholdUsd: summary.thresholdUsd ?? thresholdUsd,
      warnings: summary.warnings ?? [],
    };
  } catch (error) {
    if (options?.signal?.aborted) {
      throw error;
    }
    return unavailablePolymarketWalletIntelligenceSummary(
      "No pudimos consultar datos publicos de billeteras para este mercado.",
      thresholdUsd,
      "error",
    );
  }
}
