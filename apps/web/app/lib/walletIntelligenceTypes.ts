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

export type WalletProfileSummary = {
  commonSideBias?: WalletSignalDirection;
  confidence: WalletReliability;
  losses?: number;
  observedMarketsCount?: number;
  profileAvailable: boolean;
  reason: string;
  resolvedMarketsCount?: number;
  shortAddress: string;
  volumeObservedUsd?: number;
  warnings: string[];
  winRate?: number;
  wins?: number;
};

export type WalletIntelligenceSummary = {
  analyzedCapitalUsd?: number;
  available: boolean;
  checkedAt?: string;
  confidence: "high" | "low" | "medium" | "none";
  largePositions?: WalletMarketPosition[];
  largeTrades?: WalletMarketPosition[];
  notableWallets?: WalletMarketPosition[];
  noCapitalUsd?: number;
  profileSummaries?: WalletProfileSummary[];
  reason: string;
  relevantWalletsCount: number;
  signalDirection: WalletSignalDirection;
  source?: "backend" | "local" | "polymarket_data" | "unavailable";
  thresholdUsd: number;
  topWallets?: WalletMarketPosition[];
  trustedNoWallets?: number;
  trustedYesWallets?: number;
  warnings: string[];
  yesCapitalUsd?: number;
};

export type WalletPublicSignalSummary = {
  auxiliaryLabel: string;
  available: boolean;
  biasLabel: string;
  confidenceLabel: string;
  explanation: string;
  headline: string;
  shouldUseAsAuxiliarySignal: boolean;
  warnings: string[];
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
