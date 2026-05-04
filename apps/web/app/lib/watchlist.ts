"use client";

import { fetchApiJson } from "./api";

export type WatchlistStatus = "watching" | "investigating" | "reviewed" | "dismissed";

export type WatchlistItem = {
  id: number;
  market_id: number;
  status: WatchlistStatus;
  note?: string | null;
  created_at: string;
  updated_at: string;
  market_question: string;
  market_slug: string;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
  active: boolean;
  closed: boolean;
  latest_yes_price?: string | number | null;
  latest_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
};

export const WATCHLIST_STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching: "En seguimiento",
  investigating: "Investigando",
  reviewed: "Revisado",
  dismissed: "Descartado",
};

async function requestWatchlist<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchApiJson<T>(path, init);
}

export function fetchWatchlistItems(): Promise<WatchlistItem[]> {
  return requestWatchlist<WatchlistItem[]>("/watchlist");
}

export function fetchMarketWatchlistStatus(
  marketId: number | string,
): Promise<WatchlistItem | null> {
  return requestWatchlist<WatchlistItem | null>(`/markets/${marketId}/watchlist`);
}

export function createWatchlistItem(
  marketId: number | string,
  payload?: { status?: WatchlistStatus; note?: string | null },
): Promise<WatchlistItem> {
  return requestWatchlist<WatchlistItem>("/watchlist", {
    method: "POST",
    body: JSON.stringify({
      market_id: Number(marketId),
      status: payload?.status ?? "watching",
      note: payload?.note ?? null,
    }),
  });
}

export function toggleWatchlistMarket(
  marketId: number | string,
): Promise<WatchlistItem | null> {
  return requestWatchlist<WatchlistItem | null>(`/markets/${marketId}/watchlist/toggle`, {
    method: "POST",
  });
}

export function updateWatchlistItem(
  itemId: number,
  payload: { status?: WatchlistStatus; note?: string | null },
): Promise<WatchlistItem> {
  return requestWatchlist<WatchlistItem>(`/watchlist/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removeWatchlistItem(itemId: number): Promise<null> {
  return requestWatchlist<null>(`/watchlist/${itemId}`, {
    method: "DELETE",
  });
}
