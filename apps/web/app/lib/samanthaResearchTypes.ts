export type SamanthaResearchVersion = "1.0";

export type SamanthaResearchGoal =
  | "crypto_context"
  | "economic_context"
  | "external_news"
  | "kalshi_comparison"
  | "official_sources"
  | "odds_comparison"
  | "political_context"
  | "reddit_social_weak_signal"
  | "sports_context";

export type SamanthaDirection = "NEUTRAL" | "NO" | "UNKNOWN" | "YES";
export type SamanthaReliability = "high" | "low" | "medium" | "unknown";

export type SamanthaResearchBrief = {
  createdAt: string;
  knownSignals: {
    marketProbability?: {
      no?: number;
      outcomes?: Array<{ label: string; probability?: number }>;
      yes?: number;
    };
    walletIntelligence?: {
      available: boolean;
      bias?: SamanthaDirection;
      largePositionsCount?: number;
      largeTradesCount?: number;
      neutralCapitalUsd?: number;
      notableWalletCount?: number;
      observedActivities?: Array<{
        action?: string;
        amountUsd?: number;
        outcome?: string;
        price?: number;
        side?: SamanthaDirection;
        source?: string;
        shortAddress?: string;
        tokenId?: string;
        type?: string;
      }>;
      observedCapitalUsd?: number;
      noCapitalUsd?: number;
      profileSummary?: Array<{
        confidence: "high" | "low" | "medium" | "unknown";
        profileAvailable: boolean;
        reason: string;
        resolvedMarketsCount?: number;
        shortAddress: string;
        winRate?: number;
      }>;
      walletSignalAvailable?: boolean;
      warnings?: string[];
      yesCapitalUsd?: number;
    };
  };
  market: {
    category?: string;
    conditionId?: string;
    eventDate?: string;
    eventSlug?: string;
    league?: string;
    liquidity?: number;
    marketSlug?: string;
    normalizedUrl: string;
    outcomes: Array<{
      label: string;
      price?: number;
      side?: "DRAW" | "NO" | "UNKNOWN" | "YES";
      tokenId?: string;
    }>;
    sport?: string;
    title: string;
    url: string;
    volume?: number;
  };
  researchGoals: SamanthaResearchGoal[];
  safetyRules: string[];
  taskType: "deep_market_research";
  version: SamanthaResearchVersion;
};

export type SamanthaEvidenceSourceType =
  | "kalshi"
  | "news"
  | "odds"
  | "official"
  | "other"
  | "reddit"
  | "social"
  | "sports_data";

export type SamanthaEvidenceItem = {
  checkedAt: string;
  direction: SamanthaDirection;
  id: string;
  publishedAt?: string;
  quote?: string;
  reliability: SamanthaReliability;
  sourceName: string;
  sourceType: SamanthaEvidenceSourceType;
  sourceUrl?: string;
  summary: string;
  title: string;
};

export type SamanthaComparisonSummary = {
  direction: SamanthaDirection;
  found: boolean;
  reliability: SamanthaReliability;
  summary: string;
};

export type SamanthaKalshiComparisonSummary = SamanthaComparisonSummary & {
  equivalent: boolean;
};

export type SamanthaSuggestedEstimate = {
  available: boolean;
  confidence: "high" | "low" | "medium" | "none";
  decision: "NONE" | "NO" | "WEAK" | "YES";
  noProbability?: number;
  reason: string;
  yesProbability?: number;
};

export type SamanthaResearchReport = {
  completedAt: string;
  evidence: SamanthaEvidenceItem[];
  kalshiComparison?: SamanthaKalshiComparisonSummary;
  marketUrl: string;
  oddsComparison?: SamanthaComparisonSummary;
  status: "completed" | "failed" | "partial";
  suggestedEstimate?: SamanthaSuggestedEstimate;
  version: SamanthaResearchVersion;
  warnings: string[];
};

export type SamanthaResearchParseResult = {
  errors: string[];
  report?: SamanthaResearchReport;
  warnings: string[];
  valid: boolean;
};
