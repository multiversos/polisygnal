export type PolymarketLinkValidation = {
  message: string;
  normalizedUrl: string | null;
  ok: boolean;
};

const ALLOWED_HOSTS = new Set(["polymarket.com", "www.polymarket.com"]);
const BLOCKED_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "169.254.169.254", "localhost"]);
const MAX_POLYMARKET_URL_LENGTH = 2048;
const POLYMARKET_PATH_PREFIXES = ["/event/", "/market/", "/sports/"];
const STOP_WORDS = new Set([
  "and",
  "at",
  "de",
  "el",
  "en",
  "event",
  "fc",
  "market",
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

export function extractPolymarketSlug(input: string): string | null {
  const normalized = normalizePolymarketUrl(input);
  if (!normalized) {
    return null;
  }
  const parsed = new URL(normalized);
  const segments = parsed.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const knownPrefixIndex = segments.findIndex((segment) =>
    ["event", "market", "sports"].includes(segment),
  );
  if (knownPrefixIndex >= 0 && segments[knownPrefixIndex + 1]) {
    return segments.slice(knownPrefixIndex + 1).join("-");
  }
  return segments.at(-1) ?? null;
}

export function extractPossibleMarketTerms(input: string): string[] {
  const slug = extractPolymarketSlug(input);
  if (!slug) {
    return [];
  }
  const words = slug
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return Array.from(new Set(words));
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
  const pathname = new URL(normalized).pathname;
  if (!POLYMARKET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
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
