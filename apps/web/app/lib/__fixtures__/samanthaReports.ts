import type { SamanthaResearchReport } from "../samanthaResearchTypes";

const checkedAt = "2026-05-12T12:00:00.000Z";
const marketUrl = "https://polymarket.com/event/test-market";

export const strongValidSamanthaReport: SamanthaResearchReport = {
  completedAt: checkedAt,
  evidence: [
    {
      checkedAt,
      direction: "YES",
      id: "official-lineup",
      reliability: "high",
      sourceName: "Official Fixture Source",
      sourceType: "official",
      sourceUrl: "https://example.com/official-fixture-source",
      summary: "Structured official context supports YES for this controlled test market.",
      title: "Official controlled source",
    },
    {
      checkedAt,
      direction: "YES",
      id: "news-context",
      reliability: "medium",
      sourceName: "Verified News Fixture",
      sourceType: "news",
      sourceUrl: "https://example.com/verified-news-fixture",
      summary: "Independent news context also supports YES for this controlled test market.",
      title: "News controlled source",
    },
  ],
  kalshiComparison: {
    direction: "UNKNOWN",
    equivalent: false,
    found: false,
    reliability: "unknown",
    summary: "No clearly equivalent Kalshi market in this controlled fixture.",
  },
  marketUrl,
  oddsComparison: {
    direction: "UNKNOWN",
    found: false,
    reliability: "unknown",
    summary: "No comparable odds in this controlled fixture.",
  },
  status: "completed",
  suggestedEstimate: {
    available: true,
    confidence: "high",
    decision: "YES",
    noProbability: 39,
    reason: "Two independent controlled sources support YES.",
    yesProbability: 61,
  },
  version: "1.0",
  warnings: ["Controlled fixture only; not production evidence."],
};

export const weakValidSamanthaReport: SamanthaResearchReport = {
  completedAt: checkedAt,
  evidence: [
    {
      checkedAt,
      direction: "NEUTRAL",
      id: "neutral-context",
      reliability: "low",
      sourceName: "Context Fixture",
      sourceType: "news",
      sourceUrl: "https://example.com/context-fixture",
      summary: "Context is relevant but not directional enough for a PolySignal estimate.",
      title: "Neutral context",
    },
    {
      checkedAt,
      direction: "YES",
      id: "social-context",
      reliability: "low",
      sourceName: "Social Fixture",
      sourceType: "reddit",
      sourceUrl: "https://example.com/social-fixture",
      summary: "Social chatter is explicitly weak and cannot support a final estimate.",
      title: "Weak social context",
    },
  ],
  marketUrl,
  status: "partial",
  suggestedEstimate: {
    available: true,
    confidence: "low",
    decision: "WEAK",
    noProbability: 49,
    reason: "Context exists, but directional evidence is weak.",
    yesProbability: 51,
  },
  version: "1.0",
  warnings: ["Insufficient directional evidence in this controlled fixture."],
};

export const validButNoIndependentGateReport: SamanthaResearchReport = {
  completedAt: checkedAt,
  evidence: [
    {
      checkedAt,
      direction: "YES",
      id: "single-context",
      reliability: "medium",
      sourceName: "Single Fixture Source",
      sourceType: "news",
      sourceUrl: "https://example.com/single-fixture-source",
      summary: "A single source is not enough to pass the strict Samantha estimate gate.",
      title: "Single controlled source",
    },
  ],
  marketUrl,
  status: "completed",
  suggestedEstimate: {
    available: true,
    confidence: "medium",
    decision: "YES",
    noProbability: 42,
    reason: "This fixture has a suggested estimate shape but lacks enough evidence.",
    yesProbability: 58,
  },
  version: "1.0",
  warnings: ["Controlled fixture: valid shape, insufficient independent support."],
};

export const invalidSamanthaReport: SamanthaResearchReport = {
  completedAt: checkedAt,
  evidence: [
    {
      checkedAt,
      direction: "YES",
      id: "dangerous-url",
      reliability: "medium",
      sourceName: "Dangerous Source",
      sourceType: "news",
      sourceUrl: "file:///etc/passwd",
      summary: "Dangerous URL should be rejected.",
      title: "Dangerous URL",
    },
    {
      checkedAt,
      direction: "YES",
      id: "reddit-high",
      reliability: "high",
      sourceName: "Reddit",
      sourceType: "reddit",
      summary: "Reddit must not be accepted as high reliability.",
      title: "Reddit high reliability",
    },
    {
      checkedAt,
      direction: "NO",
      id: "unsafe-text",
      reliability: "medium",
      sourceName: "Unsafe Fixture",
      sourceType: "other",
      summary: "<script>alert('x')</script> place a bet, copy this trader, ROI 100%, win rate 100%.",
      title: "Unsafe script and trading instruction",
    },
    {
      checkedAt,
      direction: "UNKNOWN",
      id: "wallet-address",
      reliability: "low",
      sourceName: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceType: "other",
      summary: "Full wallet address should be rejected.",
      title: "Full wallet address",
    },
  ],
  kalshiComparison: {
    direction: "YES",
    equivalent: false,
    found: true,
    reliability: "high",
    summary: "Non-equivalent Kalshi market cannot be used as a strong signal.",
  },
  marketUrl,
  status: "completed",
  suggestedEstimate: {
    available: true,
    confidence: "high",
    decision: "YES",
    noProbability: -1,
    reason: "Estimate outside 0-100 must be rejected.",
    yesProbability: 101,
  },
  version: "1.0",
  warnings: ["Controlled invalid fixture only."],
};

export const invalidSamanthaReportCases = {
  dangerousUrl: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "dangerous-url",
        sourceUrl: "file:///etc/passwd",
      },
    ],
  },
  fullWalletAddress: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "full-wallet",
        sourceName: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ],
  },
  kalshiNotEquivalent: {
    ...strongValidSamanthaReport,
    kalshiComparison: {
      direction: "YES",
      equivalent: false,
      found: true,
      reliability: "high",
      summary: "Non-equivalent controlled fixture.",
    },
  },
  redditHighReliability: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "reddit-high",
        reliability: "high",
        sourceName: "Reddit",
        sourceType: "reddit",
      },
    ],
  },
  roiClaim: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "roi-claim",
        summary: "This source claims ROI 100% for a public wallet.",
      },
    ],
  },
  scriptInjection: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "script-injection",
        summary: "<script>alert('x')</script>",
      },
    ],
  },
  secretLikeText: {
    ...strongValidSamanthaReport,
    warnings: ["token=not-a-real-secret"],
  },
  tradingInstruction: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "trading-instruction",
        summary: "Place a bet and buy YES immediately.",
      },
    ],
  },
  winRateClaim: {
    ...strongValidSamanthaReport,
    evidence: [
      {
        ...strongValidSamanthaReport.evidence[0],
        id: "win-rate-claim",
        summary: "This source claims win rate 100% for a public wallet.",
      },
    ],
  },
};
