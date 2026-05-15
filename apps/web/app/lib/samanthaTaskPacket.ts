import type {
  SamanthaResearchBrief,
  SamanthaResearchReport,
} from "./samanthaResearchTypes";
import {
  getSamanthaSafetyRules,
  serializeResearchBrief,
  validateResearchBrief,
} from "./samanthaResearchBrief";

export type SamanthaTaskPacket = {
  expectedReportSchema: string;
  researchBriefJson: string;
  returnInstructions: string;
  safetyRules: string[];
  samanthaInstructionsText: string;
  taskPacketJson: string;
};

const FULL_WALLET_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/;
const SECRET_MARKERS = [
  "api_key",
  "authorization:",
  "bearer ",
  "database_url=",
  "password",
  "postgres://",
  "postgresql://",
  "secret=",
  "token=",
] as const;

const REPORT_SCHEMA_EXAMPLE: SamanthaResearchReport = {
  completedAt: "ISO-8601 timestamp",
  evidence: [
    {
      checkedAt: "ISO-8601 timestamp",
      direction: "YES",
      id: "short-stable-id",
      publishedAt: "optional ISO-8601 timestamp",
      quote: "optional short quote, max 280 chars",
      reliability: "medium",
      sourceName: "Source name",
      sourceType: "news",
      sourceUrl: "https://example.com/source",
      summary: "Short source-backed summary.",
      title: "Evidence title",
    },
  ],
  kalshiComparison: {
    direction: "UNKNOWN",
    equivalent: false,
    found: false,
    reliability: "unknown",
    summary: "Only mark equivalent=true when the contract is clearly comparable.",
  },
  marketUrl: "https://polymarket.com/event/...",
  oddsComparison: {
    direction: "UNKNOWN",
    found: false,
    reliability: "unknown",
    summary: "Only mark found=true when odds are comparable by market, date, side, and line.",
  },
  status: "partial",
  suggestedEstimate: {
    available: false,
    confidence: "none",
    decision: "NONE",
    reason: "Only provide an estimate when evidence is strong enough.",
  },
  version: "1.0",
  warnings: [],
};

function containsBlockedText(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    FULL_WALLET_ADDRESS_PATTERN.test(value) ||
    SECRET_MARKERS.some((marker) => lower.includes(marker))
  );
}

export function getExpectedSamanthaReportSchema(): string {
  return JSON.stringify(REPORT_SCHEMA_EXAMPLE, null, 2);
}

export function getSamanthaReturnInstructions(): string {
  return [
    "Return ONLY valid JSON.",
    "Do not wrap the JSON in Markdown.",
    "Use SamanthaResearchReport version 1.0.",
    "Every evidence item must include title, sourceName, sourceType, checkedAt, direction, reliability, and summary.",
    "Use sourceUrl only for public http/https URLs.",
    "Use UNKNOWN or NEUTRAL when evidence does not clearly support YES or NO.",
    "If you cannot find reliable information, return status=partial or failed and explain in warnings.",
    "Do not include long quotes, raw HTML, private notes, secrets, or full wallet addresses.",
  ].join("\n");
}

export function buildSamanthaInstructionsText(brief: SamanthaResearchBrief): string {
  const goals = brief.researchGoals.map((goal) => `- ${goal}`).join("\n");
  const outcomes = brief.market.outcomes
    .map((outcome) => {
      const price =
        typeof outcome.price === "number" ? ` price=${outcome.price}` : " price=unavailable";
      return `- ${outcome.label}${price} side=${outcome.side ?? "UNKNOWN"}`;
    })
    .join("\n");
  return [
    "Samantha, investigate this Polymarket market for PolySignal.",
    "",
    "Market:",
    `- Title: ${brief.market.title}`,
    `- URL: ${brief.market.normalizedUrl}`,
    brief.market.eventSlug ? `- Event slug: ${brief.market.eventSlug}` : "- Event slug: unavailable",
    brief.market.marketSlug ? `- Market slug: ${brief.market.marketSlug}` : "- Market slug: unavailable",
    brief.market.eventDate ? `- Event/close date: ${brief.market.eventDate}` : "- Event/close date: unavailable",
    "",
    "Outcomes:",
    outcomes || "- Outcomes unavailable",
    "",
    "Research goals:",
    goals,
    "",
    "Rules:",
    ...brief.safetyRules.map((rule) => `- ${rule}`),
    "",
    "Important interpretation rules:",
    "- Use real sources only.",
    "- Do not invent sources, quotes, odds, Kalshi matches, wallet history, ROI, win rate, or results.",
    "- Classify each evidence item as YES, NO, NEUTRAL, or UNKNOWN.",
    "- Reddit and social content are weak signals only and cannot be high reliability.",
    "- Kalshi can be used only when the equivalent market is clearly comparable.",
    "- Odds can be used only when market, date, side, and line are comparable.",
    "- Do not trade, do not touch databases, do not use secrets, and do not identify real people behind wallets.",
    "",
    "Return instructions:",
    getSamanthaReturnInstructions(),
    "",
    "Expected JSON schema example:",
    getExpectedSamanthaReportSchema(),
  ].join("\n");
}

export function buildSamanthaTaskPacket(brief: SamanthaResearchBrief): SamanthaTaskPacket {
  const validation = validateResearchBrief(brief);
  const safetyRules = getSamanthaSafetyRules();
  const researchBriefJson = serializeResearchBrief({
    ...brief,
    safetyRules: [...new Set([...brief.safetyRules, ...safetyRules])],
  });
  const expectedReportSchema = getExpectedSamanthaReportSchema();
  const returnInstructions = getSamanthaReturnInstructions();
  const samanthaInstructionsText = buildSamanthaInstructionsText({
    ...brief,
    safetyRules: [...new Set([...brief.safetyRules, ...safetyRules])],
  });
  const taskPacket = {
    expectedReportSchema: JSON.parse(expectedReportSchema),
    researchBrief: JSON.parse(researchBriefJson),
    returnInstructions,
    safetyRules,
    samanthaInstructionsText,
    validation: validation.valid ? "valid" : validation.errors,
    version: "1.0",
  };
  const taskPacketJson = JSON.stringify(taskPacket, null, 2);

  if (
    containsBlockedText(researchBriefJson) ||
    containsBlockedText(expectedReportSchema) ||
    containsBlockedText(returnInstructions) ||
    containsBlockedText(samanthaInstructionsText) ||
    containsBlockedText(taskPacketJson)
  ) {
    return {
      expectedReportSchema,
      researchBriefJson: "{}",
      returnInstructions:
        "Task packet blocked because it may contain sensitive text. Rebuild the market brief.",
      safetyRules,
      samanthaInstructionsText:
        "Task packet blocked because it may contain sensitive text. Rebuild the market brief.",
      taskPacketJson: "{}",
    };
  }

  return {
    expectedReportSchema,
    researchBriefJson,
    returnInstructions,
    safetyRules,
    samanthaInstructionsText,
    taskPacketJson,
  };
}
