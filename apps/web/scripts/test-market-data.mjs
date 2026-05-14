import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  getDisplayMarketPrices,
  getMarketOutcomePrices,
} = loadTsModule("app/lib/marketDataDisplay.ts");

const marketDetailsSource = readFileSync(resolve(appRoot, "app/components/MarketDataDetails.tsx"), "utf8");

function sportsOutcomeFixture() {
  return {
    latest_snapshot: {
      no_price: null,
      yes_price: null,
    },
    market: {
      event_slug: "nba-sas-min-2026-05-15",
      market_slug: "nba-sas-min-2026-05-15",
      outcomes: [
        {
          label: "Spurs",
          price: 0.66,
          side: "UNKNOWN",
          token_id: "spurs-token",
        },
        {
          label: "Timberwolves",
          price: 0.35,
          side: "UNKNOWN",
          token_id: "timberwolves-token",
        },
      ],
      question: "Spurs vs. Timberwolves",
    },
  };
}

function binaryFixture() {
  return {
    latest_snapshot: {
      no_price: null,
      yes_price: null,
    },
    market: {
      market_slug: "will-gretchen-whitmer-win-the-2028-democratic-presidential-nomination-676",
      outcomes: [
        {
          label: "YES",
          price: 0.0115,
          side: "UNKNOWN",
          token_id: "yes-token",
        },
        {
          label: "NO",
          price: 0.9885,
          side: "UNKNOWN",
          token_id: "no-token",
        },
      ],
      question: "Will Gretchen Whitmer win the 2028 Democratic presidential nomination?",
    },
  };
}

const sportsDisplay = getDisplayMarketPrices(sportsOutcomeFixture());
assert(sportsDisplay.mode === "outcome", "sports/team market should render outcome summary mode");
assert(sportsDisplay.cards.some((card) => card.name === "Spurs" && card.price === 0.66), "Spurs outcome price should be promoted to summary");
assert(
  sportsDisplay.cards.some((card) => card.name === "Timberwolves" && card.price === 0.35),
  "Timberwolves outcome price should be promoted to summary",
);
assert(sportsDisplay.leader?.label === "Spurs", "highest priced sports outcome should be the market-price leader");
assert(
  !sportsDisplay.cards.some((card) => card.name === "YES" || card.name === "NO"),
  "sports/team market must not degrade into YES/NO unavailable summary",
);

const sportsOutcomes = getMarketOutcomePrices(sportsOutcomeFixture());
assert(
  sportsOutcomes.every((outcome) => outcome.side === "outcome"),
  "UNKNOWN sports sides with real labels should be treated as named outcomes",
);

const binaryDisplay = getDisplayMarketPrices(binaryFixture());
assert(binaryDisplay.mode === "binary", "real YES/NO market should stay in binary summary mode");
assert(binaryDisplay.cards.some((card) => card.name === "YES" && card.price === 0.0115), "binary YES price should be preserved");
assert(binaryDisplay.cards.some((card) => card.name === "NO" && card.price === 0.9885), "binary NO price should be preserved");
assert(binaryDisplay.leader?.label === "NO", "binary leader should use the highest market price");

const snapshotDisplay = getDisplayMarketPrices({
  latest_snapshot: {
    no_price: 0.42,
    yes_price: 0.58,
  },
  market: {
    outcomes: [],
    question: "Snapshot-only binary fixture",
  },
});
assert(snapshotDisplay.mode === "binary", "snapshot YES/NO prices should still render binary mode when no outcomes exist");

assert(
  marketDetailsSource.includes("getDisplayMarketPrices"),
  "market drawer must use the explicit display-price helper",
);
assert(
  marketDetailsSource.includes("Lider por precio de mercado"),
  "market drawer should show the leader for outcome markets",
);
assert(
  marketDetailsSource.indexOf('displayPrices.mode === "binary"') <
    marketDetailsSource.indexOf('displayPrices.mode === "outcome"'),
  "market drawer should branch explicitly between binary and outcome modes",
);
assert(
  !marketDetailsSource.includes("showBinarySummary"),
  "market drawer should not use the old broad binary summary gate",
);
assert(!marketDetailsSource.includes("<pre"), "market drawer must not expose raw JSON by default");

console.log("Market data display tests passed");
