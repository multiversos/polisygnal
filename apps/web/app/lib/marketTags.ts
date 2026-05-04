"use client";

import { fetchApiJson } from "./api";

export type MarketTagType = "manual" | "system";

export type MarketTag = {
  id?: number | null;
  name: string;
  slug: string;
  color?: string | null;
  tag_type: MarketTagType;
  created_at?: string | null;
};

export type MarketTagsResponse = {
  market_id: number;
  tags: MarketTag[];
  suggested_tags: MarketTag[];
};

async function requestMarketTags<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchApiJson<T>(path, init);
}

export function fetchMarketTags(marketId: number | string): Promise<MarketTagsResponse> {
  return requestMarketTags<MarketTagsResponse>(`/markets/${marketId}/tags`);
}

export function addMarketTag(
  marketId: number | string,
  payload: { name: string; color?: string | null },
): Promise<MarketTagsResponse> {
  return requestMarketTags<MarketTagsResponse>(`/markets/${marketId}/tags`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      color: payload.color ?? null,
      tag_type: "manual",
    }),
  });
}

export function removeMarketTag(marketId: number | string, tagId: number): Promise<null> {
  return requestMarketTags<null>(`/markets/${marketId}/tags/${tagId}`, {
    method: "DELETE",
  });
}
