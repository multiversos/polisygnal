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
  { label: "API docs", href: `${API_BASE_URL}/docs` },
  { label: "Backend panel", href: `${API_BASE_URL}/` },
  { label: "Health", href: `${API_BASE_URL}/health` },
  { label: "Markets overview", href: `${API_BASE_URL}/markets/overview` },
  {
    label: "Research candidates",
    href: `${API_BASE_URL}/research/candidates?limit=10&vertical=sports`,
  },
  { label: "External signals", href: `${API_BASE_URL}/external-signals/kalshi?limit=10` },
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
    return { diff: null, label: "Sin comparacion", tone: "neutral" };
  }

  const diff = signalProbability - marketPrice;
  const magnitude = Math.abs(diff);
  if (magnitude >= 0.08) {
    return { diff, label: "High divergence", tone: "high-divergence" };
  }
  if (magnitude >= 0.03) {
    return { diff, label: "Divergent", tone: "divergent" };
  }
  return { diff, label: "Aligned", tone: "aligned" };
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
  return value.replaceAll("_", " ");
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
            name={candidate.question}
            src={fallbackUrl}
            abbreviation={participantInitials(candidate.question)}
          />
          <span className="participant-name">Market visual</span>
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
            <span className="participant-role">{participant.role}</span>
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
        <span>Market price</span>
        {!hasPriceData ? <strong>Missing price data</strong> : null}
      </div>

      <div className="price-split">
        <div>
          <span>YES</span>
          <strong>{formatMarketPercent(yes)}</strong>
        </div>
        <div>
          <span>NO</span>
          <strong>{formatMarketPercent(no)}</strong>
        </div>
      </div>

      <div
        aria-label={`YES ${formatMarketPercent(yes)} and NO ${formatMarketPercent(no)}`}
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
          <span>Liquidity</span>
          <strong>{formatMarketMetric(candidate.liquidity)}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{formatMarketMetric(candidate.volume)}</strong>
        </div>
      </div>

      <p className="market-price-note">YES/NO reflejan el precio implicito del mercado.</p>
    </div>
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
              {candidate ? `Market #${candidate.market_id}` : "Unmatched"}
            </span>
          </div>
          <h3>{signal.title || signal.source_ticker || "External market signal"}</h3>
          <p>{signal.source_ticker || signal.source_market_id || "Ticker no disponible"}</p>
        </div>
        <span className={`comparison-badge ${comparison.tone}`}>
          {comparison.label}
        </span>
      </div>

      {candidate ? (
        <div className="matched-market-note">
          <strong>{candidate.question}</strong>
          <span>
            Polymarket YES {formatProbability(candidate.market_yes_price)} | Kalshi{" "}
            {formatProbability(signal.yes_probability ?? signal.mid_price)} | Diff{" "}
            {formatPercentDelta(comparison.diff)}
          </span>
        </div>
      ) : (
        <p className="unmatched-note">
          Esta senal aun no esta vinculada a un mercado Polymarket. Se muestra
          como contexto externo, no como equivalente.
        </p>
      )}

      <div className="external-signal-metrics">
        <div>
          <span>YES prob.</span>
          <strong>{formatProbability(signal.yes_probability)}</strong>
        </div>
        <div>
          <span>NO prob.</span>
          <strong>{formatProbability(signal.no_probability)}</strong>
        </div>
        <div>
          <span>Mid / last</span>
          <strong>
            {formatProbability(signal.mid_price)} / {formatProbability(signal.last_price)}
          </strong>
        </div>
        <div>
          <span>Spread</span>
          <strong>{formatProbability(signal.spread)}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{formatCompact(signal.volume)}</strong>
        </div>
        <div>
          <span>Open interest</span>
          <strong>{formatCompact(signal.open_interest)}</strong>
        </div>
      </div>

      <div className="confidence-row">
        <span className={`confidence-pill ${confidenceTone(signal.source_confidence)}`}>
          Source confidence {formatProbability(signal.source_confidence)}
        </span>
        <span className={`confidence-pill ${confidenceTone(signal.match_confidence)}`}>
          Match confidence {formatProbability(signal.match_confidence)}
        </span>
        <span className="timestamp-pill">Fetched {formatDateTime(signal.fetched_at)}</span>
      </div>

      {signal.match_reason ? (
        <p className="match-reason">Match reason: {signal.match_reason}</p>
      ) : null}

      {lowMatchConfidence ? (
        <p className="warning-text">
          Match confidence bajo: tratar como comparacion debil.
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="warning-list">
          {warnings.slice(0, 4).map((warning) => (
            <span key={`${signal.id}-${warning}`}>{warning}</span>
          ))}
        </div>
      ) : (
        <span className="quiet-text">Sin warnings de fuente.</span>
      )}
    </article>
  );
}

export default function DashboardPage() {
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
      errors.push("API offline o /health no disponible");
    }
    if (candidates.status === "rejected") {
      errors.push("No se pudieron cargar candidatos");
    }
    if (externalSignals.status === "rejected") {
      errors.push("No se pudieron cargar external signals");
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

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Inteligencia para mercados predictivos</h1>
          <p className="subtitle">
            Dashboard read-only para revisar estado local, mercados candidatos y
            rutas utiles sin ejecutar research, ingestar responses ni crear
            predicciones.
          </p>
        </div>
        <div
          className={`status-pill ${apiOnline ? "status-online" : "status-offline"}`}
          aria-live="polite"
        >
          <span className="status-dot" />
          {state.loading ? "Cargando API" : apiOnline ? "API online" : "API offline"}
        </div>
      </header>

      <section className="safety-strip">
        <strong>Read-only:</strong>
        <span>
          El candidate_score indica prioridad para investigar, no recomendacion
          de apuesta. PolySignal no ejecuta apuestas automaticas. Las imagenes
          aparecen cuando Polymarket o los datos locales las proveen; si no hay
          logo, se usan iniciales o imagen del mercado.
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
          <span>Backend status</span>
          <strong>{state.loading ? "Cargando" : state.health?.status ?? "Offline"}</strong>
          <p>{state.health?.environment ?? "Entorno local pendiente"}</p>
        </article>
        <article className="metric-card">
          <span>Markets overview</span>
          <strong>{marketCount === null ? "N/D" : marketCount}</strong>
          <p>{state.overview ? "Endpoint disponible" : "Sin respuesta del endpoint"}</p>
        </article>
        <article className="metric-card">
          <span>Research candidates</span>
          <strong>{state.loading ? "..." : topCandidates.length}</strong>
          <p>Lectura read-only del selector</p>
        </article>
        <article className="metric-card">
          <span>External signals</span>
          <strong>{state.loading ? "..." : state.externalSignals.length}</strong>
          <p>Senales guardadas localmente; no fetch remoto desde UI</p>
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
          <label htmlFor="sport-filter">Sport</label>
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
          <label htmlFor="shape-filter">Market shape</label>
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
          <label htmlFor="limit-filter">Limit</label>
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
          {state.loading ? "Cargando" : "Refresh"}
        </button>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Top Research Candidates</h2>
              <p>
                Mercados priorizados para investigar. El score mide calidad de
                candidato, no una senal de apuesta.
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

          <div className="signal-strip" aria-label="Distribucion visual de scores">
            {topCandidates.length === 0 ? (
              <span className="empty-inline">Sin candidatos para graficar</span>
            ) : (
              topCandidates.map((candidate) => {
                const score = Math.max(
                  0,
                  Math.min(100, toNumber(candidate.candidate_score) ?? 0),
                );
                return (
                  <div className="signal-item" key={candidate.market_id}>
                    <div className="signal-label">#{candidate.market_id}</div>
                    <div className="signal-track">
                      <span
                        className={`signal-fill ${scoreTone(score)}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <div className="signal-score">{formatScore(score)}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="table-shell">
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Mercado</th>
                  <th>Clasificacion</th>
                  <th>Score</th>
                  <th>Market price</th>
                  <th>Template</th>
                  <th>Reasons / warnings</th>
                </tr>
              </thead>
              <tbody>
                {state.loading ? (
                  <tr>
                    <td colSpan={6}>Cargando candidatos...</td>
                  </tr>
                ) : topCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      No hay candidatos disponibles para estos filtros. Prueba
                      con sport all, market shape all o un limit mayor.
                    </td>
                  </tr>
                ) : (
                  topCandidates.map((candidate) => (
                    <tr key={candidate.market_id}>
                      <td>
                        <div className="market-cell">
                          <CandidateParticipants candidate={candidate} />
                          <strong>{candidate.question}</strong>
                          <span>
                            Market ID {candidate.market_id}
                            {candidate.event_title ? ` | ${candidate.event_title}` : ""}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="badge-row">
                          <span className="badge">{candidate.sport}</span>
                          <span className="badge muted">{candidate.market_shape}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`score-badge ${scoreTone(candidate.candidate_score)}`}>
                          {formatScore(candidate.candidate_score)}
                        </span>
                      </td>
                      <td>
                        <MarketPricePanel candidate={candidate} />
                      </td>
                      <td>
                        <span className="template-chip">
                          {candidate.research_template_name}
                        </span>
                      </td>
                      <td>
                        <div className="reason-list">
                          {candidate.candidate_reasons.length > 0 ? (
                            <span>{candidate.candidate_reasons.slice(0, 2).join(", ")}</span>
                          ) : (
                            <span className="quiet-text">Sin reasons</span>
                          )}
                          {candidate.warnings.length > 0 ? (
                            <strong>{candidate.warnings.slice(0, 2).join(", ")}</strong>
                          ) : (
                            <span className="quiet-text">Sin warnings</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel panel-wide external-panel">
          <div className="panel-heading">
            <div>
              <h2>External Market Signals</h2>
              <p>
                Segunda opinion de mercado usando fuentes externas como Kalshi.
                Son inputs de comparacion, no recomendaciones de apuesta.
              </p>
            </div>
            <a
              className="text-link"
              href={`${API_BASE_URL}/external-signals/kalshi?limit=10`}
              target="_blank"
              rel="noreferrer"
            >
              Ver Kalshi JSON
            </a>
          </div>

          <div className="external-summary-grid">
            <div>
              <span>Total loaded</span>
              <strong>{state.loading ? "..." : state.externalSignals.length}</strong>
            </div>
            <div>
              <span>Matched to candidates</span>
              <strong>{matchedExternalSignals.length}</strong>
            </div>
            <div>
              <span>Unmatched</span>
              <strong>{unmatchedExternalSignals.length}</strong>
            </div>
          </div>

          {state.loading ? (
            <div className="empty-state">Loading external signals...</div>
          ) : state.externalSignals.length === 0 ? (
            <div className="empty-state">
              <strong>No external signals yet</strong>
              <p>
                No hay senales externas guardadas todavia. Para cargar una senal
                Kalshi controlada usa el CLI con limite pequeno y persistencia
                explicita.
              </p>
              <code>
                python -m app.commands.fetch_kalshi_signals --limit 1 --status
                open --persist --json
              </code>
              <span>Solo lectura / sin trading / sin ordenes.</span>
            </div>
          ) : (
            <div className="external-signal-sections">
              {matchedExternalSignals.length > 0 ? (
                <section>
                  <h3>Matched signals</h3>
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
                  Signals loaded but no matches. Las senales actuales no tienen
                  `polymarket_market_id` vinculado a los candidatos visibles.
                </div>
              )}

              {unmatchedExternalSignals.length > 0 ? (
                <section>
                  <h3>Unmatched external signals</h3>
                  <p className="section-note">
                    Estas senales aun no estan vinculadas a un mercado
                    Polymarket. No se asume equivalencia por texto parecido.
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
              <h2>Como leer PolySignal</h2>
              <p>Glosario rapido para interpretar la pantalla.</p>
            </div>
          </div>
          <dl className="definition-list">
            <div>
              <dt>YES price</dt>
              <dd>Precio implicito actual de la opcion Yes en Polymarket.</dd>
            </div>
            <div>
              <dt>NO price</dt>
              <dd>Precio implicito actual de la opcion No cuando existe snapshot.</dd>
            </div>
            <div>
              <dt>candidate_score</dt>
              <dd>Prioridad para investigar. No es recomendacion de apuesta.</dd>
            </div>
            <div>
              <dt>confidence_score</dt>
              <dd>Calidad de evidencia cuando existe research, no probabilidad de ganar.</dd>
            </div>
            <div>
              <dt>edge</dt>
              <dd>Diferencia entre una estimacion PolySignal y el precio del mercado.</dd>
            </div>
            <div>
              <dt>liquidity / volume</dt>
              <dd>Profundidad y actividad del mercado usadas como contexto operativo.</dd>
            </div>
            <div>
              <dt>market_shape</dt>
              <dd>Forma del mercado: championship, match_winner, futures u otra.</dd>
            </div>
            <div>
              <dt>research packet</dt>
              <dd>Paquete read-only para que un agente externo prepare research JSON.</dd>
            </div>
            <div>
              <dt>Quality Gate</dt>
              <dd>Validacion previa a ingestar findings, report y prediction.</dd>
            </div>
            <div>
              <dt>Kalshi implied probability</dt>
              <dd>Probabilidad implicita normalizada desde precios Kalshi.</dd>
            </div>
            <div>
              <dt>Source confidence</dt>
              <dd>Calidad operativa de la fuente externa: spread, volumen y datos.</dd>
            </div>
            <div>
              <dt>Match confidence</dt>
              <dd>Confianza de que una senal externa corresponde al mercado local.</dd>
            </div>
            <div>
              <dt>Spread</dt>
              <dd>Diferencia entre bid y ask. Spread alto reduce confiabilidad.</dd>
            </div>
            <div>
              <dt>Aligned / divergent</dt>
              <dd>Comparacion simple entre Kalshi y Polymarket, no senal de apuesta.</dd>
            </div>
            <div>
              <dt>External signal</dt>
              <dd>Segunda opinion de mercado guardada localmente y mostrada read-only.</dd>
            </div>
          </dl>
        </aside>

        <aside className="panel">
          <div className="panel-heading compact">
            <div>
              <h2>Enlaces rapidos</h2>
              <p>Atajos locales para inspeccion read-only.</p>
            </div>
          </div>
          <nav className="quick-links" aria-label="Enlaces rapidos">
            {quickLinks.map((link) => (
              <a href={link.href} key={link.href} target="_blank" rel="noreferrer">
                <span>{link.label}</span>
                <span aria-hidden="true">Open</span>
              </a>
            ))}
          </nav>
        </aside>
      </section>
    </main>
  );
}
