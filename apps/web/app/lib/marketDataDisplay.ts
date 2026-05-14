import type { MarketOverviewItem } from "./marketOverview";
import { normalizeProbability, type ProbabilityValue } from "./marketProbabilities";

export type DisplayMarketPriceMode = "binary" | "outcome" | "unavailable";

export type DisplayMarketPriceSide = "NO" | "YES" | "outcome" | "unknown";

export type MarketOutcomePrice = {
  name: string;
  price: number | null;
  probability: number | null;
  side: DisplayMarketPriceSide;
  tokenId: string | null;
};

export type DisplayMarketPriceCard = MarketOutcomePrice;

export type DisplayMarketPrices = {
  cards: DisplayMarketPriceCard[];
  hiddenOutcomeCount: number;
  leader: { label: string; price: number } | null;
  mode: DisplayMarketPriceMode;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function binarySideFromLabel(label: unknown): "NO" | "YES" | null {
  const normalized = normalizeLabel(label);
  if (normalized === "yes" || normalized === "si") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  return null;
}

function normalizeMarketPrice(value: unknown): number | null {
  const probability = normalizeProbability(value as ProbabilityValue);
  if (probability !== null) {
    return probability;
  }
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function normalizeOutcomeSide(label: unknown, side: unknown): DisplayMarketPriceSide {
  const labelSide = binarySideFromLabel(label);
  if (labelSide) {
    return labelSide;
  }
  if (typeof label === "string" && label.trim()) {
    return "outcome";
  }
  const sideValue = typeof side === "string" ? side.trim().toUpperCase() : "";
  if (sideValue === "YES" || sideValue === "NO") {
    return sideValue;
  }
  return "unknown";
}

export function getMarketOutcomePrices(item?: MarketOverviewItem | null): MarketOutcomePrice[] {
  return (item?.market?.outcomes ?? [])
    .filter((outcome) => outcome.label || (outcome.price !== null && outcome.price !== undefined) || outcome.token_id)
    .map((outcome, index) => {
      const price = normalizeMarketPrice(outcome.price);
      return {
        name: outcome.label || `Outcome ${index + 1}`,
        price,
        probability: price,
        side: normalizeOutcomeSide(outcome.label, outcome.side),
        tokenId: outcome.token_id ?? null,
      };
    });
}

function bySide(prices: MarketOutcomePrice[], side: "NO" | "YES"): MarketOutcomePrice | null {
  return prices.find((outcome) => outcome.side === side) ?? null;
}

function binaryCardsFromOutcomes(prices: MarketOutcomePrice[]): DisplayMarketPriceCard[] | null {
  const yes = bySide(prices, "YES");
  const no = bySide(prices, "NO");
  if (!yes && !no) {
    return null;
  }
  return [
    {
      name: "YES",
      price: yes?.price ?? null,
      probability: yes?.probability ?? null,
      side: "YES",
      tokenId: yes?.tokenId ?? null,
    },
    {
      name: "NO",
      price: no?.price ?? null,
      probability: no?.probability ?? null,
      side: "NO",
      tokenId: no?.tokenId ?? null,
    },
  ];
}

function binaryCardsFromSnapshot(item?: MarketOverviewItem | null): DisplayMarketPriceCard[] | null {
  const yes = normalizeMarketPrice(item?.latest_snapshot?.yes_price);
  const no = normalizeMarketPrice(item?.latest_snapshot?.no_price);
  if (yes === null && no === null) {
    return null;
  }
  return [
    {
      name: "YES",
      price: yes,
      probability: yes,
      side: "YES",
      tokenId: null,
    },
    {
      name: "NO",
      price: no,
      probability: no,
      side: "NO",
      tokenId: null,
    },
  ];
}

function displayLeader(prices: DisplayMarketPriceCard[]): DisplayMarketPrices["leader"] {
  const priced = prices.filter((price): price is DisplayMarketPriceCard & { price: number } => price.price !== null);
  if (priced.length === 0) {
    return null;
  }
  const leader = priced.reduce((best, current) => (current.price > best.price ? current : best));
  return { label: leader.name, price: leader.price };
}

export function getDisplayMarketPrices(item?: MarketOverviewItem | null, maxOutcomeCards = 4): DisplayMarketPrices {
  const outcomes = getMarketOutcomePrices(item);
  const pricedOutcomes = outcomes.filter((outcome) => outcome.price !== null);
  const binaryOutcomes = binaryCardsFromOutcomes(pricedOutcomes);

  if (binaryOutcomes) {
    return {
      cards: binaryOutcomes,
      hiddenOutcomeCount: 0,
      leader: displayLeader(binaryOutcomes),
      mode: "binary",
    };
  }

  if (pricedOutcomes.length > 0) {
    const cards = pricedOutcomes.slice(0, maxOutcomeCards);
    return {
      cards,
      hiddenOutcomeCount: Math.max(0, pricedOutcomes.length - cards.length),
      leader: displayLeader(pricedOutcomes),
      mode: "outcome",
    };
  }

  const snapshotCards = binaryCardsFromSnapshot(item);
  if (snapshotCards) {
    return {
      cards: snapshotCards,
      hiddenOutcomeCount: 0,
      leader: displayLeader(snapshotCards),
      mode: "binary",
    };
  }

  return {
    cards: [],
    hiddenOutcomeCount: 0,
    leader: null,
    mode: "unavailable",
  };
}
