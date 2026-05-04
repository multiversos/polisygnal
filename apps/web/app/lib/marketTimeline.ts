"use client";

import { API_BASE_URL } from "./api";

export type MarketTimelineItem = {
  timestamp: string;
  type: string;
  title: string;
  description: string;
  source: string;
  url?: string | null;
  severity?: string | null;
  status?: string | null;
  data: Record<string, unknown>;
};

export type MarketTimelineResponse = {
  market_id: number;
  items: MarketTimelineItem[];
};

export async function fetchMarketTimeline(
  marketId: number | string,
): Promise<MarketTimelineResponse> {
  const response = await fetch(`${API_BASE_URL}/markets/${marketId}/timeline`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`/markets/${marketId}/timeline responded ${response.status}`);
  }

  return response.json() as Promise<MarketTimelineResponse>;
}
