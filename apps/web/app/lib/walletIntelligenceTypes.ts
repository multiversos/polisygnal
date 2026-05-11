export type WalletSide = "BOTH" | "NO" | "UNKNOWN" | "YES";

export type WalletRelevanceLevel = "high" | "low" | "medium" | "unknown";

export type WalletRiskProfile =
  | "consistent"
  | "new_wallet"
  | "unprofitable"
  | "unknown"
  | "volatile";

export type WalletSignalDirection = "NEUTRAL" | WalletSide;

export type WalletReliability = "high" | "low" | "medium" | "unknown";

export type WalletMarketPosition = {
  averageEntryPrice?: number;
  currentValueUsd?: number;
  lastActivityAt?: string;
  marketId?: string;
  shortAddress: string;
  side: WalletSide;
  amountUsd?: number;
  unrealizedPnlUsd?: number;
  walletAddress: string;
};

export type WalletPerformanceProfile = {
  averagePositionUsd?: number;
  estimatedRoi?: number;
  losses?: number;
  marketsParticipated?: number;
  reliability: WalletReliability;
  resolvedMarkets?: number;
  riskProfile: WalletRiskProfile;
  shortAddress: string;
  strongestCategories?: string[];
  totalVolumeUsd?: number;
  walletAddress: string;
  weakestCategories?: string[];
  winRate?: number;
  wins?: number;
};

export type WalletIntelligenceSummary = {
  analyzedCapitalUsd?: number;
  available: boolean;
  confidence: "high" | "low" | "medium" | "none";
  noCapitalUsd?: number;
  reason: string;
  relevantWalletsCount: number;
  signalDirection: WalletSignalDirection;
  thresholdUsd: number;
  trustedNoWallets?: number;
  trustedYesWallets?: number;
  warnings: string[];
  yesCapitalUsd?: number;
};

export type WalletReadinessChecklistItem = {
  available: boolean;
  label: string;
  reason: string;
};

export type WalletIntelligenceReadiness = {
  available: boolean;
  checklist: WalletReadinessChecklistItem[];
  level: "none" | "partial" | "ready";
  missing: string[];
  thresholdUsd: number;
  warnings: string[];
};
