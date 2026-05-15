import type {
  ExternalOddsComparison,
  ExternalOddsCompareInput,
  ExternalOddsProviderConfig,
} from "./externalOddsTypes";
import { fetchOddsBlazeComparison } from "./oddsProviders/oddsBlaze";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

export function getExternalOddsProviderConfig(): ExternalOddsProviderConfig & { apiKey?: string | null } {
  const authMode = cleanText(process.env.ODDS_PROVIDER_AUTH_MODE).toLowerCase();
  return {
    apiKey: cleanText(process.env.ODDS_PROVIDER_API_KEY) || null,
    authMode: authMode === "query" ? "query" : "query",
    baseUrl: cleanText(process.env.ODDS_PROVIDER_BASE_URL) || "https://odds.oddsblaze.com/",
    enabled: toBoolean(process.env.ODDS_PROVIDER_ENABLED, false),
    league: cleanText(process.env.ODDS_PROVIDER_LEAGUE) || "nba",
    name: cleanText(process.env.ODDS_PROVIDER_NAME) || "OddsBlaze",
    sportsbook: cleanText(process.env.ODDS_PROVIDER_SPORTSBOOK) || "draftkings",
    timeoutMs: toInteger(process.env.ODDS_PROVIDER_TIMEOUT_MS, 10_000),
    trialMode: toBoolean(process.env.ODDS_PROVIDER_TRIAL_MODE, true),
  };
}

export function buildOddsBlazeRequestUrl(
  input: ExternalOddsCompareInput,
  config = getExternalOddsProviderConfig(),
): URL {
  const url = new URL(config.baseUrl);
  if (config.apiKey) {
    url.searchParams.set("key", config.apiKey);
  }
  url.searchParams.set("sportsbook", config.sportsbook);
  url.searchParams.set("league", cleanText(input.league) || config.league);
  url.searchParams.set("market", "moneyline");
  url.searchParams.set("price", "probability");
  url.searchParams.set("main", "true");
  url.searchParams.set("live", "false");
  return url;
}

export async function compareExternalOdds(
  input: ExternalOddsCompareInput,
): Promise<ExternalOddsComparison> {
  const config = getExternalOddsProviderConfig();
  const requestUrl = buildOddsBlazeRequestUrl(input, config);
  return fetchOddsBlazeComparison(input, {
    ...config,
    requestUrl,
  });
}
