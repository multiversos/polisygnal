import { normalizePolymarketUrl } from "../../lib/polymarketLink";
import {
  WALLET_INTELLIGENCE_THRESHOLD_USD,
  calculateWalletSideBias,
  filterRelevantWallets,
  formatWalletAddress,
  getWalletIntelligenceSummary,
} from "../../lib/walletIntelligence";
import {
  buildWalletMarketHistoryItems,
  buildWalletProfileSummaries,
  type WalletPublicHistoryPosition,
} from "../../lib/walletProfiles";
import type {
  PublicWalletActivity,
  PublicWalletActivityAction,
  WalletIntelligenceSummary,
  WalletMarketPosition,
  WalletPublicProfile,
  WalletSide,
} from "../../lib/walletIntelligenceTypes";

const DATA_API_BASE_URL = "https://data-api.polymarket.com";
const DATA_API_HOST = "data-api.polymarket.com";
const GAMMA_API_BASE_URL = "https://gamma-api.polymarket.com";
const GAMMA_API_HOST = "gamma-api.polymarket.com";
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_REQUEST_BYTES = 16_000;
const MAX_RESPONSE_BYTES = 512_000;
const MAX_LIMIT = 50;
const PROFILE_WALLET_LIMIT = 5;
const SAFE_PATHS = new Set(["/trades", "/v1/market-positions", "/closed-positions"]);
const SAFE_GAMMA_PATHS = new Set(["/public-profile"]);
const FULL_WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

type WalletRouteInput = {
  conditionId?: unknown;
  eventSlug?: unknown;
  marketSlug?: unknown;
  marketUrl?: unknown;
  minUsd?: unknown;
  tokenIds?: unknown;
};

type PublicTrade = Record<string, unknown> & {
  asset?: string | null;
  conditionId?: string | null;
  makerAssetId?: string | number | null;
  outcome?: string | null;
  price?: string | number | null;
  proxyWallet?: string | null;
  size?: string | number | null;
  side?: string | null;
  timestamp?: string | number | null;
  transactionHash?: string | null;
  txHash?: string | null;
};

type PublicPosition = Record<string, unknown> & {
  avgPrice?: string | number | null;
  asset?: string | null;
  conditionId?: string | null;
  currentValue?: string | number | null;
  currPrice?: string | number | null;
  outcome?: string | null;
  proxyWallet?: string | null;
  realizedPnl?: string | number | null;
  size?: string | number | null;
  tokenId?: string | number | null;
  totalBought?: string | number | null;
  totalPnl?: string | number | null;
};

type PublicProfile = Record<string, unknown> & {
  bio?: string | null;
  displayUsernamePublic?: boolean | null;
  name?: string | null;
  profileImage?: string | null;
  proxyWallet?: string | null;
  pseudonym?: string | null;
  username?: string | null;
  xUsername?: string | null;
};

type InternalWalletPosition = {
  fullWallet: string;
  publicPosition: WalletMarketPosition;
};

type InternalWalletActivity = {
  amountUsd?: number;
  fullWallet: string;
  publicActivity: PublicWalletActivity;
  publicPosition: WalletMarketPosition;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-PolySignal-Wallet-Source": "polymarket-data",
    },
  });
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

function normalizeAction(value: unknown, fallback: PublicWalletActivityAction): PublicWalletActivityAction {
  const normalized = cleanPublicString(value, 40)?.toLowerCase();
  if (normalized === "buy" || normalized === "bought" || normalized === "purchase") {
    return "buy";
  }
  if (normalized === "sell" || normalized === "sold") {
    return "sell";
  }
  if (normalized === "position" || normalized === "open" || normalized === "hold") {
    return "position";
  }
  return fallback;
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

function publicRawFields(record: Record<string, unknown>, keys: string[]): Record<string, string | number | boolean | null> | undefined {
  const fields: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      fields[key] = typeof value === "string" ? cleanPublicString(value, 260) : value;
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
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

function normalizeTokenIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => cleanIdentifier(item, 180))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
}

function normalizeSide(value: unknown): WalletSide {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "si" || normalized === "sí") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  return "UNKNOWN";
}

function unavailableSummary(reason: string, thresholdUsd = WALLET_INTELLIGENCE_THRESHOLD_USD): WalletIntelligenceSummary {
  return {
    ...getWalletIntelligenceSummary(null, thresholdUsd),
    checkedAt: new Date().toISOString(),
    queryStatus: "unavailable",
    reason,
    source: "unavailable",
    warnings: [
      "No encontramos datos publicos suficientes de billeteras para este mercado.",
      "Este analisis no usara wallets como senal fuerte.",
      "Las direcciones completas solo se muestran en el detalle de billeteras cuando la fuente publica las entrega.",
    ],
  };
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

function parseMarketPositions(payload: unknown): PublicPosition[] {
  const groups = parseList(payload);
  const positions: PublicPosition[] = [];
  for (const group of groups) {
    if (Array.isArray(group.positions)) {
      positions.push(
        ...group.positions.filter((item): item is PublicPosition => Boolean(item) && typeof item === "object"),
      );
    } else {
      positions.push(group as PublicPosition);
    }
    if (positions.length >= MAX_LIMIT) {
      break;
    }
  }
  return positions.slice(0, MAX_LIMIT);
}

function buildDataApiUrl(path: string, params: Record<string, string>): URL | null {
  if (!SAFE_PATHS.has(path)) {
    return null;
  }
  const url = new URL(`${DATA_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== DATA_API_HOST ||
    url.username ||
    url.password ||
    url.port
  ) {
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
  if (
    url.protocol !== "https:" ||
    url.hostname !== GAMMA_API_HOST ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null;
  }
  return url;
}

async function fetchDataApiJson(path: string, params: Record<string, string>): Promise<unknown | null> {
  const url = buildDataApiUrl(path, params);
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
        "User-Agent": "PolySignal Wallet Intelligence",
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

async function fetchGammaApiJson(path: string, params: Record<string, string>): Promise<unknown | null> {
  const url = buildGammaApiUrl(path, params);
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
        "User-Agent": "PolySignal Wallet Intelligence",
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

function tradeAmountUsd(trade: PublicTrade): number | undefined {
  const size = normalizeNumber(trade.size);
  const price = normalizeNumber(trade.price);
  if (size === undefined || price === undefined) {
    return undefined;
  }
  return Math.abs(size * price);
}

function positionAmountUsd(position: PublicPosition): number | undefined {
  const currentValue = normalizeNumber(position.currentValue);
  if (currentValue !== undefined) {
    return Math.abs(currentValue);
  }
  const totalBought = normalizeNumber(position.totalBought);
  if (totalBought !== undefined) {
    return Math.abs(totalBought);
  }
  const size = normalizeNumber(position.size);
  const price = normalizeNumber(position.currPrice);
  if (size !== undefined && price !== undefined) {
    return Math.abs(size * price);
  }
  return undefined;
}

function toPublicPosition(input: {
  amountUsd?: number;
  averageEntryPrice?: number;
  fullWallet?: unknown;
  lastActivityAt?: unknown;
  marketId?: string;
  pnlUsd?: number;
  side?: unknown;
}): InternalWalletPosition | null {
  if (typeof input.fullWallet !== "string" || !FULL_WALLET_PATTERN.test(input.fullWallet)) {
    return null;
  }
  if (input.amountUsd === undefined) {
    return null;
  }
  const shortAddress = formatWalletAddress(input.fullWallet);
  return {
    fullWallet: input.fullWallet,
    publicPosition: {
      amountUsd: input.amountUsd,
      averageEntryPrice: input.averageEntryPrice,
      lastActivityAt: typeof input.lastActivityAt === "string" ? input.lastActivityAt : undefined,
      marketId: input.marketId,
      shortAddress,
      side: normalizeSide(input.side),
      unrealizedPnlUsd: input.pnlUsd,
      walletAddress: shortAddress,
    },
  };
}

function toWalletActivity(input: {
  action: PublicWalletActivityAction;
  activityType: PublicWalletActivity["activityType"];
  amountUsd?: number;
  fullWallet?: unknown;
  idPrefix: string;
  index: number;
  marketId?: string;
  outcome?: unknown;
  positionSize?: number;
  price?: number;
  raw?: Record<string, unknown>;
  realizedPnl?: number;
  shares?: number;
  timestamp?: unknown;
  tokenId?: unknown;
  transactionHash?: unknown;
  unrealizedPnl?: number;
}): InternalWalletActivity | null {
  const position = toPublicPosition({
    amountUsd: input.amountUsd,
    averageEntryPrice: input.price,
    fullWallet: input.fullWallet,
    lastActivityAt: input.timestamp,
    marketId: input.marketId,
    pnlUsd: input.unrealizedPnl ?? input.realizedPnl,
    side: input.outcome,
  });
  if (!position) {
    return null;
  }
  const timestamp = cleanPublicString(input.timestamp, 80);
  const tokenId = cleanPublicString(input.tokenId, 180);
  const transactionHash = cleanPublicString(input.transactionHash, 180);
  return {
    amountUsd: input.amountUsd,
    fullWallet: position.fullWallet,
    publicActivity: {
      action: input.action,
      activityType: input.activityType,
      amountUsd: input.amountUsd ?? null,
      conditionId: input.marketId ?? null,
      id: `${input.idPrefix}-${input.index}-${position.publicPosition.shortAddress}-${input.amountUsd ?? "na"}`,
      limitations: [
        "Datos publicos de Polymarket Data API; pueden ser parciales o estar sujetos a limite de consulta.",
        "No identifica personas reales ni convierte actividad publica en una guia operativa.",
      ],
      marketId: input.marketId ?? null,
      outcome: cleanPublicString(input.outcome, 80),
      positionSize: input.positionSize ?? null,
      price: input.price ?? null,
      rawSourceFields: input.raw
        ? publicRawFields(input.raw, [
            "asset",
            "conditionId",
            "currPrice",
            "currentValue",
            "makerAssetId",
            "outcome",
            "price",
            "realizedPnl",
            "side",
            "size",
            "timestamp",
            "tokenId",
            "totalBought",
            "totalPnl",
            "transactionHash",
            "txHash",
          ])
        : undefined,
      realizedPnl: input.realizedPnl ?? null,
      shares: input.shares ?? null,
      shortAddress: position.publicPosition.shortAddress,
      side: position.publicPosition.side === "YES" || position.publicPosition.side === "NO" ? position.publicPosition.side : "UNKNOWN",
      source: "polymarket_data_api",
      timestamp,
      tokenId,
      transactionHash,
      unrealizedPnl: input.unrealizedPnl ?? null,
      walletAddress: position.fullWallet,
      warnings: [
        "Actividad publica observada; no es una decision ni una recomendacion.",
      ],
    },
    publicPosition: position.publicPosition,
  };
}

function buildTradePositions(trades: PublicTrade[], marketId?: string): InternalWalletActivity[] {
  return trades
    .map((trade, index) =>
      toWalletActivity({
        action: normalizeAction(trade.side ?? trade.type ?? trade.action, "unknown"),
        activityType: "trade",
        amountUsd: tradeAmountUsd(trade),
        fullWallet: trade.proxyWallet,
        idPrefix: "trade",
        index,
        marketId,
        outcome: trade.outcome,
        price: normalizeNumber(trade.price),
        raw: trade,
        shares: normalizeNumber(trade.size),
        timestamp: trade.timestamp,
        tokenId: trade.asset ?? trade.makerAssetId,
        transactionHash: trade.transactionHash ?? trade.txHash ?? trade.hash,
      }),
    )
    .filter((item): item is InternalWalletActivity => Boolean(item));
}

function buildMarketPositions(positions: PublicPosition[], marketId?: string): InternalWalletActivity[] {
  return positions
    .map((position, index) =>
      toWalletActivity({
        action: "position",
        activityType: "position",
        amountUsd: positionAmountUsd(position),
        fullWallet: position.proxyWallet,
        idPrefix: "position",
        index,
        marketId,
        outcome: position.outcome,
        positionSize: normalizeNumber(position.size),
        price: normalizeNumber(position.avgPrice ?? position.currPrice),
        raw: position,
        realizedPnl: normalizeNumber(position.realizedPnl),
        shares: normalizeNumber(position.size),
        tokenId: position.tokenId ?? position.asset,
        unrealizedPnl: normalizeNumber(position.totalPnl),
      }),
    )
    .filter((item): item is InternalWalletActivity => Boolean(item));
}

function uniqueByWalletAndSide(items: InternalWalletActivity[]): InternalWalletActivity[] {
  const seen = new Set<string>();
  const result: InternalWalletActivity[] = [];
  for (const item of items) {
    const key = `${item.publicPosition.shortAddress}:${item.publicPosition.side}:${item.publicPosition.amountUsd ?? 0}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function capitalFor(items: WalletMarketPosition[]): number {
  return items.reduce((total, item) => total + (typeof item.amountUsd === "number" ? item.amountUsd : 0), 0);
}

function neutralCapitalFor(items: WalletMarketPosition[]): number {
  return capitalFor(items.filter((item) => item.side !== "YES" && item.side !== "NO"));
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

function profileUrlForWallet(wallet: string): string {
  return `https://polymarket.com/profile/${wallet}`;
}

function publicProfileFromPayload(payload: unknown, wallet: string): WalletPublicProfile | null {
  const candidates = parseList(payload);
  const record = (candidates[0] || (payload && typeof payload === "object" ? payload : null)) as PublicProfile | null;
  if (!record) {
    return null;
  }
  const pseudonym = firstPublicString(record, ["pseudonym", "username", "displayUsername", "displayName", "name"], 80);
  const name = firstPublicString(record, ["name"], 80);
  const xUsername = firstPublicString(record, ["xUsername", "twitterUsername", "twitter"], 80);
  const proxyWallet = cleanPublicString(record.proxyWallet, 80);
  return {
    avatarUrl: safePublicImageUrl(record.profileImage ?? record.avatar ?? record.image),
    name,
    profileUrl: profileUrlForWallet(wallet),
    proxyWallet: proxyWallet && FULL_WALLET_PATTERN.test(proxyWallet) ? proxyWallet : null,
    pseudonym,
    verifiedBadge: typeof record.verified === "boolean" ? record.verified : null,
    xUsername,
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

async function loadClosedPositionsForProfiles(wallets: InternalWalletActivity[]): Promise<{
  activities: PublicWalletActivity[];
  profileSummaries: WalletIntelligenceSummary["profileSummaries"];
}> {
  const uniqueWallets = [...new Map(wallets.map((wallet) => [wallet.fullWallet, wallet])).values()].slice(0, PROFILE_WALLET_LIMIT);
  const profileInputs = await Promise.all(
    uniqueWallets.map(async (wallet) => {
      const [payload, profilePayload] = await Promise.all([
        fetchDataApiJson("/closed-positions", {
          limit: "50",
          offset: "0",
          user: wallet.fullWallet,
        }),
        fetchGammaApiJson("/public-profile", {
          address: wallet.fullWallet,
        }),
      ]);
      const closedPositions = parseList(payload).map(resultFieldsForClosedPosition);
      const profile = publicProfileFromPayload(profilePayload, wallet.fullWallet);
      return {
        closedPositions,
        currentSide: wallet.publicPosition.side,
        observedCapitalUsd: wallet.publicPosition.amountUsd,
        profile,
        shortAddress: wallet.publicPosition.shortAddress,
        walletAddress: wallet.fullWallet,
      };
    }),
  );
  const profileSummaries = buildWalletProfileSummaries(profileInputs);
  const summaryByShort = new Map(profileSummaries.map((profile) => [profile.shortAddress, profile]));
  const activities = uniqueWallets.map((wallet, index) => {
    const profile = summaryByShort.get(wallet.publicPosition.shortAddress);
    const marketHistory = buildWalletMarketHistoryItems(profileInputs[index]?.closedPositions ?? []);
    const realizedPnlValues = marketHistory
      .map((item) => item.realizedPnl)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const realizedPnlTotal = realizedPnlValues.reduce((sum, value) => sum + value, 0);
    const highlightedProfile = Boolean(
      typeof profile?.winRate === "number" &&
        profile.winRate >= 0.8 &&
        (profile.resolvedMarketsCount ?? 0) >= 50 &&
        (realizedPnlValues.length > 0 || (profile.volumeObservedUsd ?? wallet.publicPosition.amountUsd ?? 0) >= 100),
    );
    return {
      action: "unknown" as const,
      activityType: "notable_wallet" as const,
      amountUsd: wallet.publicPosition.amountUsd ?? null,
      closedMarkets: profile?.resolvedMarketsCount ?? null,
      id: `profile-${wallet.publicPosition.shortAddress}`,
      highlightedProfile,
      limitations: [
        "Perfil enriquecido con datos publicos cuando la fuente los entrega.",
        "No convierte historial pasado en recomendacion ni prediccion garantizada.",
      ],
      losses: profile?.losses ?? null,
      marketHistory,
      outcome: wallet.publicPosition.side === "YES" || wallet.publicPosition.side === "NO" ? wallet.publicPosition.side : null,
      profile: profile?.profile ?? null,
      historySummary: {
        closedMarkets: profile?.resolvedMarketsCount ?? null,
        lastActivityAt: marketHistory.find((item) => item.timestamp)?.timestamp ?? null,
        losses: profile?.losses ?? null,
        marketsParticipated: profile?.observedMarketsCount ?? null,
        realizedPnl: realizedPnlValues.length > 0 ? realizedPnlTotal : null,
        source: "polymarket_data_api_closed_positions",
        volumeObservedUsd: profile?.volumeObservedUsd ?? null,
        winRate: profile?.winRate ?? null,
        wins: profile?.wins ?? null,
      },
      price: wallet.publicActivity.price ?? null,
      shortAddress: wallet.publicPosition.shortAddress,
      side: wallet.publicPosition.side === "YES" || wallet.publicPosition.side === "NO" ? wallet.publicPosition.side : "UNKNOWN",
      source: "polymarket_data_api",
      walletAddress: wallet.fullWallet,
      warnings: profile?.warnings ?? [
        "No hay historial publico suficiente para calificar esta billetera.",
      ],
      winRate: profile?.winRate ?? null,
      wins: profile?.wins ?? null,
    } satisfies PublicWalletActivity;
  });
  return { activities, profileSummaries };
}

function mergeProfileDetails(
  activities: PublicWalletActivity[],
  profileSummaries: WalletIntelligenceSummary["profileSummaries"],
  profileActivities: PublicWalletActivity[] = [],
): PublicWalletActivity[] {
  if (!Array.isArray(profileSummaries) || profileSummaries.length === 0) {
    return activities;
  }
  const byShort = new Map(profileSummaries.map((profile) => [profile.shortAddress, profile]));
  const activityByShort = new Map(profileActivities.map((activity) => [activity.shortAddress, activity]));
  return activities.map((activity) => {
    const profile = activity.shortAddress ? byShort.get(activity.shortAddress) : undefined;
    const profileActivity = activity.shortAddress ? activityByShort.get(activity.shortAddress) : undefined;
    if (!profile) {
      return activity;
    }
    return {
      ...activity,
      closedMarkets: profile.resolvedMarketsCount ?? null,
      highlightedProfile: profileActivity?.highlightedProfile ?? false,
      historySummary: profileActivity?.historySummary ?? activity.historySummary ?? null,
      losses: profile.losses ?? null,
      marketHistory: profileActivity?.marketHistory ?? activity.marketHistory,
      profile: profile.profile ?? activity.profile ?? null,
      warnings: [...activity.warnings, ...profile.warnings],
      winRate:
        typeof profile.winRate === "number" &&
        typeof profile.wins === "number" &&
        typeof profile.losses === "number"
          ? profile.winRate
          : null,
      wins: profile.wins ?? null,
    };
  });
}

async function readRequestBody(request: Request): Promise<WalletRouteInput | null> {
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as WalletRouteInput) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const input = await readRequestBody(request);
  if (!input) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  const normalizedUrl =
    typeof input.marketUrl === "string" ? normalizePolymarketUrl(input.marketUrl) : undefined;
  if (input.marketUrl && !normalizedUrl) {
    return jsonResponse({ error: "invalid_market_url" }, 400);
  }
  const conditionId = cleanIdentifier(input.conditionId);
  const tokenIds = normalizeTokenIds(input.tokenIds);
  const thresholdUsd = Math.max(0, Math.min(normalizeNumber(input.minUsd) ?? WALLET_INTELLIGENCE_THRESHOLD_USD, 100000));
  if (!conditionId) {
    return jsonResponse(
      unavailableSummary("No hay conditionId publico suficiente para consultar billeteras de este mercado.", thresholdUsd),
    );
  }

  const [tradesPayload, positionsPayload] = await Promise.all([
    fetchDataApiJson("/trades", {
      limit: String(MAX_LIMIT),
      market: conditionId,
      offset: "0",
      takerOnly: "true",
    }),
    fetchDataApiJson("/v1/market-positions", {
      market: conditionId,
      sortBy: "TOKENS",
      sortDirection: "DESC",
      status: "OPEN",
    }),
  ]);
  const trades = parseList(tradesPayload) as PublicTrade[];
  const positions = parseMarketPositions(positionsPayload);
  const largeTrades = buildTradePositions(trades, conditionId);
  const largePositions = buildMarketPositions(positions, conditionId);
  const combined = uniqueByWalletAndSide([...largePositions, ...largeTrades]);
  const relevant = filterRelevantWallets(
    combined.map((item) => item.publicPosition),
    thresholdUsd,
  );
  const relevantActivities = combined.filter((item) =>
    relevant.some(
      (publicItem) =>
        publicItem.shortAddress === item.publicPosition.shortAddress &&
        publicItem.amountUsd === item.publicPosition.amountUsd,
    ),
  );

  if (tradesPayload === null && positionsPayload === null) {
    return jsonResponse(
      unavailableSummary("No pudimos consultar datos publicos de billeteras para este mercado.", thresholdUsd),
    );
  }
  if (relevant.length === 0) {
    const visibleActivities = combined.map((item) => item.publicActivity).slice(0, MAX_LIMIT);
    return jsonResponse({
      ...unavailableSummary("No encontramos datos publicos suficientes de billeteras para este mercado.", thresholdUsd),
      checkedAt: new Date().toISOString(),
      queryStatus: "empty",
      source: "polymarket_data",
      allActivitiesCount: combined.length,
      largePositions: largePositions.map((item) => item.publicPosition).slice(0, 10),
      largeTrades: largeTrades.map((item) => item.publicPosition).slice(0, 10),
      publicActivities: visibleActivities,
      warnings: [
        "Este analisis no usara wallets como senal fuerte.",
        tokenIds.length > 0 ? "Token ids detectados, pero sin actividad publica suficiente sobre el umbral." : "Token ids no disponibles o sin actividad suficiente.",
      ],
    });
  }

  const bias = calculateWalletSideBias(relevant, thresholdUsd);
  const profileDetails = await loadClosedPositionsForProfiles(relevantActivities);
  const profileSummaries = profileDetails.profileSummaries;
  const availableProfiles = (profileSummaries ?? []).filter((profile) => profile.profileAvailable).length;
  const publicActivities = mergeProfileDetails(
    relevantActivities.map((item) => item.publicActivity),
    profileSummaries,
    profileDetails.activities,
  );
  const enrichedPublicActivities = [...publicActivities, ...profileDetails.activities].slice(0, MAX_LIMIT);
  const observedCapitalUsd = capitalFor(relevant);
  const neutralCapitalUsd = neutralCapitalFor(relevant);
  const highlightedProfilesCount = enrichedPublicActivities.filter((activity) => activity.highlightedProfile).length;
  const historyAvailableCount = enrichedPublicActivities.filter(
    (activity) => (activity.marketHistory?.length ?? 0) > 0 || typeof activity.closedMarkets === "number",
  ).length;

  const summary: WalletIntelligenceSummary = {
    analyzedCapitalUsd: observedCapitalUsd,
    allActivitiesCount: combined.length,
    available: true,
    checkedAt: new Date().toISOString(),
    confidence: availableProfiles > 0 ? "medium" : bias.confidence === "none" ? "low" : bias.confidence,
    largePositions: filterRelevantWallets(largePositions.map((item) => item.publicPosition), thresholdUsd).slice(0, 10),
    largeTrades: filterRelevantWallets(largeTrades.map((item) => item.publicPosition), thresholdUsd).slice(0, 10),
    noCapitalUsd: bias.noCapitalUsd,
    neutralCapitalUsd,
    notableWallets: relevant.slice(0, 5),
    highlightedProfilesCount,
    historyAvailableCount,
    expandedAnalysis: {
      consistencyWarnings: [],
      highlightedProfilesCount,
      historyAvailableCount,
      largeMarket: false,
      profileCount: availableProfiles,
    },
    profileSummaries,
    publicActivities: enrichedPublicActivities,
    queryStatus: "found",
    reason:
      "Actividad publica de billeteras detectada para este mercado desde Polymarket Data API. Es una senal auxiliar, no una decision final.",
    relevantWalletsCount: relevant.length,
    signalDirection: bias.direction,
    source: "polymarket_data",
    thresholdUsd,
    topWallets: relevant.slice(0, 5),
    warnings: [
      "Las direcciones completas solo se muestran dentro del detalle de billeteras porque son datos publicos de wallet.",
      "No se identifica a personas reales detras de wallets publicas.",
      availableProfiles > 0
        ? "Hay historial cerrado publico para algunas billeteras, aun asi no basta por si solo para una prediccion."
        : "No hay historial publico suficiente para calificar estas billeteras.",
      "La actividad de wallets no es una instruccion operativa.",
    ],
    yesCapitalUsd: bias.yesCapitalUsd,
  };
  return jsonResponse(summary);
}

export function GET(): Response {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}
