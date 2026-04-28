"use client";

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

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestMarketTags<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }

  return response.json() as Promise<T>;
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
