import type {
  ExternalOddsComparison,
  ExternalOddsComparisonStatus,
} from "./externalOddsTypes";
import { getDisplayMarketPrices, type DisplayMarketPriceCard } from "./marketDataDisplay";
import type { MarketOverviewItem } from "./marketOverview";
import { teamNamesLookEquivalent } from "./sportsContext";

export type OddsComparisonRow = {
  differencePoints: number | null;
  direction: "external_higher" | "polymarket_higher" | "same" | "unknown";
  externalProbability: number | null;
  outcomeLabel: string;
  polymarketProbability: number | null;
};

export type OddsComparisonDisplay = {
  limitations: string[];
  matchConfidence: string;
  matchedQueryVariant: string | null;
  providerName: string;
  rows: OddsComparisonRow[];
  sportsbook: string;
  status: "available" | "partial" | "no_match" | "unavailable";
  summary: string;
};

function normalizeStatus(
  comparison?: ExternalOddsComparison | null,
): OddsComparisonDisplay["status"] {
  const status = comparison?.status;
  if (status === "available" || status === "partial" || status === "no_match") {
    return status;
  }
  return "unavailable";
}

function variantLabel(value?: string | null): string | null {
  if (value === "without_main") {
    return "without_main";
  }
  if (value === "without_live") {
    return "without_live";
  }
  if (value === "base_league_only") {
    return "base_league_only";
  }
  if (value === "primary") {
    return "primary";
  }
  return value?.trim() || null;
}

function findExternalProbability(
  label: string,
  comparison?: ExternalOddsComparison | null,
): number | null {
  if (!comparison) {
    return null;
  }
  const outcome = comparison.outcomes.find((entry) =>
    teamNamesLookEquivalent(entry.label, label) ||
    teamNamesLookEquivalent(entry.sourceOutcomeName, label),
  );
  return typeof outcome?.impliedProbability === "number" ? outcome.impliedProbability : null;
}

function rowDirection(
  polymarketProbability: number | null,
  externalProbability: number | null,
): OddsComparisonRow["direction"] {
  if (polymarketProbability === null || externalProbability === null) {
    return "unknown";
  }
  const delta = externalProbability - polymarketProbability;
  if (Math.abs(delta) < 0.0005) {
    return "same";
  }
  return delta > 0 ? "external_higher" : "polymarket_higher";
}

function buildRows(
  cards: DisplayMarketPriceCard[],
  comparison?: ExternalOddsComparison | null,
): OddsComparisonRow[] {
  return cards.map((card) => {
    const polymarketProbability =
      typeof card.probability === "number" ? card.probability : card.price;
    const externalProbability = findExternalProbability(card.name, comparison);
    return {
      differencePoints:
        polymarketProbability !== null && externalProbability !== null
          ? (externalProbability - polymarketProbability) * 100
          : null,
      direction: rowDirection(polymarketProbability, externalProbability),
      externalProbability,
      outcomeLabel: card.name,
      polymarketProbability,
    };
  });
}

function buildSummary(
  comparison: ExternalOddsComparison | null | undefined,
  status: OddsComparisonDisplay["status"],
): string {
  if (!comparison) {
    return "Odds externas no disponibles en este analisis.";
  }
  if (status === "available") {
    return `Comparacion externa disponible con match ${comparison.matchConfidence}${
      comparison.matchedQueryVariant ? ` usando variante ${comparison.matchedQueryVariant}` : ""
    }.`;
  }
  if (status === "partial") {
    return `Comparacion externa parcial${
      comparison.matchedQueryVariant ? ` con variante ${comparison.matchedQueryVariant}` : ""
    }.`;
  }
  if (status === "no_match") {
    return comparison.attemptedQueries && comparison.attemptedQueries > 1
      ? `No se encontro equivalente claro tras ${comparison.attemptedQueries} consultas seguras.`
      : "No se encontro equivalente claro en OddsBlaze.";
  }
  return "Odds externas no disponibles en este momento.";
}

export function buildOddsComparisonDisplay(
  item: MarketOverviewItem,
  comparison?: ExternalOddsComparison | null,
): OddsComparisonDisplay | null {
  if (!comparison) {
    return null;
  }
  const display = getDisplayMarketPrices(item, 4);
  const rows = buildRows(display.cards, comparison);
  return {
    limitations: comparison.limitations.slice(0, 4),
    matchConfidence: comparison.matchConfidence,
    matchedQueryVariant: variantLabel(comparison.matchedQueryVariant),
    providerName: comparison.providerName,
    rows,
    sportsbook: comparison.sportsbook,
    status: normalizeStatus(comparison),
    summary: buildSummary(comparison, normalizeStatus(comparison)),
  };
}

