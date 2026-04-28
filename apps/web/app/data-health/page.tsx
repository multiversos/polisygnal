"use client";

import { useCallback, useEffect, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  fetchDataHealthOverview,
  type DataHealthOverview,
} from "../lib/dataHealth";

const sportLabels: Record<string, string> = {
  nba: "NBA",
  nfl: "NFL",
  soccer: "Fútbol",
  mma: "UFC",
  nhl: "NHL",
  tennis: "Tenis",
  cricket: "Cricket",
  mlb: "Béisbol",
  other: "Otro",
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

function formatSport(value: string): string {
  return sportLabels[value] ?? value.replaceAll("_", " ");
}

export default function DataHealthPage() {
  const [overview, setOverview] = useState<DataHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDataHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchDataHealthOverview());
    } catch {
      setError("No se pudo cargar la salud de datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDataHealth();
  }, [loadDataHealth]);

  return (
    <main className="dashboard-shell data-health-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Salud de datos</h1>
          <p className="subtitle">
            Cobertura y frescura de mercados y snapshots. Esta página explica
            calidad de datos, no predicciones ni recomendaciones.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadDataHealth()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Read-only:</strong>
        <span>
          No ejecuta sync, no llama APIs externas y no inventa precios ni fuentes.
        </span>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>Salud de datos no disponible</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de salud de datos">
        <article className="metric-card">
          <span>Mercados totales</span>
          <strong>{loading ? "..." : overview?.total_markets ?? 0}</strong>
          <p>{overview?.active_markets ?? 0} activos</p>
        </article>
        <article className="metric-card">
          <span>Próximos mercados</span>
          <strong>{loading ? "..." : overview?.upcoming_markets_count ?? 0}</strong>
          <p>Ventana operativa actual</p>
        </article>
        <article className="metric-card">
          <span>Con snapshots</span>
          <strong>{loading ? "..." : overview?.markets_with_snapshots ?? 0}</strong>
          <p>{overview?.markets_missing_snapshots ?? 0} sin snapshot</p>
        </article>
        <article className="metric-card">
          <span>Faltan precios</span>
          <strong>{loading ? "..." : overview?.markets_missing_prices ?? 0}</strong>
          <p>Último snapshot sin SÍ/NO completo</p>
        </article>
        <article className="metric-card">
          <span>Sin cierre</span>
          <strong>{loading ? "..." : overview?.markets_missing_close_time ?? 0}</strong>
          <p>Mercados sin close_time</p>
        </article>
        <article className="metric-card">
          <span>Último snapshot</span>
          <strong>{loading ? "..." : formatDate(overview?.latest_snapshot_at)}</strong>
          <p>Frescura local</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Cobertura</p>
            <h2>Por deporte</h2>
          </div>
          <span className="badge muted">
            {overview?.coverage_by_sport.length ?? 0} deportes
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Cargando cobertura...</div>
        ) : !overview || overview.coverage_by_sport.length === 0 ? (
          <div className="empty-state">No hay mercados para resumir todavía.</div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Deporte</th>
                  <th>Total</th>
                  <th>Con snapshot</th>
                  <th>Faltan precios</th>
                  <th>Sin cierre</th>
                </tr>
              </thead>
              <tbody>
                {overview.coverage_by_sport.map((item) => (
                  <tr key={item.sport}>
                    <td>{formatSport(item.sport)}</td>
                    <td>{item.total}</td>
                    <td>{item.with_snapshot}</td>
                    <td>{item.missing_price}</td>
                    <td>{item.missing_close_time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Lectura operativa</p>
            <h2>Qué explica esta vista</h2>
          </div>
        </div>
        <div className="data-health-notes">
          <span className="reason-chip">Scores pendientes suelen faltar precios o snapshots.</span>
          <span className="reason-chip">sport=other indica clasificación incompleta.</span>
          <span className="reason-chip">Sin cierre limita filtros de próximos 7 días.</span>
        </div>
      </section>
    </main>
  );
}
