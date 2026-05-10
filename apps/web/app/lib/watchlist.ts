"use client";

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

export type WatchlistMarketDraft = {
  active?: boolean | null;
  close_time?: string | null;
  latest_no_price?: string | number | null;
  latest_yes_price?: string | number | null;
  liquidity?: string | number | null;
  market_shape?: string | null;
  market_slug?: string | null;
  question?: string | null;
  sport?: string | null;
  title?: string | null;
  updated_at?: string | null;
  volume?: string | number | null;
  closed?: boolean | null;
};

export const WATCHLIST_STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching: "En seguimiento",
  investigating: "Investigando",
  reviewed: "Revisado",
  dismissed: "Descartado",
};

const WATCHLIST_STORAGE_KEY = "polysignal-local-watchlist-v1";
export const WATCHLIST_STORAGE_EVENT = "polysignal:watchlist-updated";

function nowIso(): string {
  return new Date().toISOString();
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeItem(value: Partial<WatchlistItem>): WatchlistItem | null {
  const marketId = Number(value.market_id ?? value.id);
  if (!Number.isFinite(marketId) || marketId <= 0) {
    return null;
  }
  const timestamp = value.updated_at ?? value.created_at ?? nowIso();
  return {
    id: Number(value.id ?? marketId),
    market_id: marketId,
    status: value.status ?? "watching",
    note: value.note ?? null,
    created_at: value.created_at ?? timestamp,
    updated_at: timestamp,
    market_question: value.market_question || `Mercado #${marketId}`,
    market_slug: value.market_slug || String(marketId),
    sport: value.sport ?? null,
    market_shape: value.market_shape ?? null,
    close_time: value.close_time ?? null,
    active: value.active ?? true,
    closed: value.closed ?? false,
    latest_yes_price: value.latest_yes_price ?? null,
    latest_no_price: value.latest_no_price ?? null,
    liquidity: value.liquidity ?? null,
    volume: value.volume ?? null,
  };
}

function readLocalWatchlist(): WatchlistItem[] {
  const storage = browserStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(WATCHLIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeItem(item as Partial<WatchlistItem>))
      .filter((item): item is WatchlistItem => Boolean(item))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  } catch {
    storage.removeItem(WATCHLIST_STORAGE_KEY);
    return [];
  }
}

function writeLocalWatchlist(items: WatchlistItem[]): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(WATCHLIST_STORAGE_EVENT, { detail: { items } }));
}

function itemFromMarketDraft(
  marketId: number,
  payload?: { status?: WatchlistStatus; note?: string | null; market?: WatchlistMarketDraft },
  existing?: WatchlistItem | null,
): WatchlistItem {
  const now = nowIso();
  const draft = payload?.market;
  return {
    id: existing?.id ?? marketId,
    market_id: marketId,
    status: payload?.status ?? existing?.status ?? "watching",
    note: payload?.note ?? existing?.note ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    market_question:
      draft?.title || draft?.question || existing?.market_question || `Mercado #${marketId}`,
    market_slug: draft?.market_slug || existing?.market_slug || String(marketId),
    sport: draft?.sport ?? existing?.sport ?? null,
    market_shape: draft?.market_shape ?? existing?.market_shape ?? null,
    close_time: draft?.close_time ?? existing?.close_time ?? null,
    active: draft?.active ?? existing?.active ?? true,
    closed: draft?.closed ?? existing?.closed ?? false,
    latest_yes_price: draft?.latest_yes_price ?? existing?.latest_yes_price ?? null,
    latest_no_price: draft?.latest_no_price ?? existing?.latest_no_price ?? null,
    liquidity: draft?.liquidity ?? existing?.liquidity ?? null,
    volume: draft?.volume ?? existing?.volume ?? null,
  };
}

export async function fetchWatchlistItems(): Promise<WatchlistItem[]> {
  return readLocalWatchlist();
}

export async function fetchMarketWatchlistStatus(
  marketId: number | string,
): Promise<WatchlistItem | null> {
  const numericMarketId = Number(marketId);
  return readLocalWatchlist().find((item) => item.market_id === numericMarketId) ?? null;
}

export async function createWatchlistItem(
  marketId: number | string,
  payload?: { status?: WatchlistStatus; note?: string | null; market?: WatchlistMarketDraft },
): Promise<WatchlistItem> {
  const numericMarketId = Number(marketId);
  const items = readLocalWatchlist();
  const existing = items.find((item) => item.market_id === numericMarketId) ?? null;
  const nextItem = itemFromMarketDraft(numericMarketId, payload, existing);
  writeLocalWatchlist([
    nextItem,
    ...items.filter((item) => item.market_id !== numericMarketId),
  ]);
  return nextItem;
}

export async function toggleWatchlistMarket(
  marketId: number | string,
  payload?: { status?: WatchlistStatus; note?: string | null; market?: WatchlistMarketDraft },
): Promise<WatchlistItem | null> {
  const numericMarketId = Number(marketId);
  const items = readLocalWatchlist();
  const existing = items.find((item) => item.market_id === numericMarketId);
  if (existing) {
    writeLocalWatchlist(items.filter((item) => item.market_id !== numericMarketId));
    return null;
  }
  return createWatchlistItem(numericMarketId, payload);
}

export async function updateWatchlistItem(
  itemId: number,
  payload: { status?: WatchlistStatus; note?: string | null },
): Promise<WatchlistItem> {
  const items = readLocalWatchlist();
  const existing = items.find((item) => item.id === itemId);
  if (!existing) {
    throw new Error("Watchlist item not found");
  }
  const updated: WatchlistItem = {
    ...existing,
    status: payload.status ?? existing.status,
    note: payload.note ?? existing.note ?? null,
    updated_at: nowIso(),
  };
  writeLocalWatchlist(items.map((item) => (item.id === itemId ? updated : item)));
  return updated;
}

export async function removeWatchlistItem(itemId: number): Promise<null> {
  writeLocalWatchlist(readLocalWatchlist().filter((item) => item.id !== itemId));
  return null;
}

export async function clearWatchlistItems(): Promise<null> {
  writeLocalWatchlist([]);
  return null;
}
