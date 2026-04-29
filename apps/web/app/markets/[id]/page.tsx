"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";

import {
  WATCHLIST_STATUS_LABELS,
  createWatchlistItem,
  fetchMarketWatchlistStatus,
  removeWatchlistItem,
  updateWatchlistItem,
  type WatchlistItem,
  type WatchlistStatus,
} from "../../lib/watchlist";
import { MainNavigation } from "../../components/MainNavigation";
import {
  INVESTIGATION_STATUS_LABELS,
  INVESTIGATION_STATUS_ORDER,
  fetchMarketInvestigationStatus,
  removeMarketInvestigationStatus,
  updateMarketInvestigationStatus,
  upsertMarketInvestigationStatus,
  type InvestigationStatus,
  type InvestigationStatusItem,
} from "../../lib/investigationStatus";
import {
  addMarketTag,
  fetchMarketTags,
  removeMarketTag,
  type MarketTag,
} from "../../lib/marketTags";
import {
  deleteMarketOutcome,
  fetchMarketOutcome,
  updateMarketOutcome,
  upsertMarketOutcome,
  type MarketOutcome,
  type ResolvedOutcome,
} from "../../lib/backtesting";
import {
  DECISION_CONFIDENCE_LABELS,
  MARKET_DECISION_LABELS,
  createMarketDecision,
  deleteMarketDecision,
  fetchMarketDecisions,
  type DecisionConfidenceLabel,
  type MarketDecision,
  type MarketDecisionItem,
} from "../../lib/marketDecisions";

type JsonPayload = Record<string, unknown> | unknown[];

type AnalysisParticipant = {
  name: string;
  role: string;
  logo_url?: string | null;
  image_url?: string | null;
  abbreviation?: string | null;
};

type AnalysisMarket = {
  id: number;
  polymarket_market_id: string;
  event_id: number;
  event_title?: string | null;
  event_category?: string | null;
  question: string;
  slug: string;
  sport_type?: string | null;
  market_type?: string | null;
  evidence_shape?: string | null;
  image_url?: string | null;
  icon_url?: string | null;
  event_image_url?: string | null;
  event_icon_url?: string | null;
  active: boolean;
  closed: boolean;
  end_date?: string | null;
  rules_text?: string | null;
  created_at: string;
  updated_at: string;
};

type AnalysisSnapshot = {
  id: number;
  market_id: number;
  captured_at: string;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  midpoint?: string | number | null;
  last_trade_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
};

type PriceHistoryPoint = {
  snapshot_id: number;
  captured_at: string;
  yes_price?: string | number | null;
  no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
};

type PriceHistoryResponse = {
  market_id: number;
  points: PriceHistoryPoint[];
  latest?: PriceHistoryPoint | null;
  first?: PriceHistoryPoint | null;
  change_yes_abs?: string | number | null;
  change_yes_pct?: string | number | null;
  count: number;
};

type ValidPriceHistoryPoint = PriceHistoryPoint & {
  originalIndex: number;
  timestamp: number;
  yes: number;
  no: number | null;
};

type PriceHistoryChartPoint = ValidPriceHistoryPoint & {
  index: number;
  x: number;
  y: number;
};

type PriceHistoryChartModel = {
  areaPath: string;
  coordinates: PriceHistoryChartPoint[];
  height: number;
  highlighted: Set<number>;
  linePath: string;
  padding: { top: number; right: number; bottom: number; left: number };
  validPoints: ValidPriceHistoryPoint[];
  width: number;
  xLabels: Array<{ x: number; label: string }>;
  yTicks: Array<{ value: number; label: string; y: number }>;
};

type CandidateContext = {
  candidate_score: string | number;
  candidate_reasons: string[];
  warnings: string[];
  research_template_name: string;
  vertical: string;
  sport: string;
  market_shape: string;
  participants: AnalysisParticipant[];
};

type AnalysisPrediction = {
  id: number;
  prediction_family: string;
  research_run_id?: number | null;
  yes_probability: string | number;
  no_probability: string | number;
  confidence_score: string | number;
  edge_signed: string | number;
  edge_magnitude: string | number;
  edge_class: string;
  opportunity: boolean;
  recommendation?: string | null;
  run_at: string;
};

type AnalysisResearchRun = {
  id: number;
  status: string;
  vertical: string;
  subvertical?: string | null;
  market_shape: string;
  research_mode: string;
  model_used?: string | null;
  web_search_used: boolean;
  degraded_mode: boolean;
  confidence_score?: string | number | null;
  total_sources_found: number;
  total_sources_used: number;
  started_at: string;
  finished_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisFinding = {
  id: number;
  research_run_id: number;
  claim: string;
  stance: string;
  factor_type: string;
  evidence_summary: string;
  impact_score: string | number;
  credibility_score: string | number;
  freshness_score: string | number;
  source_name?: string | null;
  citation_url?: string | null;
  published_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisReport = {
  id: number;
  prediction_id?: number | null;
  research_run_id?: number | null;
  thesis: string;
  final_reasoning: string;
  recommendation: string;
  evidence_for: JsonPayload;
  evidence_against: JsonPayload;
  risks: JsonPayload;
  created_at: string;
  metadata_json?: JsonPayload | null;
};

type AnalysisEvidenceItem = {
  id: number;
  provider: string;
  evidence_type: string;
  stance: string;
  strength?: string | number | null;
  confidence?: string | number | null;
  summary: string;
  high_contradiction: boolean;
  source_name?: string | null;
  title?: string | null;
  url?: string | null;
  citation_url?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  metadata_json?: JsonPayload | null;
};

type AnalysisExternalSignal = {
  id: number;
  source: string;
  source_ticker?: string | null;
  title?: string | null;
  yes_probability?: string | number | null;
  no_probability?: string | number | null;
  mid_price?: string | number | null;
  spread?: string | number | null;
  volume?: string | number | null;
  liquidity?: string | number | null;
  open_interest?: string | number | null;
  source_confidence?: string | number | null;
  match_confidence?: string | number | null;
  match_reason?: string | null;
  warnings?: JsonPayload | null;
  fetched_at: string;
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

type MarketDataQuality = {
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
};

type MarketAnalysis = {
  market: AnalysisMarket;
  latest_snapshot?: AnalysisSnapshot | null;
  polysignal_score?: PolySignalScore | null;
  data_quality?: MarketDataQuality | null;
  candidate_context?: CandidateContext | null;
  latest_prediction?: AnalysisPrediction | null;
  prediction_history: AnalysisPrediction[];
  research_runs: AnalysisResearchRun[];
  research_findings: AnalysisFinding[];
  prediction_reports: AnalysisReport[];
  evidence_items: AnalysisEvidenceItem[];
  external_signals: AnalysisExternalSignal[];
  warnings: string[];
};

type EvidenceDisplayItem = {
  id: string;
  stance: string;
  label: string;
  claim: string;
  summary: string;
  sourceName?: string | null;
  citationUrl?: string | null;
  publishedAt?: string | null;
  impact?: string | number | null;
  credibility?: string | number | null;
  freshness?: string | number | null;
  metadata?: JsonPayload | null;
};

type LoadState = {
  analysis: MarketAnalysis | null;
  priceHistory: PriceHistoryResponse | null;
  priceHistoryError: string | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

type WatchlistPanelState = {
  item: WatchlistItem | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  statusDraft: WatchlistStatus;
  noteDraft: string;
};

type InvestigationStatusPanelState = {
  item: InvestigationStatusItem | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  statusDraft: InvestigationStatus;
  noteDraft: string;
  priorityDraft: string;
};

type MarketTagsPanelState = {
  tags: MarketTag[];
  suggestedTags: MarketTag[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  draft: string;
};

type MarkdownExportState = {
  loading: boolean;
  copied: boolean;
  error: string | null;
  fallback: string | null;
};

type MarketOutcomePanelState = {
  item: MarketOutcome | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  outcomeDraft: ResolvedOutcome;
  sourceDraft: string;
  notesDraft: string;
  resolvedAtDraft: string;
};

type MarketDecisionPanelState = {
  items: MarketDecisionItem[];
  loading: boolean;
  saving: boolean;
  deletingId: number | null;
  error: string | null;
  decisionDraft: MarketDecision;
  noteDraft: string;
  confidenceDraft: DecisionConfidenceLabel | "";
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const UPCOMING_MATCH_WINDOW_DAYS = 7;
const PAUSED_FUTURE_SHAPES = new Set(["championship", "futures"]);

const outcomeOptions: Array<{ value: ResolvedOutcome; label: string }> = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
  { value: "invalid", label: "Inválido" },
  { value: "unknown", label: "Desconocido" },
];

const decisionOptions: Array<{ value: MarketDecision; label: string }> = [
  { value: "monitor", label: MARKET_DECISION_LABELS.monitor },
  { value: "investigate_more", label: MARKET_DECISION_LABELS.investigate_more },
  { value: "ignore", label: MARKET_DECISION_LABELS.ignore },
  { value: "possible_opportunity", label: MARKET_DECISION_LABELS.possible_opportunity },
  { value: "dismissed", label: MARKET_DECISION_LABELS.dismissed },
  { value: "waiting_for_data", label: MARKET_DECISION_LABELS.waiting_for_data },
];

const decisionConfidenceOptions: Array<{
  value: DecisionConfidenceLabel | "";
  label: string;
}> = [
  { value: "", label: "Sin confianza" },
  { value: "low", label: DECISION_CONFIDENCE_LABELS.low },
  { value: "medium", label: DECISION_CONFIDENCE_LABELS.medium },
  { value: "high", label: DECISION_CONFIDENCE_LABELS.high },
];

const marketShapeLabels: Record<string, string> = {
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

const sportLabels: Record<string, string> = {
  nba: "NBA",
  nfl: "NFL",
  soccer: "fútbol",
  horse_racing: "carreras de caballos",
  mlb: "MLB",
  tennis: "tenis",
  mma: "MMA",
  other: "otro",
};

const warningLabels: Record<string, string> = {
  missing_latest_snapshot: "sin snapshot reciente",
  no_evidence_found: "sin evidencia guardada",
  no_external_signals: "sin señales externas",
  no_prediction_found: "sin predicción investigada",
  missing_yes_price: "falta precio SÍ",
  missing_price_data: "faltan datos de precio",
  missing_snapshot: "sin snapshot",
  missing_price: "faltan precios",
  missing_close_time: "sin fecha de cierre",
  missing_liquidity: "liquidez no disponible",
  missing_volume: "volumen no disponible",
  sport_uncertain: "deporte incierto",
  market_shape_uncertain: "tipo de mercado incierto",
  polysignal_score_pending: "score pendiente",
  preliminary_score: "score preliminar",
  missing_market_yes_price: "falta precio SÍ",
  external_signal_low_match_confidence: "señal externa con baja coincidencia",
  external_signal_missing_probability: "señal externa sin probabilidad",
  few_price_history_points: "pocos snapshots",
  low_confidence: "confianza baja",
  insufficient_data: "datos insuficientes",
  low_liquidity: "baja liquidez",
  low_volume: "bajo volumen",
  market_inactive_or_closed: "mercado inactivo o cerrado",
  generic_research_template: "template genérico",
};

const reasonLabels: Record<string, string> = {
  market_active_open: "mercado activo",
  valid_latest_snapshot: "precio válido",
  yes_price_in_research_band: "precio SÍ investigable",
  sports_metadata_present: "metadata deportiva",
  supported_sport: "deporte soportado",
  supported_market_shape: "tipo de mercado claro",
  specific_research_template: "template específico",
  high_liquidity: "alta liquidez",
  high_volume: "alto volumen",
  medium_liquidity: "liquidez media",
  medium_volume: "volumen medio",
  future_close_time: "cierre futuro",
  market_type_present: "tipo de mercado disponible",
};

const marketTermTranslations: Record<string, string> = {
  "NBA Eastern Conference Finals": "las Finales de la Conferencia Este de la NBA",
  "NBA Western Conference Finals": "las Finales de la Conferencia Oeste de la NBA",
  "NBA Eastern Conference Champion": "Campeón de la Conferencia Este de la NBA",
  "NBA Western Conference Champion": "Campeón de la Conferencia Oeste de la NBA",
  "Eastern Conference Champion": "Campeón de la Conferencia Este",
  "Western Conference Champion": "Campeón de la Conferencia Oeste",
  "NBA Championship": "el Campeonato de la NBA",
  "NBA Finals": "las Finales de la NBA",
  "NBA Rookie of the Year": "el Novato del Año de la NBA",
  "NBA MVP": "el MVP de la NBA",
  "Rookie of the Year": "el Novato del Año",
  "Super Bowl": "el Super Bowl",
  "World Series": "la Serie Mundial",
  "Champions League": "la Champions League",
  "Kentucky Derby": "el Kentucky Derby",
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json() as Promise<T>;
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

function formatProbability(value: unknown): string {
  const number = normalizeProbability(value);
  if (number === null) {
    return "N/D";
  }
  return `${(number * 100).toFixed(1)}%`;
}

function formatSignedProbabilityPoints(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)} pts`;
}

function formatPercentPoints(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1)} pts`;
}

function formatSignedRatio(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)}%`;
}

function formatCompact(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }
  return new Intl.NumberFormat("es-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function formatScore(value: unknown): string {
  const number = toNumber(value);
  return number === null ? "N/D" : number.toFixed(1);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "N/D";
  }
  const date = new Date(value);
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

function formatShortDateLabel(value?: string | null): string {
  if (!value) {
    return "N/D";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return `Hoy ${date.toLocaleTimeString("es-US", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Ayer";
  }
  return date.toLocaleDateString("es-US", {
    month: "short",
    day: "numeric",
  });
}

function humanizeToken(value?: string | null): string {
  return value?.replaceAll("_", " ").replaceAll("-", " ").trim() || "N/D";
}

function stripScoreSuffix(value: string): string {
  return value.split(":")[0].trim();
}

function formatReasonLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return reasonLabels[key] ?? humanizeToken(key);
}

function formatWarningLabel(value: string): string {
  const key = stripScoreSuffix(value);
  return warningLabels[key] ?? humanizeToken(key);
}

function formatSportLabel(value?: string | null): string {
  return value ? sportLabels[value] ?? humanizeToken(value) : "deporte no definido";
}

function formatMarketShapeLabel(value?: string | null): string {
  return value ? marketShapeLabels[value] ?? humanizeToken(value) : "tipo no definido";
}

function formatOutcomeLabel(value: MarketOutcome["resolved_outcome"]): string {
  if (value === "yes") {
    return "SÍ";
  }
  if (value === "no") {
    return "NO";
  }
  if (value === "invalid") {
    return "Inválido";
  }
  if (value === "unknown") {
    return "Desconocido";
  }
  return "Cancelado";
}

function formatOutcomeDateInput(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseOutcomeDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function getFocusMarketShape(analysis: MarketAnalysis): string | null {
  return (
    analysis.candidate_context?.market_shape ||
    analysis.market.evidence_shape ||
    analysis.market.market_type ||
    null
  );
}

function isPausedFutureMarket(analysis: MarketAnalysis): boolean {
  const shape = getFocusMarketShape(analysis)?.toLowerCase();
  return Boolean(shape && PAUSED_FUTURE_SHAPES.has(shape));
}

function isUpcomingMatchMarket(analysis: MarketAnalysis): boolean {
  if (getFocusMarketShape(analysis)?.toLowerCase() !== "match_winner") {
    return false;
  }
  if (!analysis.market.active || analysis.market.closed || !analysis.market.end_date) {
    return false;
  }
  const closeTime = new Date(analysis.market.end_date).getTime();
  if (!Number.isFinite(closeTime)) {
    return false;
  }
  const now = Date.now();
  const windowEnd = now + UPCOMING_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return closeTime >= now && closeTime <= windowEnd;
}

function formatParticipantRole(value?: string | null): string {
  return value ? participantRoleLabels[value] ?? humanizeToken(value) : "participante";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function ensureSpanishQuestion(value: string): string {
  const trimmed = value.trim().replace(/^¿+/, "").replace(/\?+$/, "");
  return `¿${trimmed}?`;
}

function spanishTeamSubject(teamName: string, hadEnglishThe: boolean): string {
  const cleanName = teamName.trim();
  const lastWord = cleanName.split(/\s+/).at(-1) ?? "";
  return hadEnglishThe || lastWord.endsWith("s") ? `los ${cleanName}` : cleanName;
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

  const matchWinner = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+beat\s+(the\s+)?(.+?)\?$/i);
  if (matchWinner) {
    const teamA = matchWinner[2].trim();
    const teamB = spanishTeamSubject(matchWinner[4].trim(), Boolean(matchWinner[3]));
    const subject = spanishTeamSubject(teamA, Boolean(matchWinner[1]));
    const verb = subject.startsWith("los ") ? "vencerán" : "vencerá";
    return ensureSpanishQuestion(`${subject[0].toUpperCase()}${subject.slice(1)} ${verb} a ${teamB}`);
  }

  const winMarket = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+win\s+the\s+(.+?)\?$/i);
  if (winMarket) {
    const subject = spanishTeamSubject(winMarket[2].trim(), Boolean(winMarket[1]));
    const verb = subject.startsWith("los ") ? "Ganarán" : "Ganará";
    return ensureSpanishQuestion(`${verb} ${subject} ${translateCompetitionName(winMarket[3])}`);
  }

  return trimmed;
}

function translateMarketSubtitleToSpanish(text?: string | null): string {
  if (!text) {
    return "";
  }
  const trimmed = text.trim();
  const yearNbaChampion = trimmed.match(/^(\d{4})\s+NBA\s+Champion$/i);
  if (yearNbaChampion) {
    return `Campeón de la NBA ${yearNbaChampion[1]}`;
  }
  return translateCompetitionName(trimmed);
}

function getNoProbability(yesValue: unknown, noValue: unknown): number | null {
  const explicitNo = normalizeProbability(noValue);
  if (explicitNo !== null) {
    return explicitNo;
  }
  const yes = normalizeProbability(yesValue);
  return yes === null ? null : Math.max(0, Math.min(1, 1 - yes));
}

function probabilityWidth(yesValue: unknown, noValue: unknown): number {
  const yes = normalizeProbability(yesValue);
  if (yes !== null) {
    return Math.max(0, Math.min(100, yes * 100));
  }
  const no = getNoProbability(yesValue, noValue);
  return no === null ? 50 : Math.max(0, Math.min(100, (1 - no) * 100));
}

function participantInitials(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  return words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words.slice(0, 3).map((word) => word[0].toUpperCase()).join("");
}

function hasMetadataFlag(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasMetadataFlag(item, key));
  }
  const record = value as Record<string, unknown>;
  if (record[key] === true) {
    return true;
  }
  return Object.values(record).some((item) => hasMetadataFlag(item, key));
}

function externalWarnings(value: AnalysisExternalSignal["warnings"]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`);
}

function formatSourceLabel(value?: string | null): string {
  if (!value) {
    return "Fuente externa";
  }
  return value.toLowerCase() === "kalshi" ? "Kalshi" : humanizeToken(value);
}

function compareExternalToPolymarket(
  signal: AnalysisExternalSignal,
  snapshot?: AnalysisSnapshot | null,
): {
  external: number | null;
  polymarket: number | null;
  diff: number | null;
  label: string;
  tone: string;
} {
  const external = normalizeProbability(signal.yes_probability ?? signal.mid_price);
  const polymarket = normalizeProbability(snapshot?.yes_price);
  if (external === null || polymarket === null) {
    return { external, polymarket, diff: null, label: "Datos insuficientes", tone: "neutral" };
  }
  const diff = external - polymarket;
  const magnitude = Math.abs(diff);
  if (magnitude >= 0.08) {
    return { external, polymarket, diff, label: "Divergencia alta", tone: "high-divergence" };
  }
  if (magnitude >= 0.03) {
    return { external, polymarket, diff, label: "Divergencia moderada", tone: "divergent" };
  }
  return { external, polymarket, diff, label: "Mercados alineados", tone: "aligned" };
}

function comparisonWarnings(
  signal: AnalysisExternalSignal,
  snapshot?: AnalysisSnapshot | null,
): string[] {
  const warnings: string[] = [];
  if (normalizeProbability(snapshot?.yes_price) === null) {
    warnings.push("falta precio SÍ de Polymarket");
  }
  if (normalizeProbability(signal.yes_probability ?? signal.mid_price) === null) {
    warnings.push("falta probabilidad externa");
  }
  const sourceConfidence = normalizeProbability(signal.source_confidence);
  if (sourceConfidence !== null && sourceConfidence < 0.5) {
    warnings.push("confianza de fuente baja");
  }
  const matchConfidence = normalizeProbability(signal.match_confidence);
  if (matchConfidence !== null && matchConfidence < 0.5) {
    warnings.push("confianza de coincidencia baja");
  }
  const spread = normalizeProbability(signal.spread);
  if (spread !== null && spread >= 0.08) {
    warnings.push("diferencial alto");
  }
  return warnings;
}

function evidenceGroup(stance: string): "for" | "against" | "neutral" {
  const normalized = stance.toLowerCase();
  if (["favor", "for", "yes", "support", "supports_yes"].includes(normalized)) {
    return "for";
  }
  if (["against", "contra", "no", "oppose", "opposes_yes"].includes(normalized)) {
    return "against";
  }
  return "neutral";
}

function buildEvidenceDisplayItems(analysis: MarketAnalysis): EvidenceDisplayItem[] {
  const findings = analysis.research_findings.map((finding) => ({
    id: `finding-${finding.id}`,
    stance: finding.stance,
    label: finding.factor_type,
    claim: finding.claim,
    summary: finding.evidence_summary,
    sourceName: finding.source_name,
    citationUrl: finding.citation_url,
    publishedAt: finding.published_at,
    impact: finding.impact_score,
    credibility: finding.credibility_score,
    freshness: finding.freshness_score,
    metadata: finding.metadata_json,
  }));

  const evidence = analysis.evidence_items.map((item) => ({
    id: `evidence-${item.id}`,
    stance: item.stance,
    label: item.evidence_type,
    claim: item.title || item.summary,
    summary: item.summary,
    sourceName: item.source_name || item.provider,
    citationUrl: item.citation_url || item.url,
    publishedAt: item.published_at || item.fetched_at,
    impact: item.strength,
    credibility: item.confidence,
    freshness: null,
    metadata: item.metadata_json,
  }));

  return [...findings, ...evidence];
}

function VisualAvatar({
  name,
  src,
  abbreviation,
}: {
  name: string;
  src?: string | null;
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

function PriceHistoryChart({ points }: { points: PriceHistoryPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chart = useMemo<PriceHistoryChartModel>(() => {
    const width = 640;
    const height = 260;
    const padding = { top: 22, right: 18, bottom: 40, left: 50 };
    const validPoints = points
      .map((point, originalIndex) => {
        const yes = normalizeProbability(point.yes_price);
        if (yes === null) {
          return null;
        }
        const parsedDate = new Date(point.captured_at);
        const timestamp = Number.isNaN(parsedDate.getTime())
          ? originalIndex
          : parsedDate.getTime();
        return {
          ...point,
          originalIndex,
          timestamp,
          yes,
          no: getNoProbability(point.yes_price, point.no_price),
        };
      })
      .filter(
        (
          point,
        ): point is PriceHistoryPoint & {
          originalIndex: number;
          timestamp: number;
          yes: number;
          no: number | null;
        } => point !== null,
      )
      .sort((first, second) => first.timestamp - second.timestamp || first.originalIndex - second.originalIndex);

    if (validPoints.length === 0) {
      return {
        areaPath: "",
        coordinates: [],
        height,
        highlighted: new Set<number>(),
        linePath: "",
        padding,
        validPoints: [],
        width,
        xLabels: [],
        yTicks: [],
      };
    }

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const values = validPoints.map((point) => point.yes);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rangePadding = Math.max((rawMax - rawMin) * 0.18, 0.025);
    const yMin = Math.max(0, rawMin - rangePadding);
    const yMax = Math.min(1, rawMax + rangePadding);
    const safeRange = Math.max(0.01, yMax - yMin);
    const firstTimestamp = validPoints[0]?.timestamp ?? 0;
    const lastTimestamp = validPoints.at(-1)?.timestamp ?? firstTimestamp;
    const timeRange = Math.max(1, lastTimestamp - firstTimestamp);
    const coordinates = validPoints.map((point, index) => {
      const x =
        validPoints.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + ((point.timestamp - firstTimestamp) / timeRange) * plotWidth;
      const y = padding.top + ((yMax - point.yes) / safeRange) * plotHeight;
      return { ...point, index, x, y };
    });
    const linePath = coordinates
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const baseline = padding.top + plotHeight;
    const lastCoordinate = coordinates.at(-1);
    const areaPath =
      coordinates.length > 1 && lastCoordinate
        ? `${linePath} L ${lastCoordinate.x.toFixed(1)} ${baseline} L ${coordinates[0].x.toFixed(1)} ${baseline} Z`
        : "";
    const minIndex = coordinates.reduce(
      (bestIndex, point, index) => (point.yes < coordinates[bestIndex].yes ? index : bestIndex),
      0,
    );
    const maxIndex = coordinates.reduce(
      (bestIndex, point, index) => (point.yes > coordinates[bestIndex].yes ? index : bestIndex),
      0,
    );
    const highlighted = new Set<number>([0, coordinates.length - 1, minIndex, maxIndex]);
    if (coordinates.length <= 8) {
      coordinates.forEach((_, index) => highlighted.add(index));
    }
    if (activeIndex !== null) {
      highlighted.add(activeIndex);
    }
    const yTicks = [yMax, yMin + safeRange / 2, yMin].map((value) => ({
      value,
      label: `${(value * 100).toFixed(0)}%`,
      y: padding.top + ((yMax - value) / safeRange) * plotHeight,
    }));
    const labelIndexes = Array.from(
      new Set([0, Math.floor((coordinates.length - 1) / 2), coordinates.length - 1]),
    );
    const xLabels = labelIndexes.map((index) => ({
      x: coordinates[index].x,
      label: formatShortDateLabel(coordinates[index].captured_at),
    }));

    return {
      areaPath,
      coordinates,
      height,
      highlighted,
      linePath,
      padding,
      validPoints,
      width,
      xLabels,
      yTicks,
    };
  }, [activeIndex, points]);

  if (chart.validPoints.length === 0 || chart.coordinates.length === 0) {
    return (
      <div className="price-history-chart empty" aria-hidden="true">
        Sin puntos de precio válidos
      </div>
    );
  }

  const { coordinates, height, width } = chart;
  const activePoint =
    activeIndex !== null && coordinates[activeIndex] ? coordinates[activeIndex] : null;
  const updateActivePoint = (clientX: number, target: SVGRectElement) => {
    const bounds = target.getBoundingClientRect();
    const relativeX = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * width;
    const nearestIndex = coordinates.reduce((bestIndex, point, index) => {
      const bestDistance = Math.abs(coordinates[bestIndex].x - relativeX);
      const currentDistance = Math.abs(point.x - relativeX);
      return currentDistance < bestDistance ? index : bestIndex;
    }, 0);
    setActiveIndex(nearestIndex);
  };
  const handleMouseMove = (event: MouseEvent<SVGRectElement>) => {
    updateActivePoint(event.clientX, event.currentTarget);
  };
  const handleTouchMove = (event: TouchEvent<SVGRectElement>) => {
    const touch = event.touches[0];
    if (touch) {
      updateActivePoint(touch.clientX, event.currentTarget);
    }
  };

  if (coordinates.length === 1) {
    const onlyPoint = coordinates[0];
    return (
      <div className="price-history-chart single">
        <div className="price-history-single-card">
          <span>Solo hay un snapshot disponible</span>
          <strong>{formatProbability(onlyPoint.yes)}</strong>
          <small>{formatDateTime(onlyPoint.captured_at)}</small>
        </div>
      </div>
    );
  }

  return (
    <div
      className="price-history-chart"
      role="img"
      aria-label={`Historial de precio SÍ con ${coordinates.length} puntos válidos`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {chart.yTicks.map((tick) => (
          <g key={tick.label}>
            <line
              className="price-history-grid-line"
              x1={chart.padding.left}
              x2={width - chart.padding.right}
              y1={tick.y}
              y2={tick.y}
            />
            <text className="price-history-axis-label y" x="12" y={tick.y + 4}>
              {tick.label}
            </text>
          </g>
        ))}
        <path className="price-history-area" d={chart.areaPath} />
        <path className="price-history-line" d={chart.linePath} />
        {activePoint ? (
          <line
            className="price-history-hover-line"
            x1={activePoint.x}
            x2={activePoint.x}
            y1={chart.padding.top}
            y2={height - chart.padding.bottom}
          />
        ) : null}
        {coordinates.map((point) =>
          chart.highlighted.has(point.index) ? (
            <circle
              className={`price-history-point ${activeIndex === point.index ? "active" : ""}`}
              cx={point.x}
              cy={point.y}
              key={`point-${point.snapshot_id}-${point.index}`}
              onBlur={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(point.index)}
              r={activeIndex === point.index ? 5 : 3.8}
              tabIndex={0}
            />
          ) : null,
        )}
        {chart.xLabels.map((label) => (
          <text
            className="price-history-axis-label x"
            key={`${label.label}-${label.x}`}
            textAnchor={label.x < width / 3 ? "start" : label.x > (width * 2) / 3 ? "end" : "middle"}
            x={label.x}
            y={height - 12}
          >
            {label.label}
          </text>
        ))}
        <rect
          className="price-history-interaction-zone"
          height={height - chart.padding.bottom - chart.padding.top}
          onClick={handleMouseMove}
          onMouseLeave={() => setActiveIndex(null)}
          onMouseMove={handleMouseMove}
          onTouchEnd={() => setActiveIndex(null)}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchMove}
          width={width - chart.padding.left - chart.padding.right}
          x={chart.padding.left}
          y={chart.padding.top}
        />
      </svg>
      {activePoint ? (
        <div
          className={`price-history-tooltip ${activePoint.y < 92 ? "below" : ""}`}
          style={{
            left: `min(max(${(activePoint.x / width) * 100}%, 94px), calc(100% - 94px))`,
            top: `${activePoint.y + 16}px`,
          }}
        >
          <strong>{formatDateTime(activePoint.captured_at)}</strong>
          <span>SÍ {formatProbability(activePoint.yes)}</span>
          <span>NO {formatProbability(activePoint.no)}</span>
          <span>Liquidez {formatCompact(activePoint.liquidity)}</span>
          <span>Volumen {formatCompact(activePoint.volume)}</span>
        </div>
      ) : null}
    </div>
  );
}

function PricePanel({ snapshot }: { snapshot?: AnalysisSnapshot | null }) {
  const yes = snapshot?.yes_price;
  const no = getNoProbability(snapshot?.yes_price, snapshot?.no_price);
  const hasPrice = normalizeProbability(yes) !== null || no !== null;

  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Polymarket</span>
          <h2>Precio del mercado</h2>
        </div>
        <span className="timestamp-pill">
          Snapshot {formatDateTime(snapshot?.captured_at)}
        </span>
      </div>
      <div className="market-price-panel analysis-price-panel">
        <div className="price-split">
          <div>
            <span>SÍ</span>
            <strong>{formatProbability(yes)}</strong>
          </div>
          <div>
            <span>NO</span>
            <strong>{formatProbability(no)}</strong>
          </div>
        </div>
        <div
          aria-label={`SÍ ${formatProbability(yes)} y NO ${formatProbability(no)}`}
          className={`probability-bar ${hasPrice ? "" : "neutral"}`}
          role="img"
        >
          <span
            className="probability-bar-yes"
            style={{ width: `${probabilityWidth(snapshot?.yes_price, snapshot?.no_price)}%` }}
          />
          <span className="probability-bar-no" />
        </div>
        <div className="market-depth-row">
          <div>
            <span>Liquidez</span>
            <strong>{formatCompact(snapshot?.liquidity)}</strong>
          </div>
          <div>
            <span>Volumen</span>
            <strong>{formatCompact(snapshot?.volume)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function PolySignalScorePanel({ score }: { score?: PolySignalScore | null }) {
  const hasScore = score?.score_probability !== null && score?.score_probability !== undefined;

  return (
    <section className={`analysis-section polysignal-detail-section ${score?.color_hint || "warning"}`}>
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Estimación informativa</span>
          <h2>Puntaje PolySignal</h2>
          <p className="section-note">
            PolySignal Score es una estimación informativa basada en señales disponibles. No es recomendación de apuesta.
          </p>
        </div>
        <span className="timestamp-pill">
          {score?.source === "latest_prediction" ? "Predicción guardada" : "Score preliminar"}
        </span>
      </div>

      {!score || !hasScore ? (
        <div className="empty-state">
          <strong>PolySignal SÍ: pendiente</strong>
          <p>Faltan datos suficientes para estimar.</p>
        </div>
      ) : (
        <div className="polysignal-detail-grid">
          <div className={`polysignal-score-card hero ${score.color_hint || "neutral"}`}>
            <div className="polysignal-score-heading">
              <span>PolySignal SÍ</span>
              <strong>{formatProbability(score.score_probability)}</strong>
            </div>
            <p>{score.label}</p>
          </div>

          <div className="analysis-stat-grid">
            <div><span>Mercado SÍ</span><strong>{formatProbability(score.market_yes_price)}</strong></div>
            <div><span>Diferencia</span><strong>{formatPercentPoints(score.edge_percent_points)}</strong></div>
            <div><span>Confianza</span><strong>{score.confidence_label}</strong></div>
            <div><span>Fuente</span><strong>{humanizeToken(score.source)}</strong></div>
          </div>

          <div className="polysignal-components">
            <h3>Componentes usados</h3>
            {score.components.length > 0 ? (
              score.components.map((component) => (
                <article className="polysignal-component" key={`${component.name}-${component.note}`}>
                  <strong>{humanizeToken(component.name)}</strong>
                  <span>
                    {component.probability !== null && component.probability !== undefined
                      ? `Prob. ${formatProbability(component.probability)}`
                      : component.adjustment !== null && component.adjustment !== undefined
                        ? `Ajuste ${formatSignedProbabilityPoints(component.adjustment)}`
                        : "Confianza operativa"}
                  </span>
                  <p>{component.note}</p>
                </article>
              ))
            ) : (
              <p className="quiet-text">Sin componentes disponibles.</p>
            )}
          </div>

          <div>
            <h3>Advertencias</h3>
            {score.warnings.length > 0 ? (
              <div className="candidate-chip-list">
                {score.warnings.map((warning) => (
                  <span className="warning-chip" key={warning}>
                    {formatWarningLabel(warning)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="quiet-text">Sin advertencias críticas.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatQualityBoolean(value: boolean): string {
  return value ? "SÃ­" : "No";
}

function scorePendingMessage(dataQuality?: MarketDataQuality | null): string {
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

function DataQualityPanel({
  dataQuality,
  score,
}: {
  dataQuality?: MarketDataQuality | null;
  score?: PolySignalScore | null;
}) {
  if (!dataQuality) {
    return null;
  }

  const hasScore = score?.score_probability !== null && score?.score_probability !== undefined;
  const shouldShow =
    !hasScore ||
    (score?.warnings?.length ?? 0) > 0 ||
    dataQuality.quality_label !== "Completo";
  if (!shouldShow) {
    return null;
  }

  return (
    <section className="analysis-section data-quality-detail-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">DiagnÃ³stico read-only</span>
          <h2>Calidad de datos</h2>
          <p className="section-note">
            El score queda pendiente cuando faltan datos mÃ­nimos. PolySignal no inventa probabilidades.
          </p>
        </div>
        <span className={`data-quality-label ${dataQuality.quality_label.toLowerCase()}`}>
          {dataQuality.quality_label}
        </span>
      </div>

      {!hasScore ? (
        <div className="empty-state compact">
          <strong>PolySignal SÃ pendiente</strong>
          <p>{scorePendingMessage(dataQuality)}</p>
        </div>
      ) : null}

      <div className="analysis-stat-grid">
        <div><span>Precio SÃ</span><strong>{formatQualityBoolean(dataQuality.has_yes_price)}</strong></div>
        <div><span>Precio NO</span><strong>{formatQualityBoolean(dataQuality.has_no_price)}</strong></div>
        <div><span>Snapshot</span><strong>{formatQualityBoolean(dataQuality.has_snapshot)}</strong></div>
        <div><span>SeÃ±al externa</span><strong>{formatQualityBoolean(dataQuality.has_external_signal)}</strong></div>
        <div><span>PredicciÃ³n guardada</span><strong>{formatQualityBoolean(dataQuality.has_prediction)}</strong></div>
        <div><span>Research disponible</span><strong>{formatQualityBoolean(dataQuality.has_research)}</strong></div>
        <div><span>PolySignal Score</span><strong>{formatQualityBoolean(dataQuality.has_polysignal_score)}</strong></div>
        <div><span>Calidad</span><strong>{dataQuality.quality_score}/100</strong></div>
      </div>

      {dataQuality.missing_fields.length > 0 ? (
        <div>
          <h3>QuÃ© falta</h3>
          <div className="candidate-chip-list">
            {dataQuality.missing_fields.map((field) => (
              <span className="warning-chip" key={field}>{formatWarningLabel(field)}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="quiet-text">No hay faltantes crÃ­ticos para este mercado.</p>
      )}
    </section>
  );
}

function PriceHistoryPanel({
  history,
  error,
}: {
  history?: PriceHistoryResponse | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <section className="analysis-section">
        <div className="analysis-section-heading">
          <div>
            <span className="section-kicker">Polymarket</span>
            <h2>Historial del precio</h2>
          </div>
        </div>
        <div className="empty-state">{error}</div>
      </section>
    );
  }

  if (!history || history.points.length === 0) {
    return (
      <section className="analysis-section">
        <div className="analysis-section-heading">
          <div>
            <span className="section-kicker">Polymarket</span>
            <h2>Historial del precio</h2>
          </div>
        </div>
        <div className="empty-state">
          No hay historial de precio guardado todavía para este mercado.
        </div>
      </section>
    );
  }

  const validYesPrices = history.points
    .map((point) => normalizeProbability(point.yes_price))
    .filter((value): value is number => value !== null);
  const maxYesPrice = validYesPrices.length > 0 ? Math.max(...validYesPrices) : null;
  const minYesPrice = validYesPrices.length > 0 ? Math.min(...validYesPrices) : null;

  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Polymarket</span>
          <h2>Historial del precio</h2>
          <p className="section-note">
            Evolución del precio SÍ según snapshots guardados por PolySignal.
          </p>
        </div>
        <span className="timestamp-pill">{history.count} snapshots</span>
      </div>
      <div className="price-history-summary">
        <div className="analysis-stat-grid">
          <div>
            <span>SÍ actual</span>
            <strong>{formatProbability(history.latest?.yes_price)}</strong>
          </div>
          <div>
            <span>SÍ inicial</span>
            <strong>{formatProbability(history.first?.yes_price)}</strong>
          </div>
          <div>
            <span>Cambio absoluto</span>
            <strong>{formatSignedProbabilityPoints(history.change_yes_abs)}</strong>
          </div>
          <div>
            <span>Cambio porcentual</span>
            <strong>{formatSignedRatio(history.change_yes_pct)}</strong>
          </div>
          <div>
            <span>Máximo del rango</span>
            <strong>{formatProbability(maxYesPrice)}</strong>
          </div>
          <div>
            <span>Mínimo del rango</span>
            <strong>{formatProbability(minYesPrice)}</strong>
          </div>
        </div>
        <PriceHistoryChart points={history.points} />
        <p className="section-note">
          El historial muestra cómo se ha movido el precio SÍ con el tiempo. No predice el resultado ni recomienda apostar.
        </p>
      </div>
    </section>
  );
}

function CandidateContextPanel({ context }: { context?: CandidateContext | null }) {
  if (!context) {
    return (
      <section className="analysis-section">
        <h2>Por qué aparece como candidato</h2>
        <div className="empty-state">No hay contexto de candidato calculado.</div>
      </section>
    );
  }
  const score = Math.max(0, Math.min(100, toNumber(context.candidate_score) ?? 0));
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Selector</span>
          <h2>Por qué aparece como candidato</h2>
        </div>
        <strong className="candidate-score-pill">{formatScore(context.candidate_score)}</strong>
      </div>
      <p className="section-note">
        El puntaje de candidato prioriza mercados para investigar; no es recomendación de apuesta.
      </p>
      <div className="candidate-score-track">
        <span className="candidate-score-fill high" style={{ width: `${score}%` }} />
      </div>
      <div className="analysis-chip-columns">
        <div>
          <h3>Razones</h3>
          <div className="candidate-chip-list">
            {(context.candidate_reasons ?? []).length > 0 ? (
              context.candidate_reasons.map((reason) => (
                <span className="reason-chip" key={reason}>{formatReasonLabel(reason)}</span>
              ))
            ) : (
              <span className="quiet-text">Sin razones disponibles.</span>
            )}
          </div>
        </div>
        <div>
          <h3>Advertencias</h3>
          <div className="candidate-chip-list">
            {(context.warnings ?? []).length > 0 ? (
              context.warnings.map((warning) => (
                <span className="warning-chip" key={warning}>{formatWarningLabel(warning)}</span>
              ))
            ) : (
              <span className="quiet-text">Sin advertencias críticas.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExternalSignalsPanel({
  signals,
  snapshot,
}: {
  signals: AnalysisExternalSignal[];
  snapshot?: AnalysisSnapshot | null;
}) {
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Segunda opinión</span>
          <h2>Señales externas</h2>
        </div>
      </div>
      {signals.length === 0 ? (
        <div className="empty-state">No hay señales externas vinculadas a este mercado todavía.</div>
      ) : (
        <div className="analysis-card-grid">
          {signals.map((signal) => {
            const comparison = compareExternalToPolymarket(signal, snapshot);
            const sourceLabel = formatSourceLabel(signal.source);
            const warnings = [
              ...comparisonWarnings(signal, snapshot),
              ...externalWarnings(signal.warnings).map(formatWarningLabel),
            ];
            return (
              <article className="external-signal-card" key={signal.id}>
                <div className="external-signal-header">
                  <div>
                    <div className="badge-row">
                      <span className="badge source-badge">{sourceLabel}</span>
                      <span className="badge muted">{signal.source_ticker || "sin ticker"}</span>
                    </div>
                    <h3>{signal.title || "Señal externa"}</h3>
                    <p>Actualizado {formatDateTime(signal.fetched_at)}</p>
                  </div>
                  <span className={`comparison-badge ${comparison.tone}`}>{comparison.label}</span>
                </div>
                <div className="comparison-panel">
                  <h4>Comparación de mercado</h4>
                  <div className="comparison-metric-grid">
                    <div><span>Polymarket SÍ</span><strong>{formatProbability(comparison.polymarket)}</strong></div>
                    <div><span>{sourceLabel} SÍ</span><strong>{formatProbability(comparison.external)}</strong></div>
                    <div><span>Diferencia</span><strong>{comparison.diff === null ? "N/D" : `${(comparison.diff * 100).toFixed(1)} pts`}</strong></div>
                    <div><span>Estado</span><strong>{comparison.label}</strong></div>
                  </div>
                  <div className="comparison-market-bars" aria-label="Comparación visual de probabilidades SÍ">
                    <div className="comparison-market-row">
                      <span>Polymarket</span>
                      <div className="comparison-mini-track">
                        <span
                          className="comparison-mini-fill polymarket"
                          style={{ width: `${comparison.polymarket === null ? 50 : comparison.polymarket * 100}%` }}
                        />
                      </div>
                      <strong>{formatProbability(comparison.polymarket)}</strong>
                    </div>
                    <div className="comparison-market-row">
                      <span>{sourceLabel}</span>
                      <div className="comparison-mini-track">
                        <span
                          className="comparison-mini-fill external"
                          style={{ width: `${comparison.external === null ? 50 : comparison.external * 100}%` }}
                        />
                      </div>
                      <strong>{formatProbability(comparison.external)}</strong>
                    </div>
                  </div>
                </div>
                <div className="external-signal-metrics compact">
                  <div><span>{sourceLabel} NO</span><strong>{formatProbability(signal.no_probability)}</strong></div>
                  <div><span>Diferencial</span><strong>{formatProbability(signal.spread)}</strong></div>
                  <div><span>Conf. fuente</span><strong>{formatProbability(signal.source_confidence)}</strong></div>
                  <div><span>Conf. coincidencia</span><strong>{formatProbability(signal.match_confidence)}</strong></div>
                  <div><span>Volumen</span><strong>{formatCompact(signal.volume)}</strong></div>
                  <div><span>Interés abierto</span><strong>{formatCompact(signal.open_interest)}</strong></div>
                </div>
                {signal.match_reason ? <p className="match-reason">Motivo: {signal.match_reason}</p> : null}
                {warnings.length > 0 ? (
                  <div className="warning-list">
                    {warnings.map((warning) => (
                      <span key={`${signal.id}-${warning}`}>{warning}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <p className="section-note">
        Las diferencias entre mercados son señales comparativas, no recomendaciones de apuesta.
      </p>
    </section>
  );
}

function EvidenceCard({ item }: { item: EvidenceDisplayItem }) {
  const mockStructural = hasMetadataFlag(item.metadata, "mock_structural");
  const reviewRequired = hasMetadataFlag(item.metadata, "source_review_required");
  return (
    <article className="evidence-card">
      <div className="evidence-card-header">
        <span className="badge muted">{humanizeToken(item.label)}</span>
        {mockStructural ? <span className="badge muted">Mock / prueba estructural</span> : null}
        {reviewRequired ? <span className="warning-chip">Requiere revisión humana</span> : null}
      </div>
      <h3>{item.claim}</h3>
      <p>{item.summary}</p>
      <div className="evidence-meta-grid">
        <span>Impacto {formatScore(item.impact)}</span>
        <span>Credibilidad {formatScore(item.credibility)}</span>
        <span>Frescura {formatScore(item.freshness)}</span>
        <span>{formatDateTime(item.publishedAt)}</span>
      </div>
      <div className="source-row">
        <strong>{item.sourceName || "Fuente sin nombre"}</strong>
        {item.citationUrl ? (
          <a href={item.citationUrl} target="_blank" rel="noreferrer">
            Abrir fuente
          </a>
        ) : (
          <span>Fuente sin enlace verificable</span>
        )}
      </div>
    </article>
  );
}

function EvidencePanel({ analysis }: { analysis: MarketAnalysis }) {
  const items = buildEvidenceDisplayItems(analysis);
  const groups = {
    for: items.filter((item) => evidenceGroup(item.stance) === "for"),
    against: items.filter((item) => evidenceGroup(item.stance) === "against"),
    neutral: items.filter((item) => evidenceGroup(item.stance) === "neutral"),
  };
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Research</span>
          <h2>Evidencia y fuentes</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">No hay evidencia externa guardada todavía para este mercado.</div>
      ) : (
        <div className="evidence-groups">
          <div>
            <h3>A favor del SÍ</h3>
            {groups.for.length > 0 ? groups.for.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin evidencia a favor.</p>}
          </div>
          <div>
            <h3>En contra del SÍ</h3>
            {groups.against.length > 0 ? groups.against.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin evidencia en contra.</p>}
          </div>
          <div>
            <h3>Riesgos / neutral</h3>
            {groups.neutral.length > 0 ? groups.neutral.map((item) => <EvidenceCard item={item} key={item.id} />) : <p className="quiet-text">Sin riesgos o notas neutrales.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function PredictionPanel({ analysis }: { analysis: MarketAnalysis }) {
  const prediction = analysis.latest_prediction;
  const report = analysis.prediction_reports[0];
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Reporte</span>
          <h2>Reporte de predicción</h2>
        </div>
      </div>
      {!prediction && !report ? (
        <div className="empty-state">No hay reporte de predicción investigada todavía.</div>
      ) : (
        <div className="prediction-report-grid">
          {prediction ? (
            <div className="analysis-stat-grid">
              <div><span>Familia</span><strong>{prediction.prediction_family}</strong></div>
              <div><span>Prob. SÍ</span><strong>{formatProbability(prediction.yes_probability)}</strong></div>
              <div><span>Prob. NO</span><strong>{formatProbability(prediction.no_probability)}</strong></div>
              <div><span>Confianza</span><strong>{formatProbability(prediction.confidence_score)}</strong></div>
              <div><span>Diferencia</span><strong>{formatProbability(prediction.edge_signed)}</strong></div>
              <div><span>Magnitud</span><strong>{formatProbability(prediction.edge_magnitude)}</strong></div>
            </div>
          ) : null}
          {report ? (
            <article className="report-card">
              <span className="badge muted">{report.recommendation}</span>
              <h3>Tesis</h3>
              <p>{report.thesis}</p>
              <h3>Razonamiento final</h3>
              <p>{report.final_reasoning}</p>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ResearchRunsPanel({ runs }: { runs: AnalysisResearchRun[] }) {
  return (
    <section className="analysis-section">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Historial</span>
          <h2>Research runs</h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="empty-state">No hay investigaciones guardadas todavía para este mercado.</div>
      ) : (
        <div className="analysis-card-grid">
          {runs.map((run) => (
            <article className="run-card" key={run.id}>
              <div className="badge-row">
                <span className="badge">{run.status}</span>
                <span className="badge muted">{run.research_mode}</span>
                {run.degraded_mode ? <span className="warning-chip">modo degradado</span> : null}
              </div>
              <h3>Run #{run.id}</h3>
              <p>
                Fuentes usadas {run.total_sources_used}/{run.total_sources_found} · web search {run.web_search_used ? "sí" : "no"}
              </p>
              <p className="quiet-text">
                {formatDateTime(run.started_at)} - {formatDateTime(run.finished_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WatchlistDetailPanel({
  onAdd,
  onRemove,
  onSave,
  onStatusChange,
  onNoteChange,
  state,
}: {
  onAdd: () => void;
  onRemove: () => void;
  onSave: () => void;
  onStatusChange: (status: WatchlistStatus) => void;
  onNoteChange: (note: string) => void;
  state: WatchlistPanelState;
}) {
  return (
    <section className="analysis-section watchlist-detail-panel">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Organización</span>
          <h2>Lista de seguimiento</h2>
        </div>
        {state.item ? <span className="badge external-hint">En seguimiento</span> : null}
      </div>
      <p className="section-note">
        La lista de seguimiento es solo para organizar análisis. No representa
        una recomendación de apuesta.
      </p>

      {state.loading ? <div className="empty-state compact">Cargando seguimiento...</div> : null}
      {state.error ? (
        <div className="alert-panel compact" role="status">
          <strong>No se pudo actualizar seguimiento</strong>
          <span>{state.error}</span>
        </div>
      ) : null}

      {!state.loading ? (
        <>
          <button
            className={`watchlist-button ${state.item ? "active" : ""}`}
            disabled={state.saving || Boolean(state.item)}
            onClick={onAdd}
            type="button"
          >
            {state.saving
              ? "Guardando..."
              : state.item
                ? "En seguimiento"
                : "Agregar a seguimiento"}
          </button>

          {state.item ? (
            <div className="watchlist-form">
              <label>
                Estado
                <select
                  disabled={state.saving}
                  onChange={(event) => onStatusChange(event.target.value as WatchlistStatus)}
                  value={state.statusDraft}
                >
                  {Object.entries(WATCHLIST_STATUS_LABELS).map(([status, label]) => (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nota personal
                <textarea
                  disabled={state.saving}
                  maxLength={4000}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="Escribe una nota breve para revisarlo después."
                  value={state.noteDraft}
                />
              </label>
              <div className="watchlist-actions">
                <button
                  className="watchlist-button"
                  disabled={state.saving}
                  onClick={onSave}
                  type="button"
                >
                  Guardar nota
                </button>
                <button
                  className="watchlist-button danger"
                  disabled={state.saving}
                  onClick={onRemove}
                  type="button"
                >
                  Quitar de seguimiento
                </button>
              </div>
            </div>
          ) : (
            <span className="quiet-text">
              Agrega este mercado para verlo luego en el dashboard.
            </span>
          )}
        </>
      ) : null}
    </section>
  );
}

function InvestigationStatusDetailPanel({
  onDelete,
  onNoteChange,
  onPriorityChange,
  onSave,
  onStatusChange,
  state,
}: {
  onDelete: () => void;
  onNoteChange: (note: string) => void;
  onPriorityChange: (priority: string) => void;
  onSave: () => void;
  onStatusChange: (status: InvestigationStatus) => void;
  state: InvestigationStatusPanelState;
}) {
  return (
    <section className="analysis-section watchlist-detail-panel">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Flujo de análisis</span>
          <h2>Estado de investigación</h2>
        </div>
        {state.item ? (
          <span className="badge external-hint">
            {INVESTIGATION_STATUS_LABELS[state.item.status]}
          </span>
        ) : null}
      </div>
      <p className="section-note">
        Este estado organiza el flujo de análisis. No representa una
        recomendación de apuesta.
      </p>

      {state.loading ? <div className="empty-state compact">Cargando estado...</div> : null}
      {state.error ? (
        <div className="alert-panel compact" role="status">
          <strong>No se pudo actualizar investigación</strong>
          <span>{state.error}</span>
        </div>
      ) : null}

      {!state.loading ? (
        <div className="watchlist-form">
          <label>
            Estado
            <select
              disabled={state.saving}
              onChange={(event) => onStatusChange(event.target.value as InvestigationStatus)}
              value={state.statusDraft}
            >
              {INVESTIGATION_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {INVESTIGATION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <input
              disabled={state.saving}
              inputMode="numeric"
              max={100}
              min={0}
              onChange={(event) => onPriorityChange(event.target.value)}
              placeholder="0-100 opcional"
              type="number"
              value={state.priorityDraft}
            />
          </label>
          <label>
            Nota de investigación
            <textarea
              disabled={state.saving}
              maxLength={4000}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Ej. revisar lesiones, mercado externo o movimiento de precio."
              value={state.noteDraft}
            />
          </label>
          <div className="watchlist-actions">
            <button
              className="watchlist-button"
              disabled={state.saving}
              onClick={onSave}
              type="button"
            >
              {state.saving ? "Guardando..." : state.item ? "Actualizar estado" : "Crear estado"}
            </button>
            {state.item ? (
              <button
                className="watchlist-button danger"
                disabled={state.saving}
                onClick={onDelete}
                type="button"
              >
                Borrar estado
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MarketTagsDetailPanel({
  onAdd,
  onDraftChange,
  onRemove,
  state,
}: {
  onAdd: () => void;
  onDraftChange: (value: string) => void;
  onRemove: (tagId: number) => void;
  state: MarketTagsPanelState;
}) {
  return (
    <section className="analysis-section watchlist-detail-panel">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Organización</span>
          <h2>Etiquetas</h2>
        </div>
      </div>
      <p className="section-note">
        Etiquetas manuales y sugerencias del sistema para ordenar mercados. No
        modifican análisis ni crean predicciones.
      </p>

      {state.loading ? <div className="empty-state compact">Cargando etiquetas...</div> : null}
      {state.error ? (
        <div className="alert-panel compact" role="status">
          <strong>No se pudieron actualizar etiquetas</strong>
          <span>{state.error}</span>
        </div>
      ) : null}

      {!state.loading ? (
        <>
          <div className="tag-chip-list">
            {state.tags.length === 0 ? (
              <span className="quiet-text">Sin etiquetas manuales.</span>
            ) : (
              state.tags.map((tag) => (
                <span className="tag-chip manual" key={tag.slug}>
                  {tag.name}
                  {tag.id ? (
                    <button
                      aria-label={`Quitar etiqueta ${tag.name}`}
                      disabled={state.saving}
                      onClick={() => onRemove(tag.id as number)}
                      type="button"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))
            )}
          </div>
          {state.suggestedTags.length > 0 ? (
            <div className="tag-chip-list">
              {state.suggestedTags.map((tag) => (
                <span className="tag-chip system" key={tag.slug}>{tag.name}</span>
              ))}
            </div>
          ) : null}
          <div className="watchlist-form">
            <label>
              Nueva etiqueta manual
              <input
                disabled={state.saving}
                maxLength={120}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="Ej. Alta prioridad"
                value={state.draft}
              />
            </label>
            <button
              className="watchlist-button"
              disabled={state.saving || state.draft.trim().length === 0}
              onClick={onAdd}
              type="button"
            >
              {state.saving ? "Guardando..." : "Agregar etiqueta"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function MarketOutcomeDetailPanel({
  onDelete,
  onNotesChange,
  onResolvedAtChange,
  onSave,
  onSourceChange,
  onOutcomeChange,
  state,
}: {
  onDelete: () => void;
  onNotesChange: (notes: string) => void;
  onResolvedAtChange: (resolvedAt: string) => void;
  onSave: () => void;
  onSourceChange: (source: string) => void;
  onOutcomeChange: (outcome: ResolvedOutcome) => void;
  state: MarketOutcomePanelState;
}) {
  return (
    <section className="analysis-section watchlist-detail-panel">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Backtesting</span>
          <h2>Resultado del mercado</h2>
        </div>
      </div>
      <p className="section-note">
        Este resultado se registra manualmente para backtesting. No ejecuta
        apuestas ni trading.
      </p>
      {state.loading ? <div className="empty-state compact">Cargando outcome...</div> : null}
      {state.error ? (
        <div className="alert-panel compact" role="status">
          <strong>Outcome no disponible</strong>
          <span>{state.error}</span>
        </div>
      ) : null}
      {!state.loading && !state.item ? (
        <span className="reason-chip muted">Sin resultado manual guardado.</span>
      ) : null}
      {state.item ? (
        <dl className="source-quality-metrics">
          <div>
            <dt>Resultado</dt>
            <dd>{formatOutcomeLabel(state.item.resolved_outcome)}</dd>
          </div>
          <div>
            <dt>Fuente</dt>
            <dd>{state.item.source}</dd>
          </div>
          <div>
            <dt>Resuelto</dt>
            <dd>{formatDateTime(state.item.resolved_at)}</dd>
          </div>
          <div>
            <dt>Notas</dt>
            <dd>{state.item.notes || "N/D"}</dd>
          </div>
        </dl>
      ) : null}
      <div className="outcome-management-form">
        <label className="watchlist-field">
          Resultado
          <select
            disabled={state.saving}
            onChange={(event) => onOutcomeChange(event.target.value as ResolvedOutcome)}
            value={state.outcomeDraft}
          >
            {outcomeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="watchlist-field">
          Fecha de resolución
          <input
            disabled={state.saving}
            onChange={(event) => onResolvedAtChange(event.target.value)}
            type="datetime-local"
            value={state.resolvedAtDraft}
          />
        </label>
        <label className="watchlist-field">
          Fuente
          <input
            disabled={state.saving}
            onChange={(event) => onSourceChange(event.target.value)}
            placeholder="manual"
            value={state.sourceDraft}
          />
        </label>
        <label className="watchlist-field outcome-notes-field">
          Nota
          <textarea
            disabled={state.saving}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Notas internas sobre el resultado"
            rows={3}
            value={state.notesDraft}
          />
        </label>
        <div className="watchlist-actions">
          <button
            className="watchlist-button"
            disabled={state.loading || state.saving}
            onClick={onSave}
            type="button"
          >
            {state.saving ? "Guardando..." : "Guardar resultado"}
          </button>
          {state.item ? (
            <button
              className="watchlist-button secondary"
              disabled={state.loading || state.saving}
              onClick={onDelete}
              type="button"
            >
              Eliminar resultado
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MarketDecisionLogPanel({
  onConfidenceChange,
  onDecisionChange,
  onDelete,
  onNoteChange,
  onSave,
  state,
}: {
  onConfidenceChange: (confidence: DecisionConfidenceLabel | "") => void;
  onDecisionChange: (decision: MarketDecision) => void;
  onDelete: (decisionId: number) => void;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  state: MarketDecisionPanelState;
}) {
  return (
    <section className="analysis-section watchlist-detail-panel">
      <div className="analysis-section-heading">
        <div>
          <span className="section-kicker">Bitacora manual</span>
          <h2>Decisiones humanas</h2>
        </div>
      </div>
      <p className="section-note">
        Estas decisiones son notas manuales para organizar analisis. No ejecutan
        apuestas ni trading.
      </p>

      {state.loading ? <div className="empty-state compact">Cargando decisiones...</div> : null}
      {state.error ? (
        <div className="alert-panel compact" role="status">
          <strong>Decision no disponible</strong>
          <span>{state.error}</span>
        </div>
      ) : null}

      {!state.loading ? (
        <div className="decision-log-list">
          {state.items.length === 0 ? (
            <span className="reason-chip muted">Sin decisiones guardadas.</span>
          ) : (
            state.items.map((item) => (
              <article className="decision-log-card" key={item.id}>
                <div>
                  <strong>{MARKET_DECISION_LABELS[item.decision]}</strong>
                  <span>{formatDateTime(item.created_at)}</span>
                </div>
                {item.confidence_label ? (
                  <span className="reason-chip">
                    Confianza {DECISION_CONFIDENCE_LABELS[item.confidence_label]}
                  </span>
                ) : null}
                {item.note ? <p>{item.note}</p> : null}
                <button
                  className="watchlist-button secondary"
                  disabled={state.saving || state.deletingId === item.id}
                  onClick={() => onDelete(item.id)}
                  type="button"
                >
                  {state.deletingId === item.id ? "Eliminando..." : "Eliminar"}
                </button>
              </article>
            ))
          )}
        </div>
      ) : null}

      <div className="watchlist-form">
        <label>
          Decision
          <select
            disabled={state.saving}
            onChange={(event) => onDecisionChange(event.target.value as MarketDecision)}
            value={state.decisionDraft}
          >
            {decisionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confianza
          <select
            disabled={state.saving}
            onChange={(event) =>
              onConfidenceChange(event.target.value as DecisionConfidenceLabel | "")
            }
            value={state.confidenceDraft}
          >
            {decisionConfidenceOptions.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nota
          <textarea
            disabled={state.saving}
            maxLength={4000}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Ej. esperar datos de lesiones, revisar movimiento o dejar para mas tarde."
            value={state.noteDraft}
          />
        </label>
        <div className="watchlist-actions">
          <button
            className="watchlist-button"
            disabled={state.loading || state.saving}
            onClick={onSave}
            type="button"
          >
            {state.saving ? "Guardando..." : "Guardar decision"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default function MarketAnalysisPage() {
  const params = useParams<{ id: string }>();
  const marketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [copiedCommand, setCopiedCommand] = useState<"prepare" | "ingest" | null>(null);
  const [markdownExportState, setMarkdownExportState] = useState<MarkdownExportState>({
    loading: false,
    copied: false,
    error: null,
    fallback: null,
  });
  const [state, setState] = useState<LoadState>({
    analysis: null,
    priceHistory: null,
    priceHistoryError: null,
    loading: true,
    error: null,
    notFound: false,
  });
  const [watchlistState, setWatchlistState] = useState<WatchlistPanelState>({
    item: null,
    loading: true,
    saving: false,
    error: null,
    statusDraft: "watching",
    noteDraft: "",
  });
  const [investigationState, setInvestigationState] = useState<InvestigationStatusPanelState>({
    item: null,
    loading: true,
    saving: false,
    error: null,
    statusDraft: "pending_review",
    noteDraft: "",
    priorityDraft: "",
  });
  const [marketTagsState, setMarketTagsState] = useState<MarketTagsPanelState>({
    tags: [],
    suggestedTags: [],
    loading: true,
    saving: false,
    error: null,
    draft: "",
  });
  const [marketOutcomeState, setMarketOutcomeState] = useState<MarketOutcomePanelState>({
    item: null,
    loading: true,
    saving: false,
    error: null,
    outcomeDraft: "unknown",
    sourceDraft: "manual",
    notesDraft: "",
    resolvedAtDraft: "",
  });
  const [marketDecisionState, setMarketDecisionState] = useState<MarketDecisionPanelState>({
    items: [],
    loading: true,
    saving: false,
    deletingId: null,
    error: null,
    decisionDraft: "monitor",
    noteDraft: "",
    confidenceDraft: "",
  });

  const loadAnalysis = useCallback(async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      notFound: false,
      priceHistoryError: null,
    }));
    try {
      const [analysisResult, historyResult] = await Promise.allSettled([
        fetchJson<MarketAnalysis>(`/markets/${marketId}/analysis`),
        fetchJson<PriceHistoryResponse>(`/markets/${marketId}/price-history?limit=50&order=asc`),
      ]);
      if (analysisResult.status === "rejected") {
        throw analysisResult.reason;
      }
      setState({
        analysis: analysisResult.value,
        priceHistory: historyResult.status === "fulfilled" ? historyResult.value : null,
        priceHistoryError:
          historyResult.status === "rejected"
            ? "No se pudo cargar el historial de precio."
            : null,
        loading: false,
        error: null,
        notFound: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      setState({
        analysis: null,
        priceHistory: null,
        priceHistoryError: null,
        loading: false,
        error: message === "not_found" ? null : "No se pudo cargar el análisis del mercado.",
        notFound: message === "not_found",
      });
    }
  }, [marketId]);

  const loadWatchlistStatus = useCallback(async () => {
    setWatchlistState((current) => ({ ...current, loading: true, error: null }));
    try {
      const item = await fetchMarketWatchlistStatus(marketId);
      setWatchlistState((current) => ({
        ...current,
        item,
        loading: false,
        error: null,
        statusDraft: item?.status ?? "watching",
        noteDraft: item?.note ?? "",
      }));
    } catch {
      setWatchlistState((current) => ({
        ...current,
        loading: false,
        error: "No se pudo cargar el estado de seguimiento.",
      }));
    }
  }, [marketId]);

  const loadInvestigationStatus = useCallback(async () => {
    setInvestigationState((current) => ({ ...current, loading: true, error: null }));
    try {
      const item = await fetchMarketInvestigationStatus(marketId);
      setInvestigationState((current) => ({
        ...current,
        item,
        loading: false,
        error: null,
        statusDraft: item?.status ?? "pending_review",
        noteDraft: item?.note ?? "",
        priorityDraft:
          item?.priority === null || item?.priority === undefined ? "" : String(item.priority),
      }));
    } catch {
      setInvestigationState((current) => ({
        ...current,
        loading: false,
        error: "No se pudo cargar el estado de investigación.",
      }));
    }
  }, [marketId]);

  const loadMarketTags = useCallback(async () => {
    setMarketTagsState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetchMarketTags(marketId);
      setMarketTagsState((current) => ({
        ...current,
        tags: response.tags,
        suggestedTags: response.suggested_tags,
        loading: false,
        error: null,
      }));
    } catch {
      setMarketTagsState((current) => ({
        ...current,
        loading: false,
        error: "No se pudieron cargar etiquetas.",
      }));
    }
  }, [marketId]);

  const loadMarketOutcome = useCallback(async () => {
    setMarketOutcomeState((current) => ({ ...current, loading: true, error: null }));
    try {
      const item = await fetchMarketOutcome(marketId);
      setMarketOutcomeState({
        item,
        loading: false,
        saving: false,
        error: null,
        outcomeDraft: item?.resolved_outcome ?? "unknown",
        sourceDraft: item?.source ?? "manual",
        notesDraft: item?.notes ?? "",
        resolvedAtDraft: formatOutcomeDateInput(item?.resolved_at),
      });
    } catch {
      setMarketOutcomeState({
        item: null,
        loading: false,
        saving: false,
        error: "No se pudo cargar outcome.",
        outcomeDraft: "unknown",
        sourceDraft: "manual",
        notesDraft: "",
        resolvedAtDraft: "",
      });
    }
  }, [marketId]);

  const loadMarketDecisions = useCallback(async () => {
    setMarketDecisionState((current) => ({ ...current, loading: true, error: null }));
    try {
      const items = await fetchMarketDecisions(marketId);
      setMarketDecisionState((current) => ({
        ...current,
        items,
        loading: false,
        error: null,
      }));
    } catch {
      setMarketDecisionState((current) => ({
        ...current,
        loading: false,
        error: "No se pudieron cargar decisiones humanas.",
      }));
    }
  }, [marketId]);

  const saveMarketOutcome = useCallback(async () => {
    setMarketOutcomeState((current) => ({ ...current, saving: true, error: null }));
    try {
      const payload = {
        resolved_outcome: marketOutcomeState.outcomeDraft,
        source: marketOutcomeState.sourceDraft.trim() || "manual",
        notes: marketOutcomeState.notesDraft.trim() || null,
        resolved_at: parseOutcomeDateInput(marketOutcomeState.resolvedAtDraft),
      };
      const item = marketOutcomeState.item
        ? await updateMarketOutcome(marketId, payload)
        : await upsertMarketOutcome(marketId, payload);
      setMarketOutcomeState((current) => ({
        ...current,
        item,
        saving: false,
        error: null,
        outcomeDraft: item.resolved_outcome,
        sourceDraft: item.source,
        notesDraft: item.notes ?? "",
        resolvedAtDraft: formatOutcomeDateInput(item.resolved_at),
      }));
    } catch {
      setMarketOutcomeState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo guardar el resultado manual.",
      }));
    }
  }, [
    marketId,
    marketOutcomeState.item,
    marketOutcomeState.notesDraft,
    marketOutcomeState.outcomeDraft,
    marketOutcomeState.resolvedAtDraft,
    marketOutcomeState.sourceDraft,
  ]);

  const removeMarketOutcome = useCallback(async () => {
    if (!marketOutcomeState.item) {
      return;
    }
    setMarketOutcomeState((current) => ({ ...current, saving: true, error: null }));
    try {
      await deleteMarketOutcome(marketId);
      setMarketOutcomeState({
        item: null,
        loading: false,
        saving: false,
        error: null,
        outcomeDraft: "unknown",
        sourceDraft: "manual",
        notesDraft: "",
        resolvedAtDraft: "",
      });
    } catch {
      setMarketOutcomeState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo eliminar el resultado manual.",
      }));
    }
  }, [marketId, marketOutcomeState.item]);

  const saveMarketDecision = useCallback(async () => {
    setMarketDecisionState((current) => ({ ...current, saving: true, error: null }));
    try {
      const item = await createMarketDecision(marketId, {
        decision: marketDecisionState.decisionDraft,
        note: marketDecisionState.noteDraft.trim() || null,
        confidence_label: marketDecisionState.confidenceDraft || null,
      });
      setMarketDecisionState((current) => ({
        ...current,
        items: [item, ...current.items],
        saving: false,
        error: null,
        noteDraft: "",
      }));
    } catch {
      setMarketDecisionState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo guardar la decision humana.",
      }));
    }
  }, [
    marketDecisionState.confidenceDraft,
    marketDecisionState.decisionDraft,
    marketDecisionState.noteDraft,
    marketId,
  ]);

  const removeMarketDecision = useCallback(async (decisionId: number) => {
    setMarketDecisionState((current) => ({
      ...current,
      deletingId: decisionId,
      error: null,
    }));
    try {
      await deleteMarketDecision(decisionId);
      setMarketDecisionState((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== decisionId),
        deletingId: null,
        error: null,
      }));
    } catch {
      setMarketDecisionState((current) => ({
        ...current,
        deletingId: null,
        error: "No se pudo eliminar la decision humana.",
      }));
    }
  }, []);

  const addToWatchlist = useCallback(async () => {
    setWatchlistState((current) => ({ ...current, saving: true, error: null }));
    try {
      const item = await createWatchlistItem(marketId, {
        status: "watching",
        note: watchlistState.noteDraft || null,
      });
      setWatchlistState((current) => ({
        ...current,
        item,
        saving: false,
        error: null,
        statusDraft: item.status,
        noteDraft: item.note ?? "",
      }));
    } catch {
      setWatchlistState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo agregar este mercado a seguimiento.",
      }));
    }
  }, [marketId, watchlistState.noteDraft]);

  const saveWatchlistItem = useCallback(async () => {
    setWatchlistState((current) => ({ ...current, saving: true, error: null }));
    try {
      const item = watchlistState.item
        ? await updateWatchlistItem(watchlistState.item.id, {
            status: watchlistState.statusDraft,
            note: watchlistState.noteDraft || null,
          })
        : await createWatchlistItem(marketId, {
            status: watchlistState.statusDraft,
            note: watchlistState.noteDraft || null,
          });
      setWatchlistState((current) => ({
        ...current,
        item,
        saving: false,
        error: null,
        statusDraft: item.status,
        noteDraft: item.note ?? "",
      }));
    } catch {
      setWatchlistState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo guardar la nota o el estado.",
      }));
    }
  }, [marketId, watchlistState.item, watchlistState.noteDraft, watchlistState.statusDraft]);

  const removeFromWatchlist = useCallback(async () => {
    if (!watchlistState.item) {
      return;
    }
    setWatchlistState((current) => ({ ...current, saving: true, error: null }));
    try {
      await removeWatchlistItem(watchlistState.item.id);
      setWatchlistState((current) => ({
        ...current,
        item: null,
        saving: false,
        error: null,
        statusDraft: "watching",
        noteDraft: "",
      }));
    } catch {
      setWatchlistState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo quitar este mercado de seguimiento.",
      }));
    }
  }, [watchlistState.item]);

  const saveInvestigationStatus = useCallback(async () => {
    setInvestigationState((current) => ({ ...current, saving: true, error: null }));
    const priority =
      investigationState.priorityDraft.trim() === ""
        ? null
        : Math.max(0, Math.min(100, Number(investigationState.priorityDraft)));
    try {
      const payload = {
        status: investigationState.statusDraft,
        note: investigationState.noteDraft || null,
        priority: Number.isFinite(priority) ? priority : null,
      };
      const item = investigationState.item
        ? await updateMarketInvestigationStatus(marketId, payload)
        : await upsertMarketInvestigationStatus(marketId, payload);
      setInvestigationState((current) => ({
        ...current,
        item,
        saving: false,
        error: null,
        statusDraft: item.status,
        noteDraft: item.note ?? "",
        priorityDraft:
          item.priority === null || item.priority === undefined ? "" : String(item.priority),
      }));
    } catch {
      setInvestigationState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo guardar el estado de investigación.",
      }));
    }
  }, [
    investigationState.item,
    investigationState.noteDraft,
    investigationState.priorityDraft,
    investigationState.statusDraft,
    marketId,
  ]);

  const deleteInvestigationStatus = useCallback(async () => {
    if (!investigationState.item) {
      return;
    }
    setInvestigationState((current) => ({ ...current, saving: true, error: null }));
    try {
      await removeMarketInvestigationStatus(marketId);
      setInvestigationState((current) => ({
        ...current,
        item: null,
        saving: false,
        error: null,
        statusDraft: "pending_review",
        noteDraft: "",
        priorityDraft: "",
      }));
    } catch {
      setInvestigationState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo borrar el estado de investigación.",
      }));
    }
  }, [investigationState.item, marketId]);

  const addTagToMarket = useCallback(async () => {
    const name = marketTagsState.draft.trim();
    if (!name) {
      return;
    }
    setMarketTagsState((current) => ({ ...current, saving: true, error: null }));
    try {
      const response = await addMarketTag(marketId, { name });
      setMarketTagsState((current) => ({
        ...current,
        tags: response.tags,
        suggestedTags: response.suggested_tags,
        saving: false,
        error: null,
        draft: "",
      }));
    } catch {
      setMarketTagsState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo agregar la etiqueta.",
      }));
    }
  }, [marketId, marketTagsState.draft]);

  const removeTagFromMarket = useCallback(async (tagId: number) => {
    setMarketTagsState((current) => ({ ...current, saving: true, error: null }));
    try {
      await removeMarketTag(marketId, tagId);
      const response = await fetchMarketTags(marketId);
      setMarketTagsState((current) => ({
        ...current,
        tags: response.tags,
        suggestedTags: response.suggested_tags,
        saving: false,
        error: null,
      }));
    } catch {
      setMarketTagsState((current) => ({
        ...current,
        saving: false,
        error: "No se pudo quitar la etiqueta.",
      }));
    }
  }, [marketId]);

  const copyMarkdownAnalysis = useCallback(async () => {
    setMarkdownExportState({
      loading: true,
      copied: false,
      error: null,
      fallback: null,
    });
    try {
      const response = await fetchJson<{ markdown: string }>(
        `/markets/${marketId}/analysis/markdown`,
      );
      const markdown = response.markdown;
      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(markdown);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied && typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = markdown;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (!copied) {
        setMarkdownExportState({
          loading: false,
          copied: false,
          error: "No se pudo copiar automáticamente. Usa el texto de respaldo.",
          fallback: markdown,
        });
        return;
      }
      setMarkdownExportState({
        loading: false,
        copied: true,
        error: null,
        fallback: null,
      });
      window.setTimeout(
        () => setMarkdownExportState((current) => ({ ...current, copied: false })),
        1800,
      );
    } catch {
      setMarkdownExportState({
        loading: false,
        copied: false,
        error: "No se pudo generar el Markdown del análisis.",
        fallback: null,
      });
    }
  }, [marketId]);

  const copyCommand = useCallback(async (command: string, key: "prepare" | "ingest") => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    try {
      let copied = false;
      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(command);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = command;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (!copied) {
        return;
      }
      setCopiedCommand(key);
      window.setTimeout(() => setCopiedCommand(null), 1800);
    } catch {
      setCopiedCommand(null);
    }
  }, []);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  useEffect(() => {
    void loadWatchlistStatus();
  }, [loadWatchlistStatus]);

  useEffect(() => {
    void loadInvestigationStatus();
  }, [loadInvestigationStatus]);

  useEffect(() => {
    void loadMarketTags();
  }, [loadMarketTags]);

  useEffect(() => {
    void loadMarketOutcome();
  }, [loadMarketOutcome]);

  useEffect(() => {
    void loadMarketDecisions();
  }, [loadMarketDecisions]);

  const analysis = state.analysis;
  const translatedTitle = analysis ? translateMarketTitleToSpanish(analysis.market.question) : "";
  const originalChanged = Boolean(analysis && translatedTitle !== analysis.market.question);
  const participants = analysis?.candidate_context?.participants ?? [];
  const fallbackImage =
    analysis?.market.image_url ||
    analysis?.market.event_image_url ||
    analysis?.market.icon_url ||
    analysis?.market.event_icon_url ||
    null;
  const analysisJsonUrl = `${API_BASE_URL}/markets/${marketId}/analysis`;
  const researchPacketCommand = `python -m app.commands.prepare_codex_research --market-id ${marketId}`;
  const ingestDryRunCommand = "python -m app.commands.ingest_codex_research --run-id <RUN_ID> --dry-run";
  const pausedFutureMarket = analysis ? isPausedFutureMarket(analysis) : false;
  const upcomingMatchMarket = analysis ? isUpcomingMatchMarket(analysis) : false;

  const marketBadges = useMemo(() => {
    if (!analysis) {
      return [];
    }
    const badges = [
      analysis.market.active && !analysis.market.closed ? "Activo" : "Inactivo/cerrado",
      formatSportLabel(analysis.candidate_context?.sport || analysis.market.sport_type),
      formatMarketShapeLabel(analysis.candidate_context?.market_shape || analysis.market.evidence_shape),
    ];
    if (isPausedFutureMarket(analysis)) {
      badges.push("Mercado a futuro");
    } else if (isUpcomingMatchMarket(analysis)) {
      badges.push("Partido próximo");
    }
    return badges;
  }, [analysis]);

  return (
    <main className="dashboard-shell analysis-shell">
      <MainNavigation />
      <header className="analysis-topbar">
        <Link className="text-link" href="/">
          Volver al dashboard
        </Link>
        <div className="topbar-actions">
          <a className="text-link" href={analysisJsonUrl} target="_blank" rel="noreferrer">
            Ver JSON del análisis
          </a>
          <a className="text-link" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>
      </header>

      {state.loading ? (
        <section className="empty-state">Cargando análisis del mercado...</section>
      ) : state.notFound ? (
        <section className="empty-state">
          <strong>Mercado no encontrado</strong>
          <p>No existe un mercado local con ID #{marketId}.</p>
        </section>
      ) : state.error ? (
        <section className="alert-panel" role="status">
          <strong>API desconectada</strong>
          <span>{state.error} Revisa que FastAPI esté corriendo en {API_BASE_URL}.</span>
        </section>
      ) : analysis ? (
        <>
          <section className="analysis-hero">
            <div>
              <p className="eyebrow">Mercado #{analysis.market.id}</p>
              <h1 title={analysis.market.question}>{translatedTitle}</h1>
              {originalChanged ? (
                <p className="original-market-title">Original: {analysis.market.question}</p>
              ) : null}
              <p className="subtitle">
                {translateMarketSubtitleToSpanish(analysis.market.event_title) || analysis.market.slug}
              </p>
              <div className="badge-row">
                {marketBadges.map((badge) => (
                  <span className="badge" key={badge}>{badge}</span>
                ))}
                <span className="badge muted">Cierre {formatDateTime(analysis.market.end_date)}</span>
              </div>
            </div>
            <div className="analysis-participants">
              {participants.length > 0 ? (
                participants.slice(0, 3).map((participant) => (
                  <span className="participant-chip" key={participant.name}>
                    <VisualAvatar
                      name={participant.name}
                      src={participant.logo_url || participant.image_url || fallbackImage}
                      abbreviation={participant.abbreviation}
                    />
                      <span className="participant-copy">
                        <span className="participant-name">{participant.name}</span>
                        <span className="participant-role">{formatParticipantRole(participant.role)}</span>
                      </span>
                    </span>
                ))
              ) : (
                <span className="participant-chip">
                  <VisualAvatar
                    name={analysis.market.question}
                    src={fallbackImage}
                    abbreviation={participantInitials(analysis.market.question)}
                  />
                  <span className="participant-name">Visual del mercado</span>
                </span>
              )}
            </div>
          </section>

          <section className="safety-strip">
            <strong>Solo lectura:</strong>
            <span>
              Esta página no ejecuta research, no consulta Kalshi en vivo, no crea predicciones y no ejecuta apuestas automáticas.
            </span>
          </section>

          {pausedFutureMarket ? (
            <section className="focus-notice paused">
              <strong>Mercado a futuro</strong>
              <span>
                Actualmente PolySignal está priorizando partidos de los próximos 7 días.
                Este mercado queda para análisis posterior.
              </span>
            </section>
          ) : null}

          {upcomingMatchMarket ? (
            <section className="focus-notice active">
              <strong>Partido próximo</strong>
              <span>
                Este mercado entra en el foco actual: partidos deportivos cercanos para
                revisión manual.
              </span>
            </section>
          ) : null}

          <div className="analysis-layout">
            <div className="analysis-main">
              <PricePanel snapshot={analysis.latest_snapshot} />
              <PolySignalScorePanel score={analysis.polysignal_score} />
              <DataQualityPanel
                dataQuality={analysis.data_quality}
                score={analysis.polysignal_score}
              />
              <PriceHistoryPanel history={state.priceHistory} error={state.priceHistoryError} />
              <CandidateContextPanel context={analysis.candidate_context} />
              <ExternalSignalsPanel signals={analysis.external_signals} snapshot={analysis.latest_snapshot} />
              <EvidencePanel analysis={analysis} />
              <PredictionPanel analysis={analysis} />
              <ResearchRunsPanel runs={analysis.research_runs} />
            </div>

            <aside className="analysis-side">
              <WatchlistDetailPanel
                onAdd={addToWatchlist}
                onNoteChange={(note) =>
                  setWatchlistState((current) => ({ ...current, noteDraft: note }))
                }
                onRemove={removeFromWatchlist}
                onSave={saveWatchlistItem}
                onStatusChange={(status) =>
                  setWatchlistState((current) => ({ ...current, statusDraft: status }))
                }
                state={watchlistState}
              />

              <InvestigationStatusDetailPanel
                onDelete={deleteInvestigationStatus}
                onNoteChange={(note) =>
                  setInvestigationState((current) => ({ ...current, noteDraft: note }))
                }
                onPriorityChange={(priority) =>
                  setInvestigationState((current) => ({ ...current, priorityDraft: priority }))
                }
                onSave={saveInvestigationStatus}
                onStatusChange={(status) =>
                  setInvestigationState((current) => ({ ...current, statusDraft: status }))
                }
                state={investigationState}
              />

              <MarketTagsDetailPanel
                onAdd={addTagToMarket}
                onDraftChange={(draft) =>
                  setMarketTagsState((current) => ({ ...current, draft }))
                }
                onRemove={removeTagFromMarket}
                state={marketTagsState}
              />

              <MarketOutcomeDetailPanel
                onDelete={removeMarketOutcome}
                onNotesChange={(notes) =>
                  setMarketOutcomeState((current) => ({ ...current, notesDraft: notes }))
                }
                onOutcomeChange={(outcome) =>
                  setMarketOutcomeState((current) => ({ ...current, outcomeDraft: outcome }))
                }
                onResolvedAtChange={(resolvedAt) =>
                  setMarketOutcomeState((current) => ({
                    ...current,
                    resolvedAtDraft: resolvedAt,
                  }))
                }
                onSave={saveMarketOutcome}
                onSourceChange={(source) =>
                  setMarketOutcomeState((current) => ({ ...current, sourceDraft: source }))
                }
                state={marketOutcomeState}
              />

              <MarketDecisionLogPanel
                onConfidenceChange={(confidence) =>
                  setMarketDecisionState((current) => ({
                    ...current,
                    confidenceDraft: confidence,
                  }))
                }
                onDecisionChange={(decision) =>
                  setMarketDecisionState((current) => ({
                    ...current,
                    decisionDraft: decision,
                  }))
                }
                onDelete={removeMarketDecision}
                onNoteChange={(note) =>
                  setMarketDecisionState((current) => ({ ...current, noteDraft: note }))
                }
                onSave={saveMarketDecision}
                state={marketDecisionState}
              />

              <section className="analysis-section">
                <h2>Qué falta por investigar</h2>
                <div className="candidate-chip-list">
                  {analysis.warnings.length > 0 ? (
                    analysis.warnings.map((warning) => (
                      <span className="warning-chip" key={warning}>{formatWarningLabel(warning)}</span>
                    ))
                  ) : (
                    <span className="reason-chip">Sin faltantes críticos</span>
                  )}
                </div>
              </section>

              <section className="analysis-section">
                <h2>Investigar este mercado</h2>
                <p className="section-note">
                  Este mercado todavía puede investigarse con Codex Agent. PolySignal
                  generará un request JSON y un packet Markdown para que un agente
                  externo analice fuentes y devuelva evidencia estructurada.
                </p>
                {analysis.research_runs.length > 0 ? (
                  <span className="reason-chip">
                    Ya existen investigaciones previas para este mercado.
                  </span>
                ) : null}
                <div className="command-card">
                  <div>
                    <span>Exportar análisis</span>
                    <code>GET /markets/{marketId}/analysis/markdown</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyMarkdownAnalysis()}
                    disabled={markdownExportState.loading}
                  >
                    {markdownExportState.loading
                      ? "Generando..."
                      : markdownExportState.copied
                        ? "Copiado"
                        : "Copiar análisis Markdown"}
                  </button>
                </div>
                {markdownExportState.error ? (
                  <div className="alert-panel compact" role="status">
                    <strong>Export Markdown</strong>
                    <span>{markdownExportState.error}</span>
                  </div>
                ) : null}
                {markdownExportState.fallback ? (
                  <div className="markdown-export-fallback">
                    <label>
                      Copia manual
                      <textarea readOnly value={markdownExportState.fallback} />
                    </label>
                  </div>
                ) : null}
                <div className="command-card">
                  <div>
                    <span>Generar Research Packet</span>
                    <code>{researchPacketCommand}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCommand(researchPacketCommand, "prepare")}
                  >
                    {copiedCommand === "prepare" ? "Copiado" : "Copiar comando"}
                  </button>
                </div>
                <div className="command-card">
                  <div>
                    <span>Ingesta segura con Quality Gate</span>
                    <code>{ingestDryRunCommand}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCommand(ingestDryRunCommand, "ingest")}
                  >
                    {copiedCommand === "ingest" ? "Copiado" : "Copiar comando"}
                  </button>
                </div>
                <p className="section-note">
                  Primero usa <strong>--dry-run</strong> para pasar por Quality Gate
                  antes de crear predicción.
                </p>
                <p className="warning-text">
                  No ejecutes apuestas automáticas. El packet es para investigación,
                  no para trading.
                </p>
              </section>

              <section className="analysis-section">
                <h2>Links técnicos</h2>
                <div className="quick-links">
                  <a href={analysisJsonUrl} target="_blank" rel="noreferrer">Endpoint de análisis</a>
                  <a href={`${API_BASE_URL}/markets/${marketId}/external-signals`} target="_blank" rel="noreferrer">Señales externas del mercado</a>
                  <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">Documentación API</a>
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
