"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { WATCHLIST_STATUS_LABELS, type WatchlistStatus } from "../lib/watchlist";

type ThemePreference = "light" | "dark";

type BriefingCounts = {
  upcoming_count: number;
  watchlist_count: number;
  unmatched_external_signals_count: number;
  candidates_count: number;
  research_gaps_count: number;
  price_movers_count: number;
};

type BriefingSummary = {
  generated_at: string;
  sport?: string | null;
  days: number;
  limit: number;
  counts: BriefingCounts;
  warnings: string[];
};

type BriefingUpcomingMarket = {
  market_id: number;
  question: string;
  event_title?: string | null;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
  event_time?: string | null;
  market_yes_price?: string | number | null;
  market_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  urgency_score?: string | number | null;
  warnings: string[];
};

type BriefingWatchlistItem = {
  id: number;
  market_id: number;
  question: string;
  status: WatchlistStatus;
  note?: string | null;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
  latest_yes_price?: string | number | null;
  latest_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
};

type BriefingExternalSignal = {
  id: number;
  source: string;
  source_ticker?: string | null;
  title?: string | null;
  yes_probability?: string | number | null;
  source_confidence?: string | number | null;
  match_confidence?: string | number | null;
  warnings?: unknown[] | Record<string, unknown> | null;
  fetched_at?: string | null;
};

type BriefingResearchGap = {
  market_id: number;
  question: string;
  sport?: string | null;
  market_shape?: string | null;
  source_section: string;
  reasons: string[];
};

type BriefingPriceMover = {
  market_id: number;
  question: string;
  sport?: string | null;
  market_shape?: string | null;
  first_yes_price?: string | number | null;
  latest_yes_price?: string | number | null;
  change_yes_abs?: string | number | null;
  change_yes_pct?: string | number | null;
  snapshots_count: number;
  start_time?: string | null;
  end_time?: string | null;
};

type DailyBriefing = {
  summary: BriefingSummary;
  upcoming_markets: BriefingUpcomingMarket[];
  watchlist: BriefingWatchlistItem[];
  unmatched_external_signals: BriefingExternalSignal[];
  research_gaps: BriefingResearchGap[];
  price_movers: BriefingPriceMover[];
};

const THEME_STORAGE_KEY = "polysignal-theme";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const sportOptions = ["all", "nba", "nfl", "mlb", "soccer", "tennis", "mma"];
const dayOptions = [1, 3, 7];

const sportLabels: Record<string, string> = {
  nba: "NBA",
  nfl: "NFL",
  mlb: "MLB",
  soccer: "Fútbol",
  tennis: "Tenis",
  mma: "MMA",
};

const marketShapeLabels: Record<string, string> = {
  match_winner: "Ganador del partido",
  championship: "Campeonato",
  futures: "Futuro",
  player_prop: "Jugador",
  team_prop: "Equipo",
  yes_no_generic: "SÍ/NO",
};

const gapLabels: Record<string, string> = {
  sin_research_runs: "Sin research runs",
  sin_evidencia_guardada: "Sin evidencia guardada",
  sin_reporte_de_prediccion: "Sin reporte de predicción",
};

function applyThemePreference(theme: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function resolveThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
  } catch {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

function formatPercent(value: unknown): string {
  const numberValue = toNumber(value);
  if (numberValue === null) {
    return "—";
  }
  const percent = Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue;
  return `${percent.toFixed(1)}%`;
}

function formatSignedPoints(value: unknown): string {
  const numberValue = toNumber(value);
  if (numberValue === null) {
    return "—";
  }
  const points = Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`;
}

function formatCompact(value: unknown): string {
  const numberValue = toNumber(value);
  if (numberValue === null) {
    return "—";
  }
  return new Intl.NumberFormat("es", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numberValue);
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

function formatSport(value?: string | null): string {
  if (!value) {
    return "Deporte";
  }
  return sportLabels[value] ?? value.replace(/_/g, " ").toUpperCase();
}

function formatMarketShape(value?: string | null): string {
  if (!value) {
    return "Tipo";
  }
  return marketShapeLabels[value] ?? value.replace(/_/g, " ");
}

function formatWarningList(value: BriefingExternalSignal["warnings"]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  return Object.entries(value).map(([key, entry]) => `${key}: ${String(entry)}`);
}

function translateMarketTitleToSpanish(title: string): string {
  const trimmed = title.trim();
  const finals = trimmed.match(/^Will (?:the )?(.+?) win the NBA Finals\??$/i);
  if (finals) {
    return `¿Ganarán los ${finals[1]} las Finales de la NBA?`;
  }
  const beat = trimmed.match(/^Will (?:the )?(.+?) beat (?:the )?(.+?)\??$/i);
  if (beat) {
    return `¿Los ${beat[1]} vencerán a los ${beat[2]}?`;
  }
  const versus = trimmed.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (versus) {
    return `${versus[1]} vs ${versus[2]}`;
  }
  return trimmed;
}

async function fetchDailyBriefing(params: URLSearchParams): Promise<DailyBriefing> {
  const response = await fetch(`${API_BASE_URL}/briefing/daily?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/briefing/daily respondió ${response.status}`);
  }
  return response.json() as Promise<DailyBriefing>;
}

export default function DailyBriefingPage() {
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [sport, setSport] = useState("all");
  const [days, setDays] = useState(3);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolvedTheme = resolveThemePreference();
    setTheme(resolvedTheme);
    applyThemePreference(resolvedTheme);
  }, []);

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      days: String(days),
      limit: "10",
    });
    if (sport !== "all") {
      params.set("sport", sport);
    }
    try {
      setBriefing(await fetchDailyBriefing(params));
    } catch {
      setError("No se pudo cargar el briefing. Revisa que la API esté en línea.");
    } finally {
      setLoading(false);
    }
  }, [days, sport]);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const nextThemeLabel = theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  const summaryCards = useMemo(() => {
    const counts = briefing?.summary.counts;
    return [
      ["Próximos mercados", counts?.upcoming_count ?? 0],
      ["En seguimiento", counts?.watchlist_count ?? 0],
      ["Señales pendientes", counts?.unmatched_external_signals_count ?? 0],
      ["Faltan evidencias", counts?.research_gaps_count ?? 0],
    ] as const;
  }, [briefing]);

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyThemePreference(nextTheme);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {}
      return nextTheme;
    });
  };

  return (
    <main className="dashboard-shell briefing-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Briefing diario</h1>
          <p className="subtitle">
            Resumen operativo para decidir qué mercados revisar. No es recomendación de
            apuesta.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="analysis-link secondary" href="/">
            Volver al dashboard
          </Link>
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
        </div>
      </header>

      <section className="filter-panel briefing-filter-panel" aria-label="Filtros del briefing">
        <label>
          Deporte
          <select value={sport} onChange={(event) => setSport(event.target.value)}>
            {sportOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Todos" : formatSport(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ventana
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {dayOptions.map((option) => (
              <option key={option} value={option}>
                Próximos {option} {option === 1 ? "día" : "días"}
              </option>
            ))}
          </select>
        </label>
        <button className="refresh-button" disabled={loading} onClick={loadBriefing} type="button">
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </section>

      {error ? <div className="alert-panel error">{error}</div> : null}

      <section className="metric-grid" aria-label="Resumen del briefing">
        {summaryCards.map(([label, value]) => (
          <div className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>Para revisar hoy</p>
          </div>
        ))}
      </section>

      <p className="briefing-generated">
        Generado: {briefing ? formatDateTime(briefing.summary.generated_at) : "cargando"}
      </p>

      <div className="briefing-grid">
        <BriefingSection
          emptyCopy="No hay próximos mercados con los filtros actuales."
          items={briefing?.upcoming_markets ?? []}
          loading={loading}
          title="Próximos partidos / mercados cercanos"
        >
          {(item) => (
            <BriefingMarketCard
              key={item.market_id}
              marketId={item.market_id}
              question={item.question}
              sport={item.sport}
              marketShape={item.market_shape}
              closeTime={item.close_time ?? item.event_time}
              metrics={[
                ["SÍ", formatPercent(item.market_yes_price)],
                ["NO", formatPercent(item.market_no_price)],
                ["Liquidez", formatCompact(item.liquidity)],
                ["Cercanía", formatCompact(item.urgency_score)],
              ]}
              warnings={item.warnings}
            />
          )}
        </BriefingSection>

        <BriefingSection
          emptyCopy="No tienes mercados en seguimiento todavía."
          items={briefing?.watchlist ?? []}
          loading={loading}
          title="En seguimiento"
        >
          {(item) => (
            <BriefingMarketCard
              key={item.id}
              marketId={item.market_id}
              question={item.question}
              sport={item.sport}
              marketShape={item.market_shape}
              closeTime={item.close_time}
              metrics={[
                ["Estado", WATCHLIST_STATUS_LABELS[item.status]],
                ["SÍ", formatPercent(item.latest_yes_price)],
                ["Liquidez", formatCompact(item.liquidity)],
                ["Volumen", formatCompact(item.volume)],
              ]}
              note={item.note}
            />
          )}
        </BriefingSection>

        <section className="panel briefing-section">
          <div className="panel-heading compact">
            <div>
              <h2>Señales pendientes de vincular</h2>
              <p>Kalshi u otras fuentes externas guardadas sin mercado Polymarket conectado.</p>
            </div>
            <Link className="analysis-link secondary" href="/external-signals/matches">
              Revisar coincidencias
            </Link>
          </div>
          <div className="briefing-list">
            {loading ? <EmptyState copy="Cargando señales..." /> : null}
            {!loading && briefing?.unmatched_external_signals.length === 0 ? (
              <EmptyState copy="No hay señales pendientes de vincular." />
            ) : null}
            {briefing?.unmatched_external_signals.map((signal) => (
              <article className="briefing-item-card" key={signal.id}>
                <div className="badge-row">
                  <span className="badge">{signal.source.toUpperCase()}</span>
                  <span className="badge muted">{signal.source_ticker ?? "Sin ticker"}</span>
                </div>
                <h3>{signal.title ?? "Señal externa sin título"}</h3>
                <div className="briefing-mini-metrics">
                  <span>SÍ {formatPercent(signal.yes_probability)}</span>
                  <span>Conf. fuente {formatPercent(signal.source_confidence)}</span>
                  <span>{formatDateTime(signal.fetched_at)}</span>
                </div>
                <ChipList items={formatWarningList(signal.warnings)} />
              </article>
            ))}
          </div>
        </section>

        <BriefingSection
          emptyCopy="No hay gaps detectados en los mercados destacados."
          items={briefing?.research_gaps ?? []}
          loading={loading}
          title="Faltan evidencias"
        >
          {(gap) => (
            <BriefingMarketCard
              key={gap.market_id}
              marketId={gap.market_id}
              question={gap.question}
              sport={gap.sport}
              marketShape={gap.market_shape}
              metrics={[
                ["Origen", gap.source_section === "watchlist" ? "Watchlist" : "Próximos"],
              ]}
              warnings={gap.reasons.map((reason) => gapLabels[reason] ?? reason)}
            />
          )}
        </BriefingSection>

        <BriefingSection
          emptyCopy="No hay movimientos relevantes de precio en los mercados destacados."
          items={briefing?.price_movers ?? []}
          loading={loading}
          title="Movimiento de precio"
        >
          {(mover) => (
            <BriefingMarketCard
              key={mover.market_id}
              marketId={mover.market_id}
              question={mover.question}
              sport={mover.sport}
              marketShape={mover.market_shape}
              metrics={[
                ["SÍ inicial", formatPercent(mover.first_yes_price)],
                ["SÍ actual", formatPercent(mover.latest_yes_price)],
                ["Cambio", formatSignedPoints(mover.change_yes_abs)],
                ["Snapshots", String(mover.snapshots_count)],
              ]}
              note={`${formatDateTime(mover.start_time)} → ${formatDateTime(mover.end_time)}`}
            />
          )}
        </BriefingSection>
      </div>

      <section className="safety-strip">
        <strong>No es recomendación de apuesta.</strong>
        <span>
          El briefing solo reorganiza datos guardados para revisión manual. No ejecuta research,
          trading, fetch remoto ni crea predicciones.
        </span>
      </section>
    </main>
  );
}

function BriefingSection<T>({
  children,
  emptyCopy,
  items,
  loading,
  title,
}: {
  children: (item: T) => ReactNode;
  emptyCopy: string;
  items: T[];
  loading: boolean;
  title: string;
}) {
  return (
    <section className="panel briefing-section">
      <div className="panel-heading compact">
        <div>
          <h2>{title}</h2>
          <p>Datos comparativos para priorizar revisión manual.</p>
        </div>
      </div>
      <div className="briefing-list">
        {loading ? <EmptyState copy="Cargando datos..." /> : null}
        {!loading && items.length === 0 ? <EmptyState copy={emptyCopy} /> : null}
        {items.map(children)}
      </div>
    </section>
  );
}

function BriefingMarketCard({
  closeTime,
  marketId,
  marketShape,
  metrics,
  note,
  question,
  sport,
  warnings,
}: {
  closeTime?: string | null;
  marketId: number;
  marketShape?: string | null;
  metrics: Array<[string, string]>;
  note?: string | null;
  question: string;
  sport?: string | null;
  warnings?: string[];
}) {
  return (
    <article className="briefing-item-card">
      <div className="badge-row">
        <span className="badge">#{marketId}</span>
        <span className="badge">{formatSport(sport)}</span>
        <span className="badge muted">{formatMarketShape(marketShape)}</span>
        {closeTime ? <span className="badge muted">{formatDateTime(closeTime)}</span> : null}
      </div>
      <h3>{translateMarketTitleToSpanish(question)}</h3>
      <div className="briefing-mini-metrics">
        {metrics.map(([label, value]) => (
          <span key={`${label}-${value}`}>
            {label}: <strong>{value}</strong>
          </span>
        ))}
      </div>
      {note ? <p className="briefing-note">{note}</p> : null}
      <ChipList items={warnings ?? []} />
      <div className="briefing-card-actions">
        <Link className="analysis-link" href={`/markets/${marketId}`}>
          Ver análisis
        </Link>
      </div>
    </article>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) {
    return null;
  }
  return (
    <div className="reason-list compact">
      {items.slice(0, 4).map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="empty-state compact">
      <strong>{copy}</strong>
    </div>
  );
}
