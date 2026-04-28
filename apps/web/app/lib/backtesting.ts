"use client";

export type MarketOutcome = {
  market_id: number;
  question: string;
  resolved_outcome: "yes" | "no" | "cancelled";
  resolved_at: string;
  source: string;
  notes?: string | null;
};

export type MarketOutcomesResponse = {
  total_count: number;
  items: MarketOutcome[];
};

export type BacktestingFamilySummary = {
  prediction_family: string;
  total_resolved_with_predictions: number;
  correct_direction_count: number;
  accuracy_direction?: string | number | null;
  avg_confidence?: string | number | null;
  brier_score?: string | number | null;
};

export type BacktestingSummary = {
  generated_at: string;
  total_resolved_with_predictions: number;
  correct_direction_count: number;
  accuracy_direction?: string | number | null;
  avg_confidence?: string | number | null;
  brier_score?: string | number | null;
  by_prediction_family: BacktestingFamilySummary[];
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestBacktesting<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  if (response.status === 204) {
    return null as T;
  }
  return response.json() as Promise<T>;
}

export function fetchBacktestingSummary(): Promise<BacktestingSummary> {
  return requestBacktesting<BacktestingSummary>("/backtesting/summary");
}

export function fetchMarketOutcomes(): Promise<MarketOutcomesResponse> {
  return requestBacktesting<MarketOutcomesResponse>("/outcomes?limit=100");
}

export async function fetchMarketOutcome(
  marketId: number | string,
): Promise<MarketOutcome | null> {
  try {
    return await requestBacktesting<MarketOutcome>(`/markets/${marketId}/outcome`);
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return null;
    }
    throw error;
  }
}
