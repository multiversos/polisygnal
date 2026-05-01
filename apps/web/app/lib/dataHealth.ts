"use client";

export type DataHealthSportCoverage = {
  sport: string;
  total: number;
  with_snapshot: number;
  missing_price: number;
  missing_close_time: number;
};

export type DataHealthOverview = {
  generated_at: string;
  total_markets: number;
  active_markets: number;
  upcoming_markets_count: number;
  markets_with_snapshots: number;
  markets_missing_snapshots: number;
  markets_missing_prices: number;
  markets_missing_close_time: number;
  sport_other_count: number;
  latest_snapshot_at?: string | null;
  coverage_by_sport: DataHealthSportCoverage[];
};

export type SnapshotGapItem = {
  market_id: number;
  title: string;
  sport: string;
  close_time?: string | null;
  latest_snapshot_at?: string | null;
  has_yes_price: boolean;
  has_no_price: boolean;
  freshness_status: string;
  recommended_action: string;
};

export type SnapshotGaps = {
  generated_at: string;
  sport?: string | null;
  days: number;
  total_checked: number;
  missing_snapshot_count: number;
  missing_price_count: number;
  stale_snapshot_count: number;
  items: SnapshotGapItem[];
};

export type RefreshRun = {
  id: number;
  refresh_type: string;
  mode: string;
  status: string;
  markets_checked: number;
  markets_updated: number;
  errors_count: number;
  summary_json?: Record<string, unknown> | null;
  started_at: string;
  finished_at: string;
  created_at: string;
};

export type RefreshRuns = {
  items: RefreshRun[];
};

export type RefreshPriorityItem = {
  market_id: number;
  title: string;
  sport: string;
  close_time?: string | null;
  time_window_label: string;
  missing_snapshot: boolean;
  missing_price: boolean;
  freshness_status: string;
  data_quality_label: string;
  refresh_priority_score: number;
  reasons: string[];
  suggested_command_snapshot: string;
  suggested_command_metadata: string;
};

export type RefreshPriorities = {
  generated_at: string;
  sport?: string | null;
  days: number;
  total_considered: number;
  returned: number;
  missing_snapshot_count: number;
  missing_price_count: number;
  min_hours_to_close?: number | null;
  filters_applied: Record<string, unknown>;
  items: RefreshPriorityItem[];
};

export type AnalysisReadinessSummary = {
  total_checked: number;
  ready_count: number;
  refresh_needed_count: number;
  blocked_count: number;
  missing_snapshot_count: number;
  missing_price_count: number;
  score_pending_count: number;
};

export type AnalysisReadinessItem = {
  market_id: number;
  title: string;
  sport: string;
  market_shape: string;
  source: string;
  ready_reason?: string | null;
  close_time?: string | null;
  time_window_label: string;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  data_quality_label: string;
  freshness_status: string;
  polysignal_score_status: string;
  readiness_status: "ready" | "needs_refresh" | "blocked" | string;
  readiness_score: number;
  reasons: string[];
  missing_fields: string[];
  suggested_next_action: string;
  suggested_research_packet_command: string;
  suggested_refresh_snapshot_command: string;
  suggested_refresh_metadata_command: string;
};

export type AnalysisReadiness = {
  generated_at: string;
  sport?: string | null;
  days: number;
  limit: number;
  summary: AnalysisReadinessSummary;
  items: AnalysisReadinessItem[];
  filters_applied: Record<string, unknown>;
};

export type LiveUpcomingDiscoverySummary = {
  total_remote_checked: number;
  already_local_count: number;
  missing_local_count: number;
  local_missing_snapshot_count: number;
  remote_with_price_count: number;
  remote_missing_price_count: number;
  remote_with_condition_id_count: number;
  remote_with_clob_token_ids_count: number;
};

export type LiveUpcomingDiscoveryItem = {
  remote_id?: string | null;
  local_market_id?: number | null;
  title: string;
  question: string;
  event_title?: string | null;
  sport: string;
  market_shape: string;
  close_time?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  has_local_market: boolean;
  has_local_snapshot: boolean;
  has_local_price: boolean;
  has_remote_price: boolean;
  liquidity?: string | number | null;
  volume?: string | number | null;
  condition_id?: string | null;
  clob_token_ids: string[];
  market_slug?: string | null;
  event_slug?: string | null;
  discovery_status: string;
  reasons: string[];
  warnings: string[];
};

export type LiveUpcomingDiscovery = {
  generated_at: string;
  summary: LiveUpcomingDiscoverySummary;
  items: LiveUpcomingDiscoveryItem[];
  filters_applied: Record<string, unknown>;
  warnings: string[];
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export async function fetchDataHealthOverview(): Promise<DataHealthOverview> {
  const response = await fetch(`${API_BASE_URL}/data-health/overview`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/data-health/overview responded ${response.status}`);
  }
  return response.json() as Promise<DataHealthOverview>;
}

export async function fetchSnapshotGaps(params?: {
  sport?: string | null;
  days?: number;
  limit?: number;
}): Promise<SnapshotGaps> {
  const searchParams = new URLSearchParams();
  if (params?.sport) {
    searchParams.set("sport", params.sport);
  }
  searchParams.set("days", String(params?.days ?? 7));
  searchParams.set("limit", String(params?.limit ?? 50));
  const response = await fetch(
    `${API_BASE_URL}/data-health/snapshot-gaps?${searchParams.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`/data-health/snapshot-gaps responded ${response.status}`);
  }
  return response.json() as Promise<SnapshotGaps>;
}

export async function fetchRefreshRuns(params?: {
  refresh_type?: string | null;
  limit?: number;
}): Promise<RefreshRuns> {
  const searchParams = new URLSearchParams();
  if (params?.refresh_type) {
    searchParams.set("refresh_type", params.refresh_type);
  }
  searchParams.set("limit", String(params?.limit ?? 20));
  const response = await fetch(
    `${API_BASE_URL}/data-health/refresh-runs?${searchParams.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`/data-health/refresh-runs responded ${response.status}`);
  }
  return response.json() as Promise<RefreshRuns>;
}

export async function fetchRefreshPriorities(params?: {
  sport?: string | null;
  days?: number;
  limit?: number;
  min_hours_to_close?: number | null;
}): Promise<RefreshPriorities> {
  const searchParams = new URLSearchParams();
  if (params?.sport) {
    searchParams.set("sport", params.sport);
  }
  searchParams.set("days", String(params?.days ?? 7));
  searchParams.set("limit", String(params?.limit ?? 25));
  if (params?.min_hours_to_close !== undefined && params.min_hours_to_close !== null) {
    searchParams.set("min_hours_to_close", String(params.min_hours_to_close));
  }
  const response = await fetch(
    `${API_BASE_URL}/data-health/refresh-priorities?${searchParams.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`/data-health/refresh-priorities responded ${response.status}`);
  }
  return response.json() as Promise<RefreshPriorities>;
}

export async function fetchAnalysisReadiness(params?: {
  sport?: string | null;
  days?: number;
  limit?: number;
  min_hours_to_close?: number;
}): Promise<AnalysisReadiness> {
  const searchParams = new URLSearchParams();
  if (params?.sport) {
    searchParams.set("sport", params.sport);
  }
  searchParams.set("days", String(params?.days ?? 7));
  searchParams.set("limit", String(params?.limit ?? 50));
  if (params?.min_hours_to_close !== undefined) {
    searchParams.set("min_hours_to_close", String(params.min_hours_to_close));
  }
  const response = await fetch(
    `${API_BASE_URL}/research/analysis-readiness?${searchParams.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`/research/analysis-readiness responded ${response.status}`);
  }
  return response.json() as Promise<AnalysisReadiness>;
}

export async function fetchLiveUpcomingDiscovery(params?: {
  sport?: string | null;
  days?: number;
  limit?: number;
  include_futures?: boolean;
  focus?: string;
  min_hours_to_close?: number;
}): Promise<LiveUpcomingDiscovery> {
  const searchParams = new URLSearchParams();
  if (params?.sport) {
    searchParams.set("sport", params.sport);
  }
  searchParams.set("days", String(params?.days ?? 7));
  searchParams.set("limit", String(params?.limit ?? 25));
  searchParams.set("include_futures", String(params?.include_futures ?? false));
  searchParams.set("focus", params?.focus ?? "match_winner");
  if (params?.min_hours_to_close !== undefined) {
    searchParams.set("min_hours_to_close", String(params.min_hours_to_close));
  }
  const response = await fetch(
    `${API_BASE_URL}/research/live-upcoming-discovery?${searchParams.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`/research/live-upcoming-discovery responded ${response.status}`);
  }
  return response.json() as Promise<LiveUpcomingDiscovery>;
}
