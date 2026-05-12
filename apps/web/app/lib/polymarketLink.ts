export type PolymarketLinkValidation = {
  message: string;
  normalizedUrl: string | null;
  ok: boolean;
};

export type PolymarketLinkInfo = {
  category?: string;
  dateFromSlug?: string;
  eventSlug?: string;
  locale?: string;
  marketSlug?: string;
  normalizedUrl: string;
  pathSegments: string[];
  possibleTeamCodes: string[];
  rawSlug?: string;
  searchTerms: string[];
  sportOrLeague?: string;
};

const ALLOWED_HOSTS = new Set(["polymarket.com", "www.polymarket.com"]);
const BLOCKED_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "169.254.169.254", "localhost"]);
const MAX_POLYMARKET_URL_LENGTH = 2048;
const KNOWN_POLYMARKET_CATEGORIES = new Set(["crypto", "event", "market", "markets", "politics", "sports"]);
const LOCALE_SEGMENT_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const STOP_WORDS = new Set([
  "2024",
  "2025",
  "2026",
  "2027",
  "and",
  "at",
  "de",
  "el",
  "en",
  "event",
  "fc",
  "la",
  "laliga",
  "league",
  "liga",
  "market",
  "markets",
  "on",
  "or",
  "sports",
  "the",
  "to",
  "vs",
  "will",
]);

function withProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(www\.)?polymarket\.com\//i.test(trimmed) || /^(www\.)?polymarket\.com$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function parseUrl(input: string): URL | null {
  if (input.length > MAX_POLYMARKET_URL_LENGTH) {
    return null;
  }
  try {
    return new URL(withProtocol(input));
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_HOSTS.has(normalized) || isPrivateIpv4(normalized);
}

function isSafePolymarketUrl(parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) {
    return false;
  }
  if (isBlockedHost(hostname)) {
    return false;
  }
  return ALLOWED_HOSTS.has(hostname);
}

function normalizeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitPathSegments(parsed: URL): string[] {
  return parsed.pathname
    .split("/")
    .map((segment) => normalizeSegment(decodeURIComponent(segment.trim())))
    .filter(Boolean);
}

function splitSlugWords(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function extractDateFromSlug(slug?: string): string | undefined {
  return slug?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
}

function extractTeamCodesFromSlug(slug?: string, sportOrLeague?: string): string[] {
  const date = extractDateFromSlug(slug);
  const prefix = date && slug ? slug.slice(0, slug.indexOf(date)).replace(/-+$/g, "") : slug;
  const parts = (prefix || "")
    .split("-")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => /^[a-z]{2,5}$/.test(part) && !STOP_WORDS.has(part));
  if (parts.length >= 3 && sportOrLeague) {
    const league = sportOrLeague.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (league.startsWith(parts[0]) || parts[0].startsWith(league.slice(0, 3))) {
      return Array.from(new Set(parts.slice(1, 3)));
    }
  }
  if (parts.length >= 2) {
    return Array.from(new Set(parts.slice(-2)));
  }
  return [];
}

function searchTermsFromLink(info: Pick<PolymarketLinkInfo, "dateFromSlug" | "rawSlug" | "sportOrLeague">): string[] {
  const year = info.dateFromSlug?.slice(0, 4);
  const ignored = new Set(
    [
      info.sportOrLeague,
      year,
      ...(info.dateFromSlug ? info.dateFromSlug.split("-") : []),
    ]
      .filter((item): item is string => Boolean(item))
      .map((item) => item.toLowerCase()),
  );
  const words = splitSlugWords(info.rawSlug).filter(
    (word) => word.length >= 3 && !STOP_WORDS.has(word) && !ignored.has(word),
  );
  return Array.from(new Set(words));
}

export function normalizePolymarketUrl(input: string): string | null {
  const parsed = parseUrl(input);
  if (!parsed || !isSafePolymarketUrl(parsed)) {
    return null;
  }
  parsed.protocol = "https:";
  parsed.hash = "";
  return parsed.toString();
}

export function isPolymarketUrl(input: string): boolean {
  return normalizePolymarketUrl(input) !== null;
}

export function parsePolymarketLink(input: string): PolymarketLinkInfo | null {
  const normalizedUrl = normalizePolymarketUrl(input);
  if (!normalizedUrl) {
    return null;
  }
  const parsed = new URL(normalizedUrl);
  const pathSegments = splitPathSegments(parsed);
  const locale = pathSegments[0] && LOCALE_SEGMENT_PATTERN.test(pathSegments[0]) ? pathSegments[0] : undefined;
  const categoryIndex = pathSegments.findIndex((segment) => KNOWN_POLYMARKET_CATEGORIES.has(segment));
  const category = categoryIndex >= 0 ? pathSegments[categoryIndex] : undefined;
  const afterCategory = categoryIndex >= 0 ? pathSegments.slice(categoryIndex + 1) : pathSegments.slice(locale ? 1 : 0);
  const sportOrLeague = category === "sports" ? afterCategory[0] : undefined;
  const rawSlug =
    category === "sports"
      ? afterCategory[1] ?? afterCategory[0]
      : category === "event" || category === "market" || category === "markets"
        ? afterCategory[0]
        : afterCategory.at(-1);
  const dateFromSlug = extractDateFromSlug(rawSlug);
  const eventSlug = category === "event" || category === "sports" ? rawSlug : undefined;
  const marketSlug = category === "market" || category === "markets" ? rawSlug : undefined;
  const possibleTeamCodes = extractTeamCodesFromSlug(rawSlug, sportOrLeague);
  const info = {
    category,
    dateFromSlug,
    eventSlug,
    locale,
    marketSlug,
    normalizedUrl,
    pathSegments,
    possibleTeamCodes,
    rawSlug,
    searchTerms: [] as string[],
    sportOrLeague,
  };
  return {
    ...info,
    searchTerms: searchTermsFromLink(info),
  };
}

export function extractPolymarketSlug(input: string): string | null {
  return parsePolymarketLink(input)?.rawSlug ?? null;
}

export function extractPossibleMarketTerms(input: string): string[] {
  return parsePolymarketLink(input)?.searchTerms ?? [];
}

export function getPolymarketUrlValidationMessage(input: string): PolymarketLinkValidation {
  if (!input.trim()) {
    return {
      message: "Pega un enlace de Polymarket para empezar.",
      normalizedUrl: null,
      ok: false,
    };
  }
  const parsed = parseUrl(input);
  if (!parsed) {
    return {
      message: "No pudimos leer ese enlace. Revisa que este completo.",
      normalizedUrl: null,
      ok: false,
    };
  }
  if (!isSafePolymarketUrl(parsed)) {
    return {
      message: "Por ahora solo aceptamos enlaces de Polymarket.",
      normalizedUrl: null,
      ok: false,
    };
  }
  const normalized = normalizePolymarketUrl(input);
  if (!normalized) {
    return {
      message: "No pudimos normalizar ese enlace de Polymarket.",
      normalizedUrl: null,
      ok: false,
    };
  }
  const linkInfo = parsePolymarketLink(normalized);
  if (!linkInfo?.category) {
    return {
      message: "El enlace parece de Polymarket, pero no reconocemos si es evento, mercado o deporte.",
      normalizedUrl: normalized,
      ok: true,
    };
  }
  return {
    message: "Enlace listo para comparar con los mercados cargados.",
    normalizedUrl: normalized,
    ok: true,
  };
}
