import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  buildIndependentEvidenceSummary,
  getIndependentEvidenceStatusLabel,
} = loadTsModule("app/lib/independentEvidence.ts");
const {
  strongValidSamanthaReport,
  validButNoIndependentGateReport,
} = loadTsModule("app/lib/__fixtures__/samanthaReports.ts");

const sportsMarket = {
  latest_snapshot: {
    captured_at: "2026-05-15T14:00:00.000Z",
    liquidity: 1000000,
    volume: 2000000,
  },
  market: {
    active: true,
    close_time: "2026-05-15T19:00:00.000Z",
    event_slug: "nba-sas-min-2026-05-15",
    event_title: "Spurs vs. Timberwolves",
    market_slug: "nba-sas-min-2026-05-15",
    outcomes: [
      { label: "Spurs", price: 0.66, side: "UNKNOWN" },
      { label: "Timberwolves", price: 0.35, side: "UNKNOWN" },
    ],
    question: "Spurs vs. Timberwolves",
    sport_type: "nba",
  },
};

const politicalMarket = {
  latest_snapshot: {
    captured_at: "2026-05-15T14:00:00.000Z",
    no_price: 0.9885,
    yes_price: 0.0115,
  },
  market: {
    active: true,
    event_slug: "democratic-presidential-nominee-2028",
    event_title: "Democratic presidential nominee 2028",
    market_slug: "will-gretchen-whitmer-win-the-2028-democratic-presidential-nomination-676",
    outcomes: [
      { label: "YES", price: 0.0115, side: "YES" },
      { label: "NO", price: 0.9885, side: "NO" },
    ],
    question: "Will Gretchen Whitmer win the 2028 Democratic presidential nomination?",
  },
};

const walletSummary = {
  analyzedCapitalUsd: 80682.779694,
  available: true,
  checkedAt: "2026-05-15T14:02:00.000Z",
  confidence: "medium",
  highlightedProfilesCount: 5,
  historyAvailableCount: 5,
  queryStatus: "found",
  reason: "Controlled fixture with real-shaped wallet data.",
  relevantWalletsCount: 59,
  signalDirection: "YES",
  thresholdUsd: 100,
  warnings: [],
};

const sportsSummary = buildIndependentEvidenceSummary({
  agentName: "Samantha",
  item: sportsMarket,
  samanthaReport: validButNoIndependentGateReport,
  samanthaStatus: "partial",
  suggestedDecisionAvailable: false,
  walletSummary,
});

assert(
  sportsSummary.items.some((item) => item.label === "Precio de mercado" && item.status === "available"),
  "market price should appear as available reference",
);
assert(
  sportsSummary.items.some((item) => item.label === "Billeteras" && item.isIndependent === false),
  "wallet intelligence should remain auxiliary",
);
assert(
  sportsSummary.items.some((item) => item.label === "Odds externas" && item.status === "not_connected"),
  "external odds should stay not_connected without a real provider",
);
assert(
  sportsSummary.items.some((item) => item.label === "Noticias/lesiones" && item.status === "not_connected"),
  "sports summary should show missing news/injuries honestly",
);
assert(
  sportsSummary.missingRequiredCategories.some((label) => label.startsWith("Odds externas")),
  "sports summary should explain missing odds",
);
assert(!sportsSummary.enoughForEstimate, "sports summary must not enable estimate with only market + wallets");

const politicsSummary = buildIndependentEvidenceSummary({
  agentName: "Samantha",
  item: politicalMarket,
  samanthaReport: validButNoIndependentGateReport,
  samanthaStatus: "partial",
  suggestedDecisionAvailable: false,
  walletSummary: {
    ...walletSummary,
    available: false,
    queryStatus: "unavailable",
    relevantWalletsCount: 0,
  },
});

assert(
  politicsSummary.items.some((item) => item.label === "Noticias/encuestas"),
  "political markets should adapt missing-source labels away from sports injuries",
);
assert(
  !politicsSummary.items.some((item) => item.label === "Noticias/lesiones"),
  "political markets must not show sports-specific injuries copy",
);
assert(
  politicsSummary.items.some((item) => item.label === "Odds/mercados comparables"),
  "political markets should use comparable external-source wording",
);

const readySummary = buildIndependentEvidenceSummary({
  agentName: "Samantha",
  item: sportsMarket,
  samanthaReport: strongValidSamanthaReport,
  samanthaStatus: "completed",
  suggestedDecisionAvailable: true,
  walletSummary,
});

assert(readySummary.enoughForEstimate, "ready summary should reflect an available estimate gate");
assert(
  readySummary.availableIndependentCount > 0,
  "ready summary should count real independent evidence",
);
assert(
  getIndependentEvidenceStatusLabel("not_connected") === "Fuente no conectada",
  "status labels should stay user-facing and explicit",
);

console.log(
  JSON.stringify(
    {
      available_independent_ready: readySummary.availableIndependentCount,
      sports_missing: sportsSummary.missingRequiredCategories.length,
      status: "ok",
    },
    null,
    2,
  ),
);
