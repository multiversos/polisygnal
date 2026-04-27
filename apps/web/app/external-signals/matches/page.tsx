"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  mid_price?: string | number | null;
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

type MatchAction = "would_link" | "review_required" | "no_match";

type MatchCandidate = {
  market_id: number;
  market_question: string;
  sport?: string | null;
  market_shape?: string | null;
  match_confidence: string | number;
  match_reason: string;
  warnings: string[];
  action: MatchAction;
};

type MatchCandidatesResponse = {
  signal_id: number;
  source: string;
  source_ticker?: string | null;
  signal_title?: string | null;
  thresholds: {
    auto_link: string | number;
    review_min: string | number;
  };
  candidates: MatchCandidate[];
};

type LoadState = {
  signals: ExternalMarketSignal[];
  selectedSignalId: number | null;
  matchResponse: MatchCandidatesResponse | null;
  loadingSignals: boolean;
  loadingCandidates: boolean;
  error: string | null;
  candidateError: string | null;
};

type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "polysignal-theme";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

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

const warningLabels: Record<string, string> = {
  multivariate_external_market: "mercado externo multivariable",
  year_mismatch: "año diferente",
  sport_mismatch: "deporte diferente",
  review_required: "requiere revisión",
  ambiguous_title: "título ambiguo",
  participant_mismatch: "participantes distintos",
  participants_not_detected: "participantes no detectados",
  weak_title_overlap: "coincidencia textual débil",
  missing_market_title: "mercado sin título",
  missing_external_title: "señal externa sin título",
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

function applyStoredThemePreference() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  let theme: ThemePreference = "light";
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      theme = storedTheme;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch {
    theme = "light";
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
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

function humanizeToken(value?: string | null): string {
  return value?.replaceAll("_", " ").replaceAll("-", " ").trim() || "N/D";
}

function formatSportLabel(value?: string | null): string {
  return value ? sportLabels[value] ?? humanizeToken(value) : "deporte no definido";
}

function formatMarketShapeLabel(value?: string | null): string {
  return value ? marketShapeLabels[value] ?? humanizeToken(value) : "tipo no definido";
}

function formatWarningLabel(value: string): string {
  return warningLabels[value] ?? humanizeToken(value);
}

function formatSourceLabel(value?: string | null): string {
  if (!value) {
    return "Fuente externa";
  }
  return value.toLowerCase() === "kalshi" ? "Kalshi" : humanizeToken(value);
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

  const matchWinner = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+beat\s+(the\s+)?(.+?)\?$/i);
  if (matchWinner) {
    const subject = spanishTeamSubject(matchWinner[2].trim(), Boolean(matchWinner[1]));
    const object = spanishTeamSubject(matchWinner[4].trim(), Boolean(matchWinner[3]));
    const verb = subject.startsWith("los ") ? "vencerán" : "vencerá";
    return ensureSpanishQuestion(`${subject[0].toUpperCase()}${subject.slice(1)} ${verb} a ${object}`);
  }

  const winMarket = trimmed.match(/^Will\s+(the\s+)?(.+?)\s+win\s+the\s+(.+?)\?$/i);
  if (winMarket) {
    const subject = spanishTeamSubject(winMarket[2].trim(), Boolean(winMarket[1]));
    const verb = subject.startsWith("los ") ? "Ganarán" : "Ganará";
    return ensureSpanishQuestion(`${verb} ${subject} ${translateCompetitionName(winMarket[3])}`);
  }

  return trimmed;
}

function actionLabel(action: MatchAction): string {
  if (action === "would_link") {
    return "Vinculable";
  }
  if (action === "review_required") {
    return "Requiere revisión";
  }
  return "No vincular";
}

function actionClass(action: MatchAction): string {
  if (action === "would_link") {
    return "would-link";
  }
  if (action === "review_required") {
    return "review-required";
  }
  return "no-match";
}

function confidenceWidth(value: unknown): number {
  const probability = normalizeProbability(value);
  return probability === null ? 0 : Math.max(0, Math.min(100, probability * 100));
}

export default function ExternalSignalMatchReviewPage() {
  const [state, setState] = useState<LoadState>({
    signals: [],
    selectedSignalId: null,
    matchResponse: null,
    loadingSignals: true,
    loadingCandidates: false,
    error: null,
    candidateError: null,
  });

  useEffect(() => {
    applyStoredThemePreference();
  }, []);

  const loadCandidates = useCallback(async (signalId: number) => {
    setState((current) => ({
      ...current,
      selectedSignalId: signalId,
      loadingCandidates: true,
      candidateError: null,
      matchResponse: null,
    }));
    try {
      const response = await fetchJson<MatchCandidatesResponse>(
        `/external-signals/${signalId}/match-candidates?limit=5`,
      );
      setState((current) => ({
        ...current,
        matchResponse: response,
        loadingCandidates: false,
        candidateError: null,
      }));
    } catch {
      setState((current) => ({
        ...current,
        matchResponse: null,
        loadingCandidates: false,
        candidateError: "No se pudieron cargar candidatos para esta senal.",
      }));
    }
  }, []);

  const loadSignals = useCallback(async () => {
    setState((current) => ({
      ...current,
      loadingSignals: true,
      error: null,
      candidateError: null,
    }));
    try {
      const response = await fetchJson<ExternalSignalsResponse>(
        "/external-signals/unmatched?source=kalshi&limit=10",
      );
      const firstSignal = response.signals[0] ?? null;
      setState((current) => ({
        ...current,
        signals: response.signals,
        selectedSignalId: firstSignal?.id ?? null,
        loadingSignals: false,
        error: null,
      }));
      if (firstSignal) {
        await loadCandidates(firstSignal.id);
      } else {
        setState((current) => ({ ...current, matchResponse: null }));
      }
    } catch {
      setState((current) => ({
        ...current,
        signals: [],
        selectedSignalId: null,
        matchResponse: null,
        loadingSignals: false,
        error: `No se pudieron cargar senales pendientes desde ${API_BASE_URL}.`,
      }));
    }
  }, [loadCandidates]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  const selectedSignal = useMemo(
    () => state.signals.find((signal) => signal.id === state.selectedSignalId) ?? null,
    [state.selectedSignalId, state.signals],
  );

  return (
    <main className="dashboard-shell analysis-shell match-review-shell">
      <header className="analysis-topbar">
        <Link className="text-link" href="/">
          Volver al dashboard
        </Link>
        <div className="topbar-actions">
          <a className="text-link" href={`${API_BASE_URL}/external-signals/unmatched?source=kalshi&limit=10`} target="_blank" rel="noreferrer">
            Ver JSON pendientes
          </a>
          <a className="text-link" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>
      </header>

      <section className="analysis-hero match-review-hero">
        <div>
          <p className="eyebrow">Kalshi ↔ Polymarket</p>
          <h1>Revisión de coincidencias Kalshi</h1>
          <p className="subtitle">
            Vista read-only para revisar posibles vínculos entre señales externas
            guardadas y mercados Polymarket. No aplica matches, no consulta Kalshi
            en vivo y no ejecuta trading.
          </p>
        </div>
        <div className="match-threshold-grid" aria-label="Thresholds de matching">
          <div>
            <span>0.80 o más</span>
            <strong>Vinculable</strong>
          </div>
          <div>
            <span>0.60 - 0.79</span>
            <strong>Revisión humana</strong>
          </div>
          <div>
            <span>Menos de 0.60</span>
            <strong>No vincular</strong>
          </div>
        </div>
      </section>

      <section className="safety-strip">
        <strong>Solo revisión:</strong>
        <span>
          Esta vista solo ayuda a revisar coincidencias. No vincula señales
          automáticamente, no crea research_runs, no crea predicciones y no
          ejecuta apuestas.
        </span>
      </section>

      {state.error ? (
        <section className="alert-panel" role="status">
          <strong>API desconectada</strong>
          <span>{state.error}</span>
        </section>
      ) : null}

      <section className="match-review-layout">
        <aside className="analysis-section match-signal-panel">
          <div className="analysis-section-heading">
            <div>
              <span className="section-kicker">Pendientes</span>
              <h2>Señales pendientes de vincular</h2>
            </div>
            <button className="refresh-button compact-button" type="button" onClick={() => void loadSignals()}>
              Actualizar
            </button>
          </div>

          {state.loadingSignals ? (
            <div className="empty-state">Cargando señales pendientes...</div>
          ) : state.signals.length === 0 ? (
            <div className="empty-state">
              <strong>No hay senales pendientes.</strong>
              <p>
                Las señales Kalshi guardadas ya están vinculadas o no hay datos
                externos cargados localmente.
              </p>
            </div>
          ) : (
            <div className="match-signal-list">
              {state.signals.map((signal) => {
                const warnings = externalWarnings(signal.warnings);
                const selected = signal.id === state.selectedSignalId;
                return (
                  <button
                    className={`match-signal-card ${selected ? "selected" : ""}`}
                    key={signal.id}
                    onClick={() => void loadCandidates(signal.id)}
                    type="button"
                  >
                    <span className="badge source-badge">{formatSourceLabel(signal.source)}</span>
                    <strong>{signal.title || signal.source_ticker || `Senal #${signal.id}`}</strong>
                    <span>{signal.source_ticker || signal.source_market_id || "Ticker no disponible"}</span>
                    <div className="match-signal-metrics">
                      <span>Prob. SÍ {formatProbability(signal.yes_probability ?? signal.mid_price)}</span>
                      <span>Conf. fuente {formatProbability(signal.source_confidence)}</span>
                      <span>{formatDateTime(signal.fetched_at)}</span>
                    </div>
                    {warnings.length > 0 ? (
                      <div className="warning-list">
                        {warnings.slice(0, 3).map((warning) => (
                          <span key={`${signal.id}-${warning}`}>{formatWarningLabel(warning)}</span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="analysis-section match-candidate-panel">
          <div className="analysis-section-heading">
            <div>
              <span className="section-kicker">Candidatos</span>
              <h2>Candidatos Polymarket propuestos</h2>
            </div>
            {selectedSignal ? (
              <span className="badge muted">Señal #{selectedSignal.id}</span>
            ) : null}
          </div>

          {selectedSignal ? (
            <div className="match-selected-signal">
              <span className="badge source-badge">{formatSourceLabel(selectedSignal.source)}</span>
              <strong>{selectedSignal.title || selectedSignal.source_ticker}</strong>
              <p>
                {selectedSignal.source_ticker || "Ticker no disponible"} · Prob. SÍ{" "}
                {formatProbability(selectedSignal.yes_probability ?? selectedSignal.mid_price)} ·
                Conf. fuente {formatProbability(selectedSignal.source_confidence)}
              </p>
            </div>
          ) : null}

          {state.loadingCandidates ? (
            <div className="empty-state">Calculando candidatos de match...</div>
          ) : state.candidateError ? (
            <div className="alert-panel" role="status">
              <strong>Error</strong>
              <span>{state.candidateError}</span>
            </div>
          ) : !selectedSignal ? (
            <div className="empty-state">Selecciona una señal pendiente para revisar candidatos.</div>
          ) : state.matchResponse && state.matchResponse.candidates.length > 0 ? (
            <div className="match-candidate-list">
              {state.matchResponse.candidates.map((candidate) => {
                const width = confidenceWidth(candidate.match_confidence);
                const translatedTitle = translateMarketTitleToSpanish(candidate.market_question);
                return (
                  <article className="match-candidate-card" key={candidate.market_id}>
                    <div className="match-candidate-header">
                      <div>
                        <div className="badge-row">
                          <span className="candidate-id">#{candidate.market_id}</span>
                          <span className="badge">{formatSportLabel(candidate.sport)}</span>
                          <span className="badge muted">{formatMarketShapeLabel(candidate.market_shape)}</span>
                        </div>
                        <h3 title={candidate.market_question}>{translatedTitle}</h3>
                      </div>
                      <span className={`match-action-badge ${actionClass(candidate.action)}`}>
                        {actionLabel(candidate.action)}
                      </span>
                    </div>

                    <div className="match-confidence-row">
                      <span>Confianza de coincidencia</span>
                      <strong>{formatProbability(candidate.match_confidence)}</strong>
                      <div className="match-confidence-track">
                        <span className={`match-confidence-fill ${actionClass(candidate.action)}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>

                    <p className="match-reason">Motivo: {candidate.match_reason}</p>

                    {candidate.warnings.length > 0 ? (
                      <div className="warning-list">
                        {candidate.warnings.map((warning) => (
                          <span key={`${candidate.market_id}-${warning}`}>{formatWarningLabel(warning)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="quiet-text">Sin advertencias del matcher.</span>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Sin candidatos disponibles.</strong>
              <p>
                No hay mercados Polymarket locales para comparar o el matcher no
                encontró candidatos para esta señal.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
