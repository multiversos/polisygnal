"use client";

import { fetchApiJson, isApiNotFoundError } from "./api";

export type ResolvedOutcome = "yes" | "no" | "cancelled" | "invalid" | "unknown";

export type MarketOutcome = {
  market_id: number;
  question: string;
  resolved_outcome: ResolvedOutcome;
  resolved_at: string;
  source: string;
  notes?: string | null;
};

export type MarketOutcomePayload = {
  resolved_outcome: ResolvedOutcome;
  resolved_at?: string | null;
  source?: string | null;
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

export type BacktestingConfidenceBucket = {
  bucket: string;
  min_confidence: string | number;
  max_confidence: string | number;
  total_resolved_with_predictions: number;
  correct_direction_count: number;
  accuracy_direction?: string | number | null;
  avg_confidence?: string | number | null;
  brier_score?: string | number | null;
};

export type BacktestingSummary = {
  generated_at: string;
  total_outcomes: number;
  total_predictions: number;
  resolved_with_predictions: number;
  total_resolved_with_predictions: number;
  correct_direction_count: number;
  accuracy_direction?: string | number | null;
  avg_confidence?: string | number | null;
  brier_score?: string | number | null;
  by_prediction_family: BacktestingFamilySummary[];
  by_confidence_bucket: BacktestingConfidenceBucket[];
};

async function requestBacktesting<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchApiJson<T>(path, init);
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
    if (isApiNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export function upsertMarketOutcome(
  marketId: number | string,
  payload: MarketOutcomePayload,
): Promise<MarketOutcome> {
  return requestBacktesting<MarketOutcome>(`/markets/${marketId}/outcome`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMarketOutcome(
  marketId: number | string,
  payload: Partial<MarketOutcomePayload>,
): Promise<MarketOutcome> {
  return requestBacktesting<MarketOutcome>(`/markets/${marketId}/outcome`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMarketOutcome(marketId: number | string): Promise<null> {
  return requestBacktesting<null>(`/markets/${marketId}/outcome`, {
    method: "DELETE",
  });
}
