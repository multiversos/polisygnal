"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  fetchSmartAlerts,
  type SmartAlert,
  type SmartAlertSeverity,
} from "../lib/smartAlerts";

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
  { value: "nba", label: "NBA" },
  { value: "nfl", label: "NFL" },
  { value: "soccer", label: "Fútbol" },
  { value: "mma", label: "UFC" },
  { value: "nhl", label: "NHL" },
  { value: "tennis", label: "Tenis" },
  { value: "cricket", label: "Cricket" },
  { value: "mlb", label: "Béisbol" },
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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SmartAlertSeverity | "">("");
  const [sport, setSport] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSmartAlerts({
        limit: 50,
        severity: severity || null,
        sport: sport || null,
      });
      setAlerts(response.alerts);
      setCounts(response.counts);
      setGeneratedAt(response.generated_at);
    } catch {
      setError("No se pudieron cargar las alertas inteligentes.");
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
              <option key={option.value || "all"} value={option.value}>
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
