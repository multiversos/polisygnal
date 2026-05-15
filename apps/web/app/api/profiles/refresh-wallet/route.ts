import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "../../../lib/polymarketWalletProfile";
import {
  buildWalletMarketHistoryItems,
  buildWalletProfileSummary,
  type WalletPublicHistoryPosition,
} from "../../../lib/walletProfiles";
import type {
  WalletPublicMarketHistoryItem,
  WalletPublicProfile,
} from "../../../lib/walletIntelligenceTypes";

const DATA_API_BASE_URL = "https://data-api.polymarket.com";
const DATA_API_HOST = "data-api.polymarket.com";
const GAMMA_API_BASE_URL = "https://gamma-api.polymarket.com";
const GAMMA_API_HOST = "gamma-api.polymarket.com";
const MAX_BODY_BYTES = 4096;
const MAX_RESPONSE_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 6_000;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SAFE_DATA_PATHS = new Set(["/closed-positions"]);
const SAFE_GAMMA_PATHS = new Set(["/public-profile"]);

type RefreshWalletInput = {
  walletAddress?: unknown;
};

type PublicProfile = Record<string, unknown> & {
  avatar?: string | null;
  image?: string | null;
  name?: string | null;
  profileImage?: string | null;
  proxyWallet?: string | null;
  pseudonym?: string | null;
  username?: string | null;
  verified?: boolean | null;
  xUsername?: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-PolySignal-Profile-Source": "polymarket-public",
    },
    status,
  });
}

function cleanPublicString(value: unknown, maxLength = 220): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const cleaned = String(value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }
  return cleaned;
}

function cleanIdentifier(value: unknown, maxLength = 180): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const cleaned = String(value).trim();
  if (!cleaned || cleaned.length > maxLength || /[^a-zA-Z0-9_.:-]/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstPublicString(record: Record<string, unknown>, keys: string[], maxLength = 220): string | null {
  for (const key of keys) {
    const value = cleanPublicString(record[key], maxLength);
    if (value) {
      return value;
    }
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = normalizeNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "items", "results"]) {
      if (Array.isArray(record[key])) {
        return record[key].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
      }
    }
  }
  return [];
}

function buildDataApiUrl(path: string, params: Record<string, string>): URL | null {
  if (!SAFE_DATA_PATHS.has(path)) {
    return null;
  }
  const url = new URL(`${DATA_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (url.protocol !== "https:" || url.hostname !== DATA_API_HOST || url.username || url.password || url.port) {
    return null;
  }
  return url;
}

function buildGammaApiUrl(path: string, params: Record<string, string>): URL | null {
  if (!SAFE_GAMMA_PATHS.has(path)) {
    return null;
  }
  const url = new URL(`${GAMMA_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (url.protocol !== "https:" || url.hostname !== GAMMA_API_HOST || url.username || url.password || url.port) {
    return null;
  }
  return url;
}

async function fetchJson(url: URL | null): Promise<unknown | null> {
  if (!url) {
    return null;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "User-Agent": "PolySignal Profile Refresh",
      },
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return null;
    }
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function safePublicImageUrl(value: unknown): string | null {
  const raw = cleanPublicString(value, 600);
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function publicProfileFromPayload(payload: unknown, walletAddress: string): WalletPublicProfile | null {
  const candidates = parseList(payload);
  const record = (candidates[0] || (payload && typeof payload === "object" ? payload : null)) as PublicProfile | null;
  if (!record) {
    return null;
  }
  const proxyWallet = cleanPublicString(record.proxyWallet, 80);
  return {
    avatarUrl: safePublicImageUrl(record.profileImage ?? record.avatar ?? record.image),
    name: firstPublicString(record, ["name"], 80),
    profileUrl: buildPolymarketWalletProfileUrl(walletAddress),
    proxyWallet: proxyWallet && WALLET_PATTERN.test(proxyWallet) ? proxyWallet : null,
    pseudonym: firstPublicString(record, ["pseudonym", "username", "displayUsername", "displayName", "name"], 80),
    verifiedBadge: typeof record.verified === "boolean" ? record.verified : null,
    xUsername: firstPublicString(record, ["xUsername", "twitterUsername", "twitter"], 80),
  };
}

function resultFieldsForClosedPosition(position: Record<string, unknown>): WalletPublicHistoryPosition {
  return {
    averagePrice: firstNumber(position, ["avgPrice", "averagePrice", "price"]),
    conditionId: cleanIdentifier(position.conditionId ?? position.condition_id),
    marketSlug: cleanIdentifier(position.marketSlug ?? position.market_slug ?? position.slug),
    marketTitle: firstPublicString(position, ["title", "marketTitle", "question"], 160) ?? undefined,
    marketUrl: cleanPublicString(position.marketUrl ?? position.url, 260) ?? undefined,
    outcome: firstPublicString(position, ["outcome", "side"], 80) ?? undefined,
    realizedPnlUsd: normalizeNumber(position.realizedPnl ?? position.realized_pnl ?? position.cashPnl),
    side: firstPublicString(position, ["outcome", "side"], 80) ?? undefined,
    timestamp: cleanPublicString(position.timestamp ?? position.updatedAt ?? position.createdAt, 80) ?? undefined,
    volumeUsd: firstNumber(position, ["totalBought", "currentValue", "value", "volume", "amount"]),
  };
}

async function readRequestBody(request: Request): Promise<RefreshWalletInput | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as RefreshWalletInput) : null;
  } catch {
    return null;
  }
}

function sumRealizedPnl(history: WalletPublicMarketHistoryItem[]): number | null {
  const values = history
    .map((item) => item.realizedPnl)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

export async function POST(request: Request): Promise<Response> {
  const input = await readRequestBody(request);
  const walletAddress = typeof input?.walletAddress === "string" ? input.walletAddress.trim() : "";
  if (!isPolymarketWalletAddress(walletAddress)) {
    return jsonResponse({ error: "invalid_wallet" }, 400);
  }

  const [closedPayload, profilePayload] = await Promise.all([
    fetchJson(buildDataApiUrl("/closed-positions", {
      limit: "50",
      offset: "0",
      user: walletAddress,
    })),
    fetchJson(buildGammaApiUrl("/public-profile", {
      address: walletAddress,
    })),
  ]);
  const closedPositions = parseList(closedPayload).map(resultFieldsForClosedPosition);
  const history = buildWalletMarketHistoryItems(closedPositions);
  const profile = publicProfileFromPayload(profilePayload, walletAddress);
  const summary = buildWalletProfileSummary({
    closedPositions,
    profile,
    shortAddress: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
    walletAddress,
  });
  const realizedPnl = sumRealizedPnl(history);
  const hasClosedStats = typeof summary.winRate === "number" && typeof summary.resolvedMarketsCount === "number";
  const hasProfileData = Boolean(profile?.pseudonym || profile?.name || profile?.avatarUrl || profile?.xUsername);
  const sourceResponded = closedPayload !== null || profilePayload !== null;
  const status = hasClosedStats ? "updated" : sourceResponded && hasProfileData ? "partial" : sourceResponded ? "partial" : "unavailable";
  const now = new Date().toISOString();
  const warnings = [
    ...summary.warnings,
    hasClosedStats ? "" : "La fuente publica no devolvio mercados cerrados suficientes con PnL real para recalcular win rate.",
    status === "unavailable" ? "No pudimos consultar fuentes publicas para esta wallet en este momento." : "",
  ].filter(Boolean);
  const limitations = [
    "Actualizacion basada solo en fuentes publicas disponibles.",
    "Si una metrica no viene de la fuente, PolySignal conserva el dato local anterior como dato posiblemente stale.",
    "Historial pasado no garantiza resultados futuros y no es una recomendacion de copy-trading.",
  ];

  return jsonResponse({
    limitations,
    profile: {
      avatarUrl: profile?.avatarUrl ?? null,
      closedMarkets: summary.resolvedMarketsCount ?? null,
      lastUpdatedAt: now,
      losses: summary.losses ?? null,
      markets: history,
      name: profile?.name ?? null,
      observedCapitalUsd: summary.volumeObservedUsd ?? null,
      profileUrl: profile?.profileUrl ?? buildPolymarketWalletProfileUrl(walletAddress),
      proxyWallet: profile?.proxyWallet ?? null,
      pseudonym: profile?.pseudonym ?? null,
      realizedPnl,
      shortAddress: summary.shortAddress,
      source: "polymarket_public_profile_refresh",
      unrealizedPnl: null,
      verifiedBadge: profile?.verifiedBadge ?? null,
      walletAddress,
      winRate: summary.winRate ?? null,
      wins: summary.wins ?? null,
      xUsername: profile?.xUsername ?? null,
    },
    status,
    warnings,
  });
}

export function GET(): Response {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}
