import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  buildConservativePolySignalEstimate,
} = loadTsModule("app/lib/polySignalSignalMixer.ts");
const {
  strongValidSamanthaReport,
  validButNoIndependentGateReport,
  weakValidSamanthaReport,
} = loadTsModule("app/lib/__fixtures__/samanthaReports.ts");

const marketReference = { no: 0.8, yes: 0.2 };
const emptyWalletSignal = {
  available: false,
  confidence: "none",
  reason: "Controlled fixture without wallet data.",
  relevantWalletsCount: 0,
  signalDirection: "UNKNOWN",
  thresholdUsd: 100,
  warnings: [],
};
const sufficientWalletSignal = {
  ...emptyWalletSignal,
  analyzedCapitalUsd: 450,
  available: true,
  confidence: "medium",
  noCapitalUsd: 0,
  reason: "Controlled fixture with enough public wallet activity.",
  relevantWalletsCount: 3,
  signalDirection: "YES",
  source: "polymarket_data",
  warnings: ["Controlled wallet fixture only."],
  yesCapitalUsd: 450,
};
const sufficientWalletProfileSignal = {
  ...sufficientWalletSignal,
  confidence: "low",
  profileSummaries: [
    {
      commonSideBias: "YES",
      confidence: "low",
      losses: 2,
      observedMarketsCount: 7,
      profileAvailable: true,
      reason: "Controlled profile built from closed positions.",
      resolvedMarketsCount: 6,
      shortAddress: "0x1234...5678",
      volumeObservedUsd: 1200,
      warnings: ["Controlled profile fixture only."],
      winRate: 4 / 6,
      wins: 4,
    },
  ],
};
const matchedExternalOdds = {
  bestSourceUrl: "https://sportsbook.draftkings.com/event/pistons-cavaliers",
  checkedAt: "2026-05-15T19:15:00.000Z",
  eventName: "Detroit Pistons vs. Cleveland Cavaliers",
  eventStartTime: "2026-05-15T23:00:00.000Z",
  league: "NBA",
  limitations: ["Controlled comparison fixture only."],
  matchConfidence: "high",
  matchedMarket: true,
  outcomes: [
    { impliedProbability: 0.4082, label: "Pistons", priceAmerican: 145, priceDecimal: 2.45, sourceOutcomeName: "Detroit Pistons" },
    { impliedProbability: 0.6364, label: "Cavaliers", priceAmerican: -175, priceDecimal: 1.57, sourceOutcomeName: "Cleveland Cavaliers" },
  ],
  providerName: "OddsBlaze",
  sportsbook: "DraftKings",
  status: "available",
  warnings: [],
};

function expectPending(result, label) {
  assert(!result.available, `${label} should keep estimate unavailable`);
  assert(!result.countsForHistoryAccuracy, `${label} must not count for history accuracy`);
  assert(result.blockers.length > 0, `${label} should explain blockers`);
}

function expectAvailable(result, label) {
  assert(result.available, `${label} should create a conservative estimate`);
  assert(result.countsForHistoryAccuracy, `${label} should be countable only after final resolution`);
  assert(result.contributions.length > 0, `${label} should expose signal contributions`);
}

const noSamantha = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  walletSignal: sufficientWalletSignal,
});
expectPending(noSamantha, "no Samantha report");
assert(
  noSamantha.blockers.some((entry) => entry.code === "missing_samantha_report"),
  "missing Samantha report should be a visible blocker",
);

const marketOnly = buildConservativePolySignalEstimate({
  marketImpliedProbability: { no: 0.39, yes: 0.61 },
  walletSignal: emptyWalletSignal,
});
expectPending(marketOnly, "market price only");
assert(
  marketOnly.contributions.some((entry) => entry.source === "market_reference" && !entry.usedForEstimate),
  "market price should appear only as reference contribution",
);
assert(
  marketOnly.estimateYesProbability === undefined,
  "market price should never be copied into estimateYesProbability",
);

const weakSamantha = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  samanthaReport: weakValidSamanthaReport,
  walletSignal: emptyWalletSignal,
});
expectPending(weakSamantha, "weak Samantha report");
assert(
  weakSamantha.blockers.some((entry) => entry.code === "samantha_estimate_not_accepted"),
  "weak Samantha report should fail the Samantha estimate gate",
);

const noIndependentGate = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  samanthaReport: validButNoIndependentGateReport,
  walletSignal: emptyWalletSignal,
});
expectPending(noIndependentGate, "valid-shape report without enough independent support");

const withDirectExternalOdds = buildConservativePolySignalEstimate({
  externalOddsComparison: matchedExternalOdds,
  marketImpliedProbability: marketReference,
  samanthaReport: validButNoIndependentGateReport,
  walletSignal: emptyWalletSignal,
});
expectPending(withDirectExternalOdds, "valid-shape report with direct external odds only");
assert(
  !withDirectExternalOdds.blockers.some((entry) => entry.code === "missing_independent_support"),
  "direct external odds should clear the missing independent support blocker even if the estimate still stays pending",
);
assert(
  withDirectExternalOdds.blockers.some((entry) => entry.code === "samantha_estimate_not_accepted"),
  "direct external odds alone must not bypass Samantha validation gates",
);
assert(
  withDirectExternalOdds.explanation.includes("soporte independiente parcial disponible"),
  "pending explanation should acknowledge when external support exists but conservative gates still block the estimate",
);

const withWallet = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  samanthaReport: validButNoIndependentGateReport,
  walletSignal: sufficientWalletSignal,
});
expectPending(withWallet, "Samantha plus sufficient wallet signal");
assert(
  withWallet.contributions.some(
    (entry) => entry.source === "wallet_intelligence" && !entry.usedForEstimate,
  ),
  "wallet intelligence must stay auxiliary and not become estimate support by itself",
);
assert(
  withWallet.blockers.some((entry) => entry.code === "missing_independent_support"),
  "wallet support alone must still leave the independent-support blocker visible",
);

const withWalletProfile = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  samanthaReport: validButNoIndependentGateReport,
  walletSignal: sufficientWalletProfileSignal,
});
expectPending(withWalletProfile, "Samantha plus sufficient wallet profile");
assert(
  withWalletProfile.contributions.some((entry) => entry.source === "wallet_profile" && !entry.usedForEstimate),
  "wallet profile support must stay auxiliary and not become estimate support by itself",
);

const withExternalEvidence = buildConservativePolySignalEstimate({
  marketImpliedProbability: marketReference,
  samanthaReport: strongValidSamanthaReport,
  walletSignal: emptyWalletSignal,
});
expectAvailable(withExternalEvidence, "Samantha plus strong external evidence");
assert(
  withExternalEvidence.contributions.some(
    (entry) => entry.source === "external_evidence" && entry.usedForEstimate,
  ),
  "strong external evidence should be a used contribution",
);

assert(
  withExternalEvidence.estimateYesProbability === 0.61,
  "PolySignal estimate should preserve validated Samantha probability, not market price",
);
assert(
  withExternalEvidence.marketImpliedProbability?.yes === 0.2,
  "market implied probability should stay as separate reference",
);
assert(
  withExternalEvidence.confidence !== "high",
  "confidence must not become high from a single independent support category",
);
assert(
  withExternalEvidence.warnings.some((warning) => warning.includes("precio de mercado")),
  "available estimate should still warn that market price is only a reference",
);

console.log(
  JSON.stringify(
    {
      available_cases: 1,
      pending_cases: 6,
      status: "ok",
    },
    null,
    2,
  ),
);
