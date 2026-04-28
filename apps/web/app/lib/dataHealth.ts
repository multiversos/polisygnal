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
