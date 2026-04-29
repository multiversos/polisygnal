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
  items: RefreshPriorityItem[];
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
}): Promise<RefreshPriorities> {
  const searchParams = new URLSearchParams();
  if (params?.sport) {
    searchParams.set("sport", params.sport);
  }
  searchParams.set("days", String(params?.days ?? 7));
  searchParams.set("limit", String(params?.limit ?? 25));
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
