export type SoccerTeamContext = {
  confidence: "high" | "low" | "medium";
  name: string;
  role: "away" | "home" | "unknown";
};

export type SoccerMatchContext = {
  dateConfidence: "high" | "low" | "medium" | "unknown";
  league?: string;
  matchTitle: string;
  missing: string[];
  source: "event_title" | "market_title" | "slug" | "unknown";
  sport?: string;
  startTime?: string;
  teamA?: SoccerTeamContext;
  teamB?: SoccerTeamContext;
  warnings: string[];
};

export type SoccerContextReadiness = {
  hasDate: boolean;
  hasLeague: boolean;
  hasTeams: boolean;
  level: "none" | "partial" | "ready";
  missing: string[];
  readyForExternalResearch: boolean;
  teamCount: number;
  warnings: string[];
};

export type SoccerMatchContextInput = {
  candidate_context?: {
    sport?: string | null;
  } | null;
  close_time?: string | null;
  end_date?: string | null;
  eventSlug?: string | null;
  event_time?: string | null;
  event_title?: string | null;
  league?: string | null;
  links?: {
    polymarket_event_slug?: string | null;
    polymarket_market_slug?: string | null;
  } | null;
  market?: {
    close_time?: string | null;
    end_date?: string | null;
    event_category?: string | null;
    event_slug?: string | null;
    event_title?: string | null;
    league?: string | null;
    market_slug?: string | null;
    question?: string | null;
    slug?: string | null;
    sport_type?: string | null;
  } | null;
  marketSlug?: string | null;
  market_slug?: string | null;
  question?: string | null;
  slug?: string | null;
  sport?: string | null;
  sport_type?: string | null;
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeSport(value?: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function humanizeSlug(value?: string): string {
  if (!value) {
    return "Partido sin titulo";
  }
  return value
    .replace(/-\d{4}-\d{2}-\d{2}.*/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTeamName(value: string): string {
  return value
    .replace(/^will\s+/i, "")
    .replace(/\s+(?:win|draw|beat|qualify|advance)\b.*$/i, "")
    .replace(/\s+on\s+\d{4}-\d{2}-\d{2}.*$/i, "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getTeamNamesFromTitle(title: string): string[] {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const versusSplit = normalized.split(/\s+(?:vs\.?|v\.?|versus)\s+/i);
  if (versusSplit.length >= 2) {
    return versusSplit
      .slice(0, 2)
      .map(cleanTeamName)
      .filter(Boolean);
  }

  const willWin = normalized.match(/^Will\s+(.+?)\s+win\b/i);
  if (willWin?.[1]) {
    return [cleanTeamName(willWin[1])].filter(Boolean);
  }

  return [];
}

function buildMissing(context: {
  hasDate: boolean;
  hasLeague: boolean;
  teamCount: number;
}): string[] {
  const missing: string[] = [];
  if (context.teamCount < 2) {
    missing.push("Equipos no confirmados.");
  }
  if (!context.hasDate) {
    missing.push("Fecha u hora del partido no disponible.");
  }
  if (!context.hasLeague) {
    missing.push("Liga o competicion no disponible.");
  }
  missing.push("Local/visitante no confirmado.");
  missing.push("Forma reciente pendiente.");
  missing.push("Lesiones y suspensiones pendientes.");
  missing.push("Odds externas pendientes.");
  missing.push("Historial y calibracion pendientes.");
  return [...new Set(missing)];
}

export function extractSoccerMatchContext(input: SoccerMatchContextInput): SoccerMatchContext {
  const sport = pickString(
    input.market?.sport_type,
    input.candidate_context?.sport,
    input.sport_type,
    input.sport,
  );
  const eventTitle = pickString(input.market?.event_title, input.event_title);
  const marketTitle = pickString(input.market?.question, input.question);
  const slug = pickString(
    input.market?.event_slug,
    input.eventSlug,
    input.links?.polymarket_event_slug,
    input.market?.market_slug,
    input.market_slug,
    input.marketSlug,
    input.links?.polymarket_market_slug,
    input.market?.slug,
    input.slug,
  );
  const title = eventTitle || marketTitle || humanizeSlug(slug);
  const source: SoccerMatchContext["source"] = eventTitle
    ? "event_title"
    : marketTitle
      ? "market_title"
      : slug
        ? "slug"
        : "unknown";
  const teams = getTeamNamesFromTitle(title);
  const teamConfidence: SoccerTeamContext["confidence"] =
    source === "event_title" && teams.length >= 2 ? "high" : teams.length >= 2 ? "medium" : "low";
  const startTime = pickString(
    input.market?.close_time,
    input.close_time,
    input.event_time,
    input.market?.end_date,
    input.end_date,
  );
  const league = pickString(input.market?.league, input.league);
  const teamCount = teams.length;
  const warnings: string[] = [];

  if (source === "slug") {
    warnings.push("El contexto viene de un slug y puede ser incompleto.");
  }
  if (teamCount > 0) {
    warnings.push("Local y visitante no estan confirmados en los datos actuales.");
  }
  if (sport && normalizeSport(sport) !== "soccer") {
    warnings.push("El mercado no esta marcado como futbol.");
  }

  return {
    dateConfidence: startTime ? "high" : "unknown",
    league,
    matchTitle: title,
    missing: buildMissing({
      hasDate: Boolean(startTime),
      hasLeague: Boolean(league),
      teamCount,
    }),
    source,
    sport,
    startTime,
    teamA: teams[0]
      ? {
          confidence: teamConfidence,
          name: teams[0],
          role: "unknown",
        }
      : undefined,
    teamB: teams[1]
      ? {
          confidence: teamConfidence,
          name: teams[1],
          role: "unknown",
        }
      : undefined,
    warnings,
  };
}

export function getSoccerContextReadiness(context: SoccerMatchContext): SoccerContextReadiness {
  const teamCount = [context.teamA, context.teamB].filter(Boolean).length;
  const hasTeams = teamCount >= 2;
  const hasDate = Boolean(context.startTime);
  const hasLeague = Boolean(context.league);
  const readyForExternalResearch = hasTeams && hasDate;
  const level: SoccerContextReadiness["level"] = readyForExternalResearch
    ? "ready"
    : teamCount > 0 || hasDate
      ? "partial"
      : "none";
  return {
    hasDate,
    hasLeague,
    hasTeams,
    level,
    missing: context.missing,
    readyForExternalResearch,
    teamCount,
    warnings: context.warnings,
  };
}

export function formatSoccerMatchContext(context: SoccerMatchContext): string {
  if (context.teamA?.name && context.teamB?.name) {
    return `${context.teamA.name} vs ${context.teamB.name}`;
  }
  return context.matchTitle;
}
