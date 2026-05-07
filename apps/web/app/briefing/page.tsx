"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  SportsSelectorBar,
  getSportApiFilter,
  isSportBackendEnabled,
} from "../components/SportsSelectorBar";
import { fetchApiJson, friendlyApiError } from "../lib/api";
import { fetchSmartAlerts, type SmartAlert } from "../lib/smartAlerts";
import { WATCHLIST_STATUS_LABELS, type WatchlistStatus } from "../lib/watchlist";

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
  freshness?: MarketFreshness | null;
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

type MarketOverviewBriefingItem = {
  priority_bucket?: string | null;
  priority_rank?: number | null;
  scoring_mode?: string | null;
  market?: {
    id?: number | null;
    question?: string | null;
    event_title?: string | null;
    sport_type?: string | null;
    market_type?: string | null;
    close_time?: string | null;
    end_date?: string | null;
  } | null;
  latest_snapshot?: {
    yes_price?: string | number | null;
    no_price?: string | number | null;
    liquidity?: string | number | null;
    volume?: string | number | null;
    captured_at?: string | null;
  } | null;
  latest_prediction?: {
    action_score?: string | number | null;
    confidence_score?: string | number | null;
  } | null;
};

type MarketOverviewBriefingResponse = {
  total_count?: number;
  items?: MarketOverviewBriefingItem[];
};

type DailyBriefingMarkdownResponse = {
  markdown: string;
};

type MarkdownCopyStatus = "idle" | "copying" | "copied" | "error";

const dayOptions = [1, 3, 7];

const sportLabels: Record<string, string> = {
  nba: "Baloncesto",
  nfl: "NFL",
  nhl: "NHL",
  mlb: "Béisbol",
  baseball: "Béisbol",
  soccer: "Fútbol",
  tennis: "Tenis",
  cricket: "Cricket",
  mma: "UFC",
  ufc: "UFC",
  basketball: "Baloncesto",
  horse_racing: "Carreras de caballos",
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
  sin_research_runs: "Falta contexto",
  sin_evidencia_guardada: "Falta contexto",
  sin_reporte_de_prediccion: "Sin lectura PolySignal",
};

const freshnessStatusLabels: Record<string, string> = {
  stale: "Requiere revisión",
  incomplete: "Datos incompletos",
  unknown: "Frescura desconocida",
  fresh: "Datos frescos",
};

const freshnessActionLabels: Record<string, string> = {
  ok: "OK",
  needs_snapshot: "Necesita actualización",
  review_market: "Revisar mercado",
  exclude_from_scoring: "Dejar en observación",
};

const freshnessReasonLabels: Record<string, string> = {
  missing_snapshot: "Sin actualización reciente",
  missing_prices: "Faltan precios",
  close_time_past: "Cierre pasado",
  close_time_missing: "Sin fecha de cierre",
  snapshot_too_old: "Actualización antigua",
  market_closed: "Mercado cerrado",
  data_quality_insufficient: "Calidad insuficiente",
};

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

function formatSmartAlertSeverity(value: string): string {
  if (value === "critical") {
    return "Crítica";
  }
  if (value === "warning") {
    return "Warning";
  }
  return "Info";
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

function formatFreshnessStatus(value?: string | null): string {
  if (!value) {
    return "Frescura desconocida";
  }
  return freshnessStatusLabels[value] ?? value.replace(/_/g, " ");
}

function formatFreshnessAction(value?: string | null): string {
  if (!value) {
    return "Revisar datos";
  }
  return freshnessActionLabels[value] ?? value.replace(/_/g, " ");
}

function formatFreshnessReason(value: string): string {
  return freshnessReasonLabels[value] ?? value.replace(/_/g, " ");
}

function needsFreshnessReview(item: BriefingUpcomingMarket): boolean {
  const freshness = item.freshness;
  return Boolean(freshness && freshness.freshness_status !== "fresh");
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
  return fetchApiJson<DailyBriefing>(`/briefing/daily?${params.toString()}`);
}

function buildMarketOverviewParams(sport: string): URLSearchParams {
  const params = new URLSearchParams({ limit: "20" });
  const apiSport = getSportApiFilter(sport);
  if (apiSport) {
    params.set("sport_type", apiSport);
  }
  return params;
}

function overviewItemScore(item: MarketOverviewBriefingItem): number {
  return toNumber(item.latest_prediction?.action_score) ?? 0;
}

function overviewItemConfidence(item: MarketOverviewBriefingItem): number | null {
  return toNumber(item.latest_prediction?.confidence_score);
}

function overviewWarnings(item: MarketOverviewBriefingItem): string[] {
  const warnings = new Set<string>();
  if (item.priority_bucket) {
    warnings.add(item.priority_bucket);
  }
  if (item.scoring_mode) {
    warnings.add(item.scoring_mode);
  }
  if (!item.latest_prediction) {
    warnings.add("sin_prediccion");
  }
  const confidence = overviewItemConfidence(item);
  if (confidence !== null && confidence < 0.35) {
    warnings.add("baja_confianza");
  }
  return Array.from(warnings);
}

function buildDerivedBriefing(
  overview: MarketOverviewBriefingResponse,
  days: number,
  sport: string,
): DailyBriefing {
  const items = (overview.items ?? [])
    .filter((item) => item.market?.id)
    .sort((a, b) => overviewItemScore(b) - overviewItemScore(a));
  const upcoming = items.map((item) => {
    const market = item.market;
    const snapshot = item.latest_snapshot ?? {};
    const hasSnapshot = Boolean(item.latest_snapshot);
    return {
      market_id: market?.id ?? 0,
      question: market?.question ?? "Mercado sin titulo",
      event_title: market?.event_title,
      sport: market?.sport_type,
      market_shape: market?.market_type,
      close_time: market?.close_time ?? market?.end_date ?? null,
      event_time: market?.close_time ?? market?.end_date ?? null,
      market_yes_price: snapshot.yes_price,
      market_no_price: snapshot.no_price,
      liquidity: snapshot.liquidity,
      volume: snapshot.volume,
      urgency_score: item.latest_prediction?.action_score ?? item.priority_rank ?? null,
      warnings: overviewWarnings(item),
      freshness: {
        freshness_status: hasSnapshot ? "fresh" : "incomplete",
        reasons: hasSnapshot ? [] : ["missing_snapshot"],
        latest_snapshot_at: snapshot.captured_at,
        close_time: market?.close_time ?? market?.end_date ?? null,
        age_hours: null,
        recommended_action: hasSnapshot ? "ok" : "needs_snapshot",
      },
    } satisfies BriefingUpcomingMarket;
  });
  const gaps = items
    .filter((item) => {
      const confidence = overviewItemConfidence(item);
      return !item.latest_prediction || item.scoring_mode === "fallback_only" ||
        (confidence !== null && confidence < 0.35);
    })
    .slice(0, 8)
    .map((item) => ({
      market_id: item.market?.id ?? 0,
      question: item.market?.question ?? "Mercado sin titulo",
      sport: item.market?.sport_type,
      market_shape: item.market?.market_type,
      source_section: "market_overview",
      reasons: overviewWarnings(item),
    }));

  return {
    summary: {
      generated_at: new Date().toISOString(),
      sport: getSportApiFilter(sport),
      days,
      limit: 20,
      counts: {
        upcoming_count: upcoming.length,
        watchlist_count: 0,
        unmatched_external_signals_count: 0,
        candidates_count: overview.total_count ?? upcoming.length,
        research_gaps_count: gaps.length,
        price_movers_count: 0,
      },
      warnings: ["derivado_desde_market_overview"],
    },
    upcoming_markets: upcoming,
    watchlist: [],
    unmatched_external_signals: [],
    research_gaps: gaps,
    price_movers: [],
  };
}

async function fetchDerivedBriefing(days: number, sport: string): Promise<DailyBriefing> {
  const params = buildMarketOverviewParams(sport);
  const overview = await fetchApiJson<MarketOverviewBriefingResponse>(
    `/markets/overview?${params.toString()}`,
  );
  return buildDerivedBriefing(overview, days, sport);
}

async function fetchDailyBriefingMarkdown(params: URLSearchParams): Promise<string> {
  const payload = await fetchApiJson<DailyBriefingMarkdownResponse>(
    `/briefing/daily/markdown?${params.toString()}`,
  );
  return payload.markdown;
}


function buildDailyBriefingParams(days: number, sport: string): URLSearchParams {
  const params = new URLSearchParams({
    days: String(days),
    limit: "10",
  });
  const apiSport = getSportApiFilter(sport);
  if (apiSport) {
    params.set("sport", apiSport);
  }
  return params;
}

export default function DailyBriefingPage() {
  const [sport, setSport] = useState("all");
  const [days, setDays] = useState(7);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [smartAlerts, setSmartAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [markdownCopyStatus, setMarkdownCopyStatus] = useState<MarkdownCopyStatus>("idle");
  const [markdownFallback, setMarkdownFallback] = useState<string | null>(null);
  const handleSelectSport = useCallback((nextSport: string) => {
    if (!isSportBackendEnabled(nextSport)) {
      return;
    }
    setSport(nextSport);
  }, []);

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourceNote(null);
    setMarkdownFallback(null);
    const params = buildDailyBriefingParams(days, sport);
    const alertSport = getSportApiFilter(sport);
    try {
      const [briefingResult, alertsResult] = await Promise.allSettled([
        fetchDailyBriefing(params),
        fetchSmartAlerts({ limit: 5, sport: alertSport }),
      ]);
      if (briefingResult.status === "fulfilled") {
        setBriefing(briefingResult.value);
      } else {
        const derivedBriefing = await fetchDerivedBriefing(days, sport);
        setBriefing(derivedBriefing);
        setSourceNote(
          "Resumen generado con los mercados visibles disponibles.",
        );
      }
      setSmartAlerts(alertsResult.status === "fulfilled" ? alertsResult.value.alerts : []);
    } catch (error) {
      setError(friendlyApiError(error, "el briefing diario"));
    } finally {
      setLoading(false);
    }
  }, [days, sport]);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const summaryCards = useMemo(() => {
    const counts = briefing?.summary.counts;
    return [
      ["Próximos partidos", counts?.upcoming_count ?? 0],
      ["En seguimiento", counts?.watchlist_count ?? 0],
      ["Señales pendientes", counts?.unmatched_external_signals_count ?? 0],
      ["Faltan evidencias", counts?.research_gaps_count ?? 0],
    ] as const;
  }, [briefing]);
  const staleUpcomingMarkets = useMemo(
    () => (briefing?.upcoming_markets ?? []).filter(needsFreshnessReview).slice(0, 5),
    [briefing],
  );

  const copyMarkdown = useCallback(async () => {
    setMarkdownCopyStatus("copying");
    setMarkdownFallback(null);
    setError(null);
    try {
      const markdown = await fetchDailyBriefingMarkdown(buildDailyBriefingParams(days, sport));
      try {
        await navigator.clipboard.writeText(markdown);
        setMarkdownCopyStatus("copied");
        window.setTimeout(() => setMarkdownCopyStatus("idle"), 2200);
      } catch {
        setMarkdownFallback(markdown);
        setMarkdownCopyStatus("error");
      }
    } catch {
      setMarkdownCopyStatus("error");
      setError("No se pudo preparar el resumen. Intenta actualizar de nuevo.");
    }
  }, [days, sport]);

  return (
    <main className="briefing-page">
      <MainNavigation />
      <header className="topbar briefing-header">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Resumen diario</h1>
          <p className="subtitle">
            Resumen simple centrado en partidos deportivos de los próximos 7
            días. Los campeonatos y futuros quedan fuera del flujo principal por
            ahora; no es recomendación de apuesta.
          </p>
        </div>
      </header>

      <SportsSelectorBar
        activeLabel="Activo"
        description="Selecciona un deporte para filtrar el resumen diario."
        onSelect={handleSelectSport}
        selectedSport={sport}
      />

      <section className="filter-panel briefing-filter-panel" aria-label="Filtros del resumen diario">
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
        <button
          className="refresh-button briefing-copy-button"
          disabled={loading || markdownCopyStatus === "copying"}
          onClick={copyMarkdown}
          type="button"
        >
          {markdownCopyStatus === "copying"
            ? "Copiando..."
            : markdownCopyStatus === "copied"
              ? "Copiado"
              : "Copiar resumen"}
        </button>
      </section>

      <section className="safety-strip briefing-focus-note">
        <strong>Enfoque temporal:</strong>
        <span>
          El briefing se enfoca en partidos próximos. Mercados de campeonato y
          futuros quedan fuera del flujo principal por ahora.
        </span>
      </section>

      {error ? <div className="alert-panel error">{error}</div> : null}

      {sourceNote ? (
        <section className="safety-strip briefing-focus-note">
          <strong>Mercados visibles:</strong>
          <span>{sourceNote}</span>
        </section>
      ) : null}

      {markdownFallback ? (
        <section className="panel briefing-markdown-fallback" aria-label="Texto del resumen diario">
          <div className="panel-heading compact">
            <div>
              <h2>Copia manual del resumen</h2>
              <p>El portapapeles no estuvo disponible. Puedes seleccionar el texto.</p>
            </div>
          </div>
          <textarea readOnly value={markdownFallback} />
        </section>
      ) : null}

      <section className="briefing-summary-grid" aria-label="Resumen del briefing">
        {summaryCards.map(([label, value]) => (
          <div className="briefing-summary-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>Para revisar hoy</p>
          </div>
        ))}
      </section>

      <p className="briefing-generated">
        Generado: {briefing ? formatDateTime(briefing.summary.generated_at) : "cargando"}
      </p>

      <section className="panel briefing-section">
        <div className="panel-heading compact">
          <div>
            <h2>Alertas del día</h2>
            <p>Recordatorios operativos; no son recomendaciones de apuesta.</p>
          </div>
        </div>
        <div className="briefing-list">
          {loading ? <EmptyState copy="Cargando alertas..." /> : null}
          {!loading && smartAlerts.length === 0 ? (
            <EmptyState copy="No hay alertas operativas con los filtros actuales." />
          ) : null}
          {smartAlerts.map((alert) => (
            <article className={`briefing-card briefing-alert-card ${alert.severity}`} key={alert.id}>
              <div className="badge-row">
                <span className="badge muted">{formatSmartAlertSeverity(alert.severity)}</span>
                <span className="badge">{alert.type.replace(/_/g, " ")}</span>
              </div>
              <h3>{alert.title}</h3>
              <p className="briefing-note">{alert.description}</p>
              {alert.action_url ? (
                <div className="briefing-card-actions">
                  <Link className="analysis-link" href={alert.action_url}>
                    {alert.action_label ?? "Revisar"}
                  </Link>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {false ? (
        <section className="panel briefing-section">
          <div className="panel-heading compact">
            <div>
              <h2>Mercados que requieren revisión de datos</h2>
              <p>
                Señales internas de frescura; PolySignal no inventa precios ni
                probabilidades cuando faltan datos.
              </p>
            </div>
          </div>
          <div className="briefing-list">
            {staleUpcomingMarkets.map((item) => (
              <BriefingMarketCard
                key={`freshness-${item.market_id}`}
                marketId={item.market_id}
                question={item.question}
                sport={item.sport}
                marketShape={item.market_shape}
                closeTime={item.freshness?.close_time ?? item.close_time ?? item.event_time}
                metrics={[
                  ["Estado", formatFreshnessStatus(item.freshness?.freshness_status)],
                  ["Acción", formatFreshnessAction(item.freshness?.recommended_action)],
                  ["Snapshot", formatDateTime(item.freshness?.latest_snapshot_at)],
                ]}
                warnings={(item.freshness?.reasons ?? []).map(formatFreshnessReason)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="briefing-grid">
        <BriefingSection
          emptyCopy="No hay partidos próximos con los filtros actuales."
          items={briefing?.upcoming_markets ?? []}
          loading={loading}
          title="Próximos partidos para analizar"
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

        {false ? (
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
              <article className="briefing-card" key={signal.id}>
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
        ) : null}

        {false ? (
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
        ) : null}

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
                ["Actualizaciones", String(mover.snapshots_count)],
              ]}
              note={`${formatDateTime(mover.start_time)} → ${formatDateTime(mover.end_time)}`}
            />
          )}
        </BriefingSection>
      </div>

      <section className="safety-strip">
        <strong>No es recomendación de apuesta.</strong>
        <span>
          El resumen diario solo reorganiza mercados disponibles para revisión manual.
          No ejecuta apuestas automáticas.
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
    <article className="briefing-card">
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
    <div className="empty-state compact briefing-empty">
      <strong>{copy}</strong>
    </div>
  );
}
