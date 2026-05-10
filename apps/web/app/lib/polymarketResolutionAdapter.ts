import { extractPolymarketSlug, normalizePolymarketUrl } from "./polymarketLink";

export type ExternalMarketOutcome = "CANCELLED" | "NO" | "OPEN" | "UNKNOWN" | "YES";
export type ExternalResolutionSource = "clob" | "gamma" | "polymarket" | "polysignal" | "unknown";
export type ExternalResolutionStatus = "cancelled" | "open" | "resolved" | "unknown";

export type ExternalResolutionLookupInput = {
  conditionId?: string;
  eventSlug?: string;
  marketId?: string;
  marketSlug?: string;
  remoteId?: string;
  url?: string;
};

export type ExternalResolutionLookupResult = {
  checkedAt: string;
  confidence: "high" | "low" | "medium";
  outcome: ExternalMarketOutcome;
  reason: string;
  resolvedAt?: string;
  source: ExternalResolutionSource;
  status: ExternalResolutionStatus;
};

export type ExternalResolutionRequest =
  | {
      eventSlug: string;
      marketSlug?: string;
      remoteId?: string;
      url: string;
    }
  | { reason: string; url: null };

type GammaEventPayload = Record<string, unknown> & {
  markets?: unknown;
  slug?: string | null;
};

type GammaMarketPayload = Record<string, unknown> & {
  active?: boolean | null;
  closed?: boolean | null;
  id?: string | number | null;
  slug?: string | null;
};

const GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events";
const GAMMA_HOST = "gamma-api.polymarket.com";
const MAX_EXTERNAL_RESPONSE_BYTES = 256_000;
const RESOLUTION_TIMEOUT_MS = 4_500;

function checkedAt(): string {
  return new Date().toISOString();
}

function unknown(reason: string, confidence: "high" | "low" | "medium" = "low"): ExternalResolutionLookupResult {
  return {
    checkedAt: checkedAt(),
    confidence,
    outcome: "UNKNOWN",
    reason,
    source: "unknown",
    status: "unknown",
  };
}

function open(reason = "El mercado sigue abierto."): ExternalResolutionLookupResult {
  return {
    checkedAt: checkedAt(),
    confidence: "medium",
    outcome: "OPEN",
    reason,
    source: "gamma",
    status: "open",
  };
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function cleanIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const cleaned = String(value).trim();
  if (!cleaned || cleaned.length > 160 || /[^a-zA-Z0-9_-]/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
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

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOutcomeLabel(value: unknown): ExternalMarketOutcome {
  const normalized = stringValue(value)?.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "YES") {
    return "YES";
  }
  if (normalized === "NO") {
    return "NO";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED" || normalized === "INVALID" || normalized === "VOID") {
    return "CANCELLED";
  }
  return "UNKNOWN";
}

function resolutionStatusText(market: GammaMarketPayload): string {
  return [
    market.umaResolutionStatus,
    market.umaResolutionStatuses,
    market.resolutionStatus,
    market.status,
  ]
    .map((value) => (typeof value === "string" ? value : Array.isArray(value) ? value.join(" ") : ""))
    .join(" ")
    .toLowerCase();
}

function isCancelledMarket(market: GammaMarketPayload): boolean {
  const text = resolutionStatusText(market);
  return text.includes("cancel") || text.includes("invalid") || text.includes("void");
}

function isResolvedByGamma(market: GammaMarketPayload): boolean {
  const text = resolutionStatusText(market);
  return (
    market.closed === true &&
    (market.automaticallyResolved === true ||
      text.includes("resolved") ||
      text.includes("final") ||
      text.includes("settled"))
  );
}

function extractResolvedAt(market: GammaMarketPayload): string | undefined {
  return (
    stringValue(market.closedTime) ||
    stringValue(market.closed_time) ||
    stringValue(market.resolvedAt) ||
    stringValue(market.resolved_at) ||
    stringValue(market.umaEndDate) ||
    stringValue(market.endDate) ||
    undefined
  );
}

function inferOutcomeFromFinalPrices(market: GammaMarketPayload): ExternalMarketOutcome {
  const outcomes = parseJsonList(market.outcomes);
  const prices = parseJsonList(market.outcomePrices ?? market.outcome_prices);
  if (outcomes.length < 2 || outcomes.length !== prices.length) {
    return "UNKNOWN";
  }

  const parsedPrices = prices.map(numberValue);
  if (parsedPrices.some((price) => price === null)) {
    return "UNKNOWN";
  }
  const numericPrices = parsedPrices as number[];
  const winnerIndex = numericPrices.reduce(
    (bestIndex, price, index) => ((price ?? 0) > (numericPrices[bestIndex] ?? 0) ? index : bestIndex),
    0,
  );
  const winnerPrice = numericPrices[winnerIndex] ?? 0;
  const otherPrices = numericPrices.filter((_, index) => index !== winnerIndex).map((price) => price ?? 0);
  if (winnerPrice < 0.99 || otherPrices.some((price) => price > 0.01)) {
    return "UNKNOWN";
  }
  return normalizeOutcomeLabel(outcomes[winnerIndex]);
}

function resolveGammaMarket(market: GammaMarketPayload): ExternalResolutionLookupResult {
  if (isCancelledMarket(market)) {
    return {
      checkedAt: checkedAt(),
      confidence: "high",
      outcome: "CANCELLED",
      reason: "El mercado figura como cancelado o invalido en Polymarket.",
      resolvedAt: extractResolvedAt(market),
      source: "gamma",
      status: "cancelled",
    };
  }

  const winner = normalizeOutcomeLabel(
    market.winningOutcome ?? market.winning_outcome ?? market.winner ?? market.outcome ?? market.result,
  );
  if (isResolvedByGamma(market) && (winner === "YES" || winner === "NO")) {
    return {
      checkedAt: checkedAt(),
      confidence: "high",
      outcome: winner,
      reason: `El mercado fue resuelto como ${winner} en Polymarket.`,
      resolvedAt: extractResolvedAt(market),
      source: "gamma",
      status: "resolved",
    };
  }

  if (isResolvedByGamma(market)) {
    const inferred = inferOutcomeFromFinalPrices(market);
    if (inferred === "YES" || inferred === "NO") {
      return {
        checkedAt: checkedAt(),
        confidence: "high",
        outcome: inferred,
        reason: `El mercado fue resuelto como ${inferred} en Polymarket.`,
        resolvedAt: extractResolvedAt(market),
        source: "gamma",
        status: "resolved",
      };
    }
    return {
      checkedAt: checkedAt(),
      confidence: "low",
      outcome: "UNKNOWN",
      reason: "El mercado parece cerrado, pero Polymarket no expone un resultado final confiable todavia.",
      resolvedAt: extractResolvedAt(market),
      source: "gamma",
      status: "unknown",
    };
  }

  if (market.closed === false || market.active === true) {
    return open();
  }

  if (market.closed === true || market.active === false) {
    return {
      checkedAt: checkedAt(),
      confidence: "low",
      outcome: "UNKNOWN",
      reason: "El mercado parece cerrado, pero el resultado final no esta disponible todavia.",
      resolvedAt: extractResolvedAt(market),
      source: "gamma",
      status: "unknown",
    };
  }

  return unknown("No encontramos estado suficiente para verificar este mercado.");
}

export function buildExternalResolutionRequest(input: ExternalResolutionLookupInput): ExternalResolutionRequest {
  const normalizedUrl = input.url ? normalizePolymarketUrl(input.url) : null;
  const parsedUrl = normalizedUrl ? new URL(normalizedUrl) : null;
  const segments = parsedUrl?.pathname.split("/").filter(Boolean) ?? [];
  const prefix = segments[0];
  const urlSlug = normalizedUrl ? extractPolymarketSlug(normalizedUrl) : null;
  const eventSlug = normalizeSlug(input.eventSlug) || (prefix === "event" ? normalizeSlug(urlSlug) : null);
  const marketSlug = normalizeSlug(input.marketSlug) || (prefix === "market" ? normalizeSlug(urlSlug) : null);
  const remoteId = cleanIdentifier(input.remoteId || input.marketId);

  if (!normalizedUrl && !eventSlug) {
    return { reason: "Falta un enlace o event slug de Polymarket valido.", url: null };
  }
  if (!eventSlug) {
    return {
      reason: "Solo podemos consultar Polymarket de forma estructurada cuando conocemos el evento.",
      url: null,
    };
  }

  const requestUrl = new URL(GAMMA_EVENTS_URL);
  requestUrl.searchParams.set("slug", eventSlug);
  if (requestUrl.protocol !== "https:" || requestUrl.hostname !== GAMMA_HOST || requestUrl.username || requestUrl.password || requestUrl.port) {
    return { reason: "La fuente de resolucion no esta permitida.", url: null };
  }

  return {
    eventSlug,
    marketSlug: marketSlug || undefined,
    remoteId,
    url: requestUrl.toString(),
  };
}

function selectEvent(payload: unknown, eventSlug: string): GammaEventPayload | null {
  const events = Array.isArray(payload) ? payload : [];
  return (
    events.find(
      (event): event is GammaEventPayload =>
        Boolean(event) &&
        typeof event === "object" &&
        normalizeSlug((event as GammaEventPayload).slug) === eventSlug,
    ) ?? null
  );
}

function selectMarket(event: GammaEventPayload, input: ExternalResolutionRequest & { url: string }): GammaMarketPayload | null {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const marketCandidates = markets.filter(
    (market): market is GammaMarketPayload => Boolean(market) && typeof market === "object",
  );
  if (input.remoteId) {
    const byId = marketCandidates.find((market) => String(market.id ?? "") === input.remoteId);
    if (byId) {
      return byId;
    }
  }
  if (input.marketSlug) {
    const bySlug = marketCandidates.find((market) => normalizeSlug(market.slug) === input.marketSlug);
    if (bySlug) {
      return bySlug;
    }
  }
  return marketCandidates.length === 1 ? marketCandidates[0] : null;
}

export async function lookupExternalPolymarketResolution(
  input: ExternalResolutionLookupInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalResolutionLookupResult> {
  const request = buildExternalResolutionRequest(input);
  if (request.url === null) {
    return unknown(request.reason);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
  try {
    const response = await fetchImpl(request.url, {
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
      return unknown("No pudimos consultar Polymarket ahora.");
    }
    const text = await response.text();
    if (text.length > MAX_EXTERNAL_RESPONSE_BYTES) {
      return unknown("La respuesta de Polymarket fue demasiado grande para verificar con seguridad.");
    }
    const payload = JSON.parse(text) as unknown;
    const event = selectEvent(payload, request.eventSlug);
    if (!event) {
      return unknown("No encontramos este evento en Polymarket.");
    }
    const market = selectMarket(event, request);
    if (!market) {
      return unknown("No encontramos una coincidencia de mercado suficientemente confiable en Polymarket.");
    }
    return resolveGammaMarket(market);
  } catch {
    return unknown("No pudimos verificar este mercado con Polymarket todavia.");
  } finally {
    clearTimeout(timer);
  }
}
