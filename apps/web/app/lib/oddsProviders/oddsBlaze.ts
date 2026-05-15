import type {
  ExternalOddsComparison,
  ExternalOddsCompareInput,
  ExternalOddsMatchConfidence,
  ExternalOddsOutcome,
  ExternalOddsProviderConfig,
} from "../externalOddsTypes";
import {
  buildSportsContextParticipants,
  teamNamesLookEquivalent,
} from "../sportsContext";

type OddsBlazeEventTeam = {
  abbreviation?: string;
  name?: string;
};

type OddsBlazeOddsEntry = {
  links?: {
    desktop?: string;
    mobile?: string;
  };
  main?: boolean;
  market?: string;
  name?: string;
  price?: string | number | null;
  selection?: {
    name?: string;
    side?: string;
  };
};

type OddsBlazeEvent = {
  date?: string;
  live?: boolean;
  odds?: OddsBlazeOddsEntry[];
  teams?: {
    away?: OddsBlazeEventTeam;
    home?: OddsBlazeEventTeam;
  };
};

type OddsBlazeResponse = {
  events?: OddsBlazeEvent[];
  league?: {
    id?: string;
    name?: string;
  };
  sportsbook?: {
    id?: string;
    name?: string;
  };
  updated?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function americanOddsToProbability(value: number): number | null {
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  if (value > 0) {
    return 100 / (value + 100);
  }
  return Math.abs(value) / (Math.abs(value) + 100);
}

export function decimalOddsToProbability(value: number): number | null {
  if (!Number.isFinite(value) || value <= 1) {
    return null;
  }
  return 1 / value;
}

export function normalizeProbabilityValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) {
      return value;
    }
    if (value > 1 && value <= 100) {
      return value / 100;
    }
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/%$/, "");
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (value.includes("%")) {
      return parsed / 100;
    }
    if (parsed >= 0 && parsed <= 1) {
      return parsed;
    }
    if (parsed > 1 && parsed <= 100) {
      return parsed / 100;
    }
  }
  return null;
}

export function normalizeOddsPrice(input: {
  format: "american" | "decimal" | "probability";
  value: unknown;
}): Pick<ExternalOddsOutcome, "impliedProbability" | "priceAmerican" | "priceDecimal"> {
  if (input.format === "probability") {
    return {
      impliedProbability: normalizeProbabilityValue(input.value),
      priceAmerican: null,
      priceDecimal: null,
    };
  }
  if (input.format === "decimal") {
    const decimal = toNumber(input.value);
    return {
      impliedProbability: decimal === null ? null : decimalOddsToProbability(decimal),
      priceAmerican: null,
      priceDecimal: decimal,
    };
  }
  const american = toNumber(input.value);
  return {
    impliedProbability: american === null ? null : americanOddsToProbability(american),
    priceAmerican: american,
    priceDecimal: null,
  };
}

function parsePriceFormatFromUrl(url: URL): "american" | "decimal" | "probability" {
  const value = cleanText(url.searchParams.get("price")).toLowerCase();
  if (value === "decimal" || value === "probability") {
    return value;
  }
  return "american";
}

function eventTeams(event: OddsBlazeEvent): string[] {
  return [
    cleanText(event.teams?.away?.name),
    cleanText(event.teams?.home?.name),
    cleanText(event.teams?.away?.abbreviation),
    cleanText(event.teams?.home?.abbreviation),
  ].filter(Boolean);
}

function teamMatchCount(event: OddsBlazeEvent, participants: string[]): number {
  const candidates = eventTeams(event);
  return participants.filter((participant) =>
    candidates.some((candidate) => teamNamesLookEquivalent(participant, candidate)),
  ).length;
}

function sameCalendarDate(left?: string | null, right?: string | null): boolean {
  if (!left || !right) {
    return false;
  }
  return left.slice(0, 10) === right.slice(0, 10);
}

function sameOrAdjacentDate(left?: string | null, right?: string | null): boolean {
  if (!left || !right) {
    return false;
  }
  const a = new Date(left);
  const b = new Date(right);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return false;
  }
  const diffDays = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 1;
}

function matchConfidenceForEvent(
  event: OddsBlazeEvent,
  input: ExternalOddsCompareInput,
): ExternalOddsMatchConfidence {
  const context = buildSportsContextParticipants(input);
  const participants = context.participants;
  if (participants.length < 2) {
    return "unknown";
  }
  const matches = teamMatchCount(event, participants);
  if (matches >= 2 && sameOrAdjacentDate(event.date, context.eventDate)) {
    return "high";
  }
  if (matches >= 2) {
    return "medium";
  }
  if (matches === 1) {
    return "low";
  }
  return "unknown";
}

function pickBestEvent(
  events: OddsBlazeEvent[],
  input: ExternalOddsCompareInput,
): { confidence: ExternalOddsMatchConfidence; event: OddsBlazeEvent | null } {
  const scored = events.map((event) => ({
    confidence: matchConfidenceForEvent(event, input),
    dateExact: sameCalendarDate(event.date, buildSportsContextParticipants(input).eventDate),
    event,
  }));
  const rank = { high: 4, medium: 3, low: 2, unknown: 1 } as const;
  scored.sort((left, right) => {
    const confidenceDelta = rank[right.confidence] - rank[left.confidence];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    if (left.dateExact !== right.dateExact) {
      return left.dateExact ? -1 : 1;
    }
    return 0;
  });
  return {
    confidence: scored[0]?.confidence ?? "unknown",
    event: scored[0]?.event ?? null,
  };
}

function buildNoMatchDiagnostics(
  events: OddsBlazeEvent[],
  input: ExternalOddsCompareInput,
): { limitations: string[]; warnings: string[] } {
  const context = buildSportsContextParticipants(input);
  const participants = context.participants.slice(0, 2);
  if (participants.length < 2) {
    return {
      limitations: ["No hubo participantes suficientes para comparar el mercado contra OddsBlaze."],
      warnings: ["odds_compare_missing_participants"],
    };
  }
  let hasSingleTeamCandidate = false;
  let hasDualTeamWrongDate = false;
  for (const event of events) {
    const matches = teamMatchCount(event, participants);
    if (matches >= 2) {
      if (sameOrAdjacentDate(event.date, context.eventDate)) {
        continue;
      }
      hasDualTeamWrongDate = true;
    } else if (matches === 1) {
      hasSingleTeamCandidate = true;
    }
  }

  if (hasDualTeamWrongDate) {
    return {
      limitations: [
        "OddsBlaze devolvio un evento con ambos equipos, pero la fecha no fue suficientemente cercana para un match seguro.",
      ],
      warnings: ["odds_match_date_mismatch"],
    };
  }
  if (hasSingleTeamCandidate) {
    return {
      limitations: [
        "OddsBlaze devolvio candidatos con un equipo coincidente, pero no encontro un evento con ambos equipos.",
      ],
      warnings: ["odds_match_one_team_only"],
    };
  }
  return {
    limitations: [
      "OddsBlaze no devolvio un evento con ambos equipos bajo los filtros actuales de sportsbook, liga y mercado.",
      "Los filtros main=true, live=false o moneyline pueden excluir este partido en el feed temporal del trial.",
    ],
    warnings: ["odds_match_no_candidate"],
  };
}

function buildPartialMatchDiagnostics(
  event: OddsBlazeEvent,
  input: ExternalOddsCompareInput,
  outcomes: ExternalOddsOutcome[],
): { limitations: string[]; warnings: string[] } {
  const context = buildSportsContextParticipants(input);
  const matches = teamMatchCount(event, context.participants.slice(0, 2));
  if (matches === 1) {
    return {
      limitations: [
        "OddsBlaze encontro un candidato con un equipo coincidente, pero no devolvio un evento con ambos equipos para un match seguro.",
      ],
      warnings: ["odds_match_one_team_only"],
    };
  }
  if (matches >= 2 && outcomes.length < 2) {
    return {
      limitations: [
        "OddsBlaze encontro el evento, pero no devolvio dos lados de moneyline utilizables para comparar este mercado.",
      ],
      warnings: ["odds_market_incomplete"],
    };
  }
  return {
    limitations: ["La comparacion externa quedo parcial o sin match suficientemente claro."],
    warnings:
      matches >= 2
        ? ["odds_market_incomplete"]
        : ["odds_match_low_confidence"],
  };
}

function selectionMatchesTeam(entry: OddsBlazeOddsEntry, teamName: string): boolean {
  const candidates = [
    cleanText(entry.name),
    cleanText(entry.selection?.name),
  ].filter(Boolean);
  return candidates.some((candidate) => teamNamesLookEquivalent(candidate, teamName));
}

function pickOutcomeOdds(
  event: OddsBlazeEvent,
  input: ExternalOddsCompareInput,
  priceFormat: "american" | "decimal" | "probability",
): ExternalOddsOutcome[] {
  const context = buildSportsContextParticipants(input);
  if (context.participants.length < 2 || !Array.isArray(event.odds)) {
    return [];
  }
  const moneylineOdds = event.odds.filter((entry) =>
    cleanText(entry.market).toLowerCase().includes("moneyline"),
  );
  return context.participants
    .map((participant) => {
      const matchedEntry = moneylineOdds.find((entry) => selectionMatchesTeam(entry, participant));
      if (!matchedEntry) {
        return null;
      }
      const prices = normalizeOddsPrice({
        format: priceFormat,
        value: matchedEntry.price,
      });
      return {
        impliedProbability: prices.impliedProbability,
        label: participant,
        priceAmerican: prices.priceAmerican,
        priceDecimal: prices.priceDecimal,
        sourceOutcomeName: cleanText(matchedEntry.name || matchedEntry.selection?.name) || participant,
      } satisfies ExternalOddsOutcome;
    })
    .filter((entry): entry is ExternalOddsOutcome => Boolean(entry));
}

function bestSourceUrlForEvent(event: OddsBlazeEvent): string | null {
  const matched = (event.odds ?? []).find((entry) => cleanText(entry.links?.desktop));
  return cleanText(matched?.links?.desktop) || null;
}

export async function fetchOddsBlazeComparison(
  input: ExternalOddsCompareInput,
  config: ExternalOddsProviderConfig & { apiKey?: string | null; requestUrl: URL },
): Promise<ExternalOddsComparison> {
  const checkedAt = nowIso();
  if (!config.enabled) {
    return {
      bestSourceUrl: null,
      checkedAt,
      eventName: null,
      eventStartTime: null,
      league: config.league || null,
      limitations: ["Proveedor de odds no configurado."],
      matchConfidence: "unknown",
      matchedMarket: false,
      outcomes: [],
      providerName: config.name,
      sportsbook: config.sportsbook,
      status: "disabled",
      warnings: [],
    };
  }
  if (!config.apiKey) {
    return {
      bestSourceUrl: null,
      checkedAt,
      eventName: null,
      eventStartTime: null,
      league: config.league || null,
      limitations: ["Falta la API key server-side para el proveedor temporal de odds."],
      matchConfidence: "unknown",
      matchedMarket: false,
      outcomes: [],
      providerName: config.name,
      sportsbook: config.sportsbook,
      status: "unavailable",
      warnings: ["odds_provider_missing_key"],
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.requestUrl.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        bestSourceUrl: null,
        checkedAt,
        eventName: null,
        eventStartTime: null,
        league: config.league || null,
        limitations: ["El proveedor externo no devolvio una respuesta usable."],
        matchConfidence: "unknown",
        matchedMarket: false,
        outcomes: [],
        providerName: config.name,
        sportsbook: config.sportsbook,
        status: response.status >= 500 ? "unavailable" : "error",
        warnings: [`odds_provider_http_${response.status}`],
      };
    }
    const parsed = (await response.json().catch(() => null)) as OddsBlazeResponse | null;
    if (!parsed || !Array.isArray(parsed.events)) {
      return {
        bestSourceUrl: null,
        checkedAt,
        eventName: null,
        eventStartTime: null,
        league: parsed?.league?.name || config.league || null,
        limitations: ["El proveedor externo devolvio un payload sin eventos comparables."],
        matchConfidence: "unknown",
        matchedMarket: false,
        outcomes: [],
        providerName: config.name,
        sportsbook: parsed?.sportsbook?.name || config.sportsbook,
        status: "partial",
        warnings: ["odds_provider_empty_events"],
      };
    }

    const best = pickBestEvent(parsed.events, input);
    if (!best.event || best.confidence === "unknown") {
      const diagnostics = buildNoMatchDiagnostics(parsed.events, input);
      return {
        bestSourceUrl: null,
        checkedAt: parsed.updated || checkedAt,
        eventName: null,
        eventStartTime: null,
        league: parsed.league?.name || config.league || null,
        limitations: [
          "OddsBlaze respondio, pero no hubo match claro contra este mercado de Polymarket.",
          ...diagnostics.limitations,
        ],
        matchConfidence: "unknown",
        matchedMarket: false,
        outcomes: [],
        providerName: config.name,
        sportsbook: parsed.sportsbook?.name || config.sportsbook,
        status: "no_match",
        warnings: diagnostics.warnings,
      };
    }

    const priceFormat = parsePriceFormatFromUrl(config.requestUrl);
    const outcomes = pickOutcomeOdds(best.event, input, priceFormat);
    const awayName = cleanText(best.event.teams?.away?.name);
    const homeName = cleanText(best.event.teams?.home?.name);
    const eventName = [awayName, homeName].filter(Boolean).join(" vs. ") || null;
    const matchedMarket = (best.confidence === "high" || best.confidence === "medium") && outcomes.length >= 2;
    const partialDiagnostics =
      matchedMarket ? null : buildPartialMatchDiagnostics(best.event, input, outcomes);
    return {
      bestSourceUrl: bestSourceUrlForEvent(best.event),
      checkedAt: parsed.updated || checkedAt,
      eventName,
      eventStartTime: cleanText(best.event.date) || null,
      league: parsed.league?.name || config.league || null,
      limitations: [
        matchedMarket
          ? "Usar solo como comparacion externa de mercado, no como recomendacion automatica."
          : (partialDiagnostics?.limitations[0] ?? "La comparacion externa quedo parcial o sin match suficientemente claro."),
      ],
      matchConfidence: best.confidence,
      matchedMarket,
      outcomes,
      providerName: config.name,
      sportsbook: parsed.sportsbook?.name || config.sportsbook,
      status:
        matchedMarket
          ? "available"
          : best.confidence === "low" || outcomes.length > 0
            ? "partial"
            : "no_match",
      warnings: matchedMarket ? [] : (partialDiagnostics?.warnings ?? []),
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
    return {
      bestSourceUrl: null,
      checkedAt,
      eventName: null,
      eventStartTime: null,
      league: config.league || null,
      limitations: [timedOut ? "OddsBlaze no respondio a tiempo." : "No se pudo completar la consulta de odds externas."],
      matchConfidence: "unknown",
      matchedMarket: false,
      outcomes: [],
      providerName: config.name,
      sportsbook: config.sportsbook,
      status: timedOut ? "timeout" : "error",
      warnings: [timedOut ? "odds_provider_timeout" : "odds_provider_error"],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
