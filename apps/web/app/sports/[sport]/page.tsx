"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiErrorState,
  ComingSoonModule,
  EmptyState,
  LoadingState,
} from "../../components/DataState";
import { MainNavigation } from "../../components/MainNavigation";
import {
  SportsSelectorBar,
  getSportSelectorOption,
  isSportBackendEnabled,
  sportsSelectorOptions,
  type SportSelectorOption,
} from "../../components/SportsSelectorBar";
import {
  fetchApiJson,
  friendlyApiError,
} from "../../lib/api";
import { deriveMarketLifecycle } from "../../lib/marketLifecycle";

type PolySignalScore = {
  score_probability?: string | number | null;
  market_yes_price?: string | number | null;
  edge_percent_points?: string | number | null;
  confidence_label?: string | null;
  color_hint?: string | null;
  label?: string | null;
};

type UpcomingSportsMarket = {
  market_id: number;
  remote_id?: string | null;
  question: string;
  event_title?: string | null;
  event_slug?: string | null;
  market_slug?: string | null;
  sport: string;
  market_shape: string;
  active?: boolean | null;
  closed?: boolean | null;
  close_time?: string | null;
  event_time?: string | null;
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  urgency_score?: string | number | null;
  reasons?: string[];
  warnings?: string[];
  has_snapshot?: boolean;
  has_prediction?: boolean;
  polysignal_score?: PolySignalScore | null;
};

type UpcomingSportsResponse = {
  count: number;
  limit: number;
  items: UpcomingSportsMarket[];
  counts?: Record<string, number>;
};

type UpcomingDataQualityItem = {
  market_id: number;
  quality_label: string;
  has_snapshot: boolean;
  has_yes_price: boolean;
  has_no_price: boolean;
  has_polysignal_score: boolean;
  missing_fields: string[];
  warnings: string[];
};

type UpcomingDataQualityResponse = {
  summary: Record<string, number>;
  items: UpcomingDataQualityItem[];
};

type PageState = {
  items: UpcomingSportsMarket[];
  counts: Record<string, number> | null;
  qualitySummary: Record<string, number> | null;
  qualityItems: UpcomingDataQualityItem[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
};

type MarketOverviewItem = {
  priority_rank?: number | null;
  priority_bucket?: string | null;
  scoring_mode?: string | null;
  market?: {
    id?: number | null;
    question?: string | null;
    event_title?: string | null;
    sport_type?: string | null;
    market_type?: string | null;
    close_time?: string | null;
    end_date?: string | null;
    event_slug?: string | null;
    market_slug?: string | null;
    remote_id?: string | null;
    active?: boolean | null;
    closed?: boolean | null;
  } | null;
  latest_snapshot?: {
    yes_price?: string | number | null;
    no_price?: string | number | null;
    liquidity?: string | number | null;
    volume?: string | number | null;
    captured_at?: string | null;
  } | null;
  latest_prediction?: {
    yes_probability?: string | number | null;
    no_probability?: string | number | null;
    confidence_score?: string | number | null;
    action_score?: string | number | null;
    edge_signed?: string | number | null;
    edge_magnitude?: string | number | null;
  } | null;
};

type MarketsOverviewResponse = {
  total_count?: number;
  items?: MarketOverviewItem[];
};

const supportedSportIds = new Set<string>(
  sportsSelectorOptions
    .filter((option) => option.id !== "all" && option.backendSupported)
    .map((option) => option.id),
);
const knownSportIds = new Set<string>(
  sportsSelectorOptions
    .filter((option) => option.id !== "all")
    .map((option) => option.id),
);

function resolveSportOption(value: string): SportSelectorOption {
  const option = getSportSelectorOption(value);
  if (
    option.id !== "all" &&
    (supportedSportIds.has(option.id) || knownSportIds.has(option.id))
  ) {
    return option;
  }
  return getSportSelectorOption("all");
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

function normalizeProbability(value: unknown): number | null {
  const number = toNumber(value);
  if (number === null || number < 0) {
    return null;
  }
  if (number <= 1) {
    return number;
  }
  if (number <= 100) {
    return number / 100;
  }
  return null;
}

function formatPercent(value: unknown): string {
  const number = normalizeProbability(value);
  if (number === null) {
    return "--";
  }
  return `${(number * 100).toFixed(1)}%`;
}

function formatMetric(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }
  return new Intl.NumberFormat("es", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatScore(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  return number.toFixed(1);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPercentPoints(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }
  return `${number > 0 ? "+" : ""}${number.toFixed(1)} pts`;
}

function formatMarketShape(value: string): string {
  const labels: Record<string, string> = {
    match_winner: "Ganador del partido",
    championship: "Campeonato",
    futures: "Futuro",
    player_prop: "Jugador",
    team_prop: "Equipo",
    yes_no_generic: "SÍ/NO",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function buildUpcomingPath(option: SportSelectorOption): string {
  const params = new URLSearchParams({
    limit: "50",
  });
  if (option.apiValue) {
    params.set("sport_type", option.apiValue);
  }
  return `/markets/overview?${params.toString()}`;
}

function buildDataQualityPath(option: SportSelectorOption): string {
  const params = new URLSearchParams({
    limit: "50",
    days: "7",
  });
  if (option.apiValue) {
    params.set("sport", option.apiValue);
  }
  return `/research/upcoming-sports/data-quality?${params.toString()}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  return fetchApiJson<T>(path);
}

function mapOverviewItem(item: MarketOverviewItem): UpcomingSportsMarket | null {
  const market = item.market;
  if (!market?.id) {
    return null;
  }
  const snapshot = item.latest_snapshot ?? {};
  const prediction = item.latest_prediction;
  const edgeSigned = toNumber(prediction?.edge_signed);
  return {
    market_id: market.id,
    remote_id: market.remote_id,
    question: market.question || "Mercado sin título",
    event_title: market.event_title,
    event_slug: market.event_slug,
    market_slug: market.market_slug,
    sport: market.sport_type || "unknown",
    market_shape: market.market_type || "match_winner",
    active: market.active,
    closed: market.closed,
    close_time: market.close_time ?? market.end_date ?? null,
    event_time: market.close_time ?? market.end_date ?? null,
    market_yes_price: snapshot.yes_price,
    market_no_price: snapshot.no_price,
    liquidity: snapshot.liquidity,
    volume: snapshot.volume,
    urgency_score: prediction?.action_score ?? item.priority_rank ?? null,
    warnings: item.priority_bucket ? [item.priority_bucket] : [],
    has_snapshot: Boolean(item.latest_snapshot),
    has_prediction: Boolean(item.latest_prediction),
    polysignal_score: prediction
      ? {
          score_probability: prediction.yes_probability,
          market_yes_price: snapshot.yes_price,
          edge_percent_points: edgeSigned === null ? null : edgeSigned * 100,
          confidence_label: formatPercent(prediction.confidence_score),
          color_hint: item.priority_bucket === "fallback_only" ? "neutral" : "positive",
          label: item.scoring_mode,
        }
      : null,
  };
}

function buildQualityItem(market: UpcomingSportsMarket): UpcomingDataQualityItem {
  const lifecycle = deriveSportsMarketLifecycle(market);
  const warnings = new Set(market.warnings ?? []);
  if (lifecycle.status === "missed_live_snapshot") {
    warnings.add("Sin snapshot en vivo");
  } else if (lifecycle.isExpired) {
    warnings.add("Cerrado");
  }
  return {
    market_id: market.market_id,
    quality_label:
      lifecycle.status === "missed_live_snapshot"
        ? "Sin snapshot en vivo"
        : market.polysignal_score
          ? "Completo"
          : "Parcial",
    has_snapshot: market.market_yes_price !== null && market.market_yes_price !== undefined,
    has_yes_price: market.market_yes_price !== null && market.market_yes_price !== undefined,
    has_no_price: market.market_no_price !== null && market.market_no_price !== undefined,
    has_polysignal_score: Boolean(market.polysignal_score),
    missing_fields: [],
    warnings: Array.from(warnings),
  };
}

function deriveSportsMarketLifecycle(market: UpcomingSportsMarket) {
  return deriveMarketLifecycle({
    active: market.active,
    closed: market.closed,
    close_time: market.close_time,
    end_date: market.event_time,
    question: market.question,
    event_slug: market.event_slug,
    market_slug: market.market_slug,
    latest_snapshot: market.has_snapshot ? true : null,
    latest_prediction: market.has_prediction ? true : null,
  });
}

function PolySignalMiniScore({
  dataQuality,
  score,
}: {
  dataQuality?: UpcomingDataQualityItem;
  score?: PolySignalScore | null;
}) {
  if (!score?.score_probability) {
    return (
      <div className="sports-market-score warning">
        <span>PolySignal SÍ</span>
        <strong>pendiente</strong>
        <p>
          {dataQuality?.has_snapshot === false || dataQuality?.has_yes_price === false
            ? "Faltan precios o snapshots para estimar."
            : "Faltan datos suficientes para estimar."}
        </p>
      </div>
    );
  }

  return (
    <div className={`sports-market-score ${score.color_hint ?? "neutral"}`}>
      <span>PolySignal SÍ</span>
      <strong>{formatPercent(score.score_probability)}</strong>
      <p>
        Mercado SÍ {formatPercent(score.market_yes_price)} | Diferencia{" "}
        {formatPercentPoints(score.edge_percent_points)} | Confianza{" "}
        {score.confidence_label ?? "N/D"}
      </p>
    </div>
  );
}

function DataQualityMiniBadges({ item }: { item?: UpcomingDataQualityItem }) {
  if (!item) {
    return null;
  }
  const badges: string[] = [];
  if (!item.has_snapshot) {
    badges.push("Sin snapshot");
  }
  if (!item.has_yes_price || !item.has_no_price) {
    badges.push("Faltan precios");
  }
  if (!item.has_polysignal_score) {
    badges.push("Score pendiente");
  }
  if (badges.length === 0) {
    badges.push(item.quality_label);
  }
  return (
    <div className="data-quality-badges">
      {badges.slice(0, 4).map((badge) => (
        <span className="warning-chip" key={badge}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function SportMarketCard({
  dataQuality,
  market,
}: {
  dataQuality?: UpcomingDataQualityItem;
  market: UpcomingSportsMarket;
}) {
  const lifecycle = deriveSportsMarketLifecycle(market);
  return (
    <article className={`sports-market-card ${lifecycle.isExpired ? "is-expired" : ""}`}>
      <div className="sports-market-card-header">
        <div className="badge-row">
          <span className="candidate-id">#{market.market_id}</span>
          <span className="badge">{formatMarketShape(market.market_shape)}</span>
          <span className="badge muted">Cierra {formatDateTime(market.close_time)}</span>
          {lifecycle.status !== "live" && lifecycle.status !== "unknown" ? (
            <span className="warning-chip">{lifecycle.label}</span>
          ) : null}
        </div>
        <span className="urgency-pill medium">{formatScore(market.urgency_score)}</span>
      </div>
      <h2>{market.question || "Mercado sin título"}</h2>
      {market.event_title ? <p>{market.event_title}</p> : null}
      <DataQualityMiniBadges item={dataQuality} />

      <div className="sports-market-metrics">
        <div>
          <span>Precio SÍ</span>
          <strong>{formatPercent(market.market_yes_price)}</strong>
        </div>
        <div>
          <span>Precio NO</span>
          <strong>{formatPercent(market.market_no_price)}</strong>
        </div>
        <div>
          <span>Liquidez</span>
          <strong>{formatMetric(market.liquidity)}</strong>
        </div>
        <div>
          <span>Volumen</span>
          <strong>{formatMetric(market.volume)}</strong>
        </div>
      </div>

      <PolySignalMiniScore dataQuality={dataQuality} score={market.polysignal_score} />

      <div className="sports-market-actions">
        <Link className="analysis-link" href={`/markets/${market.market_id}`}>
          Ver análisis
        </Link>
      </div>
    </article>
  );
}

type SoccerTeamMeta = {
  initials: string;
  shortName: string;
  tone: string;
};

type ParsedSoccerQuestion =
  | { kind: "win"; team: string; date: string | null }
  | { kind: "exact_score"; homeTeam: string; awayTeam: string; date: string | null }
  | { kind: "exact_other"; date: string | null }
  | { kind: "halftime"; team: string; date: string | null }
  | { kind: "draw"; homeTeam: string | null; awayTeam: string | null; date: string | null }
  | { kind: "unknown"; date: string | null };

type SoccerMatch = {
  key: string;
  homeTeam: string;
  awayTeam: string;
  date: string | null;
  dateSource: "market" | "question" | "none";
  markets: UpcomingSportsMarket[];
  homeWin?: UpcomingSportsMarket;
  awayWin?: UpcomingSportsMarket;
  draw?: UpcomingSportsMarket;
  extras: UpcomingSportsMarket[];
};

type SoccerScheduleSection = {
  key: string;
  label: string;
  matches: SoccerMatch[];
};

const SOCCER_TEAM_BADGES: Record<string, SoccerTeamMeta> = {
  "bengaluru fc": { initials: "BFC", shortName: "Bengaluru", tone: "blue" },
  "chelsea fc": { initials: "CHE", shortName: "Chelsea", tone: "blue" },
  "nottingham forest fc": { initials: "NFO", shortName: "Nottingham", tone: "red" },
  "odisha fc": { initials: "OFC", shortName: "Odisha", tone: "amber" },
};

function normalizeTeamName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamMeta(team: string): SoccerTeamMeta {
  const known = SOCCER_TEAM_BADGES[normalizeTeamName(team)];
  if (known) {
    return known;
  }
  const words = team
    .replace(/\b(fc|cf|sc|club)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean);
  return {
    initials: words
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?",
    shortName: team.replace(/\s+FC$/i, ""),
    tone: "neutral",
  };
}

function extractQuestionDate(question: string): string | null {
  return question.match(/\bon\s+(\d{4}-\d{2}-\d{2})\??$/i)?.[1] ?? null;
}

function parseSoccerQuestion(question: string): ParsedSoccerQuestion {
  const date = extractQuestionDate(question);
  const exact = question.match(/^Exact Score:\s*(.+?)\s+\d+\s*-\s*\d+\s+(.+?)\?$/i);
  if (exact) {
    return {
      kind: "exact_score",
      homeTeam: exact[1].trim(),
      awayTeam: exact[2].trim(),
      date,
    };
  }
  if (/^Exact Score:\s*Any Other Score\?/i.test(question)) {
    return { kind: "exact_other", date };
  }
  const win = question.match(/^Will\s+(.+?)\s+win(?:\s+on\s+\d{4}-\d{2}-\d{2})?\?$/i);
  if (win) {
    return { kind: "win", team: win[1].trim(), date };
  }
  const halftime = question.match(/^(.+?)\s+leading at halftime\?$/i);
  if (halftime) {
    return { kind: "halftime", team: halftime[1].trim(), date };
  }
  const drawMatchup = question.match(/^Will\s+(.+?)\s+vs\.?\s+(.+?)\s+end in a draw\?$/i);
  if (drawMatchup) {
    return {
      kind: "draw",
      homeTeam: drawMatchup[1].trim(),
      awayTeam: drawMatchup[2].trim(),
      date,
    };
  }
  if (/\bdraw\b|\bempate\b/i.test(question)) {
    return { kind: "draw", homeTeam: null, awayTeam: null, date };
  }
  return { kind: "unknown", date };
}

function matchKey(homeTeam: string, awayTeam: string, date: string | null): string {
  const pair = [normalizeTeamName(homeTeam), normalizeTeamName(awayTeam)].sort().join("__");
  return `${date ?? "sin-fecha"}__${pair}`;
}

function marketDate(market: UpcomingSportsMarket): { date: string | null; source: SoccerMatch["dateSource"] } {
  if (market.close_time) {
    const date = new Date(market.close_time);
    if (!Number.isNaN(date.getTime())) {
      return { date: date.toISOString().slice(0, 10), source: "market" };
    }
  }
  const questionDate = extractQuestionDate(market.question);
  return questionDate ? { date: questionDate, source: "question" } : { date: null, source: "none" };
}

function mergeMatchDate(match: SoccerMatch, market: UpcomingSportsMarket) {
  const next = marketDate(market);
  if (match.dateSource === "market") {
    return;
  }
  if (next.source === "market" || (match.dateSource === "none" && next.date)) {
    match.date = next.date;
    match.dateSource = next.source;
    match.key = matchKey(match.homeTeam, match.awayTeam, match.date);
  }
}

function pushUniqueMarket(match: SoccerMatch, market: UpcomingSportsMarket) {
  if (!match.markets.some((item) => item.market_id === market.market_id)) {
    match.markets.push(market);
  }
}

function createSoccerMatch(
  homeTeam: string,
  awayTeam: string,
  firstMarket: UpcomingSportsMarket,
): SoccerMatch {
  const date = marketDate(firstMarket);
  return {
    key: matchKey(homeTeam, awayTeam, date.date),
    homeTeam,
    awayTeam,
    date: date.date,
    dateSource: date.source,
    markets: [firstMarket],
    extras: [],
  };
}

function findMatchForTeam(matches: SoccerMatch[], team: string): SoccerMatch | null {
  const key = normalizeTeamName(team);
  return (
    matches.find(
      (match) =>
        normalizeTeamName(match.homeTeam) === key || normalizeTeamName(match.awayTeam) === key,
    ) ?? null
  );
}

function findMatchForTeams(
  matches: SoccerMatch[],
  homeTeam: string | null,
  awayTeam: string | null,
): SoccerMatch | null {
  if (!homeTeam || !awayTeam) {
    return null;
  }
  const left = normalizeTeamName(homeTeam);
  const right = normalizeTeamName(awayTeam);
  return (
    matches.find((match) => {
      const home = normalizeTeamName(match.homeTeam);
      const away = normalizeTeamName(match.awayTeam);
      return (home === left && away === right) || (home === right && away === left);
    }) ?? null
  );
}

function applyWinMarket(match: SoccerMatch, market: UpcomingSportsMarket, team: string) {
  const key = normalizeTeamName(team);
  if (normalizeTeamName(match.homeTeam) === key) {
    match.homeWin = market;
  } else if (normalizeTeamName(match.awayTeam) === key) {
    match.awayWin = market;
  } else {
    match.extras.push(market);
  }
  pushUniqueMarket(match, market);
  mergeMatchDate(match, market);
}

function buildSoccerMatches(markets: UpcomingSportsMarket[]): SoccerMatch[] {
  const matches: SoccerMatch[] = [];
  const unassignedWins: UpcomingSportsMarket[] = [];
  const unassignedExtras: UpcomingSportsMarket[] = [];

  markets.forEach((market) => {
    const parsed = parseSoccerQuestion(market.question);
    if (parsed.kind !== "exact_score") {
      return;
    }
    let match = matches.find(
      (candidate) =>
        normalizeTeamName(candidate.homeTeam) === normalizeTeamName(parsed.homeTeam) &&
        normalizeTeamName(candidate.awayTeam) === normalizeTeamName(parsed.awayTeam),
    );
    if (!match) {
      match = createSoccerMatch(parsed.homeTeam, parsed.awayTeam, market);
      matches.push(match);
    }
    match.extras.push(market);
    pushUniqueMarket(match, market);
  });

  markets.forEach((market) => {
    const parsed = parseSoccerQuestion(market.question);
    if (parsed.kind === "exact_score") {
      return;
    }
    if (parsed.kind === "win") {
      const match = findMatchForTeam(matches, parsed.team);
      if (match) {
        applyWinMarket(match, market, parsed.team);
      } else {
        unassignedWins.push(market);
      }
      return;
    }
    if (parsed.kind === "halftime") {
      const match = findMatchForTeam(matches, parsed.team);
      if (match) {
        match.extras.push(market);
        pushUniqueMarket(match, market);
        mergeMatchDate(match, market);
      } else {
        unassignedExtras.push(market);
      }
      return;
    }
    if (parsed.kind === "draw") {
      const fallback = findMatchForTeams(matches, parsed.homeTeam, parsed.awayTeam) ?? matches[0];
      if (fallback) {
        fallback.draw = market;
        pushUniqueMarket(fallback, market);
        mergeMatchDate(fallback, market);
      } else {
        unassignedExtras.push(market);
      }
      return;
    }
    if (parsed.kind === "exact_other") {
      const fallback = matches[0];
      if (fallback) {
        fallback.extras.push(market);
        pushUniqueMarket(fallback, market);
      } else {
        unassignedExtras.push(market);
      }
      return;
    }
    unassignedExtras.push(market);
  });

  const winsByDate = new Map<string, UpcomingSportsMarket[]>();
  unassignedWins.forEach((market) => {
    const date = marketDate(market).date ?? "sin-fecha";
    winsByDate.set(date, [...(winsByDate.get(date) ?? []), market]);
  });
  winsByDate.forEach((wins) => {
    for (let index = 0; index < wins.length; index += 2) {
      const home = wins[index];
      const away = wins[index + 1];
      const parsedHome = parseSoccerQuestion(home.question);
      const parsedAway = away ? parseSoccerQuestion(away.question) : null;
      if (parsedHome.kind === "win" && parsedAway?.kind === "win") {
        const match = createSoccerMatch(parsedHome.team, parsedAway.team, home);
        applyWinMarket(match, home, parsedHome.team);
        applyWinMarket(match, away, parsedAway.team);
        matches.push(match);
      } else {
        unassignedExtras.push(home);
      }
    }
  });

  if (unassignedExtras.length > 0 && matches.length > 0) {
    unassignedExtras.forEach((market) => {
      matches[0].extras.push(market);
      pushUniqueMarket(matches[0], market);
    });
  }

  return matches.sort((left, right) => {
    const leftDate = left.date ? new Date(`${left.date}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDate = right.date ? new Date(`${right.date}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDate - rightDate || left.homeTeam.localeCompare(right.homeTeam);
  });
}

function matchIsInThreeDayWindow(match: SoccerMatch): boolean {
  const lifecycle = deriveSoccerMatchLifecycle(match);
  if (!lifecycle.isReviewableLive) {
    return false;
  }
  if (match.dateSource !== "market" || !match.date) {
    return true;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 3);
  const matchDate = new Date(`${match.date}T12:00:00`);
  return matchDate >= today && matchDate < limit;
}

function deriveSoccerMatchLifecycle(match: SoccerMatch) {
  const lifecycles = match.markets.map(deriveSportsMarketLifecycle);
  const reviewable = lifecycles.some((lifecycle) => lifecycle.isReviewableLive);
  if (reviewable) {
    return {
      ...(lifecycles[0] ?? deriveMarketLifecycle({})),
      status: "live" as const,
      label: "Próximo partido",
      detail: "Partido vivo o futuro.",
      isExpired: false,
      isReviewableLive: true,
    };
  }
  const missed = lifecycles.find((lifecycle) => lifecycle.status === "missed_live_snapshot");
  if (missed) {
    return missed;
  }
  return lifecycles[0] ?? deriveMarketLifecycle({});
}

function formatMatchDay(date: string | null): string {
  if (!date) {
    return "Sin fecha clara";
  }
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) {
    return "Sin fecha clara";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) {
    return "Hoy";
  }
  if (day.getTime() === tomorrow.getTime()) {
    return "Mañana";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    weekday: "short",
  }).format(value);
}

function buildSoccerSchedule(markets: UpcomingSportsMarket[]): SoccerScheduleSection[] {
  const sections = new Map<string, SoccerMatch[]>();
  const closedMatches: SoccerMatch[] = [];
  buildSoccerMatches(markets).forEach((match) => {
    const lifecycle = deriveSoccerMatchLifecycle(match);
    if (!lifecycle.isReviewableLive) {
      closedMatches.push(match);
      return;
    }
    if (!matchIsInThreeDayWindow(match)) {
      return;
    }
    const label = formatMatchDay(match.date);
    sections.set(label, [...(sections.get(label) ?? []), match]);
  });
  if (closedMatches.length > 0) {
    sections.set("Cerrados", closedMatches);
  }
  return Array.from(sections.entries()).map(([label, matches]) => ({
    key: label,
    label,
    matches,
  }));
}

function buildSoccerMatchStats(markets: UpcomingSportsMarket[]) {
  const matches = buildSoccerMatches(markets);
  const liveMatches = matches.filter((match) => deriveSoccerMatchLifecycle(match).isReviewableLive);
  const closedMatches = matches.filter(
    (match) => !deriveSoccerMatchLifecycle(match).isReviewableLive,
  );
  const incompleteMatches = matches.filter((match) => !match.homeWin || !match.awayWin || !match.draw);
  return {
    totalMatches: matches.length,
    liveMatches: liveMatches.length,
    closedMatches: closedMatches.length,
    incompleteMatches: incompleteMatches.length,
    completeMarkets: markets.filter((market) => market.has_snapshot && market.has_prediction).length,
    pendingMarkets: markets.filter((market) => !market.has_snapshot || !market.has_prediction).length,
  };
}

function formatSoccerPrice(value: unknown): string {
  const probability = normalizeProbability(value);
  if (probability === null) {
    return "Sin dato";
  }
  return `${Math.round(probability * 100)}¢`;
}

function sumMarketMetric(markets: UpcomingSportsMarket[], field: "liquidity" | "volume"): number | null {
  const total = markets.reduce((sum, market) => sum + (toNumber(market[field]) ?? 0), 0);
  return total > 0 ? total : null;
}

function TeamBadge({ team }: { team: string }) {
  const meta = teamMeta(team);
  return (
    <span className={`team-crest tone-${meta.tone}`} aria-hidden="true">
      {meta.initials}
    </span>
  );
}

function SoccerOutcomePill({
  label,
  market,
}: {
  label: string;
  market?: UpcomingSportsMarket;
}) {
  const lifecycle = market ? deriveSportsMarketLifecycle(market) : null;
  const priceLabel = market ? formatSoccerPrice(market.market_yes_price) : "Sin dato";
  const displayPrice =
    lifecycle?.status === "missed_live_snapshot" && priceLabel === "Sin dato"
      ? "Sin snapshot"
      : lifecycle?.isExpired && priceLabel === "Sin dato"
        ? "Cerrado"
        : priceLabel;
  const content = (
    <>
      <span>{label}</span>
      <strong>{displayPrice}</strong>
    </>
  );
  if (!market) {
    return <div className="soccer-outcome-pill missing">{content}</div>;
  }
  return (
    <Link
      className={`soccer-outcome-pill ${lifecycle?.isExpired ? "missing" : ""}`}
      href={`/markets/${market.market_id}`}
    >
      {content}
    </Link>
  );
}

function SoccerMatchCard({ match }: { match: SoccerMatch }) {
  const home = teamMeta(match.homeTeam);
  const away = teamMeta(match.awayTeam);
  const analysisMarketId =
    match.homeWin?.market_id ?? match.awayWin?.market_id ?? match.markets[0]?.market_id;
  const liquidity = sumMarketMetric(match.markets, "liquidity");
  const volume = sumMarketMetric(match.markets, "volume");
  const hasIncompletePrices = !match.homeWin || !match.awayWin || !match.draw;
  const lifecycle = deriveSoccerMatchLifecycle(match);

  return (
    <article className={`soccer-match-card ${lifecycle.isExpired ? "is-expired" : ""}`}>
      <div className="soccer-match-meta">
        <span>{lifecycle.label}</span>
        <span>Fútbol</span>
        <span>{match.dateSource === "question" ? "Fecha inferida" : "Próximo partido"}</span>
        <span>Vol. {formatMetric(volume)}</span>
      </div>
      <div className="soccer-match-main">
        <div className="soccer-team-row">
          <TeamBadge team={match.homeTeam} />
          <strong>{home.shortName}</strong>
        </div>
        <span className="soccer-versus">vs</span>
        <div className="soccer-team-row away">
          <TeamBadge team={match.awayTeam} />
          <strong>{away.shortName}</strong>
        </div>
      </div>
      <div className="soccer-outcome-grid" aria-label="Precios principales">
        <SoccerOutcomePill label={home.shortName} market={match.homeWin} />
        <SoccerOutcomePill label="Empate" market={match.draw} />
        <SoccerOutcomePill label={away.shortName} market={match.awayWin} />
      </div>
      <div className="soccer-match-footer">
        <span>{match.markets.length} mercados incluidos</span>
        <span>Liquidez {formatMetric(liquidity)}</span>
        {lifecycle.status === "missed_live_snapshot" ? (
          <span className="warning-chip">Sin snapshot en vivo</span>
        ) : null}
        {hasIncompletePrices ? <span className="warning-chip">Mercado incompleto</span> : null}
        {analysisMarketId ? (
          <Link className="analysis-link" href={`/markets/${analysisMarketId}`}>
            Ver análisis
          </Link>
        ) : null}
      </div>
      {match.extras.length > 0 ? (
        <details className="soccer-match-details">
          <summary>Mercados secundarios</summary>
          <ul>
            {match.extras.slice(0, 8).map((market) => (
              <li key={market.market_id}>
                <Link href={`/markets/${market.market_id}`}>{market.question}</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function SoccerMatchSchedule({ markets }: { markets: UpcomingSportsMarket[] }) {
  const schedule = buildSoccerSchedule(markets);
  if (schedule.length === 0) {
    return (
      <div className="sports-market-grid">
        {markets.map((market) => (
          <SportMarketCard key={market.market_id} market={market} />
        ))}
      </div>
    );
  }
  return (
    <div className="soccer-schedule">
      <div className="soccer-schedule-note">
        <strong>Próximos 3 días</strong>
        <span>
          Se usa `close_time` cuando existe. Los mercados actuales no traen hora
          estructurada, así que la fecha se infiere del título y los precios se
          muestran solo cuando existen.
        </span>
      </div>
      {schedule.map((section) => (
        <section className="soccer-day-section" key={section.key}>
          <div className="soccer-day-heading">
            <h3>{section.label}</h3>
            <span>{section.matches.length} partidos</span>
          </div>
          <div className="soccer-match-list">
            {section.matches.map((match) => (
              <SoccerMatchCard key={match.key} match={match} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function SportDetailPage() {
  const params = useParams<{ sport: string }>();
  const router = useRouter();
  const sportId = String(params.sport ?? "all");
  const sportOption = useMemo(() => resolveSportOption(sportId), [sportId]);
  const selectedSport = sportOption.id === "all" ? "all" : sportOption.id;
  const sportIsEnabled = isSportBackendEnabled(selectedSport);
  const [state, setState] = useState<PageState>({
    items: [],
    counts: null,
    qualitySummary: null,
    qualityItems: [],
    loading: true,
    error: null,
    updatedAt: null,
  });
  const [soccerViewMode, setSoccerViewMode] = useState<"matches" | "markets">("matches");

  const loadSport = useCallback(async () => {
    if (!sportIsEnabled) {
      setState((current) => ({
        ...current,
        items: [],
        counts: null,
        qualitySummary: null,
        qualityItems: [],
        loading: false,
        error: null,
        updatedAt: null,
      }));
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    const overviewPath = buildUpcomingPath(sportOption);
    try {
      const overview = await fetchJson<MarketsOverviewResponse>(overviewPath);
      const items = (overview.items ?? []).map(mapOverviewItem).filter(Boolean) as UpcomingSportsMarket[];
      const qualityItems = items.map(buildQualityItem);
      setState({
        items,
        counts: { total_count: overview.total_count ?? items.length },
        qualitySummary: {
          complete_count: qualityItems.filter((item) => item.has_polysignal_score).length,
          partial_count: qualityItems.filter((item) => !item.has_polysignal_score).length,
          missing_price_count: qualityItems.filter((item) => !item.has_yes_price || !item.has_no_price).length,
        },
        qualityItems,
        loading: false,
        error: null,
        updatedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: `${friendlyApiError(error, `datos de ${sportOption.label}`)} Ruta consultada: ${overviewPath}`,
      }));
    }
  }, [sportIsEnabled, sportOption]);

  useEffect(() => {
    void loadSport();
  }, [loadSport]);

  const qualityByMarketId = useMemo(() => {
    return new Map(state.qualityItems.map((item) => [item.market_id, item]));
  }, [state.qualityItems]);
  const overviewPath = buildUpcomingPath(sportOption);
  const shouldShowSoccerSchedule =
    selectedSport === "soccer" &&
    sportIsEnabled &&
    !state.loading &&
    state.items.length > 0 &&
    soccerViewMode === "matches";
  const soccerMatchStats = useMemo(() => {
    if (selectedSport !== "soccer" || state.items.length === 0) {
      return null;
    }
    return buildSoccerMatchStats(state.items);
  }, [selectedSport, state.items]);

  const handleSelectSport = (nextSport: string) => {
    if (nextSport === "all") {
      router.push("/sports");
      return;
    }
    router.push(`/sports/${nextSport}`);
  };

  return (
    <main className="dashboard-shell sports-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Deportes</p>
          <h1>Mercados de {sportOption.label}</h1>
          <p className="subtitle">
            Mercados reales para revisar por deporte. Si un deporte principal
            aún no tiene datos, verás un estado vacío limpio.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="refresh-button"
            disabled={state.loading || !sportIsEnabled}
            onClick={() => void loadSport()}
            type="button"
          >
            {state.loading ? "Cargando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>No es recomendación de apuesta:</strong>
        <span>
          Esta vista organiza mercados deportivos para revisión manual. No
          ejecuta apuestas automáticas ni operaciones por ti.
        </span>
      </section>

      <SportsSelectorBar
        activeLabel="Deporte"
        description="Cambia de deporte sin salir de la vista de próximos partidos."
        kicker="Vista por deporte"
        onSelect={handleSelectSport}
        selectedSport={selectedSport}
        title="Cambiar deporte"
      />

      {sportOption.id === "all" ? (
        <section className="alert-panel" role="status">
          <strong>Deporte no reconocido</strong>
          <span>
            Vuelve al índice de deportes o selecciona un chip soportado.
          </span>
        </section>
      ) : null}

      {!sportIsEnabled && sportOption.id !== "all" ? (
        <section className="alert-panel" role="status">
          <strong>{sportOption.statusLabel ?? "No disponible todavía"}</strong>
          <span>
            {sportOption.disabledMessage ??
              "Este deporte estará disponible más adelante."}
          </span>
        </section>
      ) : null}

      {state.error ? (
        <ApiErrorState
          message={state.error}
          onRetry={() => void loadSport()}
          title="No se pudo cargar este deporte"
        />
      ) : null}

      <section className="data-quality-summary" aria-label="Calidad de datos">
        <div>
          <span>Mercados</span>
          <strong>
            {state.loading ? "..." : state.counts?.total_count ?? state.items.length}
          </strong>
        </div>
        <div>
          <span>Completos</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.complete_count ?? 0}</strong>
        </div>
        <div>
          <span>Parciales</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.partial_count ?? 0}</strong>
        </div>
        <div>
          <span>Faltan precios</span>
          <strong>{state.loading ? "..." : state.qualitySummary?.missing_price_count ?? 0}</strong>
        </div>
        <p>
          Actualizado {state.updatedAt ? formatDateTime(state.updatedAt.toISOString()) : "al cargar"}.
          Si un mercado aparece parcial, todavía no tiene todos los precios necesarios.
        </p>
      </section>

      {selectedSport === "soccer" && sportIsEnabled && soccerMatchStats ? (
        <section className="data-quality-summary" aria-label="Resumen de fútbol">
          <div>
            <span>Partidos detectados</span>
            <strong>{soccerMatchStats.totalMatches}</strong>
          </div>
          <div>
            <span>Partidos activos</span>
            <strong>{soccerMatchStats.liveMatches}</strong>
          </div>
          <div>
            <span>Cerrados</span>
            <strong>{soccerMatchStats.closedMatches}</strong>
          </div>
          <div>
            <span>Mercados completos</span>
            <strong>{soccerMatchStats.completeMarkets}</strong>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{soccerMatchStats.pendingMarkets}</strong>
          </div>
          <p>
            La vista de partidos agrupa mercados por equipo vs equipo. Si un
            partido aparece incompleto, cambia a Vista mercados para revisar los
            {` ${state.items.length} `}mercados individuales cargados desde el
            listado disponible.
          </p>
        </section>
      ) : null}

      <section className="panel sports-market-section">
        <div className="panel-heading">
          <div>
            <h2>{selectedSport === "soccer" ? "Próximos partidos" : "Mercados próximos"}</h2>
            <p>
              Filtro activo: {sportOption.label}. Esta vista solo muestra mercados
              disponibles para revisión manual.
            </p>
          </div>
          {sportIsEnabled ? (
            <span className="badge muted">Solo lectura</span>
          ) : (
            <span className="badge muted">Próximamente</span>
          )}
        </div>

        {selectedSport === "soccer" && sportIsEnabled && state.items.length > 0 ? (
          <div className="view-toggle" aria-label="Cambiar vista de fútbol">
            <button
              className={soccerViewMode === "matches" ? "active" : ""}
              onClick={() => setSoccerViewMode("matches")}
              type="button"
            >
              Vista partidos
            </button>
            <button
              className={soccerViewMode === "markets" ? "active" : ""}
              onClick={() => setSoccerViewMode("markets")}
              type="button"
            >
              Vista mercados ({state.items.length})
            </button>
          </div>
        ) : null}

        {!sportIsEnabled ? (
          <ComingSoonModule
            copy="Este deporte se muestra como próximo lanzamiento y todavía no carga mercados."
            title={`${sportOption.label} está en preparación.`}
          />
        ) : state.loading ? (
          <LoadingState copy={`Cargando mercados de ${sportOption.label}...`} />
        ) : state.items.length === 0 ? (
          <EmptyState
            copy="La conexión funciona, pero todavía no hay mercados cargados para este deporte. Cuando haya datos disponibles aparecerán aquí."
            title={`Todavía no hay mercados cargados para ${sportOption.label}.`}
          />
        ) : shouldShowSoccerSchedule ? (
          <SoccerMatchSchedule markets={state.items} />
        ) : (
          <div className="sports-market-grid">
            {state.items.map((market) => (
              <SportMarketCard
                dataQuality={qualityByMarketId.get(market.market_id)}
                key={market.market_id}
                market={market}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
