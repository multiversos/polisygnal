import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  parseSamanthaResearchReport,
  shouldAcceptSuggestedEstimate,
} = loadTsModule("app/lib/samanthaResearchReport.ts");
const {
  invalidSamanthaReport,
  invalidSamanthaReportCases,
  strongValidSamanthaReport,
  weakValidSamanthaReport,
} = loadTsModule("app/lib/__fixtures__/samanthaReports.ts");

function parseFixture(value) {
  return parseSamanthaResearchReport(JSON.stringify(value));
}

function expectInvalid(value, label) {
  const parsed = parseFixture(value);
  assert(!parsed.valid, `${label} should be rejected`);
  assert(parsed.errors.length > 0, `${label} should return validation errors`);
  return parsed;
}

const strongValid = parseFixture(strongValidSamanthaReport);
assert(strongValid.valid, `strong valid fixture rejected: ${strongValid.errors.join(", ")}`);
assert(strongValid.report, "strong valid fixture should return sanitized report");
assert(shouldAcceptSuggestedEstimate(strongValid.report), "strong valid fixture should pass strict estimate acceptance");
assert(!JSON.stringify(strongValid.report).includes("walletAddress"), "valid report should not contain raw wallet fields");

const weakValid = parseFixture(weakValidSamanthaReport);
assert(weakValid.valid, `weak valid fixture rejected: ${weakValid.errors.join(", ")}`);
assert(!shouldAcceptSuggestedEstimate(weakValid.report), "weak fixture should not pass strict estimate acceptance");

expectInvalid(invalidSamanthaReport, "combined invalid fixture");
expectInvalid(
  {
    ...strongValidSamanthaReport,
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: -1,
      reason: "Out of range controlled fixture.",
      yesProbability: 101,
    },
  },
  "suggested estimate outside 0-100",
);
expectInvalid(invalidSamanthaReportCases.dangerousUrl, "dangerous source URL");
expectInvalid(invalidSamanthaReportCases.secretLikeText, "secret-like text");
expectInvalid(invalidSamanthaReportCases.fullWalletAddress, "full wallet address");
expectInvalid(invalidSamanthaReportCases.tradingInstruction, "trading instruction");
expectInvalid(invalidSamanthaReportCases.roiClaim, "invented ROI claim");
expectInvalid(invalidSamanthaReportCases.winRateClaim, "invented win-rate claim");
expectInvalid(invalidSamanthaReportCases.kalshiNotEquivalent, "non-equivalent Kalshi strong signal");
expectInvalid(invalidSamanthaReportCases.redditHighReliability, "Reddit high reliability");
expectInvalid(invalidSamanthaReportCases.scriptInjection, "HTML/script injection");

const invalidJson = parseSamanthaResearchReport("{not-json");
assert(!invalidJson.valid, "invalid JSON should be rejected");

const safeWarningReport = parseFixture({
  ...strongValidSamanthaReport,
  warnings: ["Controlled warning: confirm source dates before relying on this context."],
});
assert(safeWarningReport.valid, "safe conservative warnings should be accepted");

console.log(
  JSON.stringify(
    {
      accepted_cases: 3,
      rejected_cases: 12,
      status: "ok",
    },
    null,
    2,
  ),
);
