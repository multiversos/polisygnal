"use client";

import { fetchApiJson } from "./api";

export type WalletAnalysisMetricStatus = "estimated" | "unavailable" | "verified";
export type WalletAnalysisConfidence = "high" | "low" | "medium";
export type WalletAnalysisSignalStrength = "strong" | "moderate" | "weak";
export type WalletAnalysisJobStatus =
  | "pending"
  | "resolving_market"
  | "discovering_wallets"
  | "analyzing_wallets"
  | "scoring"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export type WalletAnalysisRunState = "progressed" | "already_running" | "no_work_remaining" | "failed";
export type WalletAnalysisCandidateSortBy = "created_at" | "pnl_30d" | "score" | "volume_30d" | "win_rate_30d";
export type WalletAnalysisSortOrder = "asc" | "desc";
export type WalletProfileStatus = "candidate" | "watching" | "demo_follow" | "paused" | "rejected";
export type MarketSignalStatus =
  | "pending_resolution"
  | "resolved_hit"
  | "resolved_miss"
  | "cancelled"
  | "unknown"
  | "no_clear_signal";
export type MarketResolutionStatus = "open" | "resolved" | "cancelled" | "unknown";

export type WalletAnalysisOutcome = {
  label: string;
  side: string;
  token_id?: string | null;
};

export type WalletAnalysisJobProgress = {
  wallets_found: number;
  wallets_analyzed: number;
  wallets_with_sufficient_history: number;
  yes_wallets: number;
  no_wallets: number;
  current_batch: number;
};

export type WalletAnalysisSignalSummary = {
  id: string;
  predicted_side?: string | null;
  predicted_outcome?: string | null;
  polysignal_score?: string | number | null;
  confidence: WalletAnalysisConfidence;
  data_confidence?: WalletAnalysisConfidence | null;
  signal_strength?: WalletAnalysisSignalStrength | null;
  signal_margin?: string | number | null;
  yes_score?: string | number | null;
  no_score?: string | number | null;
  outcome_scores_json?: Record<string, unknown> | null;
  outcome_wallet_counts_json?: Record<string, number> | null;
  signal_status: MarketSignalStatus;
  warnings_json: string[];
};

export type WalletAnalysisJobRead = {
  id: string;
  source_url: string;
  normalized_url: string;
  market_slug?: string | null;
  event_slug?: string | null;
  condition_id?: string | null;
  market_title?: string | null;
  status: WalletAnalysisJobStatus;
  outcomes: WalletAnalysisOutcome[];
  token_ids: string[];
  progress: WalletAnalysisJobProgress;
  result_json?: Record<string, unknown> | null;
  warnings: string[];
  status_detail?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
  candidates_count: number;
  signal_summary?: WalletAnalysisSignalSummary | null;
};

export type WalletAnalysisJobCreateResponse = {
  job_id: string;
  status: WalletAnalysisJobStatus;
  message: string;
  market: WalletAnalysisJobRead;
};

export type WalletAnalysisRunResponse = {
  job_id: string;
  status: WalletAnalysisJobStatus;
  run_state: WalletAnalysisRunState;
  message: string;
  wallets_found: number;
  wallets_analyzed: number;
  wallets_with_sufficient_history: number;
  candidates_count: number;
  warnings: string[];
  status_detail?: string | null;
  has_more: boolean;
  next_action?: string | null;
  signal_id?: string | null;
  signal_status?: string | null;
  market: WalletAnalysisJobRead;
};

export type WalletAnalysisCandidate = {
  id: string;
  job_id: string;
  wallet_address: string;
  outcome?: string | null;
  side?: string | null;
  token_id?: string | null;
  observed_market_position_usd?: string | number | null;
  score?: string | number | null;
  confidence: WalletAnalysisConfidence;
  roi_30d_status: WalletAnalysisMetricStatus;
  roi_30d_value?: string | number | null;
  win_rate_30d_status: WalletAnalysisMetricStatus;
  win_rate_30d_value?: string | number | null;
  pnl_30d_status: WalletAnalysisMetricStatus;
  pnl_30d_value?: string | number | null;
  trades_30d?: number | null;
  volume_30d?: string | number | null;
  markets_traded_30d?: number | null;
  last_activity_at?: string | null;
  reasons_json: string[];
  risks_json: string[];
  raw_summary_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type WalletAnalysisCandidateList = {
  items: WalletAnalysisCandidate[];
  total: number;
};

export type WalletProfileRead = {
  id: string;
  wallet_address: string;
  alias?: string | null;
  status: WalletProfileStatus;
  score?: string | number | null;
  confidence: WalletAnalysisConfidence;
  roi_30d_status: WalletAnalysisMetricStatus;
  roi_30d_value?: string | number | null;
  win_rate_30d_status: WalletAnalysisMetricStatus;
  win_rate_30d_value?: string | number | null;
  pnl_30d_status: WalletAnalysisMetricStatus;
  pnl_30d_value?: string | number | null;
  trades_30d?: number | null;
  volume_30d?: string | number | null;
  drawdown_30d_status: WalletAnalysisMetricStatus;
  drawdown_30d_value?: string | number | null;
  markets_traded_30d?: number | null;
  last_activity_at?: string | null;
  discovered_from_market?: string | null;
  discovered_from_url?: string | null;
  discovered_at?: string | null;
  reasons_json: string[];
  risks_json: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletProfileList = {
  items: WalletProfileRead[];
  total: number;
};

export type WalletProfileDemoFollowResponse = {
  profile: WalletProfileRead;
  copy_wallet: Record<string, unknown>;
  already_following: boolean;
  baseline_created_at: string;
  message: string;
};

export type PolySignalMarketSignal = {
  id: string;
  job_id?: string | null;
  source_url?: string | null;
  market_slug?: string | null;
  event_slug?: string | null;
  condition_id?: string | null;
  market_title?: string | null;
  predicted_side?: string | null;
  predicted_outcome?: string | null;
  polysignal_score?: string | number | null;
  confidence: WalletAnalysisConfidence;
  data_confidence?: WalletAnalysisConfidence | null;
  signal_strength?: WalletAnalysisSignalStrength | null;
  signal_margin?: string | number | null;
  yes_score?: string | number | null;
  no_score?: string | number | null;
  outcome_scores_json?: Record<string, unknown> | null;
  outcome_wallet_counts_json?: Record<string, number> | null;
  wallets_analyzed?: number | null;
  wallets_with_sufficient_history?: number | null;
  warnings_json: string[];
  signal_status: MarketSignalStatus;
  final_outcome?: string | null;
  final_resolution_source?: string | null;
  resolved_at?: string | null;
  top_wallets_json?: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
};

export type PolySignalMarketSignalMetricsBucket = {
  total: number;
  resolved_hit: number;
  resolved_miss: number;
  win_rate?: string | number | null;
};

export type PolySignalMarketSignalMetrics = {
  total: number;
  pending_resolution: number;
  resolved_hit: number;
  resolved_miss: number;
  cancelled: number;
  unknown: number;
  no_clear_signal: number;
  win_rate?: string | number | null;
  avg_score_resolved_hit?: string | number | null;
  avg_score_resolved_miss?: string | number | null;
  by_confidence: Record<string, PolySignalMarketSignalMetricsBucket>;
};

export type PolySignalMarketSignalList = {
  items: PolySignalMarketSignal[];
  total: number;
  metrics: PolySignalMarketSignalMetrics;
};

export type PolySignalMarketResolution = {
  status: MarketResolutionStatus;
  final_outcome?: string | null;
  source: string;
  confidence: WalletAnalysisConfidence;
  reason: string;
  checked_at: string;
};

export type PolySignalMarketSignalSettlement = {
  signal: PolySignalMarketSignal;
  resolution: PolySignalMarketResolution;
  changed: boolean;
};

export type PolySignalMarketSignalSettlePendingResponse = {
  checked: number;
  still_pending: number;
  resolved_hit: number;
  resolved_miss: number;
  cancelled: number;
  unknown: number;
  errors: number;
  items: PolySignalMarketSignalSettlement[];
};

export async function createWalletAnalysisJob(polymarketUrl: string): Promise<WalletAnalysisJobCreateResponse> {
  return fetchApiJson<WalletAnalysisJobCreateResponse>("/wallet-analysis/jobs", {
    body: JSON.stringify({ polymarket_url: polymarketUrl }),
    method: "POST",
  });
}

export async function runWalletAnalysisJobOnce(input: {
  batchSize?: number;
  historyLimit?: number;
  jobId: string;
  maxWallets?: number;
  maxWalletsDiscovery?: number;
  maxRuntimeSeconds?: number;
}): Promise<WalletAnalysisRunResponse> {
  return fetchApiJson<WalletAnalysisRunResponse>(`/wallet-analysis/jobs/${encodeURIComponent(input.jobId)}/run-once`, {
    body: JSON.stringify({
      batch_size: input.batchSize ?? 20,
      history_limit: input.historyLimit ?? 100,
      max_wallets: input.maxWallets ?? 50,
      max_wallets_discovery: input.maxWalletsDiscovery ?? 100,
      max_runtime_seconds: input.maxRuntimeSeconds ?? 12,
    }),
    method: "POST",
  }, 30000);
}

export async function runWalletAnalysisJobStep(input: {
  batchSize?: number;
  historyLimit?: number;
  jobId: string;
  maxWallets?: number;
  maxWalletsDiscovery?: number;
  maxRuntimeSeconds?: number;
}): Promise<WalletAnalysisRunResponse> {
  return fetchApiJson<WalletAnalysisRunResponse>(`/wallet-analysis/jobs/${encodeURIComponent(input.jobId)}/run-step`, {
    body: JSON.stringify({
      batch_size: input.batchSize ?? 10,
      history_limit: input.historyLimit ?? 100,
      max_wallets: input.maxWallets ?? 50,
      max_wallets_discovery: input.maxWalletsDiscovery ?? 100,
      max_runtime_seconds: input.maxRuntimeSeconds ?? 12,
    }),
    method: "POST",
  }, 20000);
}

export async function fetchWalletAnalysisJob(jobId: string): Promise<WalletAnalysisJobRead> {
  return fetchApiJson<WalletAnalysisJobRead>(`/wallet-analysis/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchWalletAnalysisCandidates(input: {
  confidence?: WalletAnalysisConfidence;
  jobId: string;
  limit?: number;
  offset?: number;
  outcome?: string;
  side?: string;
  sortBy?: WalletAnalysisCandidateSortBy;
  sortOrder?: WalletAnalysisSortOrder;
}): Promise<WalletAnalysisCandidateList> {
  const params = new URLSearchParams();
  if (input.side) {
    params.set("side", input.side);
  }
  if (input.outcome) {
    params.set("outcome", input.outcome);
  }
  if (input.confidence) {
    params.set("confidence", input.confidence);
  }
  params.set("sort_by", input.sortBy ?? "score");
  params.set("sort_order", input.sortOrder ?? "desc");
  params.set("limit", String(input.limit ?? 10));
  params.set("offset", String(input.offset ?? 0));
  return fetchApiJson<WalletAnalysisCandidateList>(
    `/wallet-analysis/jobs/${encodeURIComponent(input.jobId)}/candidates?${params.toString()}`,
  );
}

export async function saveWalletAnalysisCandidateAsProfile(candidateId: string): Promise<WalletProfileRead> {
  return fetchApiJson<WalletProfileRead>(
    `/wallet-analysis/candidates/${encodeURIComponent(candidateId)}/save-profile`,
    {
      body: "{}",
      method: "POST",
    },
  );
}

export async function fetchWalletProfiles(input?: {
  status?: WalletProfileStatus;
  limit?: number;
  offset?: number;
}): Promise<WalletProfileList> {
  const params = new URLSearchParams();
  params.set("limit", String(input?.limit ?? 20));
  params.set("offset", String(input?.offset ?? 0));
  if (input?.status) {
    params.set("status", input.status);
  }
  return fetchApiJson<WalletProfileList>(`/wallet-profiles?${params.toString()}`);
}

export async function updateWalletProfile(
  profileId: string,
  payload: {
    alias?: string | null;
    status?: WalletProfileStatus;
    notes?: string | null;
  },
): Promise<WalletProfileRead> {
  return fetchApiJson<WalletProfileRead>(`/wallet-profiles/${encodeURIComponent(profileId)}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export async function followWalletProfileInDemo(profileId: string): Promise<WalletProfileDemoFollowResponse> {
  return fetchApiJson<WalletProfileDemoFollowResponse>(
    `/wallet-profiles/${encodeURIComponent(profileId)}/demo-follow`,
    {
      body: "{}",
      method: "POST",
    },
  );
}

export async function fetchPolySignalMarketSignals(input?: {
  confidence?: WalletAnalysisConfidence;
  jobId?: string;
  limit?: number;
  marketSlug?: string;
  offset?: number;
  predictedSide?: string;
  signalStatus?: MarketSignalStatus;
}): Promise<PolySignalMarketSignalList> {
  const params = new URLSearchParams();
  params.set("limit", String(input?.limit ?? 10));
  params.set("offset", String(input?.offset ?? 0));
  if (input?.jobId) {
    params.set("job_id", input.jobId);
  }
  if (input?.marketSlug) {
    params.set("market_slug", input.marketSlug);
  }
  if (input?.predictedSide) {
    params.set("predicted_side", input.predictedSide);
  }
  if (input?.confidence) {
    params.set("confidence", input.confidence);
  }
  if (input?.signalStatus) {
    params.set("signal_status", input.signalStatus);
  }
  return fetchApiJson<PolySignalMarketSignalList>(`/polysignal-market-signals?${params.toString()}`);
}

export async function settlePolySignalMarketSignal(signalId: string): Promise<PolySignalMarketSignalSettlement> {
  return fetchApiJson<PolySignalMarketSignalSettlement>(
    `/polysignal-market-signals/${encodeURIComponent(signalId)}/settle`,
    {
      body: "{}",
      method: "POST",
    },
  );
}

export async function settlePendingPolySignalMarketSignals(input?: {
  jobId?: string;
  limit?: number;
  marketSlug?: string;
}): Promise<PolySignalMarketSignalSettlePendingResponse> {
  return fetchApiJson<PolySignalMarketSignalSettlePendingResponse>(
    "/polysignal-market-signals/settle-pending",
    {
      body: JSON.stringify({
        job_id: input?.jobId,
        limit: input?.limit ?? 10,
        market_slug: input?.marketSlug,
      }),
      method: "POST",
    },
  );
}
