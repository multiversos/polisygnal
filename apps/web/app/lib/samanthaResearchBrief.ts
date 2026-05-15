import type { MarketOverviewItem } from "./marketOverview";
import type { ExternalOddsComparison } from "./externalOddsTypes";
import { getMarketProbabilityPair } from "./marketEstimateQuality";
import type {
  SamanthaDirection,
  SamanthaResearchBrief,
  SamanthaResearchGoal,
} from "./samanthaResearchTypes";
import { getWalletSignalSummary } from "./walletIntelligence";
import type { WalletIntelligenceSummary } from "./walletIntelligenceTypes";

type BuildSamanthaResearchBriefInput = {
  externalOddsComparison?: ExternalOddsComparison | null;
  item: MarketOverviewItem;
  normalizedUrl: string;
  url?: string;
  walletSummary?: WalletIntelligenceSummary | null;
};

const FULL_WALLET_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/;
const SECRET_MARKERS = [
  "api_key",
  "authorization:",
  "bearer ",
  "database_url=",
  "password",
  "postgres://",
  "postgresql://",
  "secret=",
  "token=",
] as const;

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() || fallback;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeSide(value: unknown): "DRAW" | "NO" | "UNKNOWN" | "YES" {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "YES" || normalized === "NO" || normalized === "DRAW") {
    return normalized;
  }
  return "UNKNOWN";
}

function normalizeWalletBias(value: WalletIntelligenceSummary["signalDirection"]): SamanthaDirection {
  if (value === "YES" || value === "NO" || value === "NEUTRAL") {
    return value;
  }
  if (value === "BOTH") {
    return "NEUTRAL";
  }
  return "UNKNOWN";
}

function normalizeSignalDirection(value: unknown): SamanthaDirection {
  if (value === "YES" || value === "NO" || value === "NEUTRAL") {
    return value;
  }
  return "UNKNOWN";
}

function uniqueGoals(goals: SamanthaResearchGoal[]): SamanthaResearchGoal[] {
  return [...new Set(goals)];
}

function urlLooksSports(url: string, sport?: string): boolean {
  return Boolean(sport) || /\/sports\//i.test(url);
}

export function getResearchGoalsForMarket(input: {
  category?: string | null;
  marketSlug?: string | null;
  sport?: string | null;
  url?: string | null;
}): SamanthaResearchGoal[] {
  const category = cleanText(input.category).toLowerCase();
  const sport = cleanText(input.sport).toLowerCase();
  const slug = cleanText(input.marketSlug).toLowerCase();
  const url = cleanText(input.url).toLowerCase();
  const goals: SamanthaResearchGoal[] = [
    "external_news",
    "official_sources",
    "reddit_social_weak_signal",
    "odds_comparison",
    "kalshi_comparison",
  ];

  if (urlLooksSports(url, sport) || category.includes("sport")) {
    goals.push("sports_context");
  }
  if (category.includes("politic") || slug.includes("election") || slug.includes("president")) {
    goals.push("political_context");
  }
  if (category.includes("crypto") || slug.includes("bitcoin") || slug.includes("ethereum")) {
    goals.push("crypto_context");
  }
  if (
    category.includes("economic") ||
    category.includes("market") ||
    slug.includes("fed") ||
    slug.includes("inflation") ||
    slug.includes("recession")
  ) {
    goals.push("economic_context");
  }
  return uniqueGoals(goals);
}

export function getSamanthaSafetyRules(): string[] {
  return [
    "Return only structured JSON matching SamanthaResearchReport version 1.0.",
    "Do not invent sources, quotes, odds, Kalshi matches, wallet data, ROI, win rate, or results.",
    "If information is not found, say it is not found and use UNKNOWN or NEUTRAL.",
    "Treat Reddit and social posts as weak signals only.",
    "Use Kalshi only when the equivalent market is clear; otherwise mark equivalent=false.",
    "Use odds only when the market, date, side, and line are comparable.",
    "Do not identify real people behind wallets and do not doxx.",
    "Do not recommend copy-trading, trading, or guaranteed profit.",
    "Do not touch Neon, databases, .env files, migrations, commands with --apply, trading, or scoring jobs.",
    "Do not include secrets, tokens, connection strings, raw HTML, or private notes.",
  ];
}

export function buildSamanthaResearchBrief(input: BuildSamanthaResearchBriefInput): SamanthaResearchBrief {
  const item = input.item;
  const market = item.market ?? {};
  const snapshot = item.latest_snapshot ?? {};
  const walletReading = getWalletSignalSummary(input.walletSummary);
  const marketProbability = getMarketProbabilityPair(item);
  const outcomes = (market.outcomes ?? [])
    .filter((outcome) => cleanText(outcome.label))
    .slice(0, 12)
    .map((outcome) => ({
      label: cleanText(outcome.label),
      price: toNumber(outcome.price),
      side: normalizeSide(outcome.side),
      tokenId: cleanText(outcome.token_id),
    }));

  const brief: SamanthaResearchBrief = {
    createdAt: new Date().toISOString(),
    knownSignals: {
      marketProbability: marketProbability
        ? {
            no: marketProbability.no,
            outcomes: outcomes.map((outcome) => ({
              label: outcome.label,
              probability: outcome.price,
            })),
            yes: marketProbability.yes,
          }
        : outcomes.some((outcome) => typeof outcome.price === "number")
          ? {
              outcomes: outcomes.map((outcome) => ({
                label: outcome.label,
                probability: outcome.price,
              })),
            }
          : undefined,
      externalOddsComparison: input.externalOddsComparison
        ? {
            checkedAt: input.externalOddsComparison.checkedAt,
            eventName: input.externalOddsComparison.eventName,
            eventStartTime: input.externalOddsComparison.eventStartTime,
            league: input.externalOddsComparison.league,
            limitations: input.externalOddsComparison.limitations.slice(0, 4),
            matchConfidence: input.externalOddsComparison.matchConfidence,
            matchedMarket: input.externalOddsComparison.matchedMarket,
            outcomes: input.externalOddsComparison.outcomes.slice(0, 4).map((outcome) => ({
              impliedProbability: outcome.impliedProbability,
              label: cleanText(outcome.label),
              priceAmerican: outcome.priceAmerican,
              priceDecimal: outcome.priceDecimal,
            })),
            providerName: cleanText(input.externalOddsComparison.providerName),
            sportsbook: cleanText(input.externalOddsComparison.sportsbook),
            status: input.externalOddsComparison.status,
            warnings: input.externalOddsComparison.warnings.slice(0, 4),
          }
        : undefined,
      walletIntelligence: {
        available: Boolean(input.walletSummary?.available),
        bias: input.walletSummary ? normalizeWalletBias(input.walletSummary.signalDirection) : "UNKNOWN",
        largePositionsCount: input.walletSummary?.largePositions?.length,
        largeTradesCount: input.walletSummary?.largeTrades?.length,
        highlightedProfilesCount: input.walletSummary?.highlightedProfilesCount,
        historyAvailableCount: input.walletSummary?.historyAvailableCount,
        neutralCapitalUsd: input.walletSummary?.neutralCapitalUsd,
        notableWalletCount: input.walletSummary?.relevantWalletsCount,
        observedActivities: (input.walletSummary?.publicActivities ?? []).slice(0, 10).map((activity) => ({
          action: cleanText(activity.action),
          amountUsd: toNumber(activity.amountUsd),
          closedMarkets: toNumber(activity.closedMarkets),
          hasPublicProfile: Boolean(activity.profile),
          hasWalletHistory: Boolean(activity.marketHistory?.length || activity.historySummary),
          outcome: cleanText(activity.outcome),
          price: toNumber(activity.price),
          shortAddress: cleanText(activity.shortAddress),
          side: normalizeSignalDirection(activity.side),
          source: cleanText(activity.source),
          tokenId: cleanText(activity.tokenId),
          type: cleanText(activity.activityType),
          winRate:
            typeof activity.winRate === "number" &&
            typeof activity.closedMarkets === "number" &&
            activity.closedMarkets >= 50
              ? activity.winRate
              : undefined,
        })),
        observedCapitalUsd: input.walletSummary?.analyzedCapitalUsd,
        noCapitalUsd: input.walletSummary?.noCapitalUsd,
        profileSummary: (input.walletSummary?.profileSummaries ?? []).slice(0, 5).map((profile) => ({
          confidence: profile.confidence,
          profileAvailable: profile.profileAvailable,
          reason: cleanText(profile.reason, "No hay historial publico suficiente para calificar esta billetera."),
          resolvedMarketsCount: profile.resolvedMarketsCount,
          shortAddress: cleanText(profile.shortAddress),
          winRate:
            typeof profile.winRate === "number" &&
            typeof profile.wins === "number" &&
            typeof profile.losses === "number"
              ? profile.winRate
              : undefined,
        })),
        walletSignalAvailable: Boolean(input.walletSummary?.available && input.walletSummary.relevantWalletsCount > 0),
        warnings: walletReading.warnings,
        yesCapitalUsd: input.walletSummary?.yesCapitalUsd,
      },
    },
    market: {
      category: cleanText(market.market_type || market.sport_type) || undefined,
      conditionId: market.condition_id ?? undefined,
      eventDate: market.close_time ?? market.end_date ?? undefined,
      eventSlug: market.event_slug ?? undefined,
      league: market.sport_type ?? undefined,
      liquidity: toNumber(snapshot.liquidity),
      marketSlug: market.market_slug ?? undefined,
      normalizedUrl: input.normalizedUrl,
      outcomes,
      sport: market.sport_type ?? undefined,
      title: cleanText(market.question || market.event_title || market.market_slug, "Mercado Polymarket"),
      url: input.url ?? input.normalizedUrl,
      volume: toNumber(snapshot.volume),
    },
    researchGoals: getResearchGoalsForMarket({
      category: market.market_type,
      marketSlug: market.market_slug,
      sport: market.sport_type,
      url: input.normalizedUrl,
    }),
    safetyRules: getSamanthaSafetyRules(),
    taskType: "deep_market_research",
    version: "1.0",
  };

  return brief;
}

export function serializeResearchBrief(brief: SamanthaResearchBrief): string {
  return JSON.stringify(brief, null, 2);
}

export function validateResearchBrief(brief: SamanthaResearchBrief): { errors: string[]; valid: boolean } {
  const serialized = JSON.stringify(brief);
  const lower = serialized.toLowerCase();
  const errors: string[] = [];
  if (brief.version !== "1.0") {
    errors.push("version must be 1.0");
  }
  if (brief.taskType !== "deep_market_research") {
    errors.push("taskType must be deep_market_research");
  }
  if (!brief.market.normalizedUrl || !brief.market.title) {
    errors.push("market url and title are required");
  }
  if (FULL_WALLET_ADDRESS_PATTERN.test(serialized)) {
    errors.push("brief must not contain full wallet addresses");
  }
  for (const marker of SECRET_MARKERS) {
    if (lower.includes(marker)) {
      errors.push(`brief must not contain secret marker: ${marker}`);
    }
  }
  if (!brief.safetyRules.some((rule) => rule.includes("Do not invent sources"))) {
    errors.push("brief must include anti-invention safety rule");
  }
  if (!brief.safetyRules.some((rule) => rule.includes("Do not touch Neon"))) {
    errors.push("brief must include no-Neon safety rule");
  }
  return {
    errors,
    valid: errors.length === 0,
  };
}
