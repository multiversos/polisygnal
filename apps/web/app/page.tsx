"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MainNavigation,
} from "./components/MainNavigation";
import {
  SportsSelectorBar,
  getSportApiFilter,
  getSportSelectorOption,
  isSportBackendEnabled,
  matchesSelectedSport,
  sportsSelectorOptions,
} from "./components/SportsSelectorBar";
import {
  WATCHLIST_STATUS_LABELS,
  fetchWatchlistItems,
  removeWatchlistItem,
  toggleWatchlistMarket,
  type WatchlistItem,
} from "./lib/watchlist";
import {
  INVESTIGATION_STATUS_LABELS,
  INVESTIGATION_STATUS_ORDER,
  fetchInvestigationStatuses,
  type InvestigationStatusItem,
} from "./lib/investigationStatus";
import {
  fetchSmartAlerts,
  type SmartAlert,
} from "./lib/smartAlerts";
import {
  API_BASE_URL,
  API_HOST_LABEL,
  buildBackendApiPath,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./lib/api";
import type {
  MarketOverviewItem,
  MarketOverviewResponse,
} from "./lib/marketOverview";

type HealthResponse = {
  status?: string;
  environment?: string;
};

type MarketOverviewBucketKey =
  | "opportunity"
  | "watchlist"
  | "low-confidence"
  | "data-only"
  | "no-prediction";

type MarketOverviewBucketSection = {
  key: MarketOverviewBucketKey;
  title: string;
  description: string;
  tone: string;
  items: MarketOverviewItem[];
};

type DashboardReviewFilter =
  | "all"
  | "with-prediction"
  | "opportunity"
  | "watchlist"
  | "low-confidence"
  | "data-only";

type DashboardMetaResponse = {
  artifact_available?: boolean;
  dashboard_available?: boolean;
  generated_at?: string | null;
  path?: string | null;
};

type CandidateParticipant = {
  name: string;
  role: string;
  logo_url?: string | null;
  image_url?: string | null;
  abbreviation?: string | null;
};

type PolySignalScoreComponent = {
  name: string;
  probability?: string | number | null;
  weight?: string | number | null;
  adjustment?: string | number | null;
  confidence?: string | number | null;
  note: string;
};

type PolySignalScore = {
  score_probability?: string | number | null;
  score_percent?: string | number | null;
  market_yes_price?: string | number | null;
  edge_signed?: string | number | null;
  edge_percent_points?: string | number | null;
  confidence: string | number;
  confidence_label: string;
  source: string;
  components: PolySignalScoreComponent[];
  warnings: string[];
  label: string;
  color_hint: "positive" | "negative" | "neutral" | "warning" | string;
};

type MarketFreshness = {
  freshness_status: "fresh" | "stale" | "incomplete" | "unknown" | string;
  reasons: string[];
  latest_snapshot_at?: string | null;
  close_time?: string | null;
  age_hours?: string | number | null;
  recommended_action:
    | "ok"
    | "needs_snapshot"
    | "review_market"
    | "exclude_from_scoring"
    | string;
};

type ResearchCandidate = {
  market_id: number;
  question: string;
  event_title?: string | null;
  vertical: string;
  sport: string;
  market_shape: string;
  research_template_name: string;
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  close_time?: string | null;
  candidate_score: string | number;
  candidate_reasons: string[];
  warnings: string[];
  market_image_url?: string | null;
  event_image_url?: string | null;
  icon_url?: string | null;
  participants: CandidateParticipant[];
  polysignal_score?: PolySignalScore | null;
  freshness?: MarketFreshness | null;
};

type CandidatesResponse = {
  count: number;
  limit: number;
  candidates: ResearchCandidate[];
};

type UpcomingSportsMarket = {
  market_id: number;
  question: string;
  event_title?: string | null;
  vertical: string;
  sport: string;
  market_shape: string;
  research_template_name: string;
  close_time?: string | null;
  event_time?: string | null;
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  candidate_score: string | number;
  urgency_score: string | number;
  reasons: string[];
  warnings: string[];
  participants: CandidateParticipant[];
  polysignal_score?: PolySignalScore | null;
  freshness?: MarketFreshness | null;
};

type UpcomingSportsResponse = {
  count: number;
  limit: number;
  items: UpcomingSportsMarket[];
  counts: Record<string, number>;
  filters_applied: Record<string, unknown>;
};

type UpcomingDataQualityItem = {
  market_id: number;
  question: string;
  sport: string;
  market_shape: string;
  close_time?: string | null;
  has_snapshot: boolean;
  has_yes_price: boolean;
  has_no_price: boolean;
  has_liquidity: boolean;
  has_volume: boolean;
  has_external_signal: boolean;
  has_prediction: boolean;
  has_research: boolean;
  has_polysignal_score: boolean;
  missing_fields: string[];
  quality_score: number;
  quality_label: "Completo" | "Parcial" | "Insuficiente" | string;
  warnings: string[];
  freshness?: MarketFreshness | null;
};

type UpcomingDataQualityResponse = {
  summary: Record<string, number>;
  items: UpcomingDataQualityItem[];
  filters_applied: Record<string, unknown>;
};

type AnalysisReadinessItem = {
  market_id: number;
  title: string;
  sport: string;
  market_shape: string;
  source: string;
  ready_reason?: string | null;
  close_time?: string | null;
  time_window_label?: string | null;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  data_quality_label: string;
  freshness_status: string;
  polysignal_score_status: string;
  readiness_status: "ready" | "needs_refresh" | "blocked" | string;
  readiness_score: number;
  reasons: string[];
  missing_fields: string[];
  suggested_next_action: string;
  suggested_research_packet_command: string;
  suggested_refresh_snapshot_command: string;
  suggested_refresh_metadata_command: string;
};

type AnalysisReadinessResponse = {
  generated_at: string;
  sport?: string | null;
  days: number;
  limit: number;
  summary: {
    total_checked: number;
    ready_count: number;
    refresh_needed_count: number;
    blocked_count: number;
    missing_snapshot_count: number;
    missing_price_count: number;
    score_pending_count: number;
  };
  items: AnalysisReadinessItem[];
  filters_applied: Record<string, unknown>;
};

type MarketPriceLike = {
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
};

type ExternalMarketSignal = {
  id: number;
  source: string;
  source_market_id?: string | null;
  source_event_id?: string | null;
  source_ticker?: string | null;
  polymarket_market_id?: number | null;
  title?: string | null;
  yes_probability?: string | number | null;
  no_probability?: string | number | null;
  best_yes_bid?: string | number | null;
  best_yes_ask?: string | number | null;
  best_no_bid?: string | number | null;
  best_no_ask?: string | number | null;
  mid_price?: string | number | null;
  last_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
  open_interest?: string | number | null;
  source_confidence?: string | number | null;
  match_confidence?: string | number | null;
  match_reason?: string | null;
  warnings?: unknown[] | Record<string, unknown> | null;
  fetched_at?: string | null;
  created_at?: string | null;
};

type ExternalSignalsResponse = {
  count: number;
  limit: number;
  source?: string | null;
  ticker?: string | null;
  market_id?: number | null;
  signals: ExternalMarketSignal[];
};

type DashboardState = {
  health: HealthResponse | null;
  overview: MarketOverviewResponse | null;
  dashboardMeta: DashboardMetaResponse | null;
  candidates: ResearchCandidate[];
  upcomingMarkets: UpcomingSportsMarket[];
  upcomingCounts: Record<string, number> | null;
  upcomingDataQualitySummary: Record<string, number> | null;
  upcomingDataQualityItems: UpcomingDataQualityItem[];
  analysisReadinessSummary: AnalysisReadinessResponse["summary"] | null;
  analysisReadinessItems: AnalysisReadinessItem[];
  externalSignals: ExternalMarketSignal[];
  watchlistItems: WatchlistItem[];
  investigationStatuses: InvestigationStatusItem[];
  smartAlerts: SmartAlert[];
  smartAlertCounts: Record<string, number> | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
};

type DashboardFilters = {
  sport: string;
  marketShape: string;
  limit: number;
};

type UpcomingFilters = {
  sport: string;
  days: number;
  includeFutures: boolean;
};

const DASHBOARD_REQUEST_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;

const marketShapeOptions = [
  "all",
  "match_winner",
  "championship",
  "futures",
  "player_prop",
  "team_prop",
  "race_winner",
  "yes_no_generic",
];

const limitOptions = [5, 10, 20];

const quickLinks = [
  { label: "Briefing diario", href: "/briefing" },
  { label: "Calidad de fuentes", href: "/sources" },
  { label: "Backtesting", href: "/backtesting" },
  { label: "Documentación API", href: `${API_BASE_URL}/docs` },
  { label: "Panel backend", href: `${API_BASE_URL}/` },
  { label: "Estado API", href: `${API_BASE_URL}/health` },
  { label: "Resumen de mercados", href: `${API_BASE_URL}/markets/overview` },
  {
    label: "Candidatos de investigación",
    href: `${API_BASE_URL}/research/candidates?limit=10&vertical=sports`,
  },
  {
    label: "Próximos partidos",
    href: `${API_BASE_URL}/research/upcoming-sports?limit=10&days=7&focus=match_winner`,
  },
  { label: "Señales externas", href: `${API_BASE_URL}/external-signals/kalshi?limit=10` },
  { label: "Revisar coincidencias Kalshi", href: "/external-signals/matches" },
];

const commandCenterLinks = [
  {
    label: "Briefing",
    description: "Resumen operativo diario",
    href: "/briefing",
  },
  {
    label: "Deportes",
    description: "Mercados próximos por deporte",
    href: "/sports",
  },
  {
    label: "Investigación",
    description: "Runs y packets generados",
    href: "/research",
  },
  {
    label: "Alertas",
    description: "Recordatorios operativos",
    href: "/alerts",
  },
  {
    label: "Workflow",
    description: "Kanban de investigación",
    href: "/workflow",
  },
  {
    label: "Backtesting",
    description: "Resultados manuales y métricas",
    href: "/backtesting",
  },
  {
    label: "Salud de datos",
    description: "Cobertura, precios y snapshots",
    href: "/data-health",
  },
];

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DASHBOARD_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(buildBackendApiPath(path), {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${path} responded ${response.status}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${path} timed out after ${DASHBOARD_REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function withDashboardTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${DASHBOARD_REQUEST_TIMEOUT_MS / 1000}s`)),
      DASHBOARD_REQUEST_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatProbability(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }

  if (number >= 0 && number <= 1) {
    return `${(number * 100).toFixed(1)}%`;
  }

  return number.toFixed(2);
}

function formatCompact(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
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

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatMarketPercent(value: unknown): string {
  const number = normalizeProbability(value);
  if (number === null) {
    return "--";
  }

  return `${(number * 100).toFixed(1)}%`;
}

function formatMarketMetric(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatPercentPoints(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "--";
  }
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${number.toFixed(1)} pts`;
}

function getNoProbability(yesValue: unknown, noValue: unknown): number | null {
  const explicitNo = normalizeProbability(noValue);
  if (explicitNo !== null) {
    return explicitNo;
  }

  const yes = normalizeProbability(yesValue);
  if (yes === null) {
    return null;
  }

  return clampProbability(1 - yes);
}

function getProbabilityBarWidth(yesValue: unknown, noValue: unknown): number | null {
  const yes = normalizeProbability(yesValue);
  if (yes !== null) {
    return Math.round(clampProbability(yes) * 1000) / 10;
  }

  const no = getNoProbability(yesValue, noValue);
  if (no !== null) {
    return Math.round(clampProbability(1 - no) * 1000) / 10;
  }

  return null;
}

function formatScore(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }

  return number.toFixed(1);
}

function formatPercentDelta(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }

  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)} pts`;
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) {
    return "N/D";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }

  return date.toLocaleString("es-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeRemaining(value: string | null | undefined): string {
  if (!value) {
    return "Fecha no disponible";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) {
    return "Cierre pasado";
  }

  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${Math.max(hours, 1)} h restantes`;
  }

  const days = Math.round(hours / 24);
  return `${days} d restantes`;
}

function scoreTone(score: unknown): string {
  const number = toNumber(score) ?? 0;
  if (number >= 80) {
    return "high";
  }
  if (number >= 60) {
    return "medium";
  }
  return "low";
}

function confidenceTone(score: unknown): string {
  const number = toNumber(score) ?? 0;
  if (number >= 0.75) {
    return "high";
  }
  if (number >= 0.45) {
    return "medium";
  }
  return "low";
}

function externalWarnings(value: ExternalMarketSignal["warnings"]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`);
}

function compareSignalToCandidate(
  signal: ExternalMarketSignal,
  candidate?: ResearchCandidate,
): { diff: number | null; label: string; tone: string } {
  const signalProbability = toNumber(signal.yes_probability ?? signal.mid_price);
  const marketPrice = toNumber(candidate?.market_yes_price);
  if (signalProbability === null || marketPrice === null) {
    return { diff: null, label: "Sin comparación", tone: "neutral" };
  }

  const diff = signalProbability - marketPrice;
  const magnitude = Math.abs(diff);
  if (magnitude >= 0.08) {
    return { diff, label: "Divergencia alta", tone: "high-divergence" };
  }
  if (magnitude >= 0.03) {
    return { diff, label: "Divergente", tone: "divergent" };
  }
  return { diff, label: "Alineado", tone: "aligned" };
}

function buildMarketOverviewPath(sport: string): string {
  const params = new URLSearchParams({
    limit: "20",
  });
  const apiSport = getSportApiFilter(sport);
  if (apiSport) {
    params.set("sport_type", apiSport);
  }
  return `/markets/overview?${params.toString()}`;
}

function buildCandidatesPath(filters: DashboardFilters): string {
  const params = new URLSearchParams({
    vertical: "sports",
    limit: String(filters.limit),
  });
  const apiSport = getSportApiFilter(filters.sport);
  if (apiSport) {
    params.set("sport", apiSport);
  }
  if (filters.marketShape !== "all") {
    params.set("market_shape", filters.marketShape);
  }
  return `/research/candidates?${params.toString()}`;
}

function buildUpcomingPath(filters: UpcomingFilters): string {
  const params = new URLSearchParams({
    limit: "8",
    days: String(filters.days),
    include_futures: String(filters.includeFutures),
    focus: "match_winner",
  });
  const apiSport = getSportApiFilter(filters.sport);
  if (apiSport) {
    params.set("sport", apiSport);
  }
  return `/research/upcoming-sports?${params.toString()}`;
}

function buildUpcomingDataQualityPath(filters: UpcomingFilters): string {
  const params = new URLSearchParams({
    limit: "50",
    days: String(filters.days),
  });
  const apiSport = getSportApiFilter(filters.sport);
  if (apiSport) {
    params.set("sport", apiSport);
  }
  return `/research/upcoming-sports/data-quality?${params.toString()}`;
}

  function buildAnalysisReadinessPath(filters: UpcomingFilters): string {
    const params = new URLSearchParams({
      limit: "12",
      days: String(filters.days),
      min_hours_to_close: "24",
    });
  const apiSport = getSportApiFilter(filters.sport);
  if (apiSport) {
    params.set("sport", apiSport);
  }
  return `/research/analysis-readiness?${params.toString()}`;
}

function formatOptionLabel(value: string): string {
  if (value === "all") {
    return "todos";
  }
  return humanizeToken(value);
}

const sportLabels: Record<string, string> = {
  all: "todos",
  nba: "baloncesto",
  basketball: "baloncesto",
  nfl: "NFL",
  soccer: "fútbol",
  horse_racing: "carreras de caballos",
  nhl: "NHL",
  mlb: "béisbol",
  baseball: "béisbol",
  tennis: "tenis",
  cricket: "cricket",
  mma: "UFC",
  ufc: "UFC",
  other: "otro",
};

const marketShapeLabels: Record<string, string> = {
  all: "todos",
  match_winner: "ganador de partido",
  championship: "campeonato",
  futures: "futuro/temporada",
  player_prop: "prop de jugador",
  team_prop: "prop de equipo",
  race_winner: "ganador de carrera",
  yes_no_generic: "sí/no general",
  other: "otro",
};

const participantRoleLabels: Record<string, string> = {
  yes_side: "lado SÍ",
  no_side: "lado NO",
  participant: "participante",
  unknown: "sin rol claro",
};

const reasonLabels: Record<string, string> = {
  active: "activo",
  market_active_open: "activo",
  valid_snapshot: "precio válido",
  valid_latest_snapshot: "precio válido",
  latest_snapshot_valid: "precio válido",
  supported_sport: "deporte soportado",
  known_sport: "deporte soportado",
  clear_market_shape: "mercado claro",
  known_market_shape: "mercado claro",
  specific_template: "template específico",
  generic_sports_template: "template deportivo",
  has_liquidity: "liquidez disponible",
  has_volume: "volumen disponible",
  high_liquidity: "alta liquidez",
  high_volume: "alto volumen",
  close_time_future: "cierre futuro",
  price_in_research_range: "precio investigable",
  yes_price_in_research_band: "precio SÍ investigable",
  no_price_in_research_band: "precio NO investigable",
  not_duplicate: "sin duplicado claro",
  closes_within_24h: "cierra en menos de 24h",
  closes_within_72h: "cierra en menos de 72h",
  closes_within_7d: "cierra esta semana",
  match_winner_market: "partido detectado",
  sports_prop_market: "prop deportivo próximo",
  valid_price_data: "precio válido",
  participants_detected: "participantes detectados",
  participant_detected: "participante detectado",
  some_liquidity: "liquidez disponible",
  some_volume: "volumen disponible",
};

const warningLabels: Record<string, string> = {
  missing_price_data: "faltan datos de precio",
  low_liquidity: "baja liquidez",
  ambiguous_market: "mercado ambiguo",
  metadata_poor: "metadata incompleta",
  poor_metadata: "metadata incompleta",
  zero_volume: "volumen cero",
  zero_open_interest: "interés abierto cero",
  missing_latest_snapshot: "sin snapshot reciente",
  missing_snapshot: "sin snapshot",
  missing_price: "faltan precios",
  missing_close_time: "sin fecha de cierre",
  missing_liquidity: "liquidez no disponible",
  missing_volume: "volumen no disponible",
  sport_uncertain: "deporte incierto",
  market_shape_uncertain: "tipo de mercado incierto",
  polysignal_score_pending: "score pendiente",
  market_closed: "mercado cerrado",
  no_external_signal: "sin señal externa",
  future_or_championship_market: "mercado futuro/campeonato",
  ambiguous_or_generic_market: "mercado ambiguo o genérico",
  outside_upcoming_window: "fuera de ventana próxima",
  unknown_sport: "deporte no identificado",
  participants_not_detected: "participantes no detectados",
  participants_uncertain: "participantes por confirmar",
  liquidity_unknown: "liquidez desconocida",
  volume_unknown: "volumen desconocido",
  close_time_past: "cierre pasado",
  close_time_missing: "sin fecha de cierre",
  snapshot_too_old: "snapshot viejo",
  missing_prices: "faltan precios",
  data_quality_insufficient: "calidad insuficiente",
};

const freshnessStatusLabels: Record<string, string> = {
  fresh: "Datos frescos",
  stale: "Requiere revisión",
  incomplete: "Datos incompletos",
  unknown: "Frescura desconocida",
};

const freshnessActionLabels: Record<string, string> = {
  ok: "OK",
  needs_snapshot: "Necesita snapshot",
  review_market: "Revisar mercado",
  exclude_from_scoring: "Excluir del score",
};

const marketTermTranslations: Record<string, string> = {
  "NBA Eastern Conference Finals": "las Finales de la Conferencia Este de la NBA",
  "NBA Western Conference Finals": "las Finales de la Conferencia Oeste de la NBA",
  "NBA Eastern Conference Finals MVP": "el MVP de las Finales de la Conferencia Este de la NBA",
  "NBA Western Conference Finals MVP": "el MVP de las Finales de la Conferencia Oeste de la NBA",
  "Eastern Conference Finals MVP": "el MVP de las Finales de la Conferencia Este",
  "Western Conference Finals MVP": "el MVP de las Finales de la Conferencia Oeste",
  "NBA Finals MVP": "el MVP de las Finales de la NBA",
  "NBA Eastern Conference Champion": "Campeón de la Conferencia Este de la NBA",
  "NBA Western Conference Champion": "Campeón de la Conferencia Oeste de la NBA",
  "Eastern Conference Champion": "Campeón de la Conferencia Este",
  "Western Conference Champion": "Campeón de la Conferencia Oeste",
  "NBA Championship": "el Campeonato de la NBA",
  "NBA Finals": "las Finales de la NBA",
  "WNBA Finals": "las Finales de la WNBA",
  "NBA Rookie of the Year": "el Novato del Año de la NBA",
  "NBA MVP": "el MVP de la NBA",
  "Rookie of the Year": "el Novato del Año",
  "Super Bowl": "el Super Bowl",
  "World Series": "la Serie Mundial",
  "Champions League": "la Champions League",
  "Kentucky Derby": "el Kentucky Derby",
  MVP: "el MVP",
};

const pluralTeamLastWords = new Set([
  "76ers",
  "Bucks",
  "Bulls",
  "Cavaliers",
  "Celtics",
  "Clippers",
  "Grizzlies",
  "Hawks",
  "Heat",
  "Hornets",
  "Jazz",
  "Kings",
  "Knicks",
  "Lakers",
  "Magic",
  "Mavericks",
  "Nets",
  "Nuggets",
  "Pacers",
  "Pelicans",
  "Pistons",
  "Raptors",
  "Rockets",
  "Sixers",
  "Spurs",
  "Suns",
  "Thunder",
  "Timberwolves",
  "Trail Blazers",
  "Warriors",
  "Wizards",
]);

function stripScoreSuffix(value: string): string {
  return value.split(":")[0].trim();
}

function humanizeToken(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").trim() || value;
}

function isLikelyPluralTeamName(teamName: string, hadEnglishThe: boolean): boolean {
  if (hadEnglishThe) {
    return true;
  }

  const normalized = teamName.trim();
  const words = normalized.split(/\s+/);
  const lastWord = words[words.length - 1] ?? "";
  return lastWord.endsWith("s") || pluralTeamLastWords.has(lastWord);
}

function spanishTeamSubject(teamName: string, hadEnglishThe: boolean): string {
  const cleanName = teamName.trim();
  if (isLikelyPluralTeamName(cleanName, hadEnglishThe)) {
    return `los ${cleanName}`;
  }
  return cleanName;
}

function spanishTeamObject(teamName: string, hadEnglishThe: boolean): string {
  const subject = spanishTeamSubject(teamName, hadEnglishThe);
  return subject.startsWith("los ") ? `a ${subject}` : `a ${subject}`;
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
}

function translateCompetitionName(value: string): string {
  const trimmed = value.trim();
  const leadingYear = trimmed.match(/^(\d{4})\s+(.+)$/);
  if (leadingYear) {
    return `${translateCompetitionName(leadingYear[2])} ${leadingYear[1]}`;
  }

  const trailingYear = trimmed.match(/^(.+?)\s+(\d{4})$/);
  if (trailingYear) {
    return `${translateCompetitionName(trailingYear[1])} ${trailingYear[2]}`;
  }

  if (marketTermTranslations[trimmed]) {
    return marketTermTranslations[trimmed];
  }

  return Object.entries(marketTermTranslations)
    .sort(([a], [b]) => b.length - a.length)
    .reduce(
      (current, [english, spanish]) =>
        current.replace(new RegExp(`\\b${escapeRegExp(english)}\\b`, "gi"), spanish),
      trimmed,
    );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureSpanishQuestion(value: string): string {
  const trimmed = value.trim().replace(/^¿+/, "").replace(/\?+$/, "");
  return `¿${trimmed}?`;
}

function translateMarketTitleToSpanish(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return trimmed;
  }

  const playerOver = trimmed.match(/^Will\s+(.+?)\s+score\s+over\s+([0-9]+(?:\.[0-9]+)?)\s+points\?$/i);
  if (playerOver) {
    return ensureSpanishQuestion(`${playerOver[1].trim()} anotará más de ${playerOver[2]} puntos`);
  }

  const playerUnder = trimmed.match(/^Will\s+(.+?)\s+score\s+under\s+([0-9]+(?:\.[0-9]+)?)\s+points\?$/i);
  if (playerUnder) {
    return ensureSpanishQuestion(`${playerUnder[1].trim()} anotará menos de ${playerUnder[2]} puntos`);
  }

  const awardMarket = trimmed.match(/^Will\s+(.+?)\s+win\s+(NBA\s+Rookie of the Year|NBA\s+MVP|Rookie of the Year|MVP)\?$/i);
  if (awardMarket) {
    return ensureSpanishQuestion(`${awardMarket[1].trim()} ganará ${translateCompetitionName(awardMarket[2])}`);
  }

  const matchWinner = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+beat\s+(the\s+)?(.+?)\?$/i);
  if (matchWinner) {
    const teamA = matchWinner[2].trim();
    const teamB = matchWinner[4].trim();
    const hadTheA = Boolean(matchWinner[1]);
    const subject = capitalizeFirst(spanishTeamSubject(teamA, hadTheA));
    const verb = isLikelyPluralTeamName(teamA, hadTheA) ? "vencerán" : "vencerá";
    const object = spanishTeamObject(teamB, Boolean(matchWinner[3]));
    return ensureSpanishQuestion(`${subject} ${verb} ${object}`);
  }

  const winMarket = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+win\s+the\s+(.+?)\?$/i);
  if (winMarket) {
    const team = winMarket[2].trim();
    const subject = spanishTeamSubject(team, Boolean(winMarket[1]));
    const verb = isLikelyPluralTeamName(team, Boolean(winMarket[1])) ? "Ganarán" : "Ganará";
    const competition = translateCompetitionName(winMarket[3].trim());
    return ensureSpanishQuestion(`${verb} ${subject} ${competition}`);
  }

  return trimmed;
}

function translateMarketSubtitleToSpanish(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  const yearNbaChampion = trimmed.match(/^(\d{4})\s+NBA\s+Champion$/i);
  if (yearNbaChampion) {
    return `Campeón de la NBA ${yearNbaChampion[1]}`;
  }

  return translateCompetitionName(trimmed);
}

function humanizeMarketTitle(title: string): string {
  return translateMarketTitleToSpanish(title);
}

function formatSportLabel(value: string | null | undefined): string {
  if (!value) {
    return "deporte no definido";
  }
  const selectorOption = sportsSelectorOptions.find(
    (option) => option.id === value || option.apiValue === value,
  );
  return selectorOption?.label ?? sportLabels[value] ?? humanizeToken(value);
}

function formatMarketShapeLabel(value: string | null | undefined): string {
  if (!value) {
    return "tipo no definido";
  }
  return marketShapeLabels[value] ?? humanizeToken(value);
}

function formatParticipantRole(value: string | null | undefined): string {
  if (!value) {
    return "participante";
  }
  return participantRoleLabels[value] ?? humanizeToken(value);
}

function formatReasonLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return reasonLabels[key] ?? humanizeToken(key);
}

function formatWarningLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return warningLabels[key] ?? humanizeToken(key);
}

function formatFreshnessStatus(value?: string | null): string {
  if (!value) {
    return "Frescura desconocida";
  }
  return freshnessStatusLabels[value] ?? humanizeToken(value);
}

function formatFreshnessAction(value?: string | null): string {
  if (!value) {
    return "Revisar datos";
  }
  return freshnessActionLabels[value] ?? humanizeToken(value);
}

function formatReadinessStatus(value: string): string {
  if (value === "ready") {
    return "Listo";
  }
  if (value === "needs_refresh") {
    return "Necesita refresh";
  }
  if (value === "blocked") {
    return "Bloqueado";
  }
  return humanizeToken(value);
}

function formatReadinessAction(value: string): string {
  if (value === "listo_para_research_packet") {
    return "Listo para Research Packet";
  }
  if (value === "ejecutar_refresh_snapshot_dry_run") {
    return "Probar snapshot dry-run";
  }
  if (value === "revisar_o_descartar_por_ahora") {
    return "Revisar o descartar por ahora";
  }
  return humanizeToken(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketOverviewItem(value: unknown): value is MarketOverviewItem {
  return isRecord(value) && isRecord(value.market);
}

function getMarketOverviewItems(overview: MarketOverviewResponse | null): MarketOverviewItem[] {
  if (!Array.isArray(overview?.items)) {
    return [];
  }
  return overview.items.filter(isMarketOverviewItem);
}

function overviewBucketLabel(value?: string | null): string {
  if (!value) {
    return "Sin bucket";
  }
  const labels: Record<string, string> = {
    priority: "Oportunidad",
    watchlist: "Vigilancia",
    review_fallback: "Baja confianza",
    fallback_only: "Solo datos",
    no_prediction: "Sin prediccion",
  };
  return labels[value] ?? humanizeToken(value);
}

function overviewScoringModeLabel(value?: string | null): string {
  if (!value) {
    return "Sin modo";
  }
  const labels: Record<string, string> = {
    evidence_backed: "Con evidencia",
    fallback_only: "Solo snapshot",
    no_prediction: "Sin prediccion",
  };
  return labels[value] ?? humanizeToken(value);
}

const marketOverviewBucketDefinitions: Array<
  Omit<MarketOverviewBucketSection, "items">
> = [
  {
    key: "opportunity",
    title: "Mejores oportunidades",
    description: "Señales con mejor combinación de score, confianza y precio para revisar primero.",
    tone: "opportunity",
  },
  {
    key: "watchlist",
    title: "Watchlist",
    description: "Mercados con score medio, edge interesante o movimiento que merece seguimiento.",
    tone: "watchlist",
  },
  {
    key: "low-confidence",
    title: "Baja confianza",
    description: "Hay predicción, pero los datos disponibles todavía no sostienen una lectura fuerte.",
    tone: "low-confidence",
  },
  {
    key: "data-only",
    title: "Solo datos",
    description: "Mercados con precios y snapshots utiles, sin una senal accionable por ahora.",
    tone: "data-only",
  },
  {
    key: "no-prediction",
    title: "Sin prediccion",
    description: "Mercados pendientes de scoring; se muestran para contexto, no para priorizar.",
    tone: "neutral",
  },
];

const dashboardReviewFilters: Array<{
  key: DashboardReviewFilter;
  label: string;
}> = [
  { key: "all", label: "Todos" },
  { key: "with-prediction", label: "Con prediccion" },
  { key: "opportunity", label: "Solo oportunidades" },
  { key: "watchlist", label: "Solo vigilancia" },
  { key: "low-confidence", label: "Baja confianza" },
  { key: "data-only", label: "Solo datos" },
];

function getOverviewScoreValue(item: MarketOverviewItem): number | null {
  return normalizeProbability(item.latest_prediction?.action_score);
}

function getOverviewConfidenceValue(item: MarketOverviewItem): number | null {
  return normalizeProbability(item.latest_prediction?.confidence_score);
}

function getOverviewEdgeMagnitudeValue(item: MarketOverviewItem): number | null {
  return normalizeProbability(item.latest_prediction?.edge_magnitude);
}

function getOverviewLiquidityValue(item: MarketOverviewItem): number | null {
  return toNumber(item.latest_snapshot?.liquidity);
}

function getOverviewCloseTimeValue(item: MarketOverviewItem): number | null {
  const value = item.market?.close_time ?? item.market?.end_date;
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

function compareOverviewItems(a: MarketOverviewItem, b: MarketOverviewItem): number {
  return (
    compareNullableDesc(getOverviewScoreValue(a), getOverviewScoreValue(b)) ||
    compareNullableDesc(getOverviewConfidenceValue(a), getOverviewConfidenceValue(b)) ||
    compareNullableDesc(getOverviewLiquidityValue(a), getOverviewLiquidityValue(b)) ||
    compareNullableAsc(getOverviewCloseTimeValue(a), getOverviewCloseTimeValue(b)) ||
    compareNullableAsc(toNumber(a.priority_rank), toNumber(b.priority_rank))
  );
}

function getOverviewBucketKey(item: MarketOverviewItem): MarketOverviewBucketKey {
  const prediction = item.latest_prediction;
  const backendBucket = (item.priority_bucket ?? "").toLowerCase();
  const scoringMode = (item.scoring_mode ?? "").toLowerCase();

  if (!prediction || backendBucket === "no_prediction" || scoringMode === "no_prediction") {
    return "no-prediction";
  }
  if (backendBucket === "priority" || backendBucket === "opportunity") {
    return "opportunity";
  }
  if (backendBucket === "watchlist") {
    return "watchlist";
  }
  if (backendBucket === "review_fallback" || backendBucket === "low_confidence") {
    return "low-confidence";
  }
  if (backendBucket === "fallback_only" || backendBucket === "data_only") {
    return "data-only";
  }

  const score = getOverviewScoreValue(item);
  const confidence = getOverviewConfidenceValue(item);
  const edgeMagnitude = getOverviewEdgeMagnitudeValue(item);

  if (confidence !== null && confidence < 0.3) {
    return "low-confidence";
  }
  if (prediction.opportunity || (score !== null && score >= 0.7 && (confidence ?? 0) >= 0.45)) {
    return "opportunity";
  }
  if (scoringMode === "fallback_only") {
    return "data-only";
  }
  if (
    (score !== null && score >= 0.55) ||
    (edgeMagnitude !== null && edgeMagnitude >= 0.05)
  ) {
    return "watchlist";
  }
  return "data-only";
}

function getOverviewBucketDefinition(key: MarketOverviewBucketKey) {
  return marketOverviewBucketDefinitions.find((section) => section.key === key);
}

function buildMarketOverviewSections(
  items: MarketOverviewItem[],
): MarketOverviewBucketSection[] {
  const grouped = new Map<MarketOverviewBucketKey, MarketOverviewItem[]>();
  for (const item of items) {
    const key = getOverviewBucketKey(item);
    const bucketItems = grouped.get(key) ?? [];
    bucketItems.push(item);
    grouped.set(key, bucketItems);
  }

  return marketOverviewBucketDefinitions
    .map((definition) => ({
      ...definition,
      items: [...(grouped.get(definition.key) ?? [])].sort(compareOverviewItems),
    }))
    .filter((section) => section.items.length > 0);
}

function matchesDashboardReviewFilter(
  item: MarketOverviewItem,
  filter: DashboardReviewFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "with-prediction") {
    return Boolean(item.latest_prediction);
  }
  return getOverviewBucketKey(item) === filter;
}

function getOverviewStatus(item: MarketOverviewItem): {
  label: string;
  tone: string;
  detail: string;
} {
  const bucketKey = getOverviewBucketKey(item);
  const bucket = getOverviewBucketDefinition(bucketKey);
  if (bucketKey === "no-prediction") {
    return {
      label: "Sin prediccion",
      tone: "neutral",
      detail: "Pendiente de scoring",
    };
  }
  if (bucketKey === "opportunity") {
    return {
      label: "Oportunidad",
      tone: bucket?.tone ?? "opportunity",
      detail: "Revisar primero",
    };
  }
  if (bucketKey === "watchlist") {
    return {
      label: "Vigilancia",
      tone: bucket?.tone ?? "watchlist",
      detail: "Hay diferencia que mirar",
    };
  }
  if (bucketKey === "low-confidence") {
    return {
      label: "Baja confianza",
      tone: bucket?.tone ?? "low-confidence",
      detail: "Datos limitados",
    };
  }
  return {
    label: "Solo datos",
    tone: bucket?.tone ?? "data-only",
    detail: overviewScoringModeLabel(item.scoring_mode),
  };
}

function getOverviewTimestamp(item: MarketOverviewItem): string | null {
  return (
    item.latest_prediction?.run_at ??
    item.latest_snapshot?.captured_at ??
    item.evidence_summary?.latest_evidence_at ??
    null
  );
}

function getLatestOverviewTimestamp(items: MarketOverviewItem[]): string | null {
  let latest: Date | null = null;
  for (const item of items) {
    const timestamp = getOverviewTimestamp(item);
    if (!timestamp) {
      continue;
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    if (latest === null || date > latest) {
      latest = date;
    }
  }
  return latest?.toISOString() ?? null;
}

function countOverviewSports(items: MarketOverviewItem[]): number {
  const sports = new Set(
    items
      .map((item) => item.market?.sport_type)
      .filter((sport): sport is string => Boolean(sport)),
  );
  return sports.size;
}

function getOverviewItemsWithPrediction(items: MarketOverviewItem[]): number {
  return items.filter((item) => Boolean(item.latest_prediction)).length;
}

function formatReadinessSource(value?: string | null): string {
  if (value === "snapshot_from_discovery") {
    return "Snapshot reciente";
  }
  if (value === "imported_from_discovery") {
    return "Discovery";
  }
  return "Local";
}

function formatSmartAlertSeverity(value: string): string {
  if (value === "critical") {
    return "Crítica";
  }
  if (value === "warning") {
    return "Warning";
  }
  return "Info";
}

function participantInitials(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function visualFallbackUrl(candidate: ResearchCandidate): string | null {
  return (
    candidate.market_image_url ||
    candidate.event_image_url ||
    candidate.icon_url ||
    null
  );
}

function VisualAvatar({
  name,
  src,
  abbreviation,
}: {
  name: string;
  src: string | null;
  abbreviation?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        className="candidate-avatar"
        src={src}
        alt={`${name} visual`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="candidate-avatar fallback" aria-hidden="true">
      {abbreviation || participantInitials(name)}
    </span>
  );
}

function CandidateParticipants({ candidate }: { candidate: ResearchCandidate }) {
  const fallbackUrl = visualFallbackUrl(candidate);
  const participants = candidate.participants ?? [];

  if (participants.length === 0) {
    return (
      <div className="participant-row">
        <span className="participant-chip">
          <VisualAvatar
            name={candidate.question || "Mercado"}
            src={fallbackUrl}
            abbreviation={participantInitials(candidate.question || "Mercado")}
          />
          <span className="participant-name">Visual del mercado</span>
        </span>
      </div>
    );
  }

  return (
    <div className="participant-row">
      {participants.slice(0, 2).map((participant) => (
        <span className="participant-chip" key={`${candidate.market_id}-${participant.name}`}>
          <VisualAvatar
            name={participant.name}
            src={participant.logo_url || participant.image_url || fallbackUrl}
            abbreviation={participant.abbreviation || participantInitials(participant.name)}
          />
          <span className="participant-copy">
            <span className="participant-name">{participant.name}</span>
            <span className="participant-role">{formatParticipantRole(participant.role)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function MarketPricePanel({ candidate }: { candidate: MarketPriceLike }) {
  const yes = normalizeProbability(candidate.market_yes_price);
  const no = getNoProbability(candidate.market_yes_price, candidate.market_no_price);
  const yesWidth = getProbabilityBarWidth(
    candidate.market_yes_price,
    candidate.market_no_price,
  );
  const hasPriceData = yes !== null || no !== null;
  const displayWidth = yesWidth ?? 50;

  return (
    <div className="market-price-panel">
      <div className="market-price-heading">
        <span>Precio del mercado</span>
        {!hasPriceData ? <strong>Faltan precios</strong> : null}
      </div>

      <div className="price-split">
        <div>
          <span>SÍ</span>
          <strong>{formatMarketPercent(yes)}</strong>
        </div>
        <div>
          <span>NO</span>
          <strong>{formatMarketPercent(no)}</strong>
        </div>
      </div>

      <div
        aria-label={`SÍ ${formatMarketPercent(yes)} y NO ${formatMarketPercent(no)}`}
        className={`probability-bar ${hasPriceData ? "" : "neutral"}`}
        role="img"
      >
        <span
          className="probability-bar-yes"
          style={{ width: `${displayWidth}%` }}
        />
        <span className="probability-bar-no" />
      </div>

      <div className="market-depth-row">
        <div>
          <span>Liquidez</span>
          <strong>{formatMarketMetric(candidate.liquidity)}</strong>
        </div>
        <div>
          <span>Volumen</span>
          <strong>{formatMarketMetric(candidate.volume)}</strong>
        </div>
      </div>

      <p className="market-price-note">SÍ/NO reflejan el precio implícito del mercado.</p>
    </div>
  );
}

function CandidateScoreBar({ score }: { score: unknown }) {
  const normalizedScore = Math.max(0, Math.min(100, toNumber(score) ?? 0));

  return (
    <div className="candidate-score-block" aria-label="Puntaje de candidato">
      <div className="candidate-score-heading">
        <span>Puntaje de candidato</span>
        <strong>{formatScore(normalizedScore)}</strong>
      </div>
      <div className="candidate-score-track">
        <span
          className={`candidate-score-fill ${scoreTone(normalizedScore)}`}
          style={{ width: `${normalizedScore}%` }}
        />
      </div>
    </div>
  );
}

function UrgencyScoreBar({ score }: { score: unknown }) {
  const normalizedScore = Math.max(0, Math.min(100, toNumber(score) ?? 0));

  return (
    <div className="candidate-score-block" aria-label="Puntaje de cercanía">
      <div className="candidate-score-heading">
        <span>Puntaje de cercanía</span>
        <strong>{formatScore(normalizedScore)}</strong>
      </div>
      <div className="candidate-score-track">
        <span
          className={`candidate-score-fill ${scoreTone(normalizedScore)}`}
          style={{ width: `${normalizedScore}%` }}
        />
      </div>
    </div>
  );
}

function getScorePendingMessage(dataQuality?: UpcomingDataQualityItem | null): string {
  if (!dataQuality) {
    return "Faltan datos suficientes para estimar.";
  }

  const missingFields = new Set(dataQuality.missing_fields);
  if (
    missingFields.has("snapshot") ||
    missingFields.has("yes_price") ||
    missingFields.has("no_price")
  ) {
    return "Faltan precios o snapshots para estimar.";
  }
  if (missingFields.has("sport") || missingFields.has("market_shape")) {
    return "Falta clasificaciÃ³n confiable para estimar.";
  }
  return "Faltan datos mÃ­nimos para estimar.";
}

function DataQualityBadges({
  dataQuality,
}: {
  dataQuality?: UpcomingDataQualityItem | null;
}) {
  if (!dataQuality) {
    return null;
  }

  const badges: string[] = [];
  if (!dataQuality.has_yes_price || !dataQuality.has_no_price) {
    badges.push("Faltan precios");
  }
  if (!dataQuality.has_snapshot) {
    badges.push("Sin snapshot");
  }
  if (dataQuality.sport === "other" || dataQuality.missing_fields.includes("sport")) {
    badges.push("Deporte incierto");
  }
  if (!dataQuality.has_polysignal_score) {
    badges.push("Score pendiente");
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="data-quality-badges" aria-label="Calidad de datos">
      {badges.map((badge) => (
        <span className="warning-chip" key={badge}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function FreshnessBadges({
  freshness,
}: {
  freshness?: MarketFreshness | null;
}) {
  if (!freshness || freshness.freshness_status === "fresh") {
    return null;
  }

  const reasonBadges = (freshness.reasons ?? []).slice(0, 3).map(formatWarningLabel);
  const badges = [
    formatFreshnessStatus(freshness.freshness_status),
    formatFreshnessAction(freshness.recommended_action),
    ...reasonBadges,
  ];

  return (
    <div className="data-quality-badges freshness-badges" aria-label="Frescura de datos">
      {badges.map((badge) => (
        <span className="warning-chip" key={badge}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function DataQualitySummaryPanel({
  loading,
  summary,
}: {
  loading: boolean;
  summary: Record<string, number> | null;
}) {
  const getValue = (key: string) => (loading ? "..." : summary?.[key] ?? 0);
  return (
    <section className="data-quality-summary" aria-label="Calidad de datos de prÃ³ximos partidos">
      <div>
        <span>Completos</span>
        <strong>{getValue("complete_count")}</strong>
      </div>
      <div>
        <span>Parciales</span>
        <strong>{getValue("partial_count")}</strong>
      </div>
      <div>
        <span>Insuficientes</span>
        <strong>{getValue("insufficient_count")}</strong>
      </div>
      <div>
        <span>Faltan precios</span>
        <strong>{getValue("missing_price_count")}</strong>
      </div>
      <div>
        <span>Sin snapshots</span>
        <strong>{getValue("missing_snapshot_count")}</strong>
      </div>
      <div>
        <span>Sport=other</span>
        <strong>{getValue("sport_other_count")}</strong>
      </div>
      <p>El score queda pendiente cuando faltan precios, snapshots o clasificaciÃ³n confiable.</p>
    </section>
  );
}

function FirstAnalysisReadinessPanel({
  items,
  loading,
  summary,
}: {
  items: AnalysisReadinessItem[];
  loading: boolean;
  summary: AnalysisReadinessResponse["summary"] | null;
}) {
  const readyItems = items.filter((item) => item.readiness_status === "ready").slice(0, 3);
  return (
    <section className="panel first-analysis-panel" aria-label="Mercados listos para analisis">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Primeros analisis</p>
          <h2>Mercados listos para analisis</h2>
          <p>
            PolySignal separa mercados listos de los que necesitan refresh controlado.
            La UI no ejecuta refresh, research ni predicciones.
          </p>
        </div>
        <a className="text-link" href="/data-health">
          Ver Data Health
        </a>
      </div>
      <div className="data-quality-summary compact-readiness-summary">
        <div>
          <span>Listos</span>
          <strong>{loading ? "..." : summary?.ready_count ?? 0}</strong>
        </div>
        <div>
          <span>Necesitan refresh</span>
          <strong>{loading ? "..." : summary?.refresh_needed_count ?? 0}</strong>
        </div>
        <div>
          <span>Bloqueados</span>
          <strong>{loading ? "..." : summary?.blocked_count ?? 0}</strong>
        </div>
        <div>
          <span>Score pendiente</span>
          <strong>{loading ? "..." : summary?.score_pending_count ?? 0}</strong>
        </div>
      </div>
      {loading ? (
        <div className="empty-state compact">Calculando readiness...</div>
      ) : readyItems.length === 0 ? (
        <div className="empty-state compact">
          <strong>No hay mercados completamente listos todavía.</strong>
          <p>
            Revisa Data Health para ver candidatos que necesitan snapshot/precio y
            comandos dry-run de refresh controlado.
          </p>
        </div>
      ) : (
        <div className="ready-market-list">
          {readyItems.map((item) => (
            <article className="ready-market-card" key={`ready-${item.market_id}`}>
              <div>
                <span className="eyebrow">
                  {formatSportLabel(item.sport)} · {formatReadinessSource(item.source)}
                </span>
                <h3>{humanizeMarketTitle(item.title)}</h3>
                <p>
                  Cierre {formatDateTime(item.close_time)} - {item.data_quality_label} -{" "}
                  {formatReadinessAction(item.suggested_next_action)}
                </p>
                {item.ready_reason ? <p>{item.ready_reason}</p> : null}
              </div>
              <div className="snapshot-gap-meta">
                <span className="readiness-status ready">
                  {formatReadinessStatus(item.readiness_status)}
                </span>
                <span className="reason-chip">Score {item.readiness_score}</span>
                {item.time_window_label ? (
                  <span className="reason-chip">{item.time_window_label}</span>
                ) : null}
                <span className="reason-chip">SI {formatMarketPercent(item.yes_price)}</span>
                <span className="reason-chip">NO {formatMarketPercent(item.no_price)}</span>
                <a className="text-link" href={`/markets/${item.market_id}`}>
                  Ver análisis
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PolySignalScoreCard({
  compact = false,
  dataQuality,
  score,
}: {
  compact?: boolean;
  dataQuality?: UpcomingDataQualityItem | null;
  score?: PolySignalScore | null;
}) {
  if (!score || score.score_probability === null || score.score_probability === undefined) {
    return (
      <div className="polysignal-score-card warning">
        <div className="polysignal-score-heading">
          <span>PolySignal SÍ</span>
          <strong>pendiente</strong>
        </div>
        <p>{getScorePendingMessage(dataQuality)}</p>
      </div>
    );
  }

  return (
    <div className={`polysignal-score-card ${score.color_hint || "neutral"} ${compact ? "compact" : ""}`}>
      <div className="polysignal-score-heading">
        <span>PolySignal SÍ</span>
        <strong>{formatMarketPercent(score.score_probability)}</strong>
      </div>
      <div className="polysignal-score-meta">
        <span>Mercado SÍ: {formatMarketPercent(score.market_yes_price)}</span>
        <span>Diferencia: {formatPercentPoints(score.edge_percent_points)}</span>
        <span>Confianza: {score.confidence_label}</span>
      </div>
      {!compact ? <p>{score.label}</p> : null}
      {score.warnings?.length ? (
        <span className="polysignal-score-warning">
          {score.warnings.includes("low_confidence") || score.confidence_label === "Baja"
            ? "Score preliminar"
            : "Estimación informativa"}
        </span>
      ) : null}
    </div>
  );
}

function ReasonChips({ reasons }: { reasons: string[] }) {
  const visibleReasons = reasons.slice(0, 5);
  const remaining = Math.max(0, reasons.length - visibleReasons.length);

  if (visibleReasons.length === 0) {
    return <span className="quiet-text">Sin razones disponibles.</span>;
  }

  return (
    <div className="candidate-chip-list">
      {visibleReasons.map((reason) => (
        <span className="reason-chip" key={reason}>
          {formatReasonLabel(reason)}
        </span>
      ))}
      {remaining > 0 ? <span className="reason-chip muted">+{remaining} más</span> : null}
    </div>
  );
}

function WarningChips({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return <span className="quiet-text">Sin advertencias críticas.</span>;
  }

  return (
    <div className="candidate-chip-list">
      {warnings.slice(0, 4).map((warning) => (
        <span className="warning-chip" key={warning}>
          {formatWarningLabel(warning)}
        </span>
      ))}
    </div>
  );
}

function WatchlistToggleButton({
  busy,
  isWatchlisted,
  onClick,
}: {
  busy: boolean;
  isWatchlisted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`watchlist-button ${isWatchlisted ? "active" : ""}`}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      {busy
        ? "Actualizando..."
        : isWatchlisted
          ? "En seguimiento"
          : "Agregar a seguimiento"}
    </button>
  );
}

function InvestigationStatusSummary({
  items,
  loading,
}: {
  items: InvestigationStatusItem[];
  loading: boolean;
}) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return (
    <section className="panel investigation-status-panel" aria-label="Estado de investigación">
      <div className="panel-heading">
        <div>
          <h2>Estado de investigación</h2>
          <p>
            Kanban operativo para saber en qué etapa de análisis está cada mercado.
            No representa una recomendación de apuesta.
          </p>
        </div>
      </div>
      <div className="investigation-status-grid">
        {INVESTIGATION_STATUS_ORDER.map((status) => (
          <div className="investigation-status-card" key={status}>
            <span>{INVESTIGATION_STATUS_LABELS[status]}</span>
            <strong>{loading ? "..." : counts.get(status) ?? 0}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SmartAlertsPanel({
  alerts,
  counts,
  loading,
}: {
  alerts: SmartAlert[];
  counts: Record<string, number> | null;
  loading: boolean;
}) {
  return (
    <section className="panel smart-alerts-panel" aria-label="Alertas inteligentes">
      <div className="panel-heading">
        <div>
          <h2>Alertas inteligentes</h2>
          <p>
            Recordatorios operativos calculados desde datos existentes. No son
            recomendaciones de apuesta.
          </p>
        </div>
      </div>
      <div className="smart-alert-counts">
        <span>Info {loading ? "..." : counts?.info ?? 0}</span>
        <span>Warning {loading ? "..." : counts?.warning ?? 0}</span>
        <span>Críticas {loading ? "..." : counts?.critical ?? 0}</span>
      </div>
      {loading ? (
        <div className="empty-state compact">Cargando alertas...</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state compact">No hay alertas operativas con los filtros actuales.</div>
      ) : (
        <div className="smart-alert-list">
          {alerts.slice(0, 6).map((alert) => (
            <article className={`smart-alert-card ${alert.severity}`} key={alert.id}>
              <div>
                <span className="badge muted">{formatSmartAlertSeverity(alert.severity)}</span>
                <h3>{alert.title}</h3>
                <p>{alert.description}</p>
              </div>
              {alert.action_url ? (
                <a className="analysis-link" href={alert.action_url}>
                  {alert.action_label ?? "Revisar"}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WatchlistPanel({
  busyItemId,
  error,
  items,
  loading,
  onRemove,
}: {
  busyItemId: number | null;
  error: string | null;
  items: WatchlistItem[];
  loading: boolean;
  onRemove: (itemId: number) => void;
}) {
  return (
    <section className="panel watchlist-panel" id="mi-seguimiento" aria-label="Mi lista de seguimiento">
      <div className="panel-heading">
        <div>
          <h2>Mi lista de seguimiento</h2>
          <p>
            Mercados guardados manualmente para revisar después. No es una
            recomendación de apuesta.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert-panel compact" role="status">
          <strong>No se pudo actualizar seguimiento</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="empty-state compact">Cargando lista de seguimiento...</div>
      ) : items.length === 0 ? (
        <div className="empty-state compact">No tienes mercados en seguimiento todavía.</div>
      ) : (
        <div className="watchlist-card-grid">
          {items.map((item) => {
            const translatedTitle = humanizeMarketTitle(item.market_question);
            return (
              <article className="watchlist-card" key={item.id}>
                <div className="watchlist-card-header">
                  <div className="badge-row">
                    <span className="candidate-id">#{item.market_id}</span>
                    <span className="badge">{formatSportLabel(item.sport)}</span>
                    <span className="badge muted">{formatMarketShapeLabel(item.market_shape)}</span>
                    <span className="badge external-hint">
                      {WATCHLIST_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                </div>
                <h3 title={item.market_question}>{translatedTitle}</h3>
                <div className="watchlist-market-metrics">
                  <span>SÍ {formatMarketPercent(item.latest_yes_price)}</span>
                  <span>NO {formatMarketPercent(getNoProbability(item.latest_yes_price, item.latest_no_price))}</span>
                  <span>Liquidez {formatMarketMetric(item.liquidity)}</span>
                  <span>Volumen {formatMarketMetric(item.volume)}</span>
                </div>
                {item.note ? <p className="watchlist-note">{item.note}</p> : null}
                <div className="watchlist-actions">
                  <a className="analysis-link" href={`/markets/${item.market_id}`}>
                    Ver análisis
                  </a>
                  <button
                    className="watchlist-button danger"
                    disabled={busyItemId === item.id}
                    onClick={() => onRemove(item.id)}
                    type="button"
                  >
                    {busyItemId === item.id ? "Quitando..." : "Quitar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CandidateCard({
  candidate,
  hasExternalSignal,
  isWatchlisted,
  onToggleWatchlist,
  watchlistBusy,
}: {
  candidate: ResearchCandidate;
  hasExternalSignal: boolean;
  isWatchlisted: boolean;
  onToggleWatchlist: (marketId: number) => void;
  watchlistBusy: boolean;
}) {
  const question = candidate.question || "Mercado sin título";
  const translatedQuestion = humanizeMarketTitle(question);
  const questionWasTranslated = translatedQuestion !== question;
  const translatedEventTitle = candidate.event_title
    ? translateMarketSubtitleToSpanish(candidate.event_title)
    : "";

  return (
    <article className="candidate-card">
      <div className="candidate-card-header">
        <div className="candidate-card-meta">
          <span className="candidate-id">#{candidate.market_id}</span>
          <span className="badge">{formatSportLabel(candidate.sport)}</span>
          <span className="badge muted">{formatMarketShapeLabel(candidate.market_shape)}</span>
          {hasExternalSignal ? (
            <span className="badge external-hint">Señal externa disponible</span>
          ) : null}
        </div>
        <strong className={`candidate-score-pill ${scoreTone(candidate.candidate_score)}`}>
          {formatScore(candidate.candidate_score)}
        </strong>
      </div>

      <div className="candidate-card-body">
        <div className="candidate-main-copy">
          <CandidateParticipants candidate={candidate} />
          <h3 title={question}>{translatedQuestion}</h3>
          {questionWasTranslated ? (
            <p className="original-market-title">Original: {question}</p>
          ) : null}
          <p>
            Mercado #{candidate.market_id}
            {translatedEventTitle ? ` · ${translatedEventTitle}` : ""}
          </p>
        </div>

        <div className="candidate-card-insights">
          <CandidateScoreBar score={candidate.candidate_score} />
          <PolySignalScoreCard compact score={candidate.polysignal_score} />
          <MarketPricePanel candidate={candidate} />
        </div>
      </div>

      <div className="candidate-card-actions">
        <WatchlistToggleButton
          busy={watchlistBusy}
          isWatchlisted={isWatchlisted}
          onClick={() => onToggleWatchlist(candidate.market_id)}
        />
        <a className="analysis-link" href={`/markets/${candidate.market_id}`}>
          Ver análisis
        </a>
      </div>

      <div className="candidate-explain-grid">
        <section>
          <h4>Por qué aparece arriba</h4>
          <ReasonChips reasons={candidate.candidate_reasons ?? []} />
        </section>
        <section>
          <h4>Advertencias</h4>
          <WarningChips warnings={candidate.warnings ?? []} />
        </section>
      </div>
    </article>
  );
}

function UpcomingMarketCard({
  dataQuality,
  isWatchlisted,
  market,
  onToggleWatchlist,
  watchlistBusy,
}: {
  dataQuality?: UpcomingDataQualityItem | null;
  isWatchlisted: boolean;
  market: UpcomingSportsMarket;
  onToggleWatchlist: (marketId: number) => void;
  watchlistBusy: boolean;
}) {
  const question = market.question || "Mercado sin título";
  const translatedQuestion = humanizeMarketTitle(question);
  const translatedEventTitle = market.event_title
    ? translateMarketSubtitleToSpanish(market.event_title)
    : "";
  const score = Math.max(0, Math.min(100, toNumber(market.urgency_score) ?? 0));
  const timeReference = market.close_time ?? market.event_time ?? null;
  const participants = market.participants ?? [];

  return (
    <article className="upcoming-card">
      <div className="upcoming-card-header">
        <div className="badge-row">
          <span className="candidate-id">#{market.market_id}</span>
          <span className="badge">{formatSportLabel(market.sport)}</span>
          <span className="badge muted">{formatMarketShapeLabel(market.market_shape)}</span>
          <span className="badge time-badge">{formatTimeRemaining(timeReference)}</span>
        </div>
        <strong className={`urgency-pill ${scoreTone(score)}`}>{formatScore(score)}</strong>
      </div>
      <DataQualityBadges dataQuality={dataQuality} />
      <FreshnessBadges freshness={dataQuality?.freshness ?? market.freshness} />

      <div className="upcoming-main">
        <div className="candidate-main-copy">
          {participants.length > 0 ? (
            <div className="participant-row">
              {participants.slice(0, 2).map((participant) => (
                <span className="participant-chip" key={`${market.market_id}-${participant.name}`}>
                  <VisualAvatar
                    name={participant.name}
                    src={participant.logo_url || participant.image_url || null}
                    abbreviation={participant.abbreviation || participantInitials(participant.name)}
                  />
                  <span className="participant-copy">
                    <span className="participant-name">{participant.name}</span>
                    <span className="participant-role">{formatParticipantRole(participant.role)}</span>
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <h3 title={question}>{translatedQuestion}</h3>
          <p>
            Mercado #{market.market_id}
            {translatedEventTitle ? ` · ${translatedEventTitle}` : ""}
          </p>
        </div>

        <div className="upcoming-side">
          <UrgencyScoreBar score={score} />
          <PolySignalScoreCard dataQuality={dataQuality} score={market.polysignal_score} />
          <MarketPricePanel candidate={market} />
        </div>
        <div className="upcoming-date-row" aria-label="Fechas del mercado">
          <span>
            <strong>Cierre</strong>
            {formatDateTime(market.close_time)}
          </span>
          <span>
            <strong>Evento</strong>
            {formatDateTime(market.event_time)}
          </span>
        </div>
      </div>

      <div className="upcoming-card-footer">
        <div>
          <h4>Por qué aparece aquí</h4>
          <ReasonChips reasons={market.reasons ?? []} />
        </div>
        <div>
          <h4>Advertencias</h4>
          <WarningChips warnings={market.warnings ?? []} />
        </div>
        <div className="upcoming-card-actions">
          <WatchlistToggleButton
            busy={watchlistBusy}
            isWatchlisted={isWatchlisted}
            onClick={() => onToggleWatchlist(market.market_id)}
          />
          <a className="analysis-link" href={`/markets/${market.market_id}`}>
            Ver análisis
          </a>
        </div>
      </div>
    </article>
  );
}

function ExternalSignalCard({
  signal,
  candidate,
}: {
  signal: ExternalMarketSignal;
  candidate?: ResearchCandidate;
}) {
  const comparison = compareSignalToCandidate(signal, candidate);
  const warnings = externalWarnings(signal.warnings);
  const lowMatchConfidence =
    signal.match_confidence !== null &&
    signal.match_confidence !== undefined &&
    (toNumber(signal.match_confidence) ?? 0) < 0.5;

  return (
    <article className={`external-signal-card ${candidate ? "matched" : "unmatched"}`}>
      <div className="external-signal-header">
        <div>
          <div className="badge-row">
            <span className="badge source-badge">{signal.source || "external"}</span>
            <span className="badge muted">
              {candidate ? `Mercado #${candidate.market_id}` : "Pendiente de vincular"}
            </span>
          </div>
          <h3>{signal.title || signal.source_ticker || "Señal externa de mercado"}</h3>
          <p>{signal.source_ticker || signal.source_market_id || "Ticker no disponible"}</p>
        </div>
        <span className={`comparison-badge ${comparison.tone}`}>
          {comparison.label}
        </span>
      </div>

      {candidate ? (
        <div className="matched-market-note">
          <strong>{humanizeMarketTitle(candidate.question)}</strong>
          <span>
            Precio SÍ en Polymarket {formatProbability(candidate.market_yes_price)} | Kalshi{" "}
            {formatProbability(signal.yes_probability ?? signal.mid_price)} | Diferencia{" "}
            {formatPercentDelta(comparison.diff)}
          </span>
        </div>
      ) : (
        <p className="unmatched-note">
          Esta señal aún no está vinculada a un mercado Polymarket. Se muestra
          como contexto externo, no como equivalente.
        </p>
      )}

      <div className="external-signal-metrics">
        <div>
          <span>Prob. SÍ</span>
          <strong>{formatProbability(signal.yes_probability)}</strong>
        </div>
        <div>
          <span>Prob. NO</span>
          <strong>{formatProbability(signal.no_probability)}</strong>
        </div>
        <div>
          <span>Mid / last</span>
          <strong>
            {formatProbability(signal.mid_price)} / {formatProbability(signal.last_price)}
          </strong>
        </div>
        <div>
          <span>Diferencial</span>
          <strong>{formatProbability(signal.spread)}</strong>
        </div>
        <div>
          <span>Volumen</span>
          <strong>{formatCompact(signal.volume)}</strong>
        </div>
        <div>
          <span>Interés abierto</span>
          <strong>{formatCompact(signal.open_interest)}</strong>
        </div>
      </div>

      <div className="confidence-row">
        <span className={`confidence-pill ${confidenceTone(signal.source_confidence)}`}>
          Confianza de fuente {formatProbability(signal.source_confidence)}
        </span>
        <span className={`confidence-pill ${confidenceTone(signal.match_confidence)}`}>
          Confianza de coincidencia {formatProbability(signal.match_confidence)}
        </span>
        <span className="timestamp-pill">Actualizado {formatDateTime(signal.fetched_at)}</span>
      </div>

      {signal.match_reason ? (
        <p className="match-reason">Motivo de coincidencia: {signal.match_reason}</p>
      ) : null}

      {lowMatchConfidence ? (
        <p className="warning-text">
          Confianza de coincidencia baja: tratar como comparación débil.
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="warning-list">
          {warnings.slice(0, 4).map((warning) => (
            <span key={`${signal.id}-${warning}`}>{formatWarningLabel(warning)}</span>
          ))}
        </div>
      ) : (
        <span className="quiet-text">Sin advertencias de fuente.</span>
      )}
    </article>
  );
}

function MarketOverviewPanel({
  items,
  loading,
  overviewPath,
  selectedSport,
  totalCount,
  updatedAt,
}: {
  items: MarketOverviewItem[];
  loading: boolean;
  overviewPath: string;
  selectedSport: string;
  totalCount: number | null;
  updatedAt: Date | null;
}) {
  const [reviewFilter, setReviewFilter] = useState<DashboardReviewFilter>("all");
  const withPrediction = getOverviewItemsWithPrediction(items);
  const sportCount = countOverviewSports(items);
  const latestTimestamp = getLatestOverviewTimestamp(items);
  const sportLabel = getSportSelectorOption(selectedSport).label;
  const filteredItems = items.filter((item) =>
    matchesDashboardReviewFilter(item, reviewFilter),
  );
  const sections = buildMarketOverviewSections(filteredItems);
  const selectedFilterLabel =
    dashboardReviewFilters.find((filter) => filter.key === reviewFilter)?.label ?? "Todos";

  return (
    <section className="panel market-overview-panel" aria-label="Mercados destacados">
      <div className="panel-heading">
        <div>
          <h2>Mercados destacados</h2>
          <p>
            Lectura directa de /markets/overview: precios, score, confianza y
            estado operativo para decidir que revisar primero.
          </p>
        </div>
        <a
          className="text-link"
          href={`${API_BASE_URL}${overviewPath}`}
          target="_blank"
          rel="noreferrer"
        >
          Ver JSON
        </a>
      </div>

      <div className="market-overview-kpis" aria-label="Resumen de mercados destacados">
        <div>
          <span>Total visible</span>
          <strong>{loading ? "..." : filteredItems.length}</strong>
        </div>
        <div>
          <span>Con prediccion</span>
          <strong>{loading ? "..." : withPrediction}</strong>
        </div>
        <div>
          <span>Deportes disponibles</span>
          <strong>{loading ? "..." : sportCount}</strong>
        </div>
        <div>
          <span>Ultima senal</span>
          <strong>{loading ? "..." : formatDateTime(latestTimestamp ?? updatedAt)}</strong>
        </div>
        <div>
          <span>Modo</span>
          <strong>Solo lectura</strong>
        </div>
      </div>

      <div className="market-overview-review-filters" aria-label="Filtros de revisión">
        {dashboardReviewFilters.map((filter) => (
          <button
            aria-pressed={filter.key === reviewFilter}
            className={filter.key === reviewFilter ? "active" : ""}
            disabled={loading}
            key={filter.key}
            onClick={() => setReviewFilter(filter.key)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Cargando mercados destacados...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <strong>
            {selectedSport === "all"
              ? "Todavía no hay mercados cargados."
              : `Todavía no hay mercados cargados para ${sportLabel}.`}
          </strong>
          <p>
            Ejecuta el pipeline limitado para poblar este deporte. La pantalla
            queda en modo solo lectura y no dispara imports, discovery ni scoring.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <strong>No hay mercados en el filtro {selectedFilterLabel}.</strong>
          <p>
            Cambia el filtro de revisión para ver otros mercados cargados. Este
            filtro es local y no dispara llamadas nuevas al backend.
          </p>
        </div>
      ) : (
        <div className="market-overview-bucket-stack">
          {sections.map((section) => (
            <section
              className={`market-overview-bucket ${section.tone}`}
              key={section.key}
            >
              <div className="market-overview-bucket-heading">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <span className={`market-status-badge ${section.tone}`}>
                  {section.items.length}
                </span>
              </div>
              <div className="market-overview-grid">
                {section.items.map((item, index) => (
                  <MarketOverviewCard
                    item={item}
                    key={item.market?.id ?? `${section.key}-${item.market?.question ?? "market"}-${index}`}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function MarketOverviewCard({ item }: { item: MarketOverviewItem }) {
  const market = item.market ?? {};
  const snapshot = item.latest_snapshot ?? {};
  const prediction = item.latest_prediction ?? null;
  const status = getOverviewStatus(item);
  const marketId = market.id;
  const title = market.question
    ? humanizeMarketTitle(market.question)
    : "Mercado sin titulo";
  const originalTitle = market.question && title !== market.question ? market.question : null;
  const yesPrice = formatMarketPercent(snapshot.yes_price);
  const noPrice = formatMarketPercent(snapshot.no_price);
  const modelProbability = formatMarketPercent(prediction?.yes_probability);
  const confidence = formatMarketPercent(prediction?.confidence_score);
  const actionScore = formatMarketPercent(prediction?.action_score);
  const edge = formatPercentDelta(prediction?.edge_signed);
  const sportLabel = formatSportLabel(market.sport_type);
  const marketTypeLabel = formatMarketShapeLabel(market.market_type);
  const barWidth = getProbabilityBarWidth(
    prediction?.yes_probability ?? snapshot.yes_price,
    prediction?.no_probability ?? snapshot.no_price,
  );
  const closeTime = market.close_time ?? market.end_date ?? null;
  const closeLabel = formatDateTime(closeTime);
  const snapshotLabel = formatDateTime(snapshot.captured_at);
  const liquidityLabel = formatMarketMetric(snapshot.liquidity);
  const evidenceCount = item.evidence_summary?.evidence_count ?? 0;

  return (
    <article className={`market-overview-card ${status.tone}`}>
      <div className="market-overview-card-header">
        <div className="candidate-main-copy">
          <div className="badge-row">
            <span className="badge muted">Prioridad #{item.priority_rank ?? marketId ?? "N/D"}</span>
            <span className="badge">{sportLabel}</span>
            <span className="badge muted">{marketTypeLabel}</span>
          </div>
          <h3>{title}</h3>
          {originalTitle ? <p className="original-market-title">{originalTitle}</p> : null}
        </div>
        <span className={`market-status-badge ${status.tone}`}>{status.label}</span>
      </div>

      <div className="market-overview-card-readout">
        <strong>{status.detail}</strong>
        <span>
          Cierre: {closeLabel} | Snapshot: {snapshotLabel}
        </span>
      </div>

      <div className="market-overview-price-block">
        <div className="market-price-row">
          <span>Precio YES</span>
          <strong>{yesPrice === "--" ? "Sin dato" : yesPrice}</strong>
        </div>
        <div className="market-price-row">
          <span>Precio NO</span>
          <strong>{noPrice === "--" ? "Sin dato" : noPrice}</strong>
        </div>
        <div className={`probability-bar ${barWidth === null ? "neutral" : ""}`}>
          <span
            className="probability-bar-yes"
            style={{ width: `${barWidth ?? 50}%` }}
          />
          <span className="probability-bar-no" />
        </div>
      </div>

      <div className="market-overview-metrics">
        <div className="market-overview-metric primary">
          <span>Probabilidad modelo</span>
          <strong>{modelProbability === "--" ? "No calculado" : modelProbability}</strong>
        </div>
        <div className="market-overview-metric primary">
          <span>Score revisión</span>
          <strong>{actionScore === "--" ? "Pendiente" : actionScore}</strong>
        </div>
        <div className="market-overview-metric">
          <span>Confianza</span>
          <strong>{confidence === "--" ? "Pendiente" : confidence}</strong>
        </div>
        <div className="market-overview-metric">
          <span>Edge</span>
          <strong>{edge === "N/D" ? "Sin dato" : edge}</strong>
        </div>
      </div>

      <div className="market-overview-foot">
        <div>
          <span>Bucket</span>
          <strong>{overviewBucketLabel(item.priority_bucket)}</strong>
        </div>
        <div>
          <span>Modo</span>
          <strong>{status.detail}</strong>
        </div>
        <div>
          <span>Cierre</span>
          <strong>{formatDateTime(closeTime)}</strong>
        </div>
        <div>
          <span>Snapshot</span>
          <strong>{formatDateTime(snapshot.captured_at)}</strong>
        </div>
      </div>

      <div className="market-overview-actions">
        <span className="quiet-text">
          Evidencia: {evidenceCount} | Liquidez {liquidityLabel === "--" ? "Sin dato" : liquidityLabel}
        </span>
        {marketId ? (
          <a className="analysis-link" href={`/markets/${marketId}`}>
            Ver análisis
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>({
    sport: "all",
    marketShape: "all",
    limit: 10,
  });
  const [upcomingFilters, setUpcomingFilters] = useState<UpcomingFilters>({
    sport: "all",
    days: 7,
    includeFutures: false,
  });
  const [watchlistActionMarketId, setWatchlistActionMarketId] = useState<number | null>(null);
  const [watchlistActionItemId, setWatchlistActionItemId] = useState<number | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState>({
    health: null,
    overview: null,
    dashboardMeta: null,
    candidates: [],
    upcomingMarkets: [],
    upcomingCounts: null,
    upcomingDataQualitySummary: null,
    upcomingDataQualityItems: [],
    analysisReadinessSummary: null,
    analysisReadinessItems: [],
    externalSignals: [],
    watchlistItems: [],
    investigationStatuses: [],
    smartAlerts: [],
    smartAlertCounts: null,
    loading: true,
    error: null,
    updatedAt: null,
  });

  const loadDashboard = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
    const overviewPath = buildMarketOverviewPath(upcomingFilters.sport);
    const candidatesPath = buildCandidatesPath(filters);
    const upcomingPath = buildUpcomingPath(upcomingFilters);
    const upcomingDataQualityPath = buildUpcomingDataQualityPath(upcomingFilters);
    const analysisReadinessPath = buildAnalysisReadinessPath(upcomingFilters);
    const alertSport = getSportApiFilter(upcomingFilters.sport);
    const [
      health,
      overview,
      candidates,
      upcomingSports,
      upcomingDataQuality,
      analysisReadiness,
      dashboardMeta,
      externalSignals,
      watchlist,
      investigationStatuses,
      smartAlerts,
    ] =
      await Promise.allSettled([
        withDashboardTimeout(fetchJson<HealthResponse>("/health"), "/health"),
        withDashboardTimeout(fetchJson<MarketOverviewResponse>(overviewPath), overviewPath),
        withDashboardTimeout(fetchJson<CandidatesResponse>(candidatesPath), candidatesPath),
        withDashboardTimeout(fetchJson<UpcomingSportsResponse>(upcomingPath), upcomingPath),
        withDashboardTimeout(
          fetchJson<UpcomingDataQualityResponse>(upcomingDataQualityPath),
          upcomingDataQualityPath,
        ),
        withDashboardTimeout(
          fetchJson<AnalysisReadinessResponse>(analysisReadinessPath),
          analysisReadinessPath,
        ),
        withDashboardTimeout(
          fetchJson<DashboardMetaResponse>("/dashboard/latest/meta"),
          "/dashboard/latest/meta",
        ),
        withDashboardTimeout(
          fetchJson<ExternalSignalsResponse>("/external-signals/kalshi?limit=10"),
          "/external-signals/kalshi?limit=10",
        ),
        withDashboardTimeout(fetchWatchlistItems(), "/watchlist"),
        withDashboardTimeout(fetchInvestigationStatuses(), "/investigation-statuses"),
        withDashboardTimeout(fetchSmartAlerts({ limit: 8, sport: alertSport }), "/smart-alerts"),
      ]);

    const errors: string[] = [];
    if (health.status === "rejected") {
      errors.push("La API no respondio en /health");
    }
    if (overview.status === "rejected") {
      errors.push("La vista principal no pudo leer overview de mercados");
    }
    if (candidates.status === "rejected") {
      errors.push("Candidatos en preparacion");
    }
    if (upcomingSports.status === "rejected") {
      errors.push("Mercados próximos en preparación");
    }
    if (upcomingDataQuality.status === "rejected") {
      errors.push("Calidad de datos en preparacion");
    }
    if (analysisReadiness.status === "rejected") {
      errors.push("Readiness de analisis en preparacion");
    }
    if (externalSignals.status === "rejected") {
      errors.push("Señales externas en preparación");
    }

    if (watchlist.status === "rejected") {
      errors.push("Lista de seguimiento en preparacion");
    }
    if (investigationStatuses.status === "rejected") {
      errors.push("Estado de investigacion en preparacion");
    }
    if (smartAlerts.status === "rejected") {
      errors.push("Alertas inteligentes en preparacion");
    }

    setState({
      health: health.status === "fulfilled" ? health.value : null,
      overview: overview.status === "fulfilled" ? overview.value : null,
      dashboardMeta:
        dashboardMeta.status === "fulfilled" ? dashboardMeta.value : null,
      candidates:
        candidates.status === "fulfilled" ? candidates.value.candidates : [],
      upcomingMarkets:
        upcomingSports.status === "fulfilled" ? upcomingSports.value.items : [],
      upcomingCounts:
        upcomingSports.status === "fulfilled" ? upcomingSports.value.counts : null,
      upcomingDataQualitySummary:
        upcomingDataQuality.status === "fulfilled" ? upcomingDataQuality.value.summary : null,
      upcomingDataQualityItems:
        upcomingDataQuality.status === "fulfilled" ? upcomingDataQuality.value.items : [],
      analysisReadinessSummary:
        analysisReadiness.status === "fulfilled" ? analysisReadiness.value.summary : null,
      analysisReadinessItems:
        analysisReadiness.status === "fulfilled" ? analysisReadiness.value.items : [],
      externalSignals:
        externalSignals.status === "fulfilled" ? externalSignals.value.signals : [],
      watchlistItems: watchlist.status === "fulfilled" ? watchlist.value : [],
      investigationStatuses:
        investigationStatuses.status === "fulfilled" ? investigationStatuses.value : [],
      smartAlerts: smartAlerts.status === "fulfilled" ? smartAlerts.value.alerts : [],
      smartAlertCounts: smartAlerts.status === "fulfilled" ? smartAlerts.value.counts : null,
      loading: false,
      error: errors.length > 0 ? errors.join(". ") : null,
      updatedAt: new Date(),
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setState((current) => ({
        ...current,
        loading: false,
        error: `La API no respondio desde ${API_HOST_LABEL}. ${message}`,
        updatedAt: new Date(),
      }));
    }
  }, [filters, upcomingFilters]);

  useEffect(() => {
    let cancelled = false;

    async function guardedLoadDashboard() {
      await loadDashboard();
      if (cancelled) {
        return;
      }
    }

    void guardedLoadDashboard();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  const apiOnline = state.health?.status === "ok";
  const marketCount = useMemo(() => {
    if (typeof state.overview?.total_count === "number") {
      return state.overview.total_count;
    }
    if (Array.isArray(state.overview?.items)) {
      return state.overview.items.length;
    }
    return null;
  }, [state.overview]);
  const overviewItems = useMemo(
    () => getMarketOverviewItems(state.overview),
    [state.overview],
  );
  const overviewItemsWithPrediction = useMemo(
    () => getOverviewItemsWithPrediction(overviewItems),
    [overviewItems],
  );
  const overviewSportCount = useMemo(
    () => countOverviewSports(overviewItems),
    [overviewItems],
  );

  const filteredCandidates = state.candidates.filter((candidate) =>
    matchesSelectedSport(candidate.sport, filters.sport),
  );
  const topCandidates = filteredCandidates.slice(0, filters.limit);
  const overviewPath = buildMarketOverviewPath(upcomingFilters.sport);
  const candidatesPath = buildCandidatesPath(filters);
  const upcomingPath = buildUpcomingPath(upcomingFilters);
  const filteredUpcomingMarkets = state.upcomingMarkets.filter((market) =>
    matchesSelectedSport(market.sport, upcomingFilters.sport),
  );
  const topUpcomingMarkets = filteredUpcomingMarkets.slice(0, 8);
  const dataQualityByMarketId = useMemo(() => {
    const entries = state.upcomingDataQualityItems.map((item) => [item.market_id, item] as const);
    return new Map(entries);
  }, [state.upcomingDataQualityItems]);
  const watchlistByMarketId = useMemo(() => {
    const entries = state.watchlistItems.map((item) => [item.market_id, item] as const);
    return new Map(entries);
  }, [state.watchlistItems]);
  const candidatesById = useMemo(() => {
    const entries = state.candidates.map((candidate) => [candidate.market_id, candidate] as const);
    return new Map(entries);
  }, [state.candidates]);
  const matchedExternalSignals = useMemo(
    () =>
      state.externalSignals.filter(
        (signal) =>
          signal.polymarket_market_id !== null &&
          signal.polymarket_market_id !== undefined &&
          candidatesById.has(signal.polymarket_market_id),
      ),
    [candidatesById, state.externalSignals],
  );
  const unmatchedExternalSignals = useMemo(
    () =>
      state.externalSignals.filter(
        (signal) =>
          signal.polymarket_market_id === null ||
          signal.polymarket_market_id === undefined ||
          !candidatesById.has(signal.polymarket_market_id),
    ),
    [candidatesById, state.externalSignals],
  );
  const candidateIdsWithExternalSignals = useMemo(() => {
    const ids = state.externalSignals
      .map((signal) => signal.polymarket_market_id)
      .filter((marketId): marketId is number => typeof marketId === "number");
    return new Set(ids);
  }, [state.externalSignals]);
  const handleSelectSport = useCallback((sport: string) => {
    if (!isSportBackendEnabled(sport)) {
      return;
    }
    setFilters((current) => ({ ...current, sport }));
    setUpcomingFilters((current) => ({ ...current, sport }));
  }, []);

  useEffect(() => {
    const handleShellSportSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ sport?: string }>).detail;
      if (typeof detail?.sport === "string") {
        handleSelectSport(detail.sport);
      }
    };
    window.addEventListener("polysignal:sport-select", handleShellSportSelect);
    return () => window.removeEventListener("polysignal:sport-select", handleShellSportSelect);
  }, [handleSelectSport]);

  const handleToggleWatchlist = useCallback(async (marketId: number) => {
    setWatchlistActionMarketId(marketId);
    setWatchlistError(null);
    try {
      const item = await toggleWatchlistMarket(marketId);
      setState((current) => {
        const withoutMarket = current.watchlistItems.filter(
          (watchlistItem) => watchlistItem.market_id !== marketId,
        );
        return {
          ...current,
          watchlistItems: item ? [item, ...withoutMarket] : withoutMarket,
        };
      });
    } catch {
      setWatchlistError("No se pudo actualizar la lista. Revisa que la API esté en línea.");
    } finally {
      setWatchlistActionMarketId(null);
    }
  }, []);

  const handleRemoveWatchlistItem = useCallback(async (itemId: number) => {
    setWatchlistActionItemId(itemId);
    setWatchlistError(null);
    try {
      await removeWatchlistItem(itemId);
      setState((current) => ({
        ...current,
        watchlistItems: current.watchlistItems.filter((item) => item.id !== itemId),
      }));
    } catch {
      setWatchlistError("No se pudo quitar el mercado de seguimiento.");
    } finally {
      setWatchlistActionItemId(null);
    }
  }, []);

  return (
    <main className="dashboard-shell">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Centro de comando PolySignal</h1>
          <p className="subtitle">
            Vista operativa de solo lectura para revisar partidos próximos,
            seguimiento, alertas, workflow y calidad de datos sin ejecutar
            research automático, predicciones ni trading.
          </p>
        </div>
        <div className="topbar-actions">
          <div
            className={`status-pill ${apiOnline ? "status-online" : "status-offline"}`}
            aria-live="polite"
          >
            <span className="status-dot" />
            {state.loading ? "Cargando API" : apiOnline ? "API en línea" : "API sin respuesta"}
          </div>
          <span className="badge muted">API: {API_HOST_LABEL}</span>
          <button
            className="text-link"
            disabled={state.loading}
            onClick={() => void loadDashboard()}
            type="button"
          >
            {state.loading ? "Cargando" : "Reintentar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          PolySignal prioriza partidos cercanos para revisión manual; no es una
          recomendación de apuesta. No ejecuta apuestas automáticas, research ni
          predicciones desde esta UI.
        </span>
      </section>

      <section className="command-center-shortcuts" aria-label="Accesos rápidos del centro de comando">
        <div className="panel-heading compact">
          <div>
            <h2>Accesos rápidos</h2>
            <p>Las vistas principales del flujo operativo diario en un solo lugar.</p>
          </div>
        </div>
        <nav className="command-center-link-grid" aria-label="Vistas principales">
          {commandCenterLinks.map((link) => (
            <a className="command-center-link-card" href={link.href} key={link.href}>
              <strong>{link.label}</strong>
              <span>{link.description}</span>
            </a>
          ))}
        </nav>
      </section>

      {state.error ? (
        <section className="alert-panel" role="status">
          <strong>Datos parciales</strong>
          <span>
            {state.error}. Host API usado: {API_HOST_LABEL}. Los datos principales
            siguen visibles cuando estan disponibles.
          </span>
          <button
            className="refresh-button"
            disabled={state.loading}
            onClick={() => void loadDashboard()}
            type="button"
          >
            {state.loading ? "Cargando" : "Reintentar"}
          </button>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Estado del sistema">
        <article className="metric-card">
          <span>Estado backend</span>
          <strong>{state.loading ? "Cargando" : apiOnline ? "en línea" : "desconectado"}</strong>
          <p>{state.health?.environment ?? "Entorno local pendiente"}</p>
        </article>
        <article className="metric-card">
          <span>Resumen de mercados</span>
          <strong>{marketCount === null ? "N/D" : marketCount}</strong>
          <p>{state.overview ? "Endpoint disponible" : "Sin respuesta del endpoint"}</p>
        </article>
        <article className="metric-card">
          <span>Con prediccion</span>
          <strong>{state.loading ? "..." : overviewItemsWithPrediction}</strong>
          <p>Mercados con score visible en overview</p>
        </article>
        <article className="metric-card">
          <span>Deportes disponibles</span>
          <strong>{state.loading ? "..." : overviewSportCount}</strong>
          <p>Solo deportes principales activos en los filtros</p>
        </article>
        <article className="metric-card">
          <span>Modo actual</span>
          <strong>solo lectura</strong>
          <p>No trading automático ni scoring desde la UI</p>
        </article>
        <article className="metric-card">
          <span>Actualizacion local</span>
          <strong>{formatDateTime(state.updatedAt)}</strong>
          <p>
            {state.dashboardMeta?.generated_at
              ? `Reporte backend: ${formatDateTime(state.dashboardMeta.generated_at)}`
              : "Dashboard en vivo"}
          </p>
        </article>
      </section>

      <SmartAlertsPanel
        alerts={state.smartAlerts}
        counts={state.smartAlertCounts}
        loading={state.loading}
      />

      <SportsSelectorBar
        selectedSport={upcomingFilters.sport}
        onSelect={handleSelectSport}
      />

      <MarketOverviewPanel
        items={overviewItems}
        loading={state.loading}
        overviewPath={overviewPath}
        selectedSport={upcomingFilters.sport}
        totalCount={marketCount}
        updatedAt={state.updatedAt}
      />

      <FirstAnalysisReadinessPanel
        items={state.analysisReadinessItems}
        loading={state.loading}
        summary={state.analysisReadinessSummary}
      />

      <section className="filter-panel dashboard-filter-panel" aria-label="Filtros de candidatos">
        <div className="filter-group">
          <label htmlFor="shape-filter">Tipo de mercado</label>
          <select
            id="shape-filter"
            value={filters.marketShape}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                marketShape: event.target.value,
              }))
            }
          >
            {marketShapeOptions.map((option) => (
              <option key={option} value={option}>
                {formatOptionLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="limit-filter">Límite</label>
          <select
            id="limit-filter"
            value={filters.limit}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                limit: Number(event.target.value),
              }))
            }
          >
            {limitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button
          className="refresh-button"
          type="button"
          onClick={() => void loadDashboard()}
          disabled={state.loading}
        >
          {state.loading ? "Cargando" : "Actualizar"}
        </button>
      </section>

      <section className="panel upcoming-panel primary-focus-panel" aria-label="Próximos partidos para analizar">
        <div className="panel-heading">
          <div>
            <h2>Próximos partidos para analizar</h2>
            <p>
              Mercados deportivos de los próximos 7 días enfocados en
              ganador/perdedor del partido. Los campeonatos y futuros quedan
              pausados por ahora.
            </p>
          </div>
          <a
            className="text-link"
            href={`${API_BASE_URL}${upcomingPath}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver JSON
          </a>
        </div>

        <div className="upcoming-filter-row" aria-label="Filtros de próximos mercados">
          <div className="filter-group">
            <label htmlFor="upcoming-days-filter">Ventana</label>
            <select
              id="upcoming-days-filter"
              value={upcomingFilters.days}
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  days: Number(event.target.value),
                }))
              }
            >
              {[1, 3, 7].map((option) => (
                <option key={option} value={option}>
                  Próximos {option} {option === 1 ? "día" : "días"}
                </option>
              ))}
            </select>
          </div>
          <label className="toggle-control" htmlFor="include-futures-filter">
            <input
              checked={upcomingFilters.includeFutures}
              id="include-futures-filter"
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  includeFutures: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Incluir futuros pausados
          </label>
        </div>

        <div className="upcoming-summary-row">
          <span>Enfoque: ganador/perdedor del partido</span>
          <span>Ventana principal: próximos 7 días</span>
          <span>Total filtrados: {state.loading ? "..." : state.upcomingCounts?.matched_filters ?? 0}</span>
          <span>Ganador de partido: {state.loading ? "..." : state.upcomingCounts?.match_winner ?? 0}</span>
          <span>Futuros/campeonatos: {state.loading ? "..." : state.upcomingCounts?.championship_futures ?? 0}</span>
        </div>
        <DataQualitySummaryPanel
          loading={state.loading}
          summary={state.upcomingDataQualitySummary}
        />

        {state.loading ? (
          <div className="empty-state">Cargando próximos mercados...</div>
        ) : topUpcomingMarkets.length === 0 ? (
          <div className="empty-state">
            <strong>
              {upcomingFilters.sport === "all"
                ? "No se encontraron mercados de partidos próximos con los filtros actuales."
                : `No se encontraron mercados próximos para ${getSportSelectorOption(upcomingFilters.sport).label} con los filtros actuales.`}
            </strong>
            <p>
              Puede que Polymarket no tenga mercados diarios disponibles o que
              falte sincronizar datos recientes. Esta sección solo lee datos ya
              guardados localmente.
            </p>
          </div>
        ) : (
          <div className="upcoming-card-grid">
            {topUpcomingMarkets.map((market) => (
              <UpcomingMarketCard
                dataQuality={dataQualityByMarketId.get(market.market_id)}
                isWatchlisted={watchlistByMarketId.has(market.market_id)}
                key={market.market_id}
                market={market}
                onToggleWatchlist={handleToggleWatchlist}
                watchlistBusy={watchlistActionMarketId === market.market_id}
              />
            ))}
          </div>
        )}
      </section>

      <InvestigationStatusSummary
        items={state.investigationStatuses}
        loading={state.loading}
      />

      <WatchlistPanel
        busyItemId={watchlistActionItemId}
        error={watchlistError}
        items={state.watchlistItems}
        loading={state.loading}
        onRemove={handleRemoveWatchlistItem}
      />

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Otros mercados para más adelante</h2>
              <p>
                Candidatos generales, incluidos campeonatos y futuros, quedan
                como referencia secundaria. No son prioridad en esta etapa;
                volveremos a analizarlos más adelante.
              </p>
            </div>
            <a
              className="text-link"
              href={`${API_BASE_URL}${candidatesPath}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver JSON
            </a>
          </div>

          {state.loading ? (
            <div className="empty-state">Cargando candidatos...</div>
          ) : topCandidates.length === 0 ? (
            <div className="empty-state">
              <strong>No hay candidatos disponibles</strong>
              <p>
                Prueba con Todos en la barra de deportes, tipo de mercado todos
                o un límite mayor. La pantalla sigue en modo solo lectura.
              </p>
            </div>
          ) : (
            <div className="candidate-card-list">
              {topCandidates.map((candidate) => (
                <CandidateCard
                  candidate={candidate}
                  hasExternalSignal={candidateIdsWithExternalSignals.has(candidate.market_id)}
                  isWatchlisted={watchlistByMarketId.has(candidate.market_id)}
                  key={candidate.market_id}
                  onToggleWatchlist={handleToggleWatchlist}
                  watchlistBusy={watchlistActionMarketId === candidate.market_id}
                />
              ))}
            </div>
          )}
        </article>

        <article className="panel panel-wide external-panel">
          <div className="panel-heading">
            <div>
              <h2>Señales externas de mercado</h2>
              <p>
                Segunda opinión de mercado usando fuentes externas como Kalshi.
                Son datos comparativos, no instrucciones de apuesta.
              </p>
            </div>
            <div className="panel-action-links">
              <a className="text-link" href="/external-signals/matches">
                Revisar coincidencias Kalshi
              </a>
              <a
                className="text-link"
                href={`${API_BASE_URL}/external-signals/kalshi?limit=10`}
                target="_blank"
                rel="noreferrer"
              >
                Ver JSON de Kalshi
              </a>
            </div>
          </div>

          <p className="external-summary-help">
            Las señales externas vienen de fuentes como Kalshi. Si todavía no
            coinciden con un mercado de Polymarket, aparecen como pendientes de
            vincular. Estas señales son datos comparativos, no instrucciones de
            apuesta.
          </p>

          <div className="external-summary-grid">
            <div>
              <span>Total cargadas</span>
              <strong>{state.loading ? "..." : state.externalSignals.length}</strong>
            </div>
            <div>
              <span>Coinciden con Polymarket</span>
              <strong>{matchedExternalSignals.length}</strong>
            </div>
            <div>
              <span>Pendientes de vincular</span>
              <strong>{unmatchedExternalSignals.length}</strong>
            </div>
          </div>

          {state.loading ? (
            <div className="empty-state">Cargando señales externas...</div>
          ) : state.externalSignals.length === 0 ? (
            <div className="empty-state">
              <strong>No hay señales externas cargadas todavía.</strong>
              <p>
                Cuando cargues señales de Kalshi de forma controlada, aparecerán
                aquí. El dashboard no ejecuta fetch remoto ni operaciones de
                trading.
              </p>
              <code>
                python -m app.commands.fetch_kalshi_signals --limit 1 --status
                open --persist --json
              </code>
              <span>Solo lectura / sin trading / sin órdenes.</span>
            </div>
          ) : (
            <div className="external-signal-sections">
              {matchedExternalSignals.length > 0 ? (
                <section>
                  <h3>Señales coincidentes con Polymarket</h3>
                  <div className="external-card-grid">
                    {matchedExternalSignals.map((signal) => (
                      <ExternalSignalCard
                        key={signal.id}
                        signal={signal}
                        candidate={
                          signal.polymarket_market_id
                            ? candidatesById.get(signal.polymarket_market_id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <div className="empty-state compact">
                  Hay señales cargadas, pero ninguna coincide todavía con los
                  candidatos visibles de Polymarket.
                </div>
              )}

              {unmatchedExternalSignals.length > 0 ? (
                <section>
                  <h3>Señales pendientes de vincular</h3>
                  <p className="section-note">
                    Estas señales existen en la base de datos, pero todavía no
                    están conectadas con un mercado específico de Polymarket. No
                    se asume equivalencia por texto parecido.
                  </p>
                  <div className="external-card-grid">
                    {unmatchedExternalSignals.map((signal) => (
                      <ExternalSignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </article>

        <aside className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Cómo leer PolySignal</h2>
              <p>Glosario rápido para interpretar la pantalla.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Precio SÍ</dt>
              <dd>Precio/probabilidad implícita del lado SÍ en el mercado.</dd>
            </div>
            <div>
              <dt>Precio NO</dt>
              <dd>Precio/probabilidad implícita del lado NO cuando existe snapshot.</dd>
            </div>
            <div>
              <dt>Puntaje de candidato</dt>
              <dd>Mide qué tan útil es un mercado para investigar primero. No indica probabilidad de ganar.</dd>
            </div>
            <div>
              <dt>Confianza de evidencia</dt>
              <dd>Calidad de evidencia cuando existe research, no probabilidad de ganar.</dd>
            </div>
            <div>
              <dt>Diferencia estimada</dt>
              <dd>Diferencia entre una estimación PolySignal y el precio del mercado.</dd>
            </div>
            <div>
              <dt>Liquidez / volumen</dt>
              <dd>Profundidad y actividad del mercado usadas como contexto operativo.</dd>
            </div>
            <div>
              <dt>Tipo de mercado</dt>
              <dd>Forma del mercado: campeonato, ganador de partido, futuro/temporada u otra.</dd>
            </div>
            <div>
              <dt>Research packet</dt>
              <dd>Paquete read-only para que un agente externo prepare research JSON.</dd>
            </div>
            <div>
              <dt>Quality Gate</dt>
              <dd>Validación previa a ingestar findings, report y prediction.</dd>
            </div>
            <div>
              <dt>Probabilidad implícita de Kalshi</dt>
              <dd>Probabilidad implícita normalizada desde precios Kalshi.</dd>
            </div>
            <div>
              <dt>Confianza de fuente</dt>
              <dd>Calidad operativa de la fuente externa: spread, volumen y datos.</dd>
            </div>
            <div>
              <dt>Confianza de coincidencia</dt>
              <dd>Confianza de que una señal externa corresponde al mercado local.</dd>
            </div>
            <div>
              <dt>Diferencial</dt>
              <dd>Diferencia entre bid y ask. Un diferencial alto reduce confiabilidad.</dd>
            </div>
            <div>
              <dt>Alineado / divergente</dt>
              <dd>Comparación simple entre Kalshi y Polymarket, no señal de apuesta.</dd>
            </div>
            <div>
              <dt>Señal externa</dt>
              <dd>Segunda opinión de mercado guardada localmente y mostrada read-only.</dd>
            </div>
          </dl>
        </aside>

        <aside className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Enlaces rápidos</h2>
              <p>Atajos locales para inspección read-only.</p>
            </div>
          </div>
          <nav className="quick-links" aria-label="Enlaces rápidos">
            {quickLinks.map((link) => (
              <a
                href={link.href}
                key={link.href}
                rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                target={link.href.startsWith("http") ? "_blank" : undefined}
              >
                <span>{link.label}</span>
                <span aria-hidden="true">Abrir</span>
              </a>
            ))}
          </nav>
        </aside>
      </section>
    </main>
  );
}
