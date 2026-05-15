import type { MarketOverviewItem } from "./marketOverview";

export type SportsContextProviderStatus =
  | "available"
  | "partial"
  | "not_connected"
  | "unavailable"
  | "timeout"
  | "insufficient";

export type SportsContextEvidence = {
  checkedAt: string;
  eventDate: string | null;
  homeTeam: string | null;
  injuries: {
    available: boolean;
    sourceName: string | null;
    summary: string | null;
  };
  isHomeAwayReliable: boolean;
  league: "NBA" | null;
  limitations: string[];
  marketCloseTime: string | null;
  participants: string[];
  recentForm: {
    available: boolean;
    sourceName: string | null;
    summary: string | null;
  };
  scheduleContext: {
    available: boolean;
    backToBackAway: boolean | null;
    backToBackHome: boolean | null;
    restDaysAway: number | null;
    restDaysHome: number | null;
    sourceName: string | null;
  };
  sport: "basketball" | "nba" | "unknown";
  status: SportsContextProviderStatus;
  venue: string | null;
  warnings: string[];
  awayTeam: string | null;
};

type TeamCodeMap = Record<string, string>;

const NBA_TEAM_CODES: TeamCodeMap = {
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

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned || null;
}

function normalizeSport(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function slugCandidates(item?: MarketOverviewItem | null): string[] {
  return [
    item?.market?.market_slug,
    item?.market?.event_slug,
    item?.market?.question,
    item?.market?.event_title,
  ]
    .map(cleanText)
    .filter((value): value is string => Boolean(value));
}

function extractDateFromSlug(slug?: string | null): string | null {
  if (!slug) {
    return null;
  }
  return slug.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
}

function parseNbaSlug(slug?: string | null): {
  awayCode: string | null;
  date: string | null;
  homeCode: string | null;
  participants: string[];
} {
  if (!slug) {
    return { awayCode: null, date: null, homeCode: null, participants: [] };
  }
  const normalized = slug.trim().toLowerCase();
  const match = normalized.match(/^nba-([a-z]{2,4})-([a-z]{2,4})-(20\d{2}-\d{2}-\d{2})$/);
  if (!match) {
    return { awayCode: null, date: extractDateFromSlug(slug), homeCode: null, participants: [] };
  }
  const awayCode = match[1];
  const homeCode = match[2];
  const date = match[3];
  const participants = [NBA_TEAM_CODES[awayCode], NBA_TEAM_CODES[homeCode]].filter(
    (value): value is string => Boolean(value),
  );
  return { awayCode, date, homeCode, participants };
}

function titleParticipants(item?: MarketOverviewItem | null): string[] {
  const title = cleanText(item?.market?.event_title) || cleanText(item?.market?.question);
  if (!title) {
    return [];
  }
  const parts = title.split(/\s+(?:vs\.?|v\.?|versus)\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : [];
}

export function getNbaParticipantsFromSlug(slug?: string | null): string[] {
  return parseNbaSlug(slug).participants;
}

export function buildSportsContextEvidence(item?: MarketOverviewItem | null): SportsContextEvidence {
  const sport = normalizeSport(item?.market?.sport_type);
  const sportKind: SportsContextEvidence["sport"] =
    sport === "nba" || sport === "basketball" ? "nba" : "unknown";
  const slug = slugCandidates(item).find((candidate) => candidate.startsWith("nba-")) || cleanText(item?.market?.market_slug) || cleanText(item?.market?.event_slug);
  const parsed = parseNbaSlug(slug);
  const titleTeams = titleParticipants(item);
  const participants = parsed.participants.length > 0 ? parsed.participants : titleTeams;
  const closeTime = cleanText(item?.market?.close_time) || cleanText(item?.market?.end_date);
  const eventDate = parsed.date || closeTime?.slice(0, 10) || null;
  const hasDerivedContext = sportKind === "nba" && participants.length >= 2 && Boolean(eventDate);
  const warnings: string[] = [];
  if (sportKind === "nba" && participants.length >= 2) {
    warnings.push("Local/visitante no confirmado por fuente externa.");
  }
  const limitations = [
    "Equipos y fecha pueden derivarse de Polymarket/Gamma, pero no reemplazan una fuente deportiva independiente.",
    "No se infieren descanso, back-to-back, forma reciente ni lesiones sin fuente real.",
  ];
  return {
    awayTeam: participants[0] ?? null,
    checkedAt: new Date().toISOString(),
    eventDate,
    homeTeam: participants[1] ?? null,
    injuries: {
      available: false,
      sourceName: null,
      summary: null,
    },
    isHomeAwayReliable: false,
    league: sportKind === "nba" ? "NBA" : null,
    limitations,
    marketCloseTime: closeTime,
    participants,
    recentForm: {
      available: false,
      sourceName: null,
      summary: null,
    },
    scheduleContext: {
      available: false,
      backToBackAway: null,
      backToBackHome: null,
      restDaysAway: null,
      restDaysHome: null,
      sourceName: null,
    },
    sport: sportKind,
    status: hasDerivedContext ? "partial" : sportKind === "nba" ? "insufficient" : "unavailable",
    venue: null,
    warnings,
  };
}
