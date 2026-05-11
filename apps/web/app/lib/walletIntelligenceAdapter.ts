import {
  WALLET_INTELLIGENCE_THRESHOLD_USD,
  getWalletIntelligenceSummary,
} from "./walletIntelligence";
import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";

export type WalletIntelligenceLookupInput = {
  conditionId?: string;
  eventSlug?: string;
  marketId?: string;
  marketSlug?: string;
  tokenIds?: string[];
};

export function getWalletIntelligenceForMarket(
  _input: WalletIntelligenceLookupInput,
  thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD,
): WalletIntelligenceSummary {
  return {
    ...getWalletIntelligenceSummary(null, thresholdUsd),
    reason:
      "Pendiente de conectar una fuente estructurada de trades y posiciones publicas. No se consultan wallets desde el frontend.",
    warnings: [
      "Connect structured wallet source here before enabling real lookups.",
      "No fetch externo en esta capa.",
      "No guardar payloads crudos ni direcciones completas.",
    ],
  };
}
