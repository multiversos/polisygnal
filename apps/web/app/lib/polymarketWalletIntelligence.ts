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

function unavailableSummary(reason: string, thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD): WalletIntelligenceSummary {
  return {
    ...getWalletIntelligenceSummary(null, thresholdUsd),
    checkedAt: new Date().toISOString(),
    reason,
    source: "unavailable",
    warnings: [
      "No encontramos datos publicos suficientes de billeteras para este mercado.",
      "Este analisis no usara wallets como senal fuerte.",
      "No se muestran direcciones completas.",
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
): Promise<WalletIntelligenceSummary> {
  const conditionId = cleanIdentifier(input.conditionId);
  if (!conditionId) {
    return unavailableSummary("No disponible: el mercado no trae conditionId publico compatible.", thresholdUsd);
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
    });
    const text = await response.text();
    if (!response.ok || text.length > 256_000) {
      return unavailableSummary("No pudimos consultar datos publicos de billeteras para este mercado.", thresholdUsd);
    }
    const summary = JSON.parse(text) as WalletIntelligenceSummary;
    if (!summary || typeof summary !== "object") {
      return unavailableSummary("No pudimos consultar datos publicos de billeteras para este mercado.", thresholdUsd);
    }
    return {
      ...summary,
      source: summary.source ?? (summary.available ? "polymarket_data" : "unavailable"),
      thresholdUsd: summary.thresholdUsd ?? thresholdUsd,
      warnings: summary.warnings ?? [],
    };
  } catch {
    return unavailableSummary("No pudimos consultar datos publicos de billeteras para este mercado.", thresholdUsd);
  }
}
