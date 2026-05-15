import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "./polymarketWalletProfile";
import type {
  PublicWalletActivity,
  WalletIntelligenceSummary,
  WalletPublicMarketHistoryItem,
  WalletPublicProfile,
  WalletProfileSummary,
} from "./walletIntelligenceTypes";

export const HIGHLIGHTED_PROFILES_STORAGE_KEY = "polysignal-highlighted-wallet-profiles-v1";
export const HIGHLIGHTED_PROFILES_STORAGE_EVENT = "polysignal:highlighted-profiles-updated";
export const HIGHLIGHTED_PROFILE_MIN_WIN_RATE = 0.8;
export const HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS = 50;
export const HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD = 100;

export type HighlightedProfileSourceMarket = {
  detectedAt: string;
  sourceMarketSlug?: string | null;
  sourceMarketTitle?: string | null;
  sourceMarketUrl?: string | null;
};

export type HighlightedProfileRefreshStatus = "failed" | "idle" | "partial" | "refreshing" | "updated";

export type HighlightedWalletProfile = {
  avatarUrl?: string | null;
  closedMarkets: number;
  detectedAt: string;
  history?: WalletPublicMarketHistoryItem[];
  id: string;
  lastSeenAt: string;
  lastUpdatedAt?: string | null;
  losses?: number | null;
  name?: string | null;
  noLongerQualifies?: boolean;
  observedCapitalUsd?: number | null;
  profileUrl: string;
  proxyWallet?: string | null;
  pseudonym?: string | null;
  realizedPnl?: number | null;
  refreshError?: string | null;
  refreshStatus?: HighlightedProfileRefreshStatus;
  shortAddress: string;
  source: string;
  sourceLimitations?: string[];
  sourceMarkets: HighlightedProfileSourceMarket[];
  sourceWarnings?: string[];
  persistentId?: string | null;
  stale?: boolean;
  syncError?: string | null;
  syncStatus?: "failed" | "local" | "pending" | "synced";
  syncedAt?: string | null;
  unrealizedPnl?: number | null;
  updatedAt: string;
  verifiedBadge?: boolean | null;
  walletAddress: string;
  winRate: number;
  wins?: number | null;
  xUsername?: string | null;
};

export type HighlightedProfileSourceContext = {
  detectedAt?: string;
  observedCapitalUsd?: number | null;
  source?: string;
  sourceMarketSlug?: string | null;
  sourceMarketTitle?: string | null;
  sourceMarketUrl?: string | null;
};

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWinRate(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  if (parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }
  return null;
}

function normalizeCapital(...values: unknown[]): number | null {
  const parsed = values
    .map(toNumber)
    .filter((value): value is number => value !== null && value >= 0);
  if (parsed.length === 0) {
    return null;
  }
  return Math.max(...parsed);
}

function hasRealPnl(activity: Pick<PublicWalletActivity, "historySummary" | "realizedPnl" | "unrealizedPnl">): boolean {
  return (
    typeof activity.realizedPnl === "number" ||
    typeof activity.unrealizedPnl === "number" ||
    typeof activity.historySummary?.realizedPnl === "number" ||
    typeof activity.historySummary?.unrealizedPnl === "number"
  );
}

function shortAddressFor(walletAddress: string, fallback?: string | null): string {
  return fallback || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function sourceMarketFromContext(context?: HighlightedProfileSourceContext): HighlightedProfileSourceMarket {
  return {
    detectedAt: context?.detectedAt || new Date().toISOString(),
    sourceMarketSlug: context?.sourceMarketSlug ?? null,
    sourceMarketTitle: context?.sourceMarketTitle ?? null,
    sourceMarketUrl: context?.sourceMarketUrl ?? null,
  };
}

function mergeSourceMarkets(
  existing: HighlightedProfileSourceMarket[],
  next: HighlightedProfileSourceMarket,
): HighlightedProfileSourceMarket[] {
  const byKey = new Map<string, HighlightedProfileSourceMarket>();
  for (const item of existing) {
    const key = item.sourceMarketUrl || item.sourceMarketSlug || item.sourceMarketTitle || item.detectedAt;
    byKey.set(key, item);
  }
  const nextKey = next.sourceMarketUrl || next.sourceMarketSlug || next.sourceMarketTitle || next.detectedAt;
  byKey.set(nextKey, next);
  return [...byKey.values()].slice(-20);
}

function normalizeStoredProfile(profile: HighlightedWalletProfile): HighlightedWalletProfile {
  return {
    ...profile,
    lastUpdatedAt: profile.lastUpdatedAt ?? profile.updatedAt ?? profile.lastSeenAt ?? null,
    refreshError: profile.refreshError ?? null,
    refreshStatus: profile.refreshStatus ?? "idle",
    sourceLimitations: profile.sourceLimitations ?? [],
    sourceWarnings: profile.sourceWarnings ?? [],
    syncError: profile.syncError ?? null,
    syncStatus: profile.syncStatus ?? "local",
    syncedAt: profile.syncedAt ?? null,
    stale: profile.stale ?? false,
  };
}

function profileName(profile?: WalletPublicProfile | null): Pick<HighlightedWalletProfile, "avatarUrl" | "name" | "proxyWallet" | "pseudonym" | "verifiedBadge" | "xUsername"> {
  return {
    avatarUrl: profile?.avatarUrl ?? null,
    name: profile?.name ?? null,
    proxyWallet: profile?.proxyWallet ?? null,
    pseudonym: profile?.pseudonym ?? null,
    verifiedBadge: profile?.verifiedBadge ?? null,
    xUsername: profile?.xUsername ?? null,
  };
}

export function isHighlightedWalletActivityCandidate(
  activity: PublicWalletActivity,
  context?: HighlightedProfileSourceContext,
): boolean {
  if (!isPolymarketWalletAddress(activity.walletAddress)) {
    return false;
  }
  const winRate = normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate);
  const closedMarkets = toNumber(activity.closedMarkets ?? activity.historySummary?.closedMarkets);
  if (winRate === null || closedMarkets === null) {
    return false;
  }
  const observedCapitalUsd = normalizeCapital(
    activity.amountUsd,
    activity.historySummary?.volumeObservedUsd,
    context?.observedCapitalUsd,
  );
  return (
    winRate >= HIGHLIGHTED_PROFILE_MIN_WIN_RATE &&
    closedMarkets >= HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS &&
    (hasRealPnl(activity) || (observedCapitalUsd ?? 0) >= HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD)
  );
}

export function buildHighlightedProfileFromActivity(
  activity: PublicWalletActivity,
  context?: HighlightedProfileSourceContext,
): HighlightedWalletProfile | null {
  const walletAddress = isPolymarketWalletAddress(activity.walletAddress) ? activity.walletAddress!.trim() : null;
  if (!walletAddress || !isHighlightedWalletActivityCandidate(activity, context)) {
    return null;
  }
  const winRate = normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate);
  const closedMarkets = toNumber(activity.closedMarkets ?? activity.historySummary?.closedMarkets);
  const profileUrl = activity.profile?.profileUrl || buildPolymarketWalletProfileUrl(walletAddress);
  if (winRate === null || closedMarkets === null || !profileUrl) {
    return null;
  }
  const now = new Date().toISOString();
  const observedCapitalUsd = normalizeCapital(
    activity.amountUsd,
    activity.historySummary?.volumeObservedUsd,
    context?.observedCapitalUsd,
  );
  return {
    ...profileName(activity.profile),
    closedMarkets,
    detectedAt: context?.detectedAt || now,
    history: activity.marketHistory ?? [],
    id: walletAddress.toLowerCase(),
    lastSeenAt: context?.detectedAt || now,
    losses: toNumber(activity.losses ?? activity.historySummary?.losses),
    observedCapitalUsd,
    profileUrl,
    realizedPnl: toNumber(activity.realizedPnl ?? activity.historySummary?.realizedPnl),
    refreshError: null,
    refreshStatus: "idle",
    shortAddress: shortAddressFor(walletAddress, activity.shortAddress),
    source: context?.source || activity.source || "Wallet Intelligence",
    sourceLimitations: activity.limitations ?? [],
    sourceMarkets: [sourceMarketFromContext(context)],
    sourceWarnings: activity.warnings ?? [],
    stale: false,
    unrealizedPnl: toNumber(activity.unrealizedPnl ?? activity.historySummary?.unrealizedPnl),
    updatedAt: now,
    lastUpdatedAt: now,
    walletAddress,
    winRate,
    wins: toNumber(activity.wins ?? activity.historySummary?.wins),
  };
}

export function getHighlightedProfiles(): HighlightedWalletProfile[] {
  if (!storageAvailable()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(HIGHLIGHTED_PROFILES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is HighlightedWalletProfile => {
        const profile = item as Partial<HighlightedWalletProfile>;
        return Boolean(profile.walletAddress && isPolymarketWalletAddress(profile.walletAddress) && profile.profileUrl);
      })
      .map(normalizeStoredProfile);
  } catch {
    return [];
  }
}

export function saveHighlightedProfile(profile: HighlightedWalletProfile): HighlightedWalletProfile {
  const current = getHighlightedProfiles();
  const existing = current.find((item) => item.id === profile.id);
  const nextProfile: HighlightedWalletProfile = existing
    ? {
        ...existing,
        ...profile,
        detectedAt: existing.detectedAt,
        history: profile.history?.length ? profile.history : existing.history,
        observedCapitalUsd: Math.max(existing.observedCapitalUsd ?? 0, profile.observedCapitalUsd ?? 0),
        sourceMarkets: mergeSourceMarkets(existing.sourceMarkets ?? [], profile.sourceMarkets[0]),
      }
    : profile;
  const next = [nextProfile, ...current.filter((item) => item.id !== profile.id)]
    .sort((left, right) => (right.winRate - left.winRate) || (right.closedMarkets - left.closedMarkets))
    .slice(0, 100);
  if (storageAvailable()) {
    window.localStorage.setItem(HIGHLIGHTED_PROFILES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(HIGHLIGHTED_PROFILES_STORAGE_EVENT));
  }
  return nextProfile;
}

export function updateHighlightedProfile(profile: HighlightedWalletProfile): HighlightedWalletProfile[] {
  if (!storageAvailable()) {
    return [];
  }
  const normalizedProfile = normalizeStoredProfile(profile);
  const next = [
    normalizedProfile,
    ...getHighlightedProfiles().filter((item) => item.id !== normalizedProfile.id),
  ]
    .sort((left, right) => (right.winRate - left.winRate) || (right.closedMarkets - left.closedMarkets))
    .slice(0, 100);
  window.localStorage.setItem(HIGHLIGHTED_PROFILES_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(HIGHLIGHTED_PROFILES_STORAGE_EVENT));
  return next;
}

export function removeHighlightedProfile(walletAddress: string): HighlightedWalletProfile[] {
  if (!storageAvailable()) {
    return [];
  }
  const key = walletAddress.toLowerCase();
  const next = getHighlightedProfiles().filter((profile) => profile.id !== key);
  window.localStorage.setItem(HIGHLIGHTED_PROFILES_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(HIGHLIGHTED_PROFILES_STORAGE_EVENT));
  return next;
}

function activityFromProfileSummary(
  profile: WalletProfileSummary,
  context?: HighlightedProfileSourceContext,
): PublicWalletActivity | null {
  if (!isPolymarketWalletAddress(profile.walletAddress)) {
    return null;
  }
  return {
    action: "unknown",
    activityType: "notable_wallet",
    amountUsd: context?.observedCapitalUsd ?? profile.volumeObservedUsd ?? null,
    closedMarkets: profile.resolvedMarketsCount ?? null,
    id: `profile-${profile.walletAddress}`,
    limitations: profile.warnings,
    losses: profile.losses ?? null,
    profile: profile.profile ?? null,
    historySummary: {
      closedMarkets: profile.resolvedMarketsCount ?? null,
      losses: profile.losses ?? null,
      source: "polymarket_data_api_closed_positions",
      volumeObservedUsd: profile.volumeObservedUsd ?? null,
      winRate: profile.winRate ?? null,
      wins: profile.wins ?? null,
    },
    source: "polymarket_data_api",
    shortAddress: profile.shortAddress,
    side: "UNKNOWN",
    walletAddress: profile.walletAddress,
    warnings: profile.warnings,
    winRate: profile.winRate ?? null,
    wins: profile.wins ?? null,
  };
}

export function saveHighlightedProfilesFromWalletSummary(
  summary: WalletIntelligenceSummary | null | undefined,
  context?: HighlightedProfileSourceContext,
): { candidates: HighlightedWalletProfile[]; saved: HighlightedWalletProfile[] } {
  if (!summary) {
    return { candidates: [], saved: [] };
  }
  const profileActivities = (summary.profileSummaries ?? [])
    .map((profile) => activityFromProfileSummary(profile, {
      ...context,
      observedCapitalUsd: context?.observedCapitalUsd ?? summary.analyzedCapitalUsd,
    }))
    .filter((activity): activity is PublicWalletActivity => Boolean(activity));
  const activities = [...(summary.publicActivities ?? []), ...profileActivities];
  const candidates = activities
    .map((activity) => buildHighlightedProfileFromActivity(activity, {
      ...context,
      observedCapitalUsd: context?.observedCapitalUsd ?? summary.analyzedCapitalUsd,
    }))
    .filter((profile): profile is HighlightedWalletProfile => Boolean(profile));
  const uniqueCandidates = [...new Map(candidates.map((profile) => [profile.id, profile])).values()];
  const saved = uniqueCandidates.map(saveHighlightedProfile);
  return { candidates: uniqueCandidates, saved };
}
