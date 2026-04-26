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
};

type CandidatesResponse = {
  count: number;
  limit: number;
  candidates: ResearchCandidate[];
};

type DashboardState = {
  health: HealthResponse | null;
  overview: MarketsOverviewResponse | null;
  dashboardMeta: DashboardMetaResponse | null;
  candidates: ResearchCandidate[];
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

function formatScore(value: unknown): string {
  const number = toNumber(value);
  if (number === null) {
    return "N/D";
  }

  return number.toFixed(1);
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
    loading: true,
    error: null,
    updatedAt: null,
  });

  const loadDashboard = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    const candidatesPath = buildCandidatesPath(filters);
    const [health, overview, candidates, dashboardMeta] =
      await Promise.allSettled([
        fetchJson<HealthResponse>("/health"),
        fetchJson<MarketsOverviewResponse>("/markets/overview"),
        fetchJson<CandidatesResponse>(candidatesPath),
        fetchJson<DashboardMetaResponse>("/dashboard/latest/meta"),
      ]);

    const errors: string[] = [];
    if (health.status === "rejected") {
      errors.push("API offline o /health no disponible");
    }
    if (candidates.status === "rejected") {
      errors.push("No se pudieron cargar candidatos");
    }

    setState({
      health: health.status === "fulfilled" ? health.value : null,
      overview: overview.status === "fulfilled" ? overview.value : null,
      dashboardMeta:
        dashboardMeta.status === "fulfilled" ? dashboardMeta.value : null,
      candidates:
        candidates.status === "fulfilled" ? candidates.value.candidates : [],
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
          de apuesta. PolySignal no ejecuta apuestas automaticas.
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
                  <th>YES / NO</th>
                  <th>Profundidad</th>
                  <th>Template</th>
                  <th>Reasons / warnings</th>
                </tr>
              </thead>
              <tbody>
                {state.loading ? (
                  <tr>
                    <td colSpan={7}>Cargando candidatos...</td>
                  </tr>
                ) : topCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      No hay candidatos disponibles para estos filtros. Prueba
                      con sport all, market shape all o un limit mayor.
                    </td>
                  </tr>
                ) : (
                  topCandidates.map((candidate) => (
                    <tr key={candidate.market_id}>
                      <td>
                        <div className="market-cell">
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
                        <div className="stacked-number">
                          <span>YES {formatProbability(candidate.market_yes_price)}</span>
                          <span>NO {formatProbability(candidate.market_no_price)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="stacked-number">
                          <span>Liq. {formatCompact(candidate.liquidity)}</span>
                          <span>Vol. {formatCompact(candidate.volume)}</span>
                        </div>
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
