export type EvidenceDirection = "NEUTRAL" | "NO" | "UNKNOWN" | "YES";
export type EvidenceReliability = "high" | "low" | "medium" | "unknown";
export type ResearchSourceType =
  | "injury_report"
  | "league"
  | "odds_reference"
  | "official_team"
  | "social_signal"
  | "sports_news"
  | "stats_provider"
  | "unknown";

export type EvidenceSource = {
  isExternal: boolean;
  name: string;
  provider?: string;
  reliability: EvidenceReliability;
  url?: string;
};

export type EvidenceItem = {
  capturedAt: string;
  direction: EvidenceDirection;
  id: string;
  isExternal: boolean;
  isUserVisible: boolean;
  publishedAt?: string;
  reliability: EvidenceReliability;
  sourceName: string;
  summary: string;
  title: string;
  url?: string;
};

export type EvidenceSummary = {
  capturedAt?: string;
  externalCount: number;
  highReliabilityCount: number;
  items: EvidenceItem[];
  latestPublishedAt?: string;
  visibleCount: number;
};

export type ResearchFinding = {
  capturedAt: string;
  direction: EvidenceDirection;
  eventSlug?: string;
  id: string;
  isReal: boolean;
  isUserVisible: boolean;
  marketId?: string;
  publishedAt?: string;
  reliability: EvidenceReliability;
  sourceName?: string;
  sourceType: ResearchSourceType;
  summary: string;
  title: string;
  url?: string;
};

export function normalizeResearchReliability(
  sourceType: ResearchSourceType,
  reliability: EvidenceReliability = "unknown",
): EvidenceReliability {
  if (sourceType === "social_signal") {
    return reliability === "unknown" ? "low" : reliability;
  }
  return reliability;
}

export function summarizeEvidence(items: EvidenceItem[]): EvidenceSummary {
  const visibleItems = items.filter((item) => item.isUserVisible);
  const externalItems = items.filter((item) => item.isExternal);
  const latestPublishedAt = items
    .map((item) => item.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    externalCount: externalItems.length,
    highReliabilityCount: items.filter((item) => item.reliability === "high").length,
    items,
    latestPublishedAt,
    visibleCount: visibleItems.length,
  };
}
