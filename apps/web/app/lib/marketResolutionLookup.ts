"use client";

import type { AnalysisHistoryItem } from "./analysisHistory";
import { fetchApiJson, isApiNotFoundError } from "./api";
import {
  extractOutcomeFromMarketData,
  type AnalysisResolutionResult,
} from "./marketResolution";
import type { MarketOverviewItem, MarketOverviewResponse } from "./marketOverview";
import { extractPolymarketSlug, extractPossibleMarketTerms } from "./polymarketLink";
import type { ExternalResolutionLookupResult } from "./polymarketResolutionAdapter";

type MarketOutcomeRead = {
  market_id?: number;
  question?: string;
  resolved_at?: string | null;
  resolved_outcome?: string | null;
  source?: string | null;
};

type MarketAnalysisRead = {
  market?: Record<string, unknown> | null;
};

const LOOKUP_PAGE_SIZE = 50;
const LOOKUP_MAX_ITEMS = 100;

function normalizeText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isTrustedOutcomeSource(value?: string | null): boolean {
  const normalized = normalizeText(value);
  return (
    normalized.includes("polymarket") ||
    normalized.includes("gamma") ||
    normalized.includes("clob") ||
    normalized.includes("automatic") ||
    normalized.includes("automat")
  );
}

function resolutionSourceFromLabel(value?: string | null): "polymarket" | "polysignal_market" {
  const normalized = normalizeText(value);
  return normalized.includes("polymarket") || normalized.includes("gamma") || normalized.includes("clob")
    ? "polymarket"
    : "polysignal_market";
}

function statusFromExternal(value: ExternalResolutionLookupResult["status"]): AnalysisResolutionResult["status"] {
  if (value === "open") {
    return "open";
  }
  if (value === "resolved" || value === "cancelled") {
    return "resolved";
  }
  return "unknown";
}

async function fetchStoredOutcome(marketId: string): Promise<AnalysisResolutionResult | null> {
  try {
    const outcome = await fetchApiJson<MarketOutcomeRead>(`/markets/${marketId}/outcome`);
    if (!isTrustedOutcomeSource(outcome.source)) {
      return null;
    }
    return extractOutcomeFromMarketData(
      {
        resolved_at: outcome.resolved_at ?? undefined,
        resolved_outcome: outcome.resolved_outcome ?? undefined,
      },
      resolutionSourceFromLabel(outcome.source),
    );
  } catch (error) {
    if (isApiNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function fetchMarketAnalysisResolution(marketId: string): Promise<AnalysisResolutionResult | null> {
  try {
    const analysis = await fetchApiJson<MarketAnalysisRead>(`/markets/${marketId}/analysis`);
    return extractOutcomeFromMarketData(analysis.market ?? null, "polysignal_market");
  } catch (error) {
    if (isApiNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function fetchOverviewItems(sport?: string): Promise<MarketOverviewItem[]> {
  const items: MarketOverviewItem[] = [];
  const sportType = sport || "soccer";
  for (let offset = 0; offset < LOOKUP_MAX_ITEMS; offset += LOOKUP_PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(LOOKUP_PAGE_SIZE),
      offset: String(offset),
      sport_type: sportType,
    });
    const response = await fetchApiJson<MarketOverviewResponse>(
      `/markets/overview?${params.toString()}`,
    );
    const pageItems = response.items ?? [];
    items.push(...pageItems);
    const total = response.total_count ?? items.length;
    if (items.length >= total || pageItems.length === 0) {
      break;
    }
  }
  return items;
}

function scoreOverviewMatch(item: MarketOverviewItem, historyItem: AnalysisHistoryItem): number {
  const market = item.market;
  let score = 0;
  const normalizedUrl = historyItem.url ? normalizeText(historyItem.url) : "";
  const slug = historyItem.url ? extractPolymarketSlug(historyItem.url) : null;
  const terms = historyItem.url ? extractPossibleMarketTerms(historyItem.url) : [];
  const haystack = normalizeText(
    [
      market?.question,
      market?.event_title,
      market?.event_slug,
      market?.market_slug,
      market?.remote_id,
      market?.id,
      historyItem.title,
    ].join(" "),
  );

  if (historyItem.marketId && String(market?.id) === String(historyItem.marketId)) {
    score += 100;
  }
  if (market?.remote_id && historyItem.url?.includes(String(market.remote_id))) {
    score += 90;
  }
  if (market?.market_slug && normalizedUrl.includes(normalizeText(market.market_slug))) {
    score += 80;
  }
  if (market?.event_slug && normalizedUrl.includes(normalizeText(market.event_slug))) {
    score += 65;
  }
  if (slug && haystack.includes(normalizeText(slug))) {
    score += 65;
  }
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (terms.length > 0 && matchedTerms.length > 0) {
    score += Math.round((matchedTerms.length / terms.length) * 50);
  }
  return score;
}

async function resolveFromOverview(item: AnalysisHistoryItem): Promise<AnalysisResolutionResult | null> {
  const overviewItems = await fetchOverviewItems(item.sport);
  const bestMatch = overviewItems
    .map((overviewItem) => ({
      item: overviewItem,
      score: scoreOverviewMatch(overviewItem, item),
    }))
    .filter((match) => match.score >= 65)
    .sort((left, right) => right.score - left.score)[0];
  if (!bestMatch) {
    return null;
  }
  return extractOutcomeFromMarketData(bestMatch.item.market ?? null, "polysignal_market");
}

async function resolveFromPolymarket(item: AnalysisHistoryItem): Promise<AnalysisResolutionResult | null> {
  if (!item.url && !item.eventSlug) {
    return null;
  }
  const response = await fetch("/api/resolve-polymarket", {
    body: JSON.stringify({
      conditionId: item.conditionId,
      eventSlug: item.eventSlug,
      marketId: item.marketId,
      marketSlug: item.marketSlug,
      remoteId: item.remoteId,
      url: item.url,
    }),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    return null;
  }
  const result = (await response.json()) as ExternalResolutionLookupResult;
  return {
    confidence: result.confidence,
    outcome: result.outcome,
    reason: result.reason,
    resolvedAt: result.resolvedAt,
    source: result.source,
    status: statusFromExternal(result.status),
  };
}

export async function lookupAnalysisResolution(
  item: AnalysisHistoryItem,
): Promise<AnalysisResolutionResult> {
  if (item.marketId) {
    const storedOutcome = await fetchStoredOutcome(item.marketId);
    if (storedOutcome && storedOutcome.outcome !== "UNKNOWN") {
      return storedOutcome;
    }
    const marketResolution = await fetchMarketAnalysisResolution(item.marketId);
    if (marketResolution) {
      return marketResolution;
    }
  }

  if (item.url) {
    const overviewResolution = await resolveFromOverview(item);
    if (overviewResolution) {
      return overviewResolution;
    }
  }

  const polymarketResolution = await resolveFromPolymarket(item);
  if (polymarketResolution) {
    return polymarketResolution;
  }

  return {
    confidence: "low",
    outcome: "UNKNOWN",
    reason: "No pudimos verificar este mercado con los datos disponibles todavia.",
    source: "unknown",
    status: "unknown",
  };
}
