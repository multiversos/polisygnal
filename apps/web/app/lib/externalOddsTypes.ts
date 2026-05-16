export type ExternalOddsComparisonStatus =
  | "disabled"
  | "available"
  | "partial"
  | "no_match"
  | "unavailable"
  | "timeout"
  | "error";

export type ExternalOddsMatchConfidence = "high" | "low" | "medium" | "unknown";

export type ExternalOddsOutcome = {
  impliedProbability: number | null;
  label: string;
  priceAmerican: number | null;
  priceDecimal: number | null;
  sourceOutcomeName: string;
};

export type ExternalOddsComparison = {
  attemptedQueries?: number;
  attemptedQueryVariants?: string[];
  bestSourceUrl: string | null;
  checkedAt: string;
  eventName: string | null;
  eventStartTime: string | null;
  league: string | null;
  limitations: string[];
  matchConfidence: ExternalOddsMatchConfidence;
  matchedQueryVariant?: string | null;
  matchedMarket: boolean;
  noMatchReasons?: string[];
  outcomes: ExternalOddsOutcome[];
  providerName: string;
  sportsbook: string;
  status: ExternalOddsComparisonStatus;
  warnings: string[];
};

export type ExternalOddsCompareInput = {
  eventDate?: string | null;
  eventSlug?: string | null;
  league?: string | null;
  marketSlug?: string | null;
  marketTitle?: string | null;
  outcomePrices?: Array<{
    label?: string | null;
    price?: number | string | null;
    side?: string | null;
  }> | null;
  participants?: string[] | null;
  sport?: string | null;
};

export type ExternalOddsProviderConfig = {
  authMode: "query";
  baseUrl: string;
  enabled: boolean;
  league: string;
  name: string;
  sportsbook: string;
  timeoutMs: number;
  trialMode: boolean;
};
