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

export type WalletIntelligenceQueryStatus =
  | "empty"
  | "error"
  | "found"
  | "timeout"
  | "unavailable";

export type PublicWalletActivityType = "notable_wallet" | "position" | "trade" | "unknown";

export type WalletPublicProfile = {
  avatarUrl?: string | null;
  name?: string | null;
  profileUrl?: string | null;
  proxyWallet?: string | null;
  pseudonym?: string | null;
  verifiedBadge?: boolean | null;
  xUsername?: string | null;
};

export type WalletPublicMarketHistoryResult = "lost" | "pending" | "unknown" | "won";

export type WalletPublicMarketHistoryItem = {
  amountUsd?: number | null;
  averagePrice?: number | null;
  conditionId?: string | null;
  marketSlug?: string | null;
  marketTitle?: string | null;
  marketUrl?: string | null;
  outcome?: string | null;
  realizedPnl?: number | null;
  result: WalletPublicMarketHistoryResult;
  source: string;
  timestamp?: string | null;
};

export type WalletPublicHistorySummary = {
  closedMarkets?: number | null;
  lastActivityAt?: string | null;
  losses?: number | null;
  marketsParticipated?: number | null;
  realizedPnl?: number | null;
  source: string;
  unrealizedPnl?: number | null;
  volumeObservedUsd?: number | null;
  winRate?: number | null;
  wins?: number | null;
};

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

export type PublicWalletActivityAction = "buy" | "position" | "sell" | "unknown";

export type PublicWalletActivity = {
  action: PublicWalletActivityAction;
  activityType?: PublicWalletActivityType;
  amountUsd?: number | null;
  closedMarkets?: number | null;
  conditionId?: string | null;
  id: string;
  limitations: string[];
  losses?: number | null;
  marketsObserved?: number | null;
  marketId?: string | null;
  profile?: WalletPublicProfile | null;
  highlightedProfile?: boolean;
  historySummary?: WalletPublicHistorySummary | null;
  marketHistory?: WalletPublicMarketHistoryItem[];
  outcome?: string | null;
  positionSize?: number | null;
  price?: number | null;
  rawSourceFields?: Record<string, string | number | boolean | null>;
  realizedPnl?: number | null;
  shares?: number | null;
  shortAddress?: string | null;
  side: "NO" | "UNKNOWN" | "YES";
  source: string;
  timestamp?: string | null;
  tokenId?: string | null;
  transactionHash?: string | null;
  unrealizedPnl?: number | null;
  walletAddress?: string | null;
  warnings: string[];
  winRate?: number | null;
  wins?: number | null;
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
  profile?: WalletPublicProfile | null;
  reason: string;
  resolvedMarketsCount?: number;
  shortAddress: string;
  walletAddress?: string | null;
  volumeObservedUsd?: number;
  warnings: string[];
  winRate?: number;
  wins?: number;
};

export type WalletIntelligenceSummary = {
  analyzedCapitalUsd?: number;
  allActivitiesCount?: number;
  available: boolean;
  checkedAt?: string;
  confidence: "high" | "low" | "medium" | "none";
  limitations?: string[];
  largePositions?: WalletMarketPosition[];
  largeTrades?: WalletMarketPosition[];
  notableWallets?: WalletMarketPosition[];
  noCapitalUsd?: number;
  neutralCapitalUsd?: number;
  expandedAnalysis?: {
    consistencyWarnings: string[];
    highlightedProfilesCount: number;
    historyAvailableCount: number;
    largeMarket: boolean;
    profileCount: number;
  };
  highlightedProfilesCount?: number;
  historyAvailableCount?: number;
  profileSummaries?: WalletProfileSummary[];
  publicActivities?: PublicWalletActivity[];
  queryStatus?: WalletIntelligenceQueryStatus;
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
