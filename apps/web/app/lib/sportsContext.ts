import type { ExternalOddsCompareInput } from "./externalOddsTypes";

export type SportsContextNbaParticipantSet = {
  eventDate: string | null;
  league: "NBA" | null;
  participants: string[];
  reliableHomeAway: boolean;
  source: "market_outcomes" | "slug" | "title" | "unknown";
  sport: "basketball" | "nba" | "unknown";
};

const NBA_TEAM_CODE_NAMES: Record<string, string> = {
  atl: "Hawks",
  bkn: "Nets",
  bos: "Celtics",
  cha: "Hornets",
  chi: "Bulls",
  cle: "Cavaliers",
  dal: "Mavericks",
  den: "Nuggets",
  det: "Pistons",
  gsw: "Warriors",
  hou: "Rockets",
  ind: "Pacers",
  lac: "Clippers",
  lal: "Lakers",
  mem: "Grizzlies",
  mia: "Heat",
  mil: "Bucks",
  min: "Timberwolves",
  nop: "Pelicans",
  nyk: "Knicks",
  okc: "Thunder",
  orl: "Magic",
  phi: "76ers",
  phx: "Suns",
  por: "Trail Blazers",
  sac: "Kings",
  sas: "Spurs",
  tor: "Raptors",
  uta: "Jazz",
  was: "Wizards",
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function parseDateFromSlug(value?: string | null): string | null {
  const match = cleanText(value).match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] ?? null;
}

function participantsFromSlug(slug?: string | null): string[] {
  const normalized = cleanText(slug).toLowerCase();
  const match = normalized.match(/^nba-([a-z]{2,4})-([a-z]{2,4})-(20\d{2}-\d{2}-\d{2})$/);
  if (!match) {
    return [];
  }
  const [, awayCode, homeCode] = match;
  const away = NBA_TEAM_CODE_NAMES[awayCode];
  const home = NBA_TEAM_CODE_NAMES[homeCode];
  if (!away || !home) {
    return [];
  }
  return [away, home];
}

function participantsFromOutcomes(
  outcomes?: ExternalOddsCompareInput["outcomePrices"],
): string[] {
  if (!Array.isArray(outcomes)) {
    return [];
  }
  return uniq(
    outcomes
      .map((outcome) => cleanText(outcome?.label))
      .filter((label) => {
        const normalized = normalizeToken(label);
        return normalized && normalized !== "yes" && normalized !== "no" && normalized !== "draw";
      }),
  ).slice(0, 4);
}

function participantsFromTitle(title?: string | null): string[] {
  const cleaned = cleanText(title);
  if (!cleaned) {
    return [];
  }
  const versusMatch = cleaned.split(/\s+vs\.?\s+/i).map((part) => cleanText(part));
  if (versusMatch.length === 2 && versusMatch.every(Boolean)) {
    return uniq(versusMatch);
  }
  return [];
}

export function buildSportsContextParticipants(
  input: ExternalOddsCompareInput,
): SportsContextNbaParticipantSet {
  const sport = normalizeToken(cleanText(input.sport || input.league));
  const slug = cleanText(input.marketSlug || input.eventSlug);
  const outcomeParticipants = participantsFromOutcomes(input.outcomePrices);
  if ((sport === "nba" || sport === "basketball") && outcomeParticipants.length >= 2) {
    return {
      eventDate: cleanText(input.eventDate) || parseDateFromSlug(slug),
      league: "NBA",
      participants: outcomeParticipants.slice(0, 2),
      reliableHomeAway: false,
      source: "market_outcomes",
      sport: sport === "basketball" ? "basketball" : "nba",
    };
  }
  const slugParticipants = participantsFromSlug(slug);
  if ((sport === "nba" || sport === "basketball") && slugParticipants.length >= 2) {
    return {
      eventDate: cleanText(input.eventDate) || parseDateFromSlug(slug),
      league: "NBA",
      participants: slugParticipants,
      reliableHomeAway: false,
      source: "slug",
      sport: sport === "basketball" ? "basketball" : "nba",
    };
  }
  const titleParticipants = participantsFromTitle(input.marketTitle);
  if ((sport === "nba" || sport === "basketball") && titleParticipants.length >= 2) {
    return {
      eventDate: cleanText(input.eventDate) || parseDateFromSlug(slug),
      league: "NBA",
      participants: titleParticipants.slice(0, 2),
      reliableHomeAway: false,
      source: "title",
      sport: sport === "basketball" ? "basketball" : "nba",
    };
  }
  return {
    eventDate: cleanText(input.eventDate) || parseDateFromSlug(slug),
    league: sport === "nba" || sport === "basketball" ? "NBA" : null,
    participants: uniq((input.participants ?? []).map((entry) => cleanText(entry))).slice(0, 4),
    reliableHomeAway: false,
    source: "unknown",
    sport: sport === "nba" || sport === "basketball" ? (sport as "basketball" | "nba") : "unknown",
  };
}

export function normalizeTeamComparableName(value: string): string {
  const normalized = normalizeToken(value);
  if (normalized === "trailblazers") {
    return "blazers";
  }
  if (normalized === "sixers") {
    return "76ers";
  }
  return normalized;
}

export function teamNamesLookEquivalent(left: string, right: string): boolean {
  const a = normalizeTeamComparableName(left);
  const b = normalizeTeamComparableName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}
