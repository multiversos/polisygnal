"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type HealthResponse = {
  status?: string;
  environment?: string;
};

type MarketsOverviewResponse = {
  total_count?: number;
  items?: unknown[];
};

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
};

type CandidatesResponse = {
  count: number;
  limit: number;
  candidates: ResearchCandidate[];
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
  overview: MarketsOverviewResponse | null;
  dashboardMeta: DashboardMetaResponse | null;
  candidates: ResearchCandidate[];
  externalSignals: ExternalMarketSignal[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
};

type DashboardFilters = {
  sport: string;
  marketShape: string;
  limit: number;
};

type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "polysignal-theme";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const sportOptions = [
  "all",
  "nba",
  "nfl",
  "soccer",
  "horse_racing",
  "mlb",
  "tennis",
  "mma",
];

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
  { label: "Documentación API", href: `${API_BASE_URL}/docs` },
  { label: "Panel backend", href: `${API_BASE_URL}/` },
  { label: "Estado API", href: `${API_BASE_URL}/health` },
  { label: "Resumen de mercados", href: `${API_BASE_URL}/markets/overview` },
  {
    label: "Candidatos de investigación",
    href: `${API_BASE_URL}/research/candidates?limit=10&vertical=sports`,
  },
  { label: "Señales externas", href: `${API_BASE_URL}/external-signals/kalshi?limit=10` },
  { label: "Revisar coincidencias Kalshi", href: "/external-signals/matches" },
];

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function applyThemePreference(theme: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemThemePreference(): ThemePreference {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function resolveThemePreference(): ThemePreference {
  return getStoredThemePreference() ?? getSystemThemePreference();
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

function buildCandidatesPath(filters: DashboardFilters): string {
  const params = new URLSearchParams({
    vertical: "sports",
    limit: String(filters.limit),
  });
  if (filters.sport !== "all") {
    params.set("sport", filters.sport);
  }
  if (filters.marketShape !== "all") {
    params.set("market_shape", filters.marketShape);
  }
  return `/research/candidates?${params.toString()}`;
}

function formatOptionLabel(value: string): string {
  if (value === "all") {
    return "todos";
  }
  return humanizeToken(value);
}

const sportLabels: Record<string, string> = {
  all: "todos",
  nba: "NBA",
  nfl: "NFL",
  soccer: "fútbol",
  horse_racing: "carreras de caballos",
  mlb: "MLB",
  tennis: "tenis",
  mma: "MMA",
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
  market_closed: "mercado cerrado",
  no_external_signal: "sin señal externa",
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
  return sportLabels[value] ?? humanizeToken(value);
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

function MarketPricePanel({ candidate }: { candidate: ResearchCandidate }) {
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

function CandidateCard({
  candidate,
  hasExternalSignal,
}: {
  candidate: ResearchCandidate;
  hasExternalSignal: boolean;
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
          <MarketPricePanel candidate={candidate} />
        </div>
      </div>

      <div className="candidate-card-actions">
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

export default function DashboardPage() {
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [filters, setFilters] = useState<DashboardFilters>({
    sport: "all",
    marketShape: "all",
    limit: 10,
  });
  const [state, setState] = useState<DashboardState>({
    health: null,
    overview: null,
    dashboardMeta: null,
    candidates: [],
    externalSignals: [],
    loading: true,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    const resolvedTheme = resolveThemePreference();
    setTheme(resolvedTheme);
    applyThemePreference(resolvedTheme);

    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (getStoredThemePreference()) {
        return;
      }

      const nextTheme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      applyThemePreference(nextTheme);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyThemePreference(nextTheme);

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // The visual theme can still switch even if localStorage is unavailable.
      }

      return nextTheme;
    });
  }, []);

  const loadDashboard = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    const candidatesPath = buildCandidatesPath(filters);
    const [health, overview, candidates, dashboardMeta, externalSignals] =
      await Promise.allSettled([
        fetchJson<HealthResponse>("/health"),
        fetchJson<MarketsOverviewResponse>("/markets/overview"),
        fetchJson<CandidatesResponse>(candidatesPath),
        fetchJson<DashboardMetaResponse>("/dashboard/latest/meta"),
        fetchJson<ExternalSignalsResponse>("/external-signals/kalshi?limit=10"),
      ]);

    const errors: string[] = [];
    if (health.status === "rejected") {
      errors.push("API desconectada o /health no disponible");
    }
    if (candidates.status === "rejected") {
      errors.push("No se pudieron cargar candidatos");
    }
    if (externalSignals.status === "rejected") {
      errors.push("No se pudieron cargar señales externas");
    }

    setState({
      health: health.status === "fulfilled" ? health.value : null,
      overview: overview.status === "fulfilled" ? overview.value : null,
      dashboardMeta:
        dashboardMeta.status === "fulfilled" ? dashboardMeta.value : null,
      candidates:
        candidates.status === "fulfilled" ? candidates.value.candidates : [],
      externalSignals:
        externalSignals.status === "fulfilled" ? externalSignals.value.signals : [],
      loading: false,
      error: errors.length > 0 ? errors.join(". ") : null,
      updatedAt: new Date(),
    });
  }, [filters]);

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

  const topCandidates = state.candidates.slice(0, filters.limit);
  const candidatesPath = buildCandidatesPath(filters);
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
  const nextThemeLabel = theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Inteligencia para mercados predictivos</h1>
          <p className="subtitle">
            Dashboard de solo lectura para revisar estado local, mercados
            candidatos y rutas útiles sin ejecutar research, ingestar responses ni crear
            predicciones.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            aria-label={nextThemeLabel}
            className="theme-toggle"
            onClick={toggleTheme}
            title={nextThemeLabel}
            type="button"
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <div
            className={`status-pill ${apiOnline ? "status-online" : "status-offline"}`}
            aria-live="polite"
          >
            <span className="status-dot" />
            {state.loading ? "Cargando API" : apiOnline ? "API en línea" : "API desconectada"}
          </div>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          El puntaje de candidato prioriza mercados para investigar; no es una
          recomendación de apuesta. PolySignal no ejecuta apuestas automáticas.
          Las señales externas son datos comparativos, no instrucciones de
          apuesta.
        </span>
      </section>

      {state.error ? (
        <section className="alert-panel" role="status">
          <strong>Datos parciales</strong>
          <span>{state.error}. Revisa que FastAPI este corriendo en {API_BASE_URL}.</span>
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
          <span>Candidatos de investigación</span>
          <strong>{state.loading ? "..." : topCandidates.length}</strong>
          <p>Lectura de solo consulta del selector</p>
        </article>
        <article className="metric-card">
          <span>Señales externas</span>
          <strong>{state.loading ? "..." : state.externalSignals.length}</strong>
          <p>Señales guardadas localmente; no fetch remoto desde la UI</p>
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

      <section className="filter-panel" aria-label="Filtros de candidatos">
        <div className="filter-group">
          <label htmlFor="sport-filter">Deporte</label>
          <select
            id="sport-filter"
            value={filters.sport}
            onChange={(event) =>
              setFilters((current) => ({ ...current, sport: event.target.value }))
            }
          >
            {sportOptions.map((option) => (
              <option key={option} value={option}>
                {formatOptionLabel(option)}
              </option>
            ))}
          </select>
        </div>
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

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Mercados principales para investigar</h2>
              <p>
                Mercados con mejor calidad de datos para investigar primero.
                Este puntaje no predice el resultado ni recomienda apostar.
                El objetivo es ayudarte a decidir qué mercado merece análisis
                adicional.
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
                Prueba con deporte todos, tipo de mercado todos o un límite
                mayor. La pantalla sigue en modo solo lectura.
              </p>
            </div>
          ) : (
            <div className="candidate-card-list">
              {topCandidates.map((candidate) => (
                <CandidateCard
                  candidate={candidate}
                  hasExternalSignal={candidateIdsWithExternalSignals.has(candidate.market_id)}
                  key={candidate.market_id}
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
