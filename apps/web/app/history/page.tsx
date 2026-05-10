"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  ANALYSIS_HISTORY_STORAGE_EVENT,
  calculateAnalysisHistoryStats,
  getAnalysisHistory,
  removeAnalysisHistoryItem,
  type AnalysisHistoryItem,
  type AnalysisHistoryStats,
} from "../lib/analysisHistory";
import { formatLastUpdated } from "../lib/useAutoRefresh";

type HistoryFilter =
  | "all"
  | "detail"
  | "failed"
  | "finalized"
  | "from-link"
  | "hit"
  | "pending";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "Sin datos suficientes";
  }
  return `${Math.round(value * 100)}%`;
}

function formatProbability(value?: number): string {
  if (typeof value !== "number") {
    return "sin dato";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "sin fecha";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function statusLabel(item: AnalysisHistoryItem): string {
  if (item.result === "hit") {
    return "Acerto";
  }
  if (item.result === "miss") {
    return "Fallo";
  }
  if (item.result === "pending" || item.status === "open") {
    return "Pendiente";
  }
  return "Sin resultado";
}

function outcomeLabel(value?: string): string {
  if (value === "YES") {
    return "Si";
  }
  if (value === "NO") {
    return "No";
  }
  if (value === "CANCELLED") {
    return "Cancelado";
  }
  return "Pendiente";
}

function sourceLabel(value: AnalysisHistoryItem["source"]): string {
  if (value === "link_analyzer") {
    return "Desde enlace";
  }
  if (value === "market_detail") {
    return "Desde detalle";
  }
  if (value === "manual") {
    return "Manual";
  }
  return "Origen pendiente";
}

function filterMatches(item: AnalysisHistoryItem, filter: HistoryFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "from-link") {
    return item.source === "link_analyzer";
  }
  if (filter === "detail") {
    return item.source === "market_detail";
  }
  if (filter === "pending") {
    return item.result === "pending" || item.status === "open";
  }
  if (filter === "finalized") {
    return item.status === "resolved" || item.result === "hit" || item.result === "miss";
  }
  if (filter === "hit") {
    return item.result === "hit";
  }
  if (filter === "failed") {
    return item.result === "miss";
  }
  return true;
}

function BarChart({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ className: string; label: string; value: number }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <article className="history-chart-card">
      <h3>{label}</h3>
      {total === 0 ? (
        <p className="section-note">Sin datos suficientes para graficar todavia.</p>
      ) : (
        <>
          <div className="history-stacked-bar" aria-label={label}>
            {segments.map((segment) =>
              segment.value > 0 ? (
                <span
                  className={segment.className}
                  key={segment.label}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                  title={`${segment.label}: ${segment.value}`}
                />
              ) : null,
            )}
          </div>
          <div className="history-chart-legend">
            {segments.map((segment) => (
              <span key={segment.label}>
                <i className={segment.className} />
                {segment.label}: {segment.value}
              </span>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function ConfidenceChart({ stats }: { stats: AnalysisHistoryStats }) {
  const rows = [
    { label: "Alta", value: stats.highConfidenceAccuracy },
    { label: "Media", value: stats.mediumConfidenceAccuracy },
    { label: "Baja", value: stats.lowConfidenceAccuracy },
  ];
  return (
    <article className="history-chart-card">
      <h3>Precision por confianza</h3>
      <div className="history-confidence-list">
        {rows.map((row) => (
          <div className="history-confidence-row" key={row.label}>
            <span>{row.label}</span>
            <div className="history-confidence-track">
              <i style={{ width: `${(row.value ?? 0) * 100}%` }} />
            </div>
            <strong>{formatPercent(row.value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function MonthlyChart({ stats }: { stats: AnalysisHistoryStats }) {
  const max = Math.max(1, ...stats.completedByMonth.map((item) => item.resolved));
  return (
    <article className="history-chart-card">
      <h3>Evolucion por fecha</h3>
      {stats.completedByMonth.length === 0 ? (
        <p className="section-note">Aun no hay resultados finalizados para mostrar evolucion.</p>
      ) : (
        <div className="history-month-list">
          {stats.completedByMonth.map((item) => (
            <div className="history-month-row" key={item.label}>
              <span>{item.label}</span>
              <div className="history-confidence-track">
                <i style={{ width: `${(item.resolved / max) * 100}%` }} />
              </div>
              <strong>{item.hits} / {item.resolved}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const history = await getAnalysisHistory();
      setItems(history);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos leer el historial ahora. Mostramos lo ultimo disponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const syncHistory = () => {
      void loadHistory();
    };
    window.addEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, syncHistory);
    window.addEventListener("storage", syncHistory);
    return () => {
      window.removeEventListener(ANALYSIS_HISTORY_STORAGE_EVENT, syncHistory);
      window.removeEventListener("storage", syncHistory);
    };
  }, [loadHistory]);

  const stats = useMemo(() => calculateAnalysisHistoryStats(items), [items]);
  const visibleItems = useMemo(() => {
    return items.filter((item) => filterMatches(item, filter));
  }, [filter, items]);

  const handleRemove = useCallback(async (id: string) => {
    setBusyItemId(id);
    setError(null);
    try {
      await removeAnalysisHistoryItem(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos quitar este analisis ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setBusyItemId(null);
    }
  }, []);

  const hasEnoughResolved = stats.resolved >= 5;

  return (
    <main className="dashboard-shell history-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Historial</p>
          <h1>Historial de analisis</h1>
          <p className="subtitle">
            Revisa los mercados que PolySignal analizo y compara la lectura con el
            resultado final cuando el mercado cierre.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadHistory()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Medicion honesta:</strong>
        <span>
          Esta vista no inventa resultados. Los aciertos y fallos solo aparecen cuando
          existe un resultado guardado.
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumen del historial">
        <article className="metric-card">
          <span>Analisis guardados</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.total}</strong>
          <p>Registros locales</p>
        </article>
        <article className="metric-card">
          <span>Pendientes</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.pending}</strong>
          <p>Esperan resultado final</p>
        </article>
        <article className="metric-card">
          <span>Finalizados</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.finalized}</strong>
          <p>Con estado cerrado o revisado</p>
        </article>
        <article className="metric-card">
          <span>Aciertos</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.hits}</strong>
          <p>Lecturas confirmadas</p>
        </article>
        <article className="metric-card">
          <span>Fallos</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.misses}</strong>
          <p>Lecturas no confirmadas</p>
        </article>
        <article className="metric-card">
          <span>Porcentaje de acierto</span>
          <strong>{loading ? "..." : formatPercent(stats.accuracyRate)}</strong>
          <p>{hasEnoughResolved ? "Solo resultados finalizados" : "Aun hay pocos resultados finalizados"}</p>
        </article>
      </section>

      {!hasEnoughResolved ? (
        <section className="focus-notice active">
          <strong>Pocos resultados finalizados</strong>
          <span>
            Aun hay pocos resultados finalizados para medir precision con confianza.
            Usa este historial como organizador hasta tener mas cierres reales.
          </span>
        </section>
      ) : null}

      {error ? (
        <section className="alert-panel compact" role="status">
          <strong>Historial no disponible</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="filter-panel history-filter-panel" aria-label="Filtros de historial">
        <label className="filter-group">
          Vista
          <select onChange={(event) => setFilter(event.target.value as HistoryFilter)} value={filter}>
            <option value="all">Todos</option>
            <option value="from-link">Desde enlace</option>
            <option value="detail">Desde detalle</option>
            <option value="pending">Pendientes</option>
            <option value="finalized">Finalizados</option>
            <option value="hit">Acertados</option>
            <option value="failed">Fallados</option>
          </select>
        </label>
      </section>

      <section className="history-chart-grid" aria-label="Graficas del historial">
        <BarChart
          label="Aciertos vs fallos"
          segments={[
            { className: "hit", label: "Aciertos", value: stats.hits },
            { className: "miss", label: "Fallos", value: stats.misses },
          ]}
        />
        <BarChart
          label="Pendientes vs finalizados"
          segments={[
            { className: "pending", label: "Pendientes", value: stats.pending },
            { className: "resolved", label: "Finalizados", value: stats.finalized },
          ]}
        />
        <ConfidenceChart stats={stats} />
        <MonthlyChart stats={stats} />
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registros</p>
            <h2>Analisis guardados</h2>
            <p>Primero se muestran los registros analizados mas recientemente.</p>
          </div>
          <span className="badge muted">{visibleItems.length} visibles</span>
        </div>

        {loading ? (
          <div className="empty-state compact">Cargando historial...</div>
        ) : items.length === 0 ? (
          <div className="empty-state compact">
            <strong>Todavia no tienes analisis guardados.</strong>
            <p>
              Cuando analices un enlace de Polymarket o guardes un analisis desde
              un mercado, aparecera aqui.
            </p>
            <div className="empty-state-actions">
              <a className="analysis-link" href="/sports/soccer">
                Explorar futbol
              </a>
              <a className="analysis-link secondary" href="/sports">
                Ver mercados deportivos
              </a>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>No hay analisis para este filtro.</strong>
            <p>Prueba con otra vista o guarda un analisis desde un mercado.</p>
            <button className="watchlist-button" onClick={() => setFilter("all")} type="button">
              Ver todos
            </button>
          </div>
        ) : (
          <div className="history-list">
            {visibleItems.map((item) => (
              <article className="history-card" key={item.id}>
                <div className="history-card-header">
                  <div>
                    <span className="badge external-hint">{sourceLabel(item.source)}</span>
                    <span className="badge muted">{item.sport || "Mercado"}</span>
                    <span className={`history-result-badge ${item.result || "unknown"}`}>
                      {statusLabel(item)}
                    </span>
                  </div>
                  <span className="timestamp-pill">{formatDate(item.analyzedAt)}</span>
                </div>
                <h3>{item.title}</h3>
                <div className="history-card-metrics">
                  <span>Lectura {item.predictedSide === "UNKNOWN" ? "pendiente" : item.predictedSide}</span>
                  <span>Mercado Si {formatProbability(item.marketYesProbability)}</span>
                  <span>PolySignal Si {formatProbability(item.polySignalYesProbability)}</span>
                  <span>Confianza {item.confidence ?? "Desconocida"}</span>
                  <span>Resultado {outcomeLabel(item.outcome)}</span>
                </div>
                {item.reasons && item.reasons.length > 0 ? (
                  <p className="section-note">{item.reasons.slice(0, 2).join(" ")}</p>
                ) : (
                  <p className="section-note">Guardado para comparar cuando exista resultado final.</p>
                )}
                <div className="watchlist-actions">
                  {item.marketId ? (
                    <a className="analysis-link" href={`/markets/${item.marketId}`}>
                      Ver detalle
                    </a>
                  ) : null}
                  <button
                    className="watchlist-button danger"
                    disabled={busyItemId === item.id}
                    onClick={() => void handleRemove(item.id)}
                    type="button"
                  >
                    {busyItemId === item.id ? "Quitando" : "Quitar"}
                  </button>
                  {item.url ? (
                    <a className="analysis-link secondary" href={item.url} rel="noreferrer" target="_blank">
                      Abrir enlace original
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
