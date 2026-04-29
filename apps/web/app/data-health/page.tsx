"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  fetchDataHealthOverview,
  fetchRefreshPriorities,
  fetchRefreshRuns,
  fetchSnapshotGaps,
  type DataHealthOverview,
  type RefreshPriorities,
  type RefreshRuns,
  type SnapshotGaps,
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

const freshnessStatusLabels: Record<string, string> = {
  fresh: "Fresco",
  stale: "Stale",
  incomplete: "Incompleto",
  unknown: "Desconocido",
};

const recommendedActionLabels: Record<string, string> = {
  ok: "OK",
  needs_snapshot: "Necesita snapshot",
  review_market: "Revisar mercado",
  exclude_from_scoring: "Excluir del score",
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

function formatFreshnessStatus(value: string): string {
  return freshnessStatusLabels[value] ?? value.replaceAll("_", " ");
}

function formatRecommendedAction(value: string): string {
  return recommendedActionLabels[value] ?? value.replaceAll("_", " ");
}

function buildSnapshotCommand(marketId: number): string {
  return `python -m app.commands.refresh_market_snapshots --market-id ${marketId} --dry-run --json`;
}

function buildMetadataCommand(marketId: number): string {
  return `python -m app.commands.refresh_market_metadata --market-id ${marketId} --dry-run --json`;
}

export default function DataHealthPage() {
  const [overview, setOverview] = useState<DataHealthOverview | null>(null);
  const [snapshotGaps, setSnapshotGaps] = useState<SnapshotGaps | null>(null);
  const [refreshPriorities, setRefreshPriorities] = useState<RefreshPriorities | null>(null);
  const [refreshRuns, setRefreshRuns] = useState<RefreshRuns | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDataHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        overviewResult,
        snapshotGapsResult,
        refreshPrioritiesResult,
        refreshRunsResult,
      ] = await Promise.all([
        fetchDataHealthOverview(),
        fetchSnapshotGaps({ days: 7, limit: 50 }),
        fetchRefreshPriorities({ days: 7, limit: 12 }),
        fetchRefreshRuns({ limit: 10 }),
      ]);
      setOverview(overviewResult);
      setSnapshotGaps(snapshotGapsResult);
      setRefreshPriorities(refreshPrioritiesResult);
      setRefreshRuns(refreshRunsResult);
    } catch {
      setError("No se pudo cargar la salud de datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDataHealth();
  }, [loadDataHealth]);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      window.setTimeout(() => setCopiedCommand(null), 1600);
    } catch {
      setCopiedCommand(null);
    }
  };

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
          <Link className="text-link" href="/help/data-issues">
            Playbook de datos
          </Link>
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
            <p className="eyebrow">Diagnostico seguro</p>
            <h2>Gaps de snapshots</h2>
            <p className="section-note">
              Mercados proximos que necesitan snapshots o precios. Esta vista no ejecuta sync
              ni llama Polymarket.
            </p>
          </div>
          <span className="badge muted">
            {snapshotGaps?.total_checked ?? 0} revisados
          </span>
        </div>

        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>Sin snapshot</span>
            <strong>{loading ? "..." : snapshotGaps?.missing_snapshot_count ?? 0}</strong>
            <p>Necesitan captura local</p>
          </article>
          <article className="metric-card">
            <span>Faltan precios</span>
            <strong>{loading ? "..." : snapshotGaps?.missing_price_count ?? 0}</strong>
            <p>SÍ/NO incompleto</p>
          </article>
          <article className="metric-card">
            <span>Snapshot viejo</span>
            <strong>{loading ? "..." : snapshotGaps?.stale_snapshot_count ?? 0}</strong>
            <p>Mayor a la ventana segura</p>
          </article>
        </div>

        {loading ? (
          <div className="empty-state">Cargando gaps de snapshots...</div>
        ) : !snapshotGaps || snapshotGaps.items.length === 0 ? (
          <div className="empty-state">
            No hay mercados proximos con los filtros actuales.
          </div>
        ) : (
          <div className="snapshot-gap-list">
            {snapshotGaps.items.slice(0, 10).map((item) => (
              <article className="snapshot-gap-card" key={item.market_id}>
                <div>
                  <span className="eyebrow">{formatSport(item.sport)}</span>
                  <h3>{item.title}</h3>
                  <p>
                    Cierre {formatDate(item.close_time)} · Snapshot{" "}
                    {formatDate(item.latest_snapshot_at)}
                  </p>
                </div>
                <div className="snapshot-gap-meta">
                  <span className={`data-quality-label ${item.freshness_status}`}>
                    {formatFreshnessStatus(item.freshness_status)}
                  </span>
                  <span className="reason-chip">
                    {formatRecommendedAction(item.recommended_action)}
                  </span>
                  {!item.has_yes_price || !item.has_no_price ? (
                    <span className="warning-chip">Precio incompleto</span>
                  ) : null}
                </div>
                <a className="text-link" href={`/markets/${item.market_id}`}>
                  Ver analisis
                </a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel refresh-priority-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Priorizacion</p>
            <h2>Prioridad de actualizacion</h2>
            <p className="section-note">
              Ranking read-only de mercados proximos que conviene revisar primero con
              refresh controlado. No ejecuta comandos desde la UI.
            </p>
          </div>
          <span className="badge muted">
            {refreshPriorities?.returned ?? 0} priorizados
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Calculando prioridades de refresh...</div>
        ) : !refreshPriorities || refreshPriorities.items.length === 0 ? (
          <div className="empty-state">
            No hay candidatos de refresh con los filtros actuales.
          </div>
        ) : (
          <div className="refresh-priority-list">
            {refreshPriorities.items.slice(0, 8).map((item) => (
              <article className="refresh-priority-card" key={`priority-${item.market_id}`}>
                <div className="refresh-priority-score">
                  <span>Prioridad</span>
                  <strong>{item.refresh_priority_score}</strong>
                </div>
                <div className="refresh-priority-body">
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">{formatSport(item.sport)}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver mercado
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className={`data-quality-label ${item.freshness_status}`}>
                      {formatFreshnessStatus(item.freshness_status)}
                    </span>
                    <span className="reason-chip">{item.data_quality_label}</span>
                    {item.missing_snapshot ? (
                      <span className="warning-chip">Sin snapshot</span>
                    ) : null}
                    {item.missing_price ? (
                      <span className="warning-chip">Precio incompleto</span>
                    ) : null}
                    <span className="reason-chip">Cierre {formatDate(item.close_time)}</span>
                  </div>
                  <div className="data-health-notes">
                    {item.reasons.slice(0, 5).map((reason) => (
                      <span className="reason-chip" key={`${item.market_id}-${reason}`}>
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="refresh-command-list compact-command-list">
                    <div className="command-card">
                      <div>
                        <span>Snapshot dry-run</span>
                        <code>{item.suggested_command_snapshot}</code>
                      </div>
                      <button
                        onClick={() => void copyCommand(item.suggested_command_snapshot)}
                        type="button"
                      >
                        {copiedCommand === item.suggested_command_snapshot ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="command-card">
                      <div>
                        <span>Metadata dry-run</span>
                        <code>{item.suggested_command_metadata}</code>
                      </div>
                      <button
                        onClick={() => void copyCommand(item.suggested_command_metadata)}
                        type="button"
                      >
                        {copiedCommand === item.suggested_command_metadata ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel refresh-plan-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Plan operativo</p>
            <h2>Plan de actualizacion controlada</h2>
            <p className="section-note">
              Usa estos comandos primero en dry-run. La UI solo los muestra y copia;
              no ejecuta refresh, sync, predicciones ni trading.
            </p>
          </div>
          <span className="badge muted">
            {snapshotGaps?.items.length ?? 0} candidatos
          </span>
        </div>

        {loading ? (
          <div className="empty-state">Preparando plan de actualizacion...</div>
        ) : !snapshotGaps || snapshotGaps.items.length === 0 ? (
          <div className="empty-state">
            No hay gaps activos para planificar refresh con los filtros actuales.
          </div>
        ) : (
          <div className="refresh-plan-grid">
            {snapshotGaps.items.slice(0, 6).map((item) => {
              const snapshotCommand = buildSnapshotCommand(item.market_id);
              const metadataCommand = buildMetadataCommand(item.market_id);
              return (
                <article className="refresh-plan-card" key={`refresh-${item.market_id}`}>
                  <div className="refresh-plan-card-header">
                    <div>
                      <span className="eyebrow">{formatSport(item.sport)}</span>
                      <h3>{item.title}</h3>
                    </div>
                    <Link className="text-link" href={`/markets/${item.market_id}`}>
                      Ver mercado
                    </Link>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className={`data-quality-label ${item.freshness_status}`}>
                      {formatFreshnessStatus(item.freshness_status)}
                    </span>
                    <span className="reason-chip">
                      {formatRecommendedAction(item.recommended_action)}
                    </span>
                    <span className="reason-chip">
                      Cierre {formatDate(item.close_time)}
                    </span>
                  </div>
                  <div className="refresh-command-list">
                    <div className="command-card">
                      <div>
                        <span>Snapshot dry-run</span>
                        <code>{snapshotCommand}</code>
                      </div>
                      <button onClick={() => void copyCommand(snapshotCommand)} type="button">
                        {copiedCommand === snapshotCommand ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="command-card">
                      <div>
                        <span>Metadata dry-run</span>
                        <code>{metadataCommand}</code>
                      </div>
                      <button onClick={() => void copyCommand(metadataCommand)} type="button">
                        {copiedCommand === metadataCommand ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="refresh-run-section">
          <div className="panel-heading compact-heading">
            <div>
              <p className="eyebrow">Auditoria</p>
              <h3>Refresh runs recientes</h3>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Cargando auditoria de refresh...</div>
          ) : !refreshRuns || refreshRuns.items.length === 0 ? (
            <div className="empty-state">
              Aun no hay refresh runs auditados.
            </div>
          ) : (
            <div className="refresh-run-list">
              {refreshRuns.items.map((run) => (
                <article className="refresh-run-card" key={run.id}>
                  <div>
                    <strong>
                      #{run.id} {run.refresh_type === "snapshot" ? "Snapshots" : "Metadata"}
                    </strong>
                    <span>{formatDate(run.started_at)}</span>
                  </div>
                  <div className="snapshot-gap-meta">
                    <span className="reason-chip">{run.mode}</span>
                    <span className={`data-quality-label ${run.status}`}>
                      {run.status}
                    </span>
                    <span className="reason-chip">
                      {run.markets_checked} revisados
                    </span>
                    <span className="reason-chip">
                      {run.markets_updated} actualizados
                    </span>
                    {run.errors_count > 0 ? (
                      <span className="warning-chip">{run.errors_count} errores</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
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
