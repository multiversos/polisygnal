import {
  HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS,
  HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD,
  HIGHLIGHTED_PROFILE_MIN_WIN_RATE,
  getHighlightedProfiles,
  saveHighlightedProfile,
  updateHighlightedProfile,
  type HighlightedProfileSourceMarket,
  type HighlightedWalletProfile,
} from "./highlightedProfiles";
import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "./polymarketWalletProfile";
import type { WalletPublicMarketHistoryItem } from "./walletIntelligenceTypes";

export const HIDDEN_PERSISTENT_PROFILES_STORAGE_KEY =
  "polysignal-hidden-highlighted-wallet-profiles-v1";

type BackendHighlightedProfile = {
  avatarUrl?: string | null;
  closedMarkets?: number | null;
  createdAt?: string | null;
  detectedAt?: string | null;
  history?: WalletPublicMarketHistoryItem[];
  id?: string | null;
  lastSeenAt?: string | null;
  lastUpdatedAt?: string | null;
  losses?: number | null;
  name?: string | null;
  noLongerQualifies?: boolean;
  observedCapitalUsd?: number | null;
  profileUrl?: string | null;
  pseudonym?: string | null;
  qualificationReason?: string | null;
  qualifies?: boolean;
  realizedPnl?: number | null;
  shortAddress?: string | null;
  source?: string | null;
  sourceLimitations?: string[];
  sourceMarketSlug?: string | null;
  sourceMarketTitle?: string | null;
  sourceMarketUrl?: string | null;
  sourceSport?: string | null;
  sourceWarnings?: string[];
  unrealizedPnl?: number | null;
  updatedAt?: string | null;
  verifiedBadge?: boolean | null;
  walletAddress?: string | null;
  winRate?: number | null;
  wins?: number | null;
  xUsername?: string | null;
};

type BackendHighlightedProfileList = {
  items?: BackendHighlightedProfile[];
  total?: number;
};

type PersistentProfilesResult = {
  profiles: HighlightedWalletProfile[];
  total: number;
};

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortAddressFor(walletAddress: string, fallback?: string | null): string {
  return fallback || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function sourceMarketsFor(profile: BackendHighlightedProfile): HighlightedProfileSourceMarket[] {
  if (!profile.sourceMarketSlug && !profile.sourceMarketTitle && !profile.sourceMarketUrl) {
    return [];
  }
  return [
    {
      detectedAt: profile.lastSeenAt || profile.updatedAt || new Date().toISOString(),
      sourceMarketSlug: profile.sourceMarketSlug ?? null,
      sourceMarketTitle: profile.sourceMarketTitle ?? null,
      sourceMarketUrl: profile.sourceMarketUrl ?? null,
    },
  ];
}

function profileFromBackend(profile: BackendHighlightedProfile): HighlightedWalletProfile | null {
  const walletAddress = isPolymarketWalletAddress(profile.walletAddress)
    ? profile.walletAddress!.trim().toLowerCase()
    : null;
  if (!walletAddress) {
    return null;
  }
  const profileUrl = profile.profileUrl || buildPolymarketWalletProfileUrl(walletAddress);
  if (!profileUrl) {
    return null;
  }
  const winRate = toNumber(profile.winRate);
  const closedMarkets = toNumber(profile.closedMarkets);
  if (winRate === null || closedMarkets === null) {
    return null;
  }
  const timestamp = profile.lastUpdatedAt || profile.updatedAt || profile.lastSeenAt || new Date().toISOString();
  return {
    avatarUrl: profile.avatarUrl ?? null,
    closedMarkets,
    detectedAt: profile.detectedAt || timestamp,
    history: Array.isArray(profile.history) ? profile.history : [],
    id: walletAddress,
    lastSeenAt: profile.lastSeenAt || timestamp,
    lastUpdatedAt: profile.lastUpdatedAt || timestamp,
    losses: toNumber(profile.losses),
    name: profile.name ?? null,
    noLongerQualifies: Boolean(profile.noLongerQualifies || profile.qualifies === false),
    observedCapitalUsd: toNumber(profile.observedCapitalUsd),
    persistentId: profile.id ?? null,
    profileUrl,
    pseudonym: profile.pseudonym ?? null,
    realizedPnl: toNumber(profile.realizedPnl),
    refreshError: null,
    refreshStatus: "idle",
    shortAddress: shortAddressFor(walletAddress, profile.shortAddress),
    source: profile.source || "wallet_intelligence",
    sourceLimitations: profile.sourceLimitations ?? [],
    sourceMarkets: sourceMarketsFor(profile),
    sourceWarnings: profile.sourceWarnings ?? [],
    stale: false,
    syncError: null,
    syncStatus: "synced",
    syncedAt: timestamp,
    unrealizedPnl: toNumber(profile.unrealizedPnl),
    updatedAt: profile.updatedAt || timestamp,
    verifiedBadge: profile.verifiedBadge ?? null,
    walletAddress,
    winRate,
    wins: toNumber(profile.wins),
    xUsername: profile.xUsername ?? null,
  };
}

function profileToBackendPayload(profile: HighlightedWalletProfile): Record<string, unknown> {
  const latestMarket = profile.sourceMarkets[profile.sourceMarkets.length - 1];
  return {
    avatarUrl: profile.avatarUrl ?? null,
    closedMarkets: profile.closedMarkets,
    detectedAt: profile.detectedAt,
    history: profile.history ?? [],
    lastSeenAt: profile.lastSeenAt,
    lastUpdatedAt: profile.lastUpdatedAt ?? profile.updatedAt,
    losses: profile.losses ?? null,
    name: profile.name ?? null,
    noLongerQualifies: profile.noLongerQualifies ?? false,
    observedCapitalUsd: profile.observedCapitalUsd ?? null,
    profileUrl: profile.profileUrl,
    proxyWallet: profile.proxyWallet ?? null,
    pseudonym: profile.pseudonym ?? null,
    realizedPnl: profile.realizedPnl ?? null,
    shortAddress: profile.shortAddress,
    source: profile.source || "wallet_intelligence",
    sourceLimitations: profile.sourceLimitations ?? [],
    sourceMarketSlug: latestMarket?.sourceMarketSlug ?? null,
    sourceMarketTitle: latestMarket?.sourceMarketTitle ?? null,
    sourceMarketUrl: latestMarket?.sourceMarketUrl ?? null,
    sourceMarkets: profile.sourceMarkets,
    sourceWarnings: profile.sourceWarnings ?? [],
    unrealizedPnl: profile.unrealizedPnl ?? null,
    verifiedBadge: profile.verifiedBadge ?? null,
    walletAddress: profile.walletAddress,
    winRate: profile.winRate,
    wins: profile.wins ?? null,
    xUsername: profile.xUsername ?? null,
  };
}

export function getHiddenPersistentProfileIds(): Set<string> {
  if (!storageAvailable()) {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(HIDDEN_PERSISTENT_PROFILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase())
        : [],
    );
  } catch {
    return new Set();
  }
}

export function hidePersistentProfile(walletAddress: string): void {
  if (!storageAvailable() || !isPolymarketWalletAddress(walletAddress)) {
    return;
  }
  const hidden = getHiddenPersistentProfileIds();
  hidden.add(walletAddress.toLowerCase());
  window.localStorage.setItem(HIDDEN_PERSISTENT_PROFILES_STORAGE_KEY, JSON.stringify([...hidden]));
}

export function profileMeetsPersistentCriteria(profile: HighlightedWalletProfile): boolean {
  const hasPnl = typeof profile.realizedPnl === "number" || typeof profile.unrealizedPnl === "number";
  return (
    profile.winRate >= HIGHLIGHTED_PROFILE_MIN_WIN_RATE &&
    profile.closedMarkets >= HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS &&
    (hasPnl || (profile.observedCapitalUsd ?? 0) >= HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD)
  );
}

export function mergePersistentAndLocalProfiles(
  persistentProfiles: HighlightedWalletProfile[],
  localProfiles: HighlightedWalletProfile[],
): HighlightedWalletProfile[] {
  const hidden = getHiddenPersistentProfileIds();
  const byWallet = new Map<string, HighlightedWalletProfile>();
  for (const profile of persistentProfiles) {
    if (!hidden.has(profile.id)) {
      byWallet.set(profile.id, profile);
    }
  }
  for (const profile of localProfiles) {
    const existing = byWallet.get(profile.id);
    if (!existing) {
      byWallet.set(profile.id, { ...profile, syncStatus: profile.syncStatus ?? "local" });
      continue;
    }
    byWallet.set(profile.id, {
      ...existing,
      ...profile,
      persistentId: existing.persistentId,
      sourceMarkets: [...existing.sourceMarkets, ...profile.sourceMarkets].slice(-20),
      syncError: profile.syncError ?? existing.syncError ?? null,
      syncStatus: existing.syncStatus === "synced" ? "synced" : profile.syncStatus ?? existing.syncStatus,
      syncedAt: existing.syncedAt ?? profile.syncedAt ?? null,
    });
  }
  return [...byWallet.values()].sort(
    (left, right) => (right.winRate - left.winRate) || (right.closedMarkets - left.closedMarkets),
  );
}

export async function fetchPersistentHighlightedProfiles(): Promise<PersistentProfilesResult> {
  const response = await fetch("/api/profiles/highlighted?limit=100&sort=win_rate", {
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
    },
    method: "GET",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error("profiles_backend_unavailable");
  }
  const payload = (await response.json()) as BackendHighlightedProfileList;
  const profiles = (payload.items ?? [])
    .map(profileFromBackend)
    .filter((profile): profile is HighlightedWalletProfile => Boolean(profile));
  return {
    profiles,
    total: typeof payload.total === "number" ? payload.total : profiles.length,
  };
}

export async function upsertPersistentHighlightedProfile(
  profile: HighlightedWalletProfile,
): Promise<HighlightedWalletProfile> {
  if (!isPolymarketWalletAddress(profile.walletAddress)) {
    throw new Error("invalid_wallet");
  }
  const response = await fetch("/api/profiles/highlighted", {
    body: JSON.stringify(profileToBackendPayload(profile)),
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error("profiles_sync_failed");
  }
  const payload = (await response.json()) as BackendHighlightedProfile;
  const synced = profileFromBackend(payload);
  if (!synced) {
    throw new Error("profiles_sync_failed");
  }
  return synced;
}

export async function syncLocalHighlightedProfilesToBackend(
  profiles: HighlightedWalletProfile[] = getHighlightedProfiles(),
): Promise<{ failed: number; synced: number }> {
  let synced = 0;
  let failed = 0;
  for (const profile of profiles) {
    if (!profileMeetsPersistentCriteria(profile)) {
      continue;
    }
    try {
      const persistent = await upsertPersistentHighlightedProfile({
        ...profile,
        syncStatus: "pending",
      });
      saveHighlightedProfile({
        ...profile,
        persistentId: persistent.persistentId,
        syncError: null,
        syncStatus: "synced",
        syncedAt: persistent.syncedAt ?? new Date().toISOString(),
      });
      synced += 1;
    } catch {
      updateHighlightedProfile({
        ...profile,
        syncError: "Sincronizacion persistente pendiente.",
        syncStatus: "failed",
      });
      failed += 1;
    }
  }
  return { failed, synced };
}
