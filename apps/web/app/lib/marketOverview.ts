export type MarketOverviewMarket = {
  condition_id?: string | null;
  id?: number;
  question?: string | null;
  remote_id?: string | null;
  event_id?: number | null;
  event_title?: string | null;
  event_slug?: string | null;
  market_slug?: string | null;
  sport_type?: string | null;
  market_type?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  end_date?: string | null;
  close_time?: string | null;
  evidence_eligible?: boolean | null;
  evidence_shape?: string | null;
  evidence_skip_reason?: string | null;
  outcomes?: MarketOverviewOutcome[] | null;
  source?: "clob" | "gamma" | "polymarket" | "polysignal" | "unknown" | string | null;
};

export type MarketOverviewOutcome = {
  label?: string | null;
  price?: string | number | null;
  side?: "DRAW" | "NO" | "UNKNOWN" | "YES" | string | null;
  token_id?: string | null;
};

export type MarketOverviewSnapshot = {
  captured_at?: string | null;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
};

export type MarketOverviewPrediction = {
  id?: number;
  run_at?: string | null;
  model_version?: string | null;
  yes_probability?: string | number | null;
  no_probability?: string | number | null;
  confidence_score?: string | number | null;
  action_score?: string | number | null;
  edge_signed?: string | number | null;
  edge_magnitude?: string | number | null;
  edge_class?: string | null;
  opportunity?: boolean | null;
  review_confidence?: boolean | null;
  review_edge?: boolean | null;
  used_odds_count?: number | null;
  used_news_count?: number | null;
  used_evidence_in_scoring?: boolean | null;
};

export type MarketOverviewEvidenceSummary = {
  evidence_count?: number | null;
  odds_evidence_count?: number | null;
  news_evidence_count?: number | null;
  latest_evidence_at?: string | null;
};

export type MarketOverviewItem = {
  priority_rank?: number | null;
  priority_bucket?: string | null;
  scoring_mode?: string | null;
  market?: MarketOverviewMarket | null;
  latest_snapshot?: MarketOverviewSnapshot | null;
  latest_prediction?: MarketOverviewPrediction | null;
  evidence_summary?: MarketOverviewEvidenceSummary | null;
};

export type MarketOverviewResponse = {
  filters?: Record<string, unknown>;
  total_count?: number;
  items?: MarketOverviewItem[];
};
