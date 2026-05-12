export type DeepAnalysisLayerId =
  | "polymarket_market"
  | "market_movement"
  | "wallet_intelligence"
  | "wallet_profiles"
  | "external_research"
  | "odds_comparison"
  | "kalshi_comparison"
  | "category_context"
  | "evidence_scoring"
  | "decision"
  | "history_tracking"
  | "resolution";

export type DeepAnalysisLayerStatus =
  | "pending"
  | "running"
  | "available"
  | "partial"
  | "unavailable"
  | "blocked"
  | "error";

export type DeepAnalysisSignalDirection = "NEUTRAL" | "NO" | "UNKNOWN" | "YES";

export type DeepAnalysisSignal = {
  confidence: "high" | "low" | "medium" | "unknown";
  direction: DeepAnalysisSignalDirection;
  isReal: boolean;
  label: string;
  reason: string;
  source: string;
  strength: "high" | "low" | "medium";
};

export type DeepAnalysisLayer = {
  checkedAt?: string;
  id: DeepAnalysisLayerId;
  label: string;
  missing: string[];
  signals: DeepAnalysisSignal[];
  status: DeepAnalysisLayerStatus;
  summary: string;
  warnings: string[];
};

export type DeepAnalyzerMarketOutcome = {
  label: string;
  price?: number;
  side?: "DRAW" | "NO" | "UNKNOWN" | "YES";
};

export type DeepAnalyzerMarket = {
  active?: boolean;
  closeTime?: string;
  closed?: boolean;
  conditionId?: string;
  eventSlug?: string;
  liquidity?: number;
  marketSlug?: string;
  outcomes: DeepAnalyzerMarketOutcome[];
  source: "clob" | "gamma" | "polymarket";
  title: string;
  volume?: number;
};

export type DeepAnalyzerDecision = {
  available: boolean;
  confidence: "high" | "low" | "medium" | "none";
  countsForAccuracy: boolean;
  noProbability?: number;
  reason: string;
  side: "NONE" | "NO" | "WEAK" | "YES";
  threshold: number;
  yesProbability?: number;
};

export type DeepAnalyzerResult = {
  analysisId: string;
  decision: DeepAnalyzerDecision;
  generatedAt: string;
  layers: DeepAnalysisLayer[];
  market?: DeepAnalyzerMarket;
  normalizedUrl: string;
  url: string;
};
