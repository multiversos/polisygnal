import type { MarketOverviewItem } from "./marketOverview";
import {
  parsePolymarketLink,
  type PolymarketLinkInfo,
} from "./polymarketLink";

export type AnalyzerMatchStrength = "exact" | "possible" | "reject" | "strong" | "weak";

export type AnalyzerMatchCandidate<TItem extends MarketOverviewItem = MarketOverviewItem> = {
  eventSlug?: string;
  eventTitle?: string;
  item: TItem;
  marketId: string;
  marketSlug?: string;
  reasons: string[];
  score: number;
  strength: AnalyzerMatchStrength;
  title: string;
  warnings: string[];
};

export type AnalyzerMatchRankingResult<TItem extends MarketOverviewItem = MarketOverviewItem> = {
  candidates: AnalyzerMatchCandidate<TItem>[];
  linkInfo: PolymarketLinkInfo | null;
  rejectedCount: number;
};

const GENERIC_TERMS = new Set([
  "2024",
  "2025",
  "2026",
  "2027",
  "event",
  "la",
  "laliga",
  "league",
  "liga",
  "market",
  "markets",
  "polymarket",
  "sports",
]);

function normalizeText(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSlug(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function slugTokens(value?: string | null): string[] {
  return normalizeSlug(value)
    .split("-")
    .filter(Boolean);
}

function titleFor(item: MarketOverviewItem): string {
  return (
    item.market?.question ||
    item.market?.event_title ||
    item.market?.market_slug?.replaceAll("-", " ") ||
    "Mercado Polymarket"
  );
}

function marketIdFor(item: MarketOverviewItem): string {
  return item.market?.id !== null && item.market?.id !== undefined ? String(item.market.id) : "";
}

function linkContainsIdentifier(linkInfo: PolymarketLinkInfo, identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length < 6) {
    const parsed = new URL(linkInfo.normalizedUrl);
    const queryValues = Array.from(parsed.searchParams.values()).map((value) => value.toLowerCase());
    return linkInfo.pathSegments.includes(normalized) || queryValues.includes(normalized);
  }
  return linkInfo.normalizedUrl.toLowerCase().includes(normalized);
}

function containsDelimitedToken(tokens: string[], code: string): boolean {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode || GENERIC_TERMS.has(normalizedCode)) {
    return false;
  }
  return tokens.some(
    (token) =>
      token === normalizedCode ||
      (normalizedCode.length >= 3 && token.length > normalizedCode.length && token.startsWith(normalizedCode)),
  );
}

function teamMatchCount(item: MarketOverviewItem, linkInfo: PolymarketLinkInfo): number {
  if (linkInfo.possibleTeamCodes.length === 0) {
    return 0;
  }
  const tokens = [
    ...slugTokens(item.market?.event_slug),
    ...slugTokens(item.market?.market_slug),
    ...slugTokens(item.market?.event_title),
    ...slugTokens(item.market?.question),
  ];
  return linkInfo.possibleTeamCodes.filter((code) => containsDelimitedToken(tokens, code)).length;
}

function dateMatches(item: MarketOverviewItem, linkInfo: PolymarketLinkInfo): boolean {
  if (!linkInfo.dateFromSlug) {
    return false;
  }
  const haystack = [
    item.market?.event_slug,
    item.market?.market_slug,
    item.market?.close_time,
    item.market?.end_date,
  ]
    .filter(Boolean)
    .join(" ");
  return haystack.includes(linkInfo.dateFromSlug);
}

function scoreCandidate<TItem extends MarketOverviewItem>(
  item: TItem,
  linkInfo: PolymarketLinkInfo | null,
): AnalyzerMatchCandidate<TItem> {
  const market = item.market;
  const eventSlug = normalizeSlug(market?.event_slug);
  const marketSlug = normalizeSlug(market?.market_slug);
  const remoteId = market?.remote_id ? String(market.remote_id) : "";
  const localMarketId = marketIdFor(item);
  const rawSlug = normalizeSlug(linkInfo?.rawSlug);
  const linkEventSlug = normalizeSlug(linkInfo?.eventSlug);
  const linkMarketSlug = normalizeSlug(linkInfo?.marketSlug);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (linkInfo && remoteId && linkContainsIdentifier(linkInfo, remoteId)) {
    score = Math.max(score, 100);
    reasons.push("El identificador remoto coincide exactamente.");
  }
  if (linkInfo && localMarketId && linkContainsIdentifier(linkInfo, localMarketId)) {
    score = Math.max(score, 100);
    reasons.push("El identificador local coincide exactamente.");
  }
  if (marketSlug && (marketSlug === linkMarketSlug || marketSlug === rawSlug)) {
    score = Math.max(score, 95);
    reasons.push("El slug del mercado coincide exactamente.");
  }
  if (eventSlug && (eventSlug === linkEventSlug || eventSlug === rawSlug)) {
    score = Math.max(score, 92);
    reasons.push("El slug del evento coincide exactamente.");
  }

  const matchedTeams = linkInfo ? teamMatchCount(item, linkInfo) : 0;
  const hasDateMatch = linkInfo ? dateMatches(item, linkInfo) : false;
  if (linkInfo && linkInfo.possibleTeamCodes.length >= 2 && matchedTeams >= 2 && hasDateMatch) {
    score = Math.max(score, 86);
    reasons.push("Equipos y fecha del enlace coinciden.");
  } else if (linkInfo && linkInfo.possibleTeamCodes.length >= 2 && matchedTeams >= 2) {
    score = Math.max(score, 62);
    reasons.push("Ambos equipos del slug aparecen en el mercado.");
    warnings.push("La fecha no coincide o no esta disponible.");
  } else if (matchedTeams === 1) {
    score = Math.max(score, hasDateMatch ? 32 : 24);
    reasons.push("Solo un equipo del enlace coincide.");
    warnings.push("Un solo equipo no basta para un match principal.");
  } else if (hasDateMatch) {
    score = Math.max(score, 18);
    reasons.push("Solo coincide la fecha.");
    warnings.push("La fecha sola no basta para seleccionar mercado.");
  }

  const secondaryTerms = (linkInfo?.searchTerms ?? []).filter((term) => !GENERIC_TERMS.has(term));
  if (score < 60 && secondaryTerms.length >= 2) {
    const haystack = normalizeText([
      market?.question,
      market?.event_title,
      market?.event_slug,
      market?.market_slug,
    ].join(" "));
    const matchedTerms = secondaryTerms.filter((term) => haystack.includes(term));
    if (matchedTerms.length >= 2) {
      score = Math.max(score, 44);
      reasons.push(`${matchedTerms.length} terminos secundarios coinciden.`);
      warnings.push("Los terminos secundarios no reemplazan un slug exacto.");
    }
  }

  const strength: AnalyzerMatchStrength =
    score >= 95 ? "exact" : score >= 75 ? "strong" : score >= 45 ? "possible" : score >= 25 ? "weak" : "reject";

  return {
    eventSlug: market?.event_slug ?? undefined,
    eventTitle: market?.event_title ?? undefined,
    item,
    marketId: localMarketId,
    marketSlug: market?.market_slug ?? undefined,
    reasons,
    score,
    strength,
    title: titleFor(item),
    warnings,
  };
}

function compactPrincipalCandidates<TItem extends MarketOverviewItem>(
  candidates: AnalyzerMatchCandidate<TItem>[],
): AnalyzerMatchCandidate<TItem>[] {
  const exactOrStrong = candidates.filter((candidate) => candidate.strength === "exact" || candidate.strength === "strong");
  if (exactOrStrong.length > 0) {
    const exactEvent = exactOrStrong.find((candidate) => candidate.eventSlug)?.eventSlug;
    const sameEvent = exactEvent
      ? exactOrStrong.filter((candidate) => candidate.eventSlug === exactEvent)
      : exactOrStrong;
    return sameEvent.slice(0, 12);
  }
  return candidates.filter((candidate) => candidate.strength === "possible").slice(0, 5);
}

export function rankAnalyzerMatches<TItem extends MarketOverviewItem>(
  items: TItem[],
  normalizedUrl: string,
): AnalyzerMatchRankingResult<TItem> {
  const linkInfo = parsePolymarketLink(normalizedUrl);
  const allCandidates = items
    .map((item) => scoreCandidate(item, linkInfo))
    .sort((left, right) => right.score - left.score);
  const visible = compactPrincipalCandidates(allCandidates);
  return {
    candidates: visible,
    linkInfo,
    rejectedCount: allCandidates.length - visible.length,
  };
}
