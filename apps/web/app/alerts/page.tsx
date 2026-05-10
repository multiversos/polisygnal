"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson } from "../lib/api";
import {
  fetchSmartAlerts,
  type SmartAlert,
  type SmartAlertSeverity,
} from "../lib/smartAlerts";
import { formatLastUpdated, useAutoRefresh } from "../lib/useAutoRefresh";
import {
  WATCHLIST_STORAGE_EVENT,
  fetchWatchlistItems,
  removeWatchlistItem,
  type WatchlistItem,
} from "../lib/watchlist";

type MarketOverviewAlertItem = {
  priority_bucket?: string | null;
  scoring_mode?: string | null;
  evidence_summary?: {
    evidence_count?: number | null;
  } | null;
  market?: {
    id?: number | null;
    question?: string | null;
    sport_type?: string | null;
    close_time?: string | null;
    end_date?: string | null;
  } | null;
  latest_snapshot?: {
    captured_at?: string | null;
  } | null;
  latest_prediction?: {
    confidence_score?: string | number | null;
  } | null;
};

type MarketOverviewAlertsResponse = {
  items?: MarketOverviewAlertItem[];
};

const severityLabels: Record<SmartAlertSeverity, string> = {
  info: "Info",
  warning: "Atención",
  critical: "Crítica",
};

const severityOptions: Array<{ value: SmartAlertSeverity | ""; label: string }> = [
  { value: "", label: "Todas" },
  { value: "critical", label: "Crítica" },
  { value: "warning", label: "Atención" },
  { value: "info", label: "Info" },
];

const sportOptions = [
  { value: "", label: "Todos" },
  { value: "basketball", label: "Baloncesto" },
  { value: "nfl", label: "NFL" },
  { value: "soccer", label: "Fútbol" },
  { value: "tennis", label: "Tenis" },
  { value: "baseball", label: "Béisbol" },
  { value: "horse_racing", label: "Carreras de caballos" },
  { value: "ufc", label: "UFC (próximamente)", disabled: true },
  { value: "cricket", label: "Críquet (próximamente)", disabled: true },
  { value: "nhl", label: "NHL / Hockey (próximamente)", disabled: true },
];

const typeLabels: Record<string, string> = {
  missing_data: "Información pendiente",
  no_prediction: "Sin análisis",
  price_move: "Cambio importante",
  upcoming_close_soon: "Revisar después",
  external_signal_unmatched: "Contexto pendiente",
  low_data_quality: "Datos limitados",
  no_research: "Falta contexto",
  watchlist_needs_review: "Mi lista requiere revisión",
};

function formatDate(value?: string | null): string {
  if (!value) {
    return "N/D";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatAlertType(value: string): string {
  return publicAlertText(typeLabels[value] ?? value.replaceAll("_", " "));
}

function publicAlertText(value?: string | null): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/\bmissing[_ ]latest[_ ]snapshots?\b/gi, "sin precio reciente")
    .replace(/\bmissing[_ ]snapshots?\b/gi, "sin precio reciente")
    .replace(/\blatest[_ ]snapshots?\b/gi, "precio reciente")
    .replace(/\bsnapshots?\b/gi, "precios recientes")
    .replace(/\bscoring[_ ]mode\b/gi, "lectura")
    .replace(/\bscore\b/gi, "señal")
    .replace(/\bfallback\b/gi, "datos limitados")
    .replace(/\bmarket[_ ]?overview\b/gi, "mercados visibles")
    .replace(/\bapi\b/gi, "servicio")
    .replace(/\bbackend\b/gi, "servicio")
    .replace(/\bjson\b/gi, "datos")
    .replace(/\bproxy\b/gi, "conexión")
    .replace(/\be2e\b/gi, "prueba")
    .replace(/\bdebug\b/gi, "revisión")
    .replace(/\bpipeline\b/gi, "proceso")
    .replace(/\bmarket_type\b/gi, "tipo de mercado");
}

function formatAlertSource(value?: string | null): string {
  if (!value) {
    return "mercados visibles";
  }
  if (value.includes("market_overview") || value.includes("overview")) {
    return "mercados visibles";
  }
  if (value.includes("smart") || value.includes("alert")) {
    return "alertas de PolySignal";
  }
  return "mercados visibles";
}

function buildActionHref(alert: SmartAlert): string | null {
  if (alert.action_url) {
    return alert.action_url;
  }
  if (alert.market_id) {
    return `/markets/${alert.market_id}`;
  }
  return null;
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

function hoursUntil(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return (date.getTime() - Date.now()) / 36e5;
}

function updatedRecently(value?: string | null): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const ageMs = Date.now() - parsed;
  return ageMs >= 0 && ageMs <= 48 * 60 * 60 * 1000;
}

async function fetchMarketOverviewAlerts(sport: string): Promise<MarketOverviewAlertsResponse> {
  const params = new URLSearchParams({ limit: "50" });
  if (sport) {
    params.set("sport_type", sport);
  }
  return fetchApiJson<MarketOverviewAlertsResponse>(`/markets/overview?${params.toString()}`);
}

function buildDerivedAlertCounts(alerts: SmartAlert[]): Record<string, number> {
  return alerts.reduce<Record<string, number>>((counts, alert) => {
    counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
    return counts;
  }, {});
}

function deriveAlertsFromOverview(overview: MarketOverviewAlertsResponse): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  for (const item of overview.items ?? []) {
    const marketId = item.market?.id;
    if (!marketId) {
      continue;
    }
    const question = item.market?.question ?? `Mercado #${marketId}`;
    const base = {
      market_id: marketId,
      action_label: "Ver análisis",
      action_url: `/markets/${marketId}`,
      data: {},
    };
    if (updatedRecently(item.latest_snapshot?.captured_at)) {
      alerts.push({
        ...base,
        id: `derived-updated-${marketId}`,
        type: "price_move",
        severity: "info",
        title: "Mercado actualizado",
        description: question,
        reason: "Recibió información nueva recientemente.",
        created_from: "market_overview",
      });
    }
    if (item.latest_prediction) {
      alerts.push({
        ...base,
        id: `derived-ready-${marketId}`,
        type: "watchlist_needs_review",
        severity: "info",
        title: "Listo para revisar",
        description: question,
        reason: "Tiene análisis disponible para una lectura inicial.",
        created_from: "market_overview",
      });
    }
    if (!item.latest_prediction) {
      alerts.push({
        ...base,
        id: `derived-no-prediction-${marketId}`,
        type: "missing_data",
        severity: "critical",
        title: "Mercado sin análisis",
        description: question,
        reason: "Todavía no hay análisis disponible para este mercado.",
        created_from: "market_overview",
      });
    }
    if (!item.latest_snapshot) {
      alerts.push({
        ...base,
        id: `derived-no-snapshot-${marketId}`,
        type: "missing_data",
        severity: "warning",
        title: "Mercado sin precio reciente",
        description: question,
        reason: "Todavía falta un precio reciente para revisarlo con confianza.",
        created_from: "market_overview",
      });
    }
    if (item.scoring_mode === "fallback_only") {
      alerts.push({
        ...base,
        id: `derived-fallback-${marketId}`,
        type: "low_data_quality",
        severity: "warning",
        title: "Datos limitados",
        description: question,
        reason: "La lectura disponible es limitada.",
        created_from: "market_overview",
      });
    }
    const confidence = toNumber(item.latest_prediction?.confidence_score);
    if (confidence !== null && confidence < 0.35) {
      alerts.push({
        ...base,
        id: `derived-low-confidence-${marketId}`,
        type: "low_data_quality",
        severity: "warning",
        title: "Baja confianza",
        description: question,
        reason: "La confianza del modelo esta por debajo del umbral conservador.",
        created_from: "market_overview",
      });
    }
    const closeHours = hoursUntil(item.market?.close_time ?? item.market?.end_date);
    if (closeHours !== null && closeHours >= 0 && closeHours <= 48) {
      alerts.push({
        ...base,
        id: `derived-close-${marketId}`,
        type: "upcoming_close_soon",
        severity: "info",
        title: "Cierre próximo",
        description: question,
        reason: `Cierra en ${closeHours.toFixed(1)} horas.`,
        created_from: "market_overview",
      });
    }
    if ((item.evidence_summary?.evidence_count ?? 0) === 0) {
      alerts.push({
        ...base,
        id: `derived-no-evidence-${marketId}`,
        type: "no_research",
        severity: "info",
        title: "Falta contexto",
        description: question,
        reason: "Todavía falta contexto adicional para revisar este mercado.",
        created_from: "market_overview",
      });
    }
  }
  return alerts.slice(0, 50);
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SmartAlertSeverity | "">("");
  const [sport, setSport] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistBusyItemId, setWatchlistBusyItemId] = useState<number | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourceNote(null);
    try {
      const localWatchlist = await fetchWatchlistItems();
      setWatchlistItems(localWatchlist);
      const response = await fetchSmartAlerts({
        limit: 50,
        severity: severity || null,
        sport: sport || null,
      });
      if (response.alerts.length > 0) {
        setAlerts(response.alerts);
        setCounts(response.counts);
        setGeneratedAt(response.generated_at);
        setUpdatedAt(new Date());
      } else {
        const overview = await fetchMarketOverviewAlerts(sport);
        const derivedAlerts = deriveAlertsFromOverview(overview).filter((alert) =>
          severity ? alert.severity === severity : true,
        );
        setAlerts(derivedAlerts);
        setCounts(buildDerivedAlertCounts(derivedAlerts));
        setGeneratedAt(new Date().toISOString());
        setUpdatedAt(new Date());
        setSourceNote("Alertas generadas con los mercados visibles disponibles.");
      }
    } catch {
      try {
        const localWatchlist = await fetchWatchlistItems();
        setWatchlistItems(localWatchlist);
        const overview = await fetchMarketOverviewAlerts(sport);
        const derivedAlerts = deriveAlertsFromOverview(overview).filter((alert) =>
          severity ? alert.severity === severity : true,
        );
        setAlerts(derivedAlerts);
        setCounts(buildDerivedAlertCounts(derivedAlerts));
        setGeneratedAt(new Date().toISOString());
        setUpdatedAt(new Date());
        setSourceNote(
          "Alertas generadas con los mercados visibles disponibles.",
        );
      } catch {
        setError("No pudimos actualizar las alertas ahora. Mostramos lo último disponible.");
        setUpdatedAt((current) => current ?? new Date());
      }
    } finally {
      setLoading(false);
    }
  }, [severity, sport]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);
  useAutoRefresh(loadAlerts);

  useEffect(() => {
    const syncWatchlist = () => {
      void fetchWatchlistItems().then(setWatchlistItems);
    };
    window.addEventListener(WATCHLIST_STORAGE_EVENT, syncWatchlist);
    window.addEventListener("storage", syncWatchlist);
    return () => {
      window.removeEventListener(WATCHLIST_STORAGE_EVENT, syncWatchlist);
      window.removeEventListener("storage", syncWatchlist);
    };
  }, []);

  const alertTypes = useMemo(() => {
    return Array.from(new Set(alerts.map((alert) => alert.type))).sort();
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    if (!typeFilter) {
      return alerts;
    }
    return alerts.filter((alert) => alert.type === typeFilter);
  }, [alerts, typeFilter]);

  const handleRemoveWatchlistItem = useCallback(async (itemId: number) => {
    setWatchlistBusyItemId(itemId);
    setWatchlistError(null);
    try {
      await removeWatchlistItem(itemId);
      setWatchlistItems((current) => current.filter((item) => item.id !== itemId));
      setUpdatedAt(new Date());
    } catch {
      setWatchlistError("No pudimos quitar este mercado ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setWatchlistBusyItemId(null);
    }
  }, []);

  return (
    <main className="dashboard-shell alerts-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Alertas inteligentes</h1>
          <p className="subtitle">
            Recordatorios simples para revisar mercados. No son recomendaciones de
            apuesta.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadAlerts()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo revisión:</strong>
        <span>
          Las alertas son recordatorios de revisión. No ejecutan apuestas automáticas.
        </span>
      </section>

      <section className="safety-strip">
        <strong>Cómo leer estas alertas:</strong>
        <span>
          Por ahora mostramos avisos básicos según los mercados que sigues y la
          actividad disponible. Si no sigues mercados, la bandeja puede estar
          tranquila.
        </span>
      </section>

      <section className="filter-panel alerts-filter-panel" aria-label="Filtros de alertas">
        <label className="filter-group">
          Severidad
          <select
            onChange={(event) => setSeverity(event.target.value as SmartAlertSeverity | "")}
            value={severity}
          >
            {severityOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          Deporte
          <select onChange={(event) => setSport(event.target.value)} value={sport}>
            {sportOptions.map((option) => (
              <option
                disabled={"disabled" in option ? option.disabled : false}
                key={option.value || "all"}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          Tipo
          <select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
            <option value="">Todos</option>
            {alertTypes.map((type) => (
              <option key={type} value={type}>
                {formatAlertType(type)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="metric-grid" aria-label="Resumen de alertas">
        <article className="metric-card">
          <span>Críticas</span>
          <strong>{loading ? "..." : counts.critical ?? 0}</strong>
          <p>Revisar primero</p>
        </article>
        <article className="metric-card">
          <span>Atención</span>
          <strong>{loading ? "..." : counts.warning ?? 0}</strong>
          <p>Revisar durante el día</p>
        </article>
        <article className="metric-card">
          <span>Info</span>
          <strong>{loading ? "..." : counts.info ?? 0}</strong>
          <p>Contexto útil</p>
        </article>
        <article className="metric-card">
          <span>Generado</span>
          <strong>{loading ? "..." : formatDate(generatedAt)}</strong>
          <p>Desde datos locales existentes</p>
        </article>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>Alertas no disponibles</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {sourceNote ? (
        <section className="safety-strip">
          <strong>Mercados visibles:</strong>
          <span>{sourceNote}</span>
        </section>
      ) : null}

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Mi lista</p>
            <h2>Mercados que sigues</h2>
            <p>
              Aquí aparecerán avisos importantes de los mercados que guardes en
              este navegador.
            </p>
          </div>
          <span className="badge muted">{watchlistItems.length} guardados</span>
        </div>
        {watchlistItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>No tienes mercados en seguimiento todavía.</strong>
            <p>Guarda un mercado para revisarlo más rápido desde Alertas.</p>
            <a className="analysis-link" href="/sports/soccer">
              Ver fútbol
            </a>
          </div>
        ) : (
          <div className="alerts-list">
            {watchlistError ? (
              <div className="alert-panel compact" role="status">
                <strong>No se pudo actualizar Mi lista</strong>
                <span>{watchlistError}</span>
              </div>
            ) : null}
            {watchlistItems.slice(0, 6).map((item) => (
              <article className="alert-review-card severity-info" key={item.id}>
                <div className="alert-review-header">
                  <span className="badge severity-badge info">Mercado en seguimiento</span>
                  <span className="badge muted">{item.sport ?? "Deporte"}</span>
                </div>
                <h3>{item.market_question}</h3>
                <p>
                  Revisar este mercado. Última actividad local{" "}
                  {formatDate(item.updated_at)}.
                </p>
                <p className="section-note">
                  Si vemos una actualización confiable, aparecerá como Mercado actualizado.
                </p>
                <div className="watchlist-actions">
                  <a className="analysis-link" href={`/markets/${item.market_id}`}>
                    Ver detalle
                  </a>
                  <button
                    className="watchlist-button danger"
                    disabled={watchlistBusyItemId === item.id}
                    onClick={() => void handleRemoveWatchlistItem(item.id)}
                    type="button"
                  >
                    {watchlistBusyItemId === item.id ? "Quitando" : "Quitar de Mi lista"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisión</p>
            <h2>Alertas del día</h2>
          </div>
          <span className="badge muted">{visibleAlerts.length} alertas</span>
        </div>

        {loading ? (
          <div className="empty-state">Cargando alertas...</div>
      ) : visibleAlerts.length === 0 ? (
        <div className="empty-state">
            <strong>No hay alertas importantes por ahora.</strong>
            <p>Mientras tanto puedes revisar los mercados deportivos disponibles.</p>
            <a className="analysis-link" href="/sports">
              Explorar mercados deportivos
            </a>
        </div>
      ) : (
          <div className="alerts-list">
            {visibleAlerts.map((alert) => {
              const actionHref = buildActionHref(alert);
              return (
                <article
                  className={`alert-review-card severity-${alert.severity}`}
                  key={alert.id}
                >
                  <div className="alert-review-header">
                    <span className={`badge severity-badge ${alert.severity}`}>
                      {severityLabels[alert.severity]}
                    </span>
                    <span className="badge muted">{formatAlertType(alert.type)}</span>
                  </div>
                  <h3>{publicAlertText(alert.title)}</h3>
                  <p>{publicAlertText(alert.description)}</p>
                  <p className="section-note">
                    Razón: {publicAlertText(alert.reason)} · Fuente:{" "}
                    {formatAlertSource(alert.created_from)}
                  </p>
                  {actionHref ? (
                    <a className="analysis-link" href={actionHref}>
                      {alert.action_label || "Ver análisis"}
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
