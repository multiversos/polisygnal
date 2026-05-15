import {
  getHighlightedProfiles,
  type HighlightedWalletProfile,
} from "./highlightedProfiles";
import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "./polymarketWalletProfile";
import type {
  PublicWalletActivity,
  WalletIntelligenceSummary,
  WalletProfileSummary,
} from "./walletIntelligenceTypes";

export const PROFILE_ALERTS_STORAGE_KEY = "polysignal-profile-alerts-v1";
export const PROFILE_ALERTS_STORAGE_EVENT = "polysignal:profile-alerts-updated";
export const PROFILE_ALERT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ProfileAlertType =
  | "highlighted_profile_detected"
  | "large_position_detected"
  | "high_winrate_profile_seen"
  | "new_market_activity"
  | "profile_refresh_change";

export type ProfileAlertSeverity = "important" | "info" | "watch";

export type ProfileAlert = {
  amountUsd: number | null;
  closedMarkets: number | null;
  createdAt: string;
  id: string;
  marketSlug: string | null;
  marketTitle: string;
  marketUrl: string | null;
  observedCapitalUsd: number | null;
  outcome: string | null;
  positionSize: number | null;
  price: number | null;
  profileImageUrl: string | null;
  profileUrl: string | null;
  pseudonym: string | null;
  read: boolean;
  reason: string;
  severity: ProfileAlertSeverity;
  shortAddress: string;
  source: "analyze" | "profile_refresh" | "wallet_intelligence";
  type: ProfileAlertType;
  walletAddress: string;
  winRate: number | null;
};

export type ProfileAlertContext = {
  marketSlug?: string | null;
  marketTitle?: string | null;
  marketUrl?: string | null;
  observedCapitalUsd?: number | null;
  source?: ProfileAlert["source"];
};

type ProfileAlertCandidate = Omit<ProfileAlert, "createdAt" | "id" | "read"> & {
  createdAt?: string;
  read?: boolean;
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

function shortAddressFor(walletAddress: string, fallback?: string | null): string {
  return fallback || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function cleanText(value?: string | null, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function safePolymarketUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return null;
    }
    if (url.hostname !== "polymarket.com" && url.hostname !== "www.polymarket.com") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function profileByWallet(profiles?: HighlightedWalletProfile[]): Map<string, HighlightedWalletProfile> {
  const map = new Map<string, HighlightedWalletProfile>();
  for (const profile of profiles ?? []) {
    if (isPolymarketWalletAddress(profile.walletAddress)) {
      map.set(profile.walletAddress.toLowerCase(), profile);
    }
  }
  return map;
}

function activityFromProfileSummary(
  profile: WalletProfileSummary,
  context?: ProfileAlertContext,
): PublicWalletActivity | null {
  if (!isPolymarketWalletAddress(profile.walletAddress)) {
    return null;
  }
  return {
    action: "unknown",
    activityType: "notable_wallet",
    amountUsd: profile.volumeObservedUsd ?? context?.observedCapitalUsd ?? null,
    closedMarkets: profile.resolvedMarketsCount ?? null,
    id: `profile-alert-${profile.walletAddress}`,
    limitations: [],
    losses: profile.losses ?? null,
    profile: profile.profile ?? null,
    historySummary: {
      closedMarkets: profile.resolvedMarketsCount ?? null,
      losses: profile.losses ?? null,
      source: "polymarket_public_profile",
      volumeObservedUsd: profile.volumeObservedUsd ?? null,
      winRate: profile.winRate ?? null,
      wins: profile.wins ?? null,
    },
    outcome: null,
    source: "polymarket_data_api",
    shortAddress: profile.shortAddress,
    side: "UNKNOWN",
    walletAddress: profile.walletAddress,
    warnings: profile.warnings ?? [],
    winRate: profile.winRate ?? null,
    wins: profile.wins ?? null,
  };
}

function normalizeActivityWallet(activity: PublicWalletActivity): string | null {
  return isPolymarketWalletAddress(activity.walletAddress) ? activity.walletAddress!.trim().toLowerCase() : null;
}

function hasRelevantPosition(activity: PublicWalletActivity, context?: ProfileAlertContext): boolean {
  const amountUsd = toNumber(activity.amountUsd);
  const positionSize = toNumber(activity.positionSize);
  const observedCapitalUsd = toNumber(context?.observedCapitalUsd);
  return (amountUsd ?? 0) >= 100 || (positionSize ?? 0) > 0 || (observedCapitalUsd ?? 0) >= 100;
}

function isKnownHighlightedActivity(
  activity: PublicWalletActivity,
  knownProfile?: HighlightedWalletProfile,
): boolean {
  const winRate = normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate ?? knownProfile?.winRate);
  const closedMarkets = toNumber(
    activity.closedMarkets ?? activity.historySummary?.closedMarkets ?? knownProfile?.closedMarkets,
  );
  return Boolean(
    activity.highlightedProfile ||
      knownProfile ||
      (winRate !== null && winRate >= 0.8 && closedMarkets !== null && closedMarkets >= 50),
  );
}

function alertTypeForActivity(
  activity: PublicWalletActivity,
  knownProfile: HighlightedWalletProfile | undefined,
  context: ProfileAlertContext | undefined,
): ProfileAlertType {
  const winRate = normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate ?? knownProfile?.winRate);
  const closedMarkets = toNumber(
    activity.closedMarkets ?? activity.historySummary?.closedMarkets ?? knownProfile?.closedMarkets,
  );
  if (winRate !== null && winRate >= 0.9 && closedMarkets !== null && closedMarkets >= 50) {
    return "high_winrate_profile_seen";
  }
  if (hasRelevantPosition(activity, context)) {
    return "large_position_detected";
  }
  return "highlighted_profile_detected";
}

function severityForActivity(
  activity: PublicWalletActivity,
  knownProfile: HighlightedWalletProfile | undefined,
): ProfileAlertSeverity {
  const winRate = normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate ?? knownProfile?.winRate);
  const closedMarkets = toNumber(
    activity.closedMarkets ?? activity.historySummary?.closedMarkets ?? knownProfile?.closedMarkets,
  );
  if (winRate !== null && winRate >= 0.9 && closedMarkets !== null && closedMarkets >= 50) {
    return "important";
  }
  if (winRate !== null && winRate >= 0.8 && closedMarkets !== null && closedMarkets >= 50) {
    return "watch";
  }
  return "info";
}

export function profileAlertReason(type: ProfileAlertType): string {
  if (type === "high_winrate_profile_seen") {
    return "Perfil destacado con winRate publico alto detectado de nuevo en este mercado.";
  }
  if (type === "large_position_detected") {
    return "Actividad publica relevante detectada para este perfil destacado.";
  }
  if (type === "new_market_activity") {
    return "Nueva actividad publica disponible para este perfil destacado.";
  }
  if (type === "profile_refresh_change") {
    return "El perfil tuvo cambios al actualizar fuentes publicas.";
  }
  return "Perfil destacado detectado en este mercado.";
}

function idPart(value: string | null | undefined): string {
  return cleanText(value, "sin-dato")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sin-dato";
}

function buildAlertId(alert: ProfileAlertCandidate, createdAt: string): string {
  const day = createdAt.slice(0, 10);
  return [
    "profile-alert",
    alert.type,
    alert.walletAddress.toLowerCase(),
    idPart(alert.marketSlug || alert.marketTitle),
    idPart(alert.outcome),
    day,
  ].join(":");
}

function normalizeAlert(candidate: ProfileAlertCandidate): ProfileAlert | null {
  const walletAddress = isPolymarketWalletAddress(candidate.walletAddress)
    ? candidate.walletAddress.trim().toLowerCase()
    : null;
  if (!walletAddress) {
    return null;
  }
  const createdAt = candidate.createdAt || new Date().toISOString();
  return {
    ...candidate,
    amountUsd: toNumber(candidate.amountUsd),
    closedMarkets: toNumber(candidate.closedMarkets),
    createdAt,
    id: buildAlertId({ ...candidate, walletAddress }, createdAt),
    marketSlug: cleanText(candidate.marketSlug) || null,
    marketTitle: cleanText(candidate.marketTitle, "Mercado no disponible"),
    marketUrl: safePolymarketUrl(candidate.marketUrl),
    observedCapitalUsd: toNumber(candidate.observedCapitalUsd),
    outcome: cleanText(candidate.outcome) || null,
    positionSize: toNumber(candidate.positionSize),
    price: toNumber(candidate.price),
    profileImageUrl: cleanText(candidate.profileImageUrl) || null,
    profileUrl: safePolymarketUrl(candidate.profileUrl) || buildPolymarketWalletProfileUrl(walletAddress),
    pseudonym: cleanText(candidate.pseudonym) || null,
    read: Boolean(candidate.read),
    shortAddress: shortAddressFor(walletAddress, candidate.shortAddress),
    walletAddress,
    winRate: normalizeWinRate(candidate.winRate),
  };
}

function isDuplicateAlert(existing: ProfileAlert, next: ProfileAlert, nowMs: number): boolean {
  const existingTime = new Date(existing.createdAt).getTime();
  if (!Number.isFinite(existingTime) || nowMs - existingTime > PROFILE_ALERT_DEDUPE_WINDOW_MS) {
    return false;
  }
  return (
    existing.type === next.type &&
    existing.walletAddress.toLowerCase() === next.walletAddress.toLowerCase() &&
    (existing.marketSlug || existing.marketTitle).toLowerCase() ===
      (next.marketSlug || next.marketTitle).toLowerCase() &&
    (existing.outcome || "").toLowerCase() === (next.outcome || "").toLowerCase()
  );
}

export function getProfileAlerts(): ProfileAlert[] {
  if (!storageAvailable()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_ALERTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((alert) => normalizeAlert(alert as ProfileAlertCandidate))
      .filter((alert): alert is ProfileAlert => Boolean(alert))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 200);
  } catch {
    return [];
  }
}

export function saveProfileAlerts(candidates: ProfileAlertCandidate[]): {
  alerts: ProfileAlert[];
  created: ProfileAlert[];
} {
  const normalized = candidates
    .map(normalizeAlert)
    .filter((alert): alert is ProfileAlert => Boolean(alert));
  if (normalized.length === 0) {
    return { alerts: getProfileAlerts(), created: [] };
  }
  const { alerts: next, created } = dedupeProfileAlerts(getProfileAlerts(), normalized);
  if (storageAvailable()) {
    window.localStorage.setItem(PROFILE_ALERTS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PROFILE_ALERTS_STORAGE_EVENT));
  }
  return { alerts: next, created };
}

export function dedupeProfileAlerts(
  existingAlerts: ProfileAlert[],
  nextAlerts: ProfileAlert[],
  nowMs = Date.now(),
): { alerts: ProfileAlert[]; created: ProfileAlert[] } {
  const created: ProfileAlert[] = [];
  let alerts = existingAlerts;
  for (const alert of nextAlerts) {
    if (alerts.some((existing) => isDuplicateAlert(existing, alert, nowMs))) {
      continue;
    }
    created.push(alert);
    alerts = [alert, ...alerts];
  }
  return {
    alerts: alerts
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 200),
    created,
  };
}

export function buildProfileAlertsFromWalletSummary(
  summary: WalletIntelligenceSummary | null | undefined,
  context?: ProfileAlertContext,
  knownProfiles?: HighlightedWalletProfile[],
): ProfileAlert[] {
  if (!summary) {
    return [];
  }
  const knownByWallet = profileByWallet(knownProfiles);
  const profileActivities = (summary.profileSummaries ?? [])
    .map((profile) => activityFromProfileSummary(profile, {
      ...context,
      observedCapitalUsd: context?.observedCapitalUsd ?? summary.analyzedCapitalUsd,
    }))
    .filter((activity): activity is PublicWalletActivity => Boolean(activity));
  const activities = [...(summary.publicActivities ?? []), ...profileActivities];
  const byWalletAndOutcome = new Map<string, PublicWalletActivity>();
  for (const activity of activities) {
    const walletAddress = normalizeActivityWallet(activity);
    if (!walletAddress) {
      continue;
    }
    const outcome = cleanText(activity.outcome || activity.side) || "unknown";
    const key = `${walletAddress}:${outcome.toLowerCase()}`;
    const existing = byWalletAndOutcome.get(key);
    const existingAmount = toNumber(existing?.amountUsd) ?? 0;
    const currentAmount = toNumber(activity.amountUsd) ?? 0;
    if (!existing || currentAmount >= existingAmount) {
      byWalletAndOutcome.set(key, activity);
    }
  }
  const candidates = [...byWalletAndOutcome.values()]
    .map((activity) => {
      const walletAddress = normalizeActivityWallet(activity);
      if (!walletAddress) {
        return null;
      }
      const knownProfile = knownByWallet.get(walletAddress);
      if (!isKnownHighlightedActivity(activity, knownProfile)) {
        return null;
      }
      const type = alertTypeForActivity(activity, knownProfile, {
        ...context,
        observedCapitalUsd: context?.observedCapitalUsd ?? summary.analyzedCapitalUsd,
      });
      const profileUrl =
        activity.profile?.profileUrl ||
        knownProfile?.profileUrl ||
        buildPolymarketWalletProfileUrl(walletAddress);
      return {
        amountUsd: toNumber(activity.amountUsd),
        closedMarkets: toNumber(
          activity.closedMarkets ?? activity.historySummary?.closedMarkets ?? knownProfile?.closedMarkets,
        ),
        marketSlug: context?.marketSlug ?? null,
        marketTitle: cleanText(context?.marketTitle, "Mercado analizado"),
        marketUrl: context?.marketUrl ?? null,
        observedCapitalUsd: toNumber(
          activity.historySummary?.volumeObservedUsd ??
            knownProfile?.observedCapitalUsd ??
            summary.analyzedCapitalUsd,
        ),
        outcome: cleanText(activity.outcome || (activity.side !== "UNKNOWN" ? activity.side : null)) || null,
        positionSize: toNumber(activity.positionSize),
        price: toNumber(activity.price),
        profileImageUrl: activity.profile?.avatarUrl ?? knownProfile?.avatarUrl ?? null,
        profileUrl,
        pseudonym:
          activity.profile?.pseudonym ||
          activity.profile?.name ||
          knownProfile?.pseudonym ||
          knownProfile?.name ||
          null,
        reason: profileAlertReason(type),
        severity: severityForActivity(activity, knownProfile),
        shortAddress: shortAddressFor(walletAddress, activity.shortAddress || knownProfile?.shortAddress),
        source: context?.source ?? "analyze",
        type,
        walletAddress,
        winRate: normalizeWinRate(activity.winRate ?? activity.historySummary?.winRate ?? knownProfile?.winRate),
      };
    })
    .filter((alert): alert is ProfileAlertCandidate => Boolean(alert));
  return candidates
    .map(normalizeAlert)
    .filter((alert): alert is ProfileAlert => Boolean(alert));
}

export function saveProfileAlertsFromWalletSummary(
  summary: WalletIntelligenceSummary | null | undefined,
  context?: ProfileAlertContext,
  knownProfiles: HighlightedWalletProfile[] = getHighlightedProfiles(),
): { alerts: ProfileAlert[]; created: ProfileAlert[] } {
  return saveProfileAlerts(buildProfileAlertsFromWalletSummary(summary, context, knownProfiles));
}

export function markProfileAlertRead(alertId: string): ProfileAlert[] {
  const next = getProfileAlerts().map((alert) => (
    alert.id === alertId ? { ...alert, read: true } : alert
  ));
  if (storageAvailable()) {
    window.localStorage.setItem(PROFILE_ALERTS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PROFILE_ALERTS_STORAGE_EVENT));
  }
  return next;
}

export function deleteProfileAlert(alertId: string): ProfileAlert[] {
  const next = getProfileAlerts().filter((alert) => alert.id !== alertId);
  if (storageAvailable()) {
    window.localStorage.setItem(PROFILE_ALERTS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PROFILE_ALERTS_STORAGE_EVENT));
  }
  return next;
}

export function getUnreadProfileAlertCount(): number {
  return getProfileAlerts().filter((alert) => !alert.read).length;
}
