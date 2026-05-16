import type {
  ExternalOddsComparison,
  ExternalOddsCompareInput,
  ExternalOddsProviderConfig,
} from "./externalOddsTypes";
import { fetchOddsBlazeComparison } from "./oddsProviders/oddsBlaze";

type OddsBlazeQueryVariant = {
  live?: boolean;
  main?: boolean;
  market?: string | null;
  name: string;
};

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
  variant: OddsBlazeQueryVariant = { live: false, main: true, market: "moneyline", name: "primary" },
): URL {
  const url = new URL(config.baseUrl);
  if (config.apiKey) {
    url.searchParams.set("key", config.apiKey);
  }
  url.searchParams.set("sportsbook", config.sportsbook);
  url.searchParams.set("league", cleanText(input.league) || config.league);
  url.searchParams.set("price", "probability");
  if (variant.market) {
    url.searchParams.set("market", variant.market);
  }
  if (typeof variant.main === "boolean") {
    url.searchParams.set("main", variant.main ? "true" : "false");
  }
  if (typeof variant.live === "boolean") {
    url.searchParams.set("live", variant.live ? "true" : "false");
  }
  return url;
}

function oddsBlazeQueryVariants(): OddsBlazeQueryVariant[] {
  return [
    { live: false, main: true, market: "moneyline", name: "primary" },
    { live: false, market: "moneyline", name: "without_main" },
    { main: true, market: "moneyline", name: "without_live" },
    { name: "base_league_only" },
  ];
}

function mergeAttemptMetadata(
  result: ExternalOddsComparison,
  variantsAttempted: string[],
  matchedVariant?: string | null,
): ExternalOddsComparison {
  const attempted = Array.from(new Set(variantsAttempted.filter(Boolean)));
  return {
    ...result,
    attemptedQueries: attempted.length,
    attemptedQueryVariants: attempted,
    matchedQueryVariant: matchedVariant ?? result.matchedQueryVariant ?? null,
  };
}

function unionReasons(results: ExternalOddsComparison[]): string[] {
  return Array.from(
    new Set(
      results.flatMap((result) => result.noMatchReasons ?? []).filter((value): value is string => value.length > 0),
    ),
  );
}

function unionWarnings(results: ExternalOddsComparison[]): string[] {
  return Array.from(
    new Set(results.flatMap((result) => result.warnings ?? []).filter((value): value is string => value.length > 0)),
  );
}

function mergeLimitations(results: ExternalOddsComparison[], attempted: string[]): string[] {
  const collected = Array.from(
    new Set(
      results.flatMap((result) => result.limitations ?? []).filter((value): value is string => value.trim().length > 0),
    ),
  );
  const variantSummary =
    attempted.length > 1
      ? `OddsBlaze no devolvio evento comparable tras ${attempted.length} consultas seguras: ${attempted.join(", ")}.`
      : null;
  return [variantSummary, ...collected].filter((value): value is string => Boolean(value));
}

export async function compareExternalOdds(
  input: ExternalOddsCompareInput,
): Promise<ExternalOddsComparison> {
  const config = getExternalOddsProviderConfig();
  const variants = oddsBlazeQueryVariants();
  const attemptedVariantNames: string[] = [];
  const seenRequestKeys = new Set<string>();
  const results: ExternalOddsComparison[] = [];

  for (const variant of variants) {
    const requestUrl = buildOddsBlazeRequestUrl(input, config, variant);
    const requestKey = requestUrl.toString().replace(/([?&])key=[^&]+/i, "$1key=redacted");
    if (seenRequestKeys.has(requestKey)) {
      continue;
    }
    seenRequestKeys.add(requestKey);
    attemptedVariantNames.push(variant.name);

    const result = await fetchOddsBlazeComparison(input, {
      ...config,
      queryVariantName: variant.name,
      requestUrl,
    });
    results.push(result);

    if (result.status === "available" && result.matchedMarket) {
      return mergeAttemptMetadata(result, attemptedVariantNames, variant.name);
    }
    if (result.status === "timeout" || result.status === "error") {
      return mergeAttemptMetadata(result, attemptedVariantNames, null);
    }
  }

  const bestFallback =
    results.find((result) => result.status === "partial") ||
    results.find((result) => result.status === "no_match") ||
    results[0];

  if (!bestFallback) {
    return {
      attemptedQueries: 0,
      attemptedQueryVariants: [],
      bestSourceUrl: null,
      checkedAt: new Date().toISOString(),
      eventName: null,
      eventStartTime: null,
      league: cleanText(input.league) || config.league,
      limitations: ["No fue posible construir una consulta segura para el proveedor de odds."],
      matchConfidence: "unknown",
      matchedQueryVariant: null,
      matchedMarket: false,
      noMatchReasons: ["sportsbook_no_coverage"],
      outcomes: [],
      providerName: config.name,
      sportsbook: config.sportsbook,
      status: "error",
      warnings: ["odds_provider_query_build_failed"],
    };
  }

  return {
    ...mergeAttemptMetadata(bestFallback, attemptedVariantNames, null),
    limitations: mergeLimitations(results, attemptedVariantNames),
    noMatchReasons: unionReasons(results),
    warnings: unionWarnings(results),
  };
}
