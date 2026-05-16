import { assert, loadTsModule } from "./lib/test-loader.mjs";

const { buildOddsComparisonDisplay } = loadTsModule("app/lib/oddsComparisonDisplay.ts");

function closeEnough(left, right) {
  return typeof left === "number" && Math.abs(left - right) < 0.0001;
}

const pistonsMarket = {
  latest_snapshot: {
    captured_at: "2026-05-15T14:00:00.000Z",
  },
  market: {
    event_slug: "nba-det-cle-2026-05-15",
    event_title: "Pistons vs. Cavaliers",
    market_slug: "nba-det-cle-2026-05-15",
    outcomes: [
      { label: "Pistons", price: 0.385, side: "UNKNOWN" },
      { label: "Cavaliers", price: 0.615, side: "UNKNOWN" },
    ],
    question: "Pistons vs. Cavaliers",
    sport_type: "nba",
  },
};

const spursMarket = {
  latest_snapshot: {
    captured_at: "2026-05-15T14:00:00.000Z",
  },
  market: {
    event_slug: "nba-sas-min-2026-05-15",
    event_title: "Spurs vs. Timberwolves",
    market_slug: "nba-sas-min-2026-05-15",
    outcomes: [
      { label: "Spurs", price: 0.655, side: "UNKNOWN" },
      { label: "Timberwolves", price: 0.345, side: "UNKNOWN" },
    ],
    question: "Spurs vs. Timberwolves",
    sport_type: "nba",
  },
};

const pistonsDisplay = buildOddsComparisonDisplay(pistonsMarket, {
  attemptedQueries: 3,
  attemptedQueryVariants: ["primary", "without_main", "without_live"],
  bestSourceUrl: "https://sportsbook.draftkings.com/event/fixture-det-cle",
  checkedAt: "2026-05-16T00:10:00.175Z",
  eventName: "Detroit Pistons vs. Cleveland Cavaliers",
  eventStartTime: "2026-05-15T23:00:00.000Z",
  league: "NBA",
  limitations: ["Usar solo como comparacion externa de mercado, no como recomendacion automatica."],
  matchConfidence: "high",
  matchedMarket: true,
  matchedQueryVariant: "without_live",
  noMatchReasons: [],
  outcomes: [
    { impliedProbability: 0.408, label: "Pistons", priceAmerican: null, priceDecimal: null, sourceOutcomeName: "Detroit Pistons" },
    { impliedProbability: 0.636, label: "Cavaliers", priceAmerican: null, priceDecimal: null, sourceOutcomeName: "Cleveland Cavaliers" },
  ],
  providerName: "OddsBlaze",
  sportsbook: "DraftKings",
  status: "available",
  warnings: [],
});

assert(pistonsDisplay?.status === "available", "Pistons/Cavaliers should render as available");
assert(pistonsDisplay?.matchedQueryVariant === "without_live", "should expose the fallback variant");
assert(
  closeEnough(
    pistonsDisplay?.rows.find((row) => row.outcomeLabel === "Pistons")?.differencePoints,
    2.3,
  ),
  "Pistons diff should be calculated as external minus Polymarket in percentage points",
);
assert(
  closeEnough(
    pistonsDisplay?.rows.find((row) => row.outcomeLabel === "Cavaliers")?.differencePoints,
    2.1,
  ),
  "Cavaliers diff should be calculated as external minus Polymarket in percentage points",
);

const spursDisplay = buildOddsComparisonDisplay(spursMarket, {
  attemptedQueries: 1,
  attemptedQueryVariants: ["primary"],
  bestSourceUrl: "https://sportsbook.draftkings.com/event/fixture-sas-min",
  checkedAt: "2026-05-16T00:10:00.175Z",
  eventName: "San Antonio Spurs vs. Minnesota Timberwolves",
  eventStartTime: "2026-05-16T01:30:00.000Z",
  league: "NBA",
  limitations: ["Usar solo como comparacion externa de mercado, no como recomendacion automatica."],
  matchConfidence: "medium",
  matchedMarket: true,
  matchedQueryVariant: "primary",
  noMatchReasons: [],
  outcomes: [
    { impliedProbability: 0.697, label: "Spurs", priceAmerican: null, priceDecimal: null, sourceOutcomeName: "San Antonio Spurs" },
    { impliedProbability: 0.3448, label: "Timberwolves", priceAmerican: null, priceDecimal: null, sourceOutcomeName: "Minnesota Timberwolves" },
  ],
  providerName: "OddsBlaze",
  sportsbook: "DraftKings",
  status: "available",
  warnings: [],
});

assert(spursDisplay?.matchedQueryVariant === "primary", "Spurs/Timberwolves should preserve primary variant");
assert(
  spursDisplay?.rows.find((row) => row.outcomeLabel === "Spurs")?.direction === "external_higher",
  "Spurs should show external_higher when DraftKings probability is above Polymarket",
);

const noMatchDisplay = buildOddsComparisonDisplay(spursMarket, {
  attemptedQueries: 4,
  attemptedQueryVariants: ["primary", "without_main", "without_live", "base_league_only"],
  bestSourceUrl: null,
  checkedAt: "2026-05-16T00:10:00.175Z",
  eventName: null,
  eventStartTime: null,
  league: "NBA",
  limitations: ["OddsBlaze no devolvio evento comparable tras 4 consultas seguras."],
  matchConfidence: "unknown",
  matchedMarket: false,
  matchedQueryVariant: null,
  noMatchReasons: ["sportsbook_no_coverage", "market_filter_excluded"],
  outcomes: [],
  providerName: "OddsBlaze",
  sportsbook: "DraftKings",
  status: "no_match",
  warnings: ["odds_match_no_candidate"],
});

assert(noMatchDisplay?.status === "no_match", "no_match should stay explicit");
assert(
  noMatchDisplay?.summary.includes("4 consultas seguras"),
  "no_match summary should mention the number of safe attempts",
);
assert(
  !JSON.stringify(noMatchDisplay).includes("key="),
  "odds comparison display should never expose provider secrets or raw query strings",
);

console.log("Odds comparison display tests passed");
