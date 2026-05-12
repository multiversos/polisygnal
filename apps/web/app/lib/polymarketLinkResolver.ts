import type { MarketOverviewItem, MarketOverviewOutcome } from "./marketOverview";
import { normalizePolymarketUrl, parsePolymarketLink } from "./polymarketLink";

export type ResolvedOutcomeSide = "DRAW" | "NO" | "UNKNOWN" | "YES";

export type PolymarketLinkResolveInput = {
  url: string;
};

export type PolymarketResolvedOutcome = {
  label: string;
  price?: number | undefined;
  side?: ResolvedOutcomeSide | undefined;
  tokenId?: string | undefined;
};

export type PolymarketResolvedMarket = {
  active?: boolean | undefined;
  closeTime?: string | undefined;
  closed?: boolean | undefined;
  conditionId?: string | undefined;
  eventSlug?: string | undefined;
  id?: string | undefined;
  liquidity?: number | undefined;
  outcomes: PolymarketResolvedOutcome[];
  question: string;
  remoteId?: string | undefined;
  slug?: string | undefined;
  volume?: number | undefined;
};

export type PolymarketLinkResolveResult = {
  category?: string;
  checkedAt: string;
  event?: {
    category?: string;
    league?: string;
    slug?: string;
    sport?: string;
    startTime?: string;
    title?: string;
  };
  eventSlug?: string;
  league?: string;
  marketSlug?: string;
  markets: PolymarketResolvedMarket[];
  normalizedUrl: string;
  source: "clob" | "gamma" | "polymarket" | "unknown";
  sport?: string;
  status: "error" | "not_found" | "ok" | "unsupported";
  warnings: string[];
};

type GammaEventPayload = Record<string, unknown> & {
  active?: boolean | null;
  closed?: boolean | null;
  endDate?: string | null;
  eventDate?: string | null;
  markets?: unknown;
  slug?: string | null;
  startTime?: string | null;
  tags?: unknown;
  title?: string | null;
};

type GammaMarketPayload = Record<string, unknown> & {
  active?: boolean | null;
  closed?: boolean | null;
  conditionId?: string | null;
  endDate?: string | null;
  id?: string | number | null;
  liquidity?: string | number | null;
  liquidityNum?: string | number | null;
  outcomes?: unknown;
  outcomePrices?: unknown;
  question?: string | null;
  slug?: string | null;
  volume?: string | number | null;
  volumeNum?: string | number | null;
};

const GAMMA_HOST = "gamma-api.polymarket.com";
const GAMMA_EVENTS_URL = `https://${GAMMA_HOST}/events`;
const GAMMA_MARKETS_URL = `https://${GAMMA_HOST}/markets`;
const LINK_RESOLVE_TIMEOUT_MS = 4_500;
const MAX_GAMMA_RESPONSE_BYTES = 512_000;
const MAX_RESOLVED_MARKETS = 50;

function checkedAt(): string {
  return new Date().toISOString();
}

function resultBase(inputUrl: string): Pick<PolymarketLinkResolveResult, "checkedAt" | "markets" | "normalizedUrl" | "warnings"> {
  return {
    checkedAt: checkedAt(),
    markets: [],
    normalizedUrl: normalizePolymarketUrl(inputUrl) ?? "",
    warnings: [],
  };
}

function unsupported(inputUrl: string, reason: string): PolymarketLinkResolveResult {
  return {
    ...resultBase(inputUrl),
    source: "unknown",
    status: "unsupported",
    warnings: [reason],
  };
}

function notFound(inputUrl: string, reason: string): PolymarketLinkResolveResult {
  return {
    ...resultBase(inputUrl),
    source: "gamma",
    status: "not_found",
    warnings: [reason],
  };
}

function errorResult(inputUrl: string): PolymarketLinkResolveResult {
  return {
    ...resultBase(inputUrl),
    source: "unknown",
    status: "error",
    warnings: ["No pudimos consultar Polymarket ahora."],
  };
}

function normalizeSlug(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseJsonList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cleanIdentifier(value: unknown): string | undefined {
  const cleaned = stringValue(value);
  if (!cleaned || cleaned.length > 180 || /[^a-zA-Z0-9_.:-]/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function outcomeSide(label: string): ResolvedOutcomeSide {
  const normalized = label.trim().toLowerCase();
  if (normalized === "yes" || normalized === "si") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  if (normalized === "draw" || normalized === "empate") {
    return "DRAW";
  }
  return "UNKNOWN";
}

function normalizeOutcomes(market: GammaMarketPayload): PolymarketResolvedOutcome[] {
  const labels = parseJsonList(market.outcomes).map(stringValue).filter((item): item is string => Boolean(item));
  const prices = parseJsonList(market.outcomePrices ?? market.outcome_prices).map(numberValue);
  const tokenIds = parseJsonList(market.clobTokenIds ?? market.clob_token_ids).map(stringValue);
  const outcomes = labels.map((label, index) => ({
    label,
    price: prices[index],
    side: outcomeSide(label),
    tokenId: tokenIds[index],
  }));
  if (outcomes.length > 0) {
    return outcomes;
  }

  const tokens = parseJsonList(market.outcomeTokens ?? market.outcome_tokens ?? market.tokens);
  const tokenOutcomes: PolymarketResolvedOutcome[] = [];
  for (const token of tokens) {
    if (!token || typeof token !== "object") {
      continue;
    }
    const record = token as Record<string, unknown>;
    const label = stringValue(record.outcome ?? record.name ?? record.label);
    if (!label) {
      continue;
    }
    tokenOutcomes.push({
      label,
      price: numberValue(record.price),
      side: outcomeSide(label),
      tokenId: stringValue(record.token_id ?? record.tokenId ?? record.id),
    });
  }
  return tokenOutcomes;
}

function yesNoPrice(outcomes: PolymarketResolvedOutcome[], side: "NO" | "YES"): number | undefined {
  return outcomes.find((outcome) => outcome.side === side)?.price;
}

function normalizeMarket(
  market: GammaMarketPayload,
  event: GammaEventPayload | null,
  fallbackEventSlug?: string,
): PolymarketResolvedMarket | null {
  const question = stringValue(market.question ?? market.title ?? event?.title);
  if (!question) {
    return null;
  }
  const outcomes = normalizeOutcomes(market);
  return {
    active: boolValue(market.active),
    closeTime: stringValue(market.endDate ?? market.end_date ?? market.closeTime ?? market.close_time ?? event?.endDate),
    closed: boolValue(market.closed),
    conditionId: cleanIdentifier(market.conditionId ?? market.condition_id),
    eventSlug: normalizeSlug(market.eventSlug ?? market.event_slug ?? event?.slug ?? fallbackEventSlug),
    id: cleanIdentifier(market.id),
    liquidity: numberValue(market.liquidityNum ?? market.liquidityClob ?? market.liquidity),
    outcomes,
    question,
    remoteId: cleanIdentifier(market.id ?? market.remoteId ?? market.remote_id),
    slug: normalizeSlug(market.slug),
    volume: numberValue(market.volumeNum ?? market.volumeClob ?? market.volume),
  };
}

function normalizeEvents(payload: unknown): GammaEventPayload[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is GammaEventPayload => Boolean(item) && typeof item === "object");
  }
  if (payload && typeof payload === "object") {
    return [payload as GammaEventPayload];
  }
  return [];
}

function normalizeMarkets(payload: unknown): GammaMarketPayload[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is GammaMarketPayload => Boolean(item) && typeof item === "object");
  }
  if (payload && typeof payload === "object") {
    return [payload as GammaMarketPayload];
  }
  return [];
}

function selectEvent(events: GammaEventPayload[], slug?: string): GammaEventPayload | null {
  if (!slug) {
    return events[0] ?? null;
  }
  return events.find((event) => normalizeSlug(event.slug) === slug) ?? null;
}

function marketEvent(market: GammaMarketPayload): GammaEventPayload | null {
  const events = parseJsonList(market.events);
  const first = events.find((item) => item && typeof item === "object");
  if (first) {
    return first as GammaEventPayload;
  }
  const event = market.event;
  return event && typeof event === "object" ? (event as GammaEventPayload) : null;
}

function eventLeague(event: GammaEventPayload | null, fallback?: string): string | undefined {
  const tags = parseJsonList(event?.tags);
  const labels = tags
    .map((tag) => (tag && typeof tag === "object" ? stringValue((tag as Record<string, unknown>).label) : undefined))
    .filter((label): label is string => Boolean(label));
  const nonGeneric = labels.find((label) => !["Sports", "Games", "Soccer", "Basketball"].includes(label));
  return nonGeneric ?? fallback;
}

function eventSport(event: GammaEventPayload | null, fallback?: string): string | undefined {
  const tags = parseJsonList(event?.tags);
  const labels = tags
    .map((tag) => (tag && typeof tag === "object" ? stringValue((tag as Record<string, unknown>).slug) : undefined))
    .filter((label): label is string => Boolean(label));
  if (labels.includes("soccer")) {
    return "soccer";
  }
  if (labels.includes("basketball") || labels.includes("nba")) {
    return "nba";
  }
  return fallback;
}

function safeGammaUrl(base: string, slug: string): string | null {
  const url = new URL(base);
  url.searchParams.set("slug", slug);
  if (
    url.protocol !== "https:" ||
    url.hostname !== GAMMA_HOST ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null;
  }
  return url.toString();
}

async function fetchGammaJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== GAMMA_HOST || parsed.username || parsed.password || parsed.port) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_RESOLVE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "User-Agent": "PolySignal/0.1",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    if (text.length > MAX_GAMMA_RESPONSE_BYTES) {
      return null;
    }
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveEvent(
  inputUrl: string,
  eventSlug: string,
  fetchImpl: typeof fetch,
): Promise<PolymarketLinkResolveResult> {
  const requestUrl = safeGammaUrl(GAMMA_EVENTS_URL, eventSlug);
  if (!requestUrl) {
    return unsupported(inputUrl, "La fuente estructurada de Polymarket no esta permitida.");
  }
  const payload = await fetchGammaJson(requestUrl, fetchImpl);
  if (!payload) {
    return errorResult(inputUrl);
  }
  const event = selectEvent(normalizeEvents(payload), eventSlug);
  if (!event) {
    return notFound(inputUrl, "No pudimos obtener este mercado desde Polymarket.");
  }
  const markets = normalizeMarkets(event.markets)
    .map((market) => normalizeMarket(market, event, eventSlug))
    .filter((market): market is PolymarketResolvedMarket => Boolean(market))
    .slice(0, MAX_RESOLVED_MARKETS);
  if (markets.length === 0) {
    return notFound(inputUrl, "Polymarket devolvio el evento sin mercados analizables.");
  }
  const linkInfo = parsePolymarketLink(inputUrl);
  const sport = eventSport(event, linkInfo?.sportOrLeague);
  const league = eventLeague(event, linkInfo?.sportOrLeague);
  return {
    category: linkInfo?.category,
    checkedAt: checkedAt(),
    event: {
      category: linkInfo?.category,
      league,
      slug: normalizeSlug(event.slug) ?? eventSlug,
      sport,
      startTime: stringValue(event.startTime ?? event.eventDate ?? event.endDate),
      title: stringValue(event.title),
    },
    eventSlug,
    league,
    markets,
    normalizedUrl: normalizePolymarketUrl(inputUrl) ?? inputUrl,
    source: "gamma",
    sport,
    status: "ok",
    warnings: [],
  };
}

async function resolveMarket(
  inputUrl: string,
  marketSlug: string,
  fetchImpl: typeof fetch,
): Promise<PolymarketLinkResolveResult> {
  const requestUrl = safeGammaUrl(GAMMA_MARKETS_URL, marketSlug);
  if (!requestUrl) {
    return unsupported(inputUrl, "La fuente estructurada de Polymarket no esta permitida.");
  }
  const payload = await fetchGammaJson(requestUrl, fetchImpl);
  if (!payload) {
    return errorResult(inputUrl);
  }
  const marketPayload = normalizeMarkets(payload).find((market) => normalizeSlug(market.slug) === marketSlug);
  if (!marketPayload) {
    return notFound(inputUrl, "No pudimos obtener este mercado desde Polymarket.");
  }
  const event = marketEvent(marketPayload);
  const eventSlug = normalizeSlug(event?.slug ?? marketPayload.eventSlug ?? marketPayload.event_slug);
  const market = normalizeMarket(marketPayload, event, eventSlug);
  if (!market) {
    return notFound(inputUrl, "Polymarket no devolvio un mercado analizable.");
  }
  const linkInfo = parsePolymarketLink(inputUrl);
  const sport = eventSport(event, linkInfo?.sportOrLeague);
  const league = eventLeague(event, linkInfo?.sportOrLeague);
  return {
    category: linkInfo?.category,
    checkedAt: checkedAt(),
    event: event
      ? {
          category: linkInfo?.category,
          league,
          slug: eventSlug,
          sport,
          startTime: stringValue(event.startTime ?? event.eventDate ?? event.endDate),
          title: stringValue(event.title),
        }
      : undefined,
    eventSlug,
    league,
    marketSlug,
    markets: [market],
    normalizedUrl: normalizePolymarketUrl(inputUrl) ?? inputUrl,
    source: "gamma",
    sport,
    status: "ok",
    warnings: [],
  };
}

export async function resolvePolymarketLink(
  input: PolymarketLinkResolveInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PolymarketLinkResolveResult> {
  const normalizedUrl = normalizePolymarketUrl(input.url);
  if (!normalizedUrl) {
    return unsupported(input.url, "Por ahora solo aceptamos enlaces seguros de Polymarket.");
  }
  const linkInfo = parsePolymarketLink(normalizedUrl);
  if (!linkInfo?.rawSlug) {
    return unsupported(normalizedUrl, "Este tipo de enlace todavia no esta soportado.");
  }
  if (linkInfo.marketSlug) {
    return resolveMarket(normalizedUrl, linkInfo.marketSlug, fetchImpl);
  }
  if (linkInfo.eventSlug) {
    return resolveEvent(normalizedUrl, linkInfo.eventSlug, fetchImpl);
  }
  return unsupported(normalizedUrl, "Este tipo de enlace todavia no esta soportado.");
}

export function resolvedMarketToOverviewItem(
  result: PolymarketLinkResolveResult,
  market: PolymarketResolvedMarket,
): MarketOverviewItem {
  const yesPrice = yesNoPrice(market.outcomes, "YES");
  const noPrice = yesNoPrice(market.outcomes, "NO");
  const outcomes: MarketOverviewOutcome[] = market.outcomes.map((outcome) => ({
    label: outcome.label,
    price: outcome.price,
    side: outcome.side,
    token_id: outcome.tokenId,
  }));
  return {
    latest_prediction: null,
    latest_snapshot: {
      captured_at: result.checkedAt,
      liquidity: market.liquidity,
      no_price: noPrice,
      volume: market.volume,
      yes_price: yesPrice,
    },
    market: {
      active: market.active,
      close_time: market.closeTime ?? result.event?.startTime ?? null,
      closed: market.closed,
      condition_id: market.conditionId,
      end_date: market.closeTime ?? result.event?.startTime ?? null,
      event_slug: market.eventSlug ?? result.eventSlug ?? null,
      event_title: result.event?.title ?? market.question,
      market_slug: market.slug ?? null,
      outcomes,
      question: market.question,
      remote_id: market.remoteId ?? market.id ?? null,
      sport_type: result.sport ?? result.league ?? result.category ?? null,
      source: result.source,
    },
  };
}
