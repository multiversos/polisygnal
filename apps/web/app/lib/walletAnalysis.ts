"use client";

import { fetchApiJson } from "./api";

export type WalletAnalysisMetricStatus = "estimated" | "unavailable" | "verified";
export type WalletAnalysisConfidence = "high" | "low" | "medium";
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
export type WalletAnalysisCandidateSortBy = "created_at" | "pnl_30d" | "score" | "volume_30d" | "win_rate_30d";
export type WalletAnalysisSortOrder = "asc" | "desc";

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
  yes_score?: string | number | null;
  no_score?: string | number | null;
  outcome_scores_json?: Record<string, unknown> | null;
  signal_status:
    | "pending_resolution"
    | "resolved_hit"
    | "resolved_miss"
    | "cancelled"
    | "unknown"
    | "no_clear_signal";
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
  message: string;
  wallets_found: number;
  wallets_analyzed: number;
  wallets_with_sufficient_history: number;
  candidates_count: number;
  warnings: string[];
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
  status: "candidate" | "watching" | "demo_follow" | "paused" | "rejected";
  notes?: string | null;
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
}): Promise<WalletAnalysisRunResponse> {
  return fetchApiJson<WalletAnalysisRunResponse>(`/wallet-analysis/jobs/${encodeURIComponent(input.jobId)}/run-once`, {
    body: JSON.stringify({
      batch_size: input.batchSize ?? 20,
      history_limit: input.historyLimit ?? 100,
      max_wallets: input.maxWallets ?? 50,
      max_wallets_discovery: input.maxWalletsDiscovery ?? 100,
    }),
    method: "POST",
  }, 30000);
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
      method: "POST",
    },
  );
}
