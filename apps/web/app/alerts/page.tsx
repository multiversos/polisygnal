"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson } from "../lib/api";
import {
  fetchSmartAlerts,
  type SmartAlert,
  type SmartAlertSeverity,
} from "../lib/smartAlerts";

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
  external_signal_unmatched: "Señal externa sin vincular",
  low_data_quality: "Baja calidad de datos",
  missing_data: "Datos faltantes",
  no_research: "Sin research",
  price_move: "Movimiento de precio",
  upcoming_close_soon: "Cierre próximo",
  watchlist_needs_review: "Watchlist requiere revisión",
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
  return typeLabels[value] ?? value.replaceAll("_", " ");
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
      action_label: "Ver analisis",
      action_url: `/markets/${marketId}`,
      data: {},
    };
    if (!item.latest_prediction) {
      alerts.push({
        ...base,
        id: `derived-no-prediction-${marketId}`,
        type: "missing_data",
        severity: "critical",
        title: "Mercado sin prediccion",
        description: question,
        reason: "No hay latest_prediction disponible para este mercado.",
        created_from: "market_overview",
      });
    }
    if (!item.latest_snapshot) {
      alerts.push({
        ...base,
        id: `derived-no-snapshot-${marketId}`,
        type: "missing_data",
        severity: "warning",
        title: "Mercado sin snapshot",
        description: question,
        reason: "No hay latest_snapshot disponible para revisar precios.",
        created_from: "market_overview",
      });
    }
    if (item.scoring_mode === "fallback_only") {
      alerts.push({
        ...base,
        id: `derived-fallback-${marketId}`,
        type: "low_data_quality",
        severity: "warning",
        title: "Score solo informativo",
        description: question,
        reason: "El scoring_mode es fallback_only.",
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
        title: "Cierre proximo",
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
        title: "Sin evidencia externa guardada",
        description: question,
        reason: "La evidencia externa se agregara en un sprint posterior.",
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

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourceNote(null);
    try {
      const response = await fetchSmartAlerts({
        limit: 50,
        severity: severity || null,
        sport: sport || null,
      });
      if (response.alerts.length > 0) {
        setAlerts(response.alerts);
        setCounts(response.counts);
        setGeneratedAt(response.generated_at);
      } else {
        const overview = await fetchMarketOverviewAlerts(sport);
        const derivedAlerts = deriveAlertsFromOverview(overview).filter((alert) =>
          severity ? alert.severity === severity : true,
        );
        setAlerts(derivedAlerts);
        setCounts(buildDerivedAlertCounts(derivedAlerts));
        setGeneratedAt(new Date().toISOString());
        setSourceNote("Alertas derivadas desde /markets/overview porque no hay alertas inteligentes guardadas.");
      }
    } catch {
      try {
        const overview = await fetchMarketOverviewAlerts(sport);
        const derivedAlerts = deriveAlertsFromOverview(overview).filter((alert) =>
          severity ? alert.severity === severity : true,
        );
        setAlerts(derivedAlerts);
        setCounts(buildDerivedAlertCounts(derivedAlerts));
        setGeneratedAt(new Date().toISOString());
        setSourceNote(
          "Alertas derivadas desde /markets/overview porque el modulo de alertas dedicado aun no esta listo.",
        );
      } catch {
        setError("No se pudieron cargar alertas ni derivarlas desde market overview.");
      }
    } finally {
      setLoading(false);
    }
  }, [severity, sport]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const alertTypes = useMemo(() => {
    return Array.from(new Set(alerts.map((alert) => alert.type))).sort();
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    if (!typeFilter) {
      return alerts;
    }
    return alerts.filter((alert) => alert.type === typeFilter);
  }, [alerts, typeFilter]);

  return (
    <main className="dashboard-shell alerts-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Alertas inteligentes</h1>
          <p className="subtitle">
            Recordatorios operativos para revisar mercados, datos y señales. No son
            recomendaciones de apuesta.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadAlerts()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo revisión:</strong>
        <span>
          Las alertas no ejecutan research, no crean predicciones y no hacen trading.
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
          <p>Seguimiento operativo</p>
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
          <strong>Datos existentes:</strong>
          <span>{sourceNote} No ejecuta research, discovery, scoring ni trading.</span>
        </section>
      ) : null}

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
            No hay alertas con los filtros actuales.
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
                    {alert.market_id ? (
                      <span className="badge">#{alert.market_id}</span>
                    ) : null}
                  </div>
                  <h3>{alert.title}</h3>
                  <p>{alert.description}</p>
                  <p className="section-note">
                    Razón: {alert.reason} · Fuente: {alert.created_from}
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
