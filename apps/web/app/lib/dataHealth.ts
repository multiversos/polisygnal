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
