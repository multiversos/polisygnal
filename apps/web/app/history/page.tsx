"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  ANALYSIS_HISTORY_STORAGE_EVENT,
  calculateAnalysisHistoryStats,
  clearAnalysisHistory,
  getAnalysisHistory,
  removeAnalysisHistoryItem,
  replaceAnalysisHistory,
  type AnalysisHistoryItem,
  type AnalysisHistoryStats,
} from "../lib/analysisHistory";
import { getDecisionLabel, hasClearPrediction } from "../lib/analysisDecision";
import {
  getAnalysisLifecycleState,
  getNextCheckHintForHistory,
  getTrackingStatusForHistory,
} from "../lib/analysisLifecycle";
import { resolveAnalysisAgainstOutcome } from "../lib/marketResolution";
import { lookupAnalysisResolution } from "../lib/marketResolutionLookup";
import {
  formatProbability,
  getMarketImpliedProbabilities,
  getPolySignalProbabilities,
  getProbabilityGap,
} from "../lib/marketProbabilities";
import { getEstimateQualityLabel } from "../lib/marketEstimateQuality";
import { formatLastUpdated } from "../lib/useAutoRefresh";

type HistoryFilter =
  | "all"
  | "clear"
  | "detail"
  | "cancelled"
  | "failed"
  | "finalized"
  | "from-link"
  | "hit"
  | "not-countable"
  | "pending"
  | "unknown";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "Sin datos suficientes";
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
  if (item.result === "cancelled") {
    return "Cancelado";
  }
  if (item.result === "pending" || item.status === "open") {
    return "Pendiente";
  }
  return "Desconocido";
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
  return "No verificado";
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

function resolutionSourceLabel(value: AnalysisHistoryItem["resolutionSource"]): string {
  if (value === "polymarket" || value === "gamma" || value === "clob") {
    return "Verificado con Polymarket";
  }
  if (value === "polysignal" || value === "polysignal_market") {
    return "Datos disponibles en PolySignal";
  }
  return "No verificado todavia";
}

function resolutionConfidenceLabel(item: AnalysisHistoryItem): string | null {
  if (item.status === "open" || item.result === "pending") {
    return "El mercado sigue abierto";
  }
  if (item.resolutionConfidence === "low") {
    return "Resultado no confirmado";
  }
  if (item.status === "unknown" && item.outcome === "UNKNOWN") {
    return "Mercado cerrado, resultado no disponible todavia";
  }
  return null;
}

function decisionLabel(item: AnalysisHistoryItem): string {
  return getDecisionLabel(item.decision ?? "unknown", item.predictedSide);
}

function evaluationLabel(item: AnalysisHistoryItem): string {
  if (item.result === "hit") {
    return "Acerto";
  }
  if (item.result === "miss") {
    return "Fallo";
  }
  if (item.result === "cancelled" || item.outcome === "CANCELLED") {
    return "No cuenta por cancelacion";
  }
  if (item.result === "pending" || item.status === "open") {
    return "No cuenta todavia";
  }
  if (item.decision === "weak" || item.decision === "unknown") {
    return "No cuenta por decision debil";
  }
  if (item.decision === "none") {
    return item.estimateQuality === "market_price_only"
      ? "No cuenta: solo probabilidad del mercado"
      : "No cuenta sin estimacion PolySignal";
  }
  return "No verificable";
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
  if (filter === "clear") {
    return hasClearPrediction(item);
  }
  if (filter === "not-countable") {
    return !hasClearPrediction(item);
  }
  if (filter === "pending") {
    return item.result === "pending" || item.status === "open";
  }
  if (filter === "finalized") {
    return item.status === "resolved" || item.result === "hit" || item.result === "miss" || item.result === "cancelled";
  }
  if (filter === "hit") {
    return item.result === "hit";
  }
  if (filter === "failed") {
    return item.result === "miss";
  }
  if (filter === "cancelled") {
    return item.result === "cancelled";
  }
  if (filter === "unknown") {
    return item.result === "unknown" || item.status === "unknown";
  }
  return true;
}

function marketProbabilityForItem(item: AnalysisHistoryItem) {
  return getMarketImpliedProbabilities({
    marketNoPrice: item.marketNoProbability,
    marketYesPrice: item.marketYesProbability,
  });
}

function marketOutcomesLabel(item: AnalysisHistoryItem): string | null {
  const outcomes = item.marketOutcomes
    ?.filter((outcome) => outcome.label)
    .slice(0, 4)
    .map((outcome) => {
      const price = typeof outcome.price === "number" ? formatProbability(outcome.price) : "sin precio";
      return `${outcome.label}: ${price}`;
    });
  return outcomes && outcomes.length > 0 ? outcomes.join(" | ") : null;
}

function polySignalProbabilityForItem(item: AnalysisHistoryItem) {
  if (item.estimateQuality !== "real_polysignal_estimate") {
    return null;
  }
  return getPolySignalProbabilities({
    polySignalNoProbability: item.polySignalNoProbability,
    polySignalYesProbability: item.polySignalYesProbability,
  });
}

function analyzerHrefForItem(item: AnalysisHistoryItem): string | null {
  if (!item.url) {
    return null;
  }
  const params = new URLSearchParams({
    auto: "1",
    url: item.url,
  });
  if (item.deepAnalysisJobId) {
    params.set("job", item.deepAnalysisJobId);
  }
  return `/analyze?${params.toString()}`;
}

function averageProbability(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
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
        <p className="section-note">Aun no hay resultados medibles para mostrar evolucion.</p>
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
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [refreshingResults, setRefreshingResults] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);
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
  const comparisonItems = useMemo(() => {
    return items.filter((item) => marketProbabilityForItem(item) && polySignalProbabilityForItem(item));
  }, [items]);
  const comparisonAverages = useMemo(() => {
    const marketValues: number[] = [];
    const polySignalValues: number[] = [];
    for (const item of comparisonItems) {
      const market = marketProbabilityForItem(item);
      const polySignal = polySignalProbabilityForItem(item);
      if (market && polySignal) {
        marketValues.push(market.yes);
        polySignalValues.push(polySignal.yes);
      }
    }
    return {
      marketYes: averageProbability(marketValues),
      polySignalYes: averageProbability(polySignalValues),
    };
  }, [comparisonItems]);

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

  const handleClearAll = useCallback(async () => {
    if (items.length === 0) {
      return;
    }
    const confirmed = window.confirm("Borrar todo el historial local guardado en este navegador?");
    if (!confirmed) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      await clearAnalysisHistory();
      setItems([]);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos borrar el historial local ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setClearing(false);
    }
  }, [items.length]);

  const handleRefreshResults = useCallback(async () => {
    const candidates = items.filter(
      (item) =>
        item.result === "pending" ||
        item.status === "open" ||
        item.result === "unknown" ||
        item.status === "unknown",
    );
    if (candidates.length === 0) {
      setResolutionMessage("No hay analisis pendientes para verificar ahora.");
      return;
    }

    setRefreshingResults(true);
    setError(null);
    setResolutionMessage("Buscando resultados finales disponibles...");
    try {
      let updatedCount = 0;
      let pendingCount = 0;
      let unknownCount = 0;
      const patches = new Map<string, Partial<AnalysisHistoryItem>>();

      for (const item of candidates) {
        try {
          const resolution = await lookupAnalysisResolution(item);
          const patch = resolveAnalysisAgainstOutcome(item, resolution);
          const checkedAt = new Date().toISOString();
          patches.set(item.id, {
            ...patch,
            lastCheckedAt: checkedAt,
            nextCheckHint:
              patch.result === "pending"
                ? "Revisar cuando Polymarket confirme el resultado final."
                : "Revision completada con la fuente disponible.",
            resolutionStatus:
              patch.result === "hit" || patch.result === "miss"
                ? "resolved"
                : patch.result === "cancelled"
                  ? "cancelled"
                  : patch.result === "pending"
                    ? "pending"
                    : "unknown",
            trackingStatus:
              patch.result === "hit"
                ? "resolved_hit"
                : patch.result === "miss"
                  ? "resolved_miss"
                  : patch.result === "cancelled"
                    ? "cancelled"
                    : patch.result === "pending"
                      ? getTrackingStatusForHistory(item)
                      : "unknown",
          });
          if (patch.result === "hit" || patch.result === "miss" || patch.result === "cancelled") {
            updatedCount += 1;
          } else if (patch.result === "pending") {
            pendingCount += 1;
          } else {
            unknownCount += 1;
          }
        } catch {
          const checkedAt = new Date().toISOString();
          patches.set(item.id, {
            lastCheckedAt: checkedAt,
            nextCheckHint: "Intenta actualizar resultados mas tarde.",
            outcome: "UNKNOWN",
            resolutionConfidence: "low",
            resolutionReason: "No pudimos verificar este mercado todavia.",
            resolutionSource: "unknown",
            resolutionStatus: "unknown",
            result: "unknown",
            status: "unknown",
            trackingStatus: "unknown",
            verifiedAt: checkedAt,
          });
          unknownCount += 1;
        }
      }

      const nextItems = items.map((item) => ({ ...item, ...(patches.get(item.id) ?? {}) }));
      const normalized = await replaceAnalysisHistory(nextItems);
      setItems(normalized);
      setUpdatedAt(new Date());
      setResolutionMessage(
        `${updatedCount} analisis actualizados. ${pendingCount} siguen pendientes. ${unknownCount} no se pudieron verificar.`,
      );
    } catch {
      setError("No pudimos actualizar los resultados ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setRefreshingResults(false);
    }
  }, [items]);

  const hasEnoughResolved = stats.countableResolved >= 5;

  return (
    <main className="dashboard-shell history-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Historial</p>
          <h1>Historial de analisis</h1>
          <p className="subtitle">
            Revisa las lecturas guardadas, los pendientes de resolucion y el
            rendimiento real de PolySignal cuando Polymarket confirma resultados.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/analyze">
            Analizar nuevo enlace
          </a>
          <a className="analysis-link secondary" href="/performance">
            Ver rendimiento
          </a>
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadHistory()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
          <button
            className="theme-toggle"
            disabled={refreshingResults || loading || items.length === 0}
            onClick={() => void handleRefreshResults()}
            type="button"
          >
            {refreshingResults ? "Buscando resultados" : "Actualizar resultados"}
          </button>
          <button
            className="watchlist-button danger"
            disabled={clearing || loading || items.length === 0}
            onClick={() => void handleClearAll()}
            type="button"
          >
            {clearing ? "Borrando" : "Borrar historial local"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Guardado en este navegador:</strong>
        <span>
          Este historial es local y no se sincroniza entre dispositivos todavia.
          Puedes borrarlo cuando quieras; mas adelante podra guardarse en una cuenta.
        </span>
      </section>

      <section className="safety-strip">
        <strong>Como se mide PolySignal:</strong>
        <span>
          Solo contamos aciertos y fallos cuando PolySignal hizo una prediccion clara
          y el mercado ya fue resuelto por Polymarket o una fuente confiable.
          La probabilidad del mercado no es una estimacion PolySignal.
        </span>
      </section>

      <section className="safety-strip">
        <strong>Resolucion automatica:</strong>
        <span>
          Los pendientes no cuentan como fallos. Los mercados sin decision fuerte,
          cancelados o desconocidos tampoco cuentan para precision.
        </span>
      </section>

      <section className="safety-strip">
        <strong>Resultado verificable:</strong>
        <span>
          PolySignal intentara verificar los mercados usando datos disponibles de
          Polymarket. El usuario no marca manualmente el resultado final.
        </span>
      </section>

      {resolutionMessage ? (
        <section className="focus-notice active" role="status">
          <strong>Actualizacion de resultados</strong>
          <span>{resolutionMessage}</span>
        </section>
      ) : null}

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
          <span>Predicciones claras</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.clearPredictions}</strong>
          <p>Superan umbral de 55%</p>
        </article>
        <article className="metric-card">
          <span>Sin decision fuerte</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.weakDecisions}</strong>
          <p>Zona 45/55 o en observacion</p>
        </article>
        <article className="metric-card">
          <span>Con estimacion PolySignal real</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.realPolySignalEstimates}</strong>
          <p>Separadas del precio del mercado</p>
        </article>
        <article className="metric-card">
          <span>Solo probabilidad de mercado</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.marketPriceOnly}</strong>
          <p>No cuentan para precision</p>
        </article>
        <article className="metric-card">
          <span>Sin estimacion</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.noPolySignalEstimate}</strong>
          <p>No cuentan para precision</p>
        </article>
        <article className="metric-card">
          <span>Finalizados</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.finalized}</strong>
          <p>Con estado cerrado o revisado</p>
        </article>
        <article className="metric-card">
          <span>Aciertos</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.hits}</strong>
          <p>Predicciones claras confirmadas</p>
        </article>
        <article className="metric-card">
          <span>Fallos</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.misses}</strong>
          <p>Predicciones claras no confirmadas</p>
        </article>
        <article className="metric-card">
          <span>Cancelados</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.cancelled}</strong>
          <p>No cuentan como fallo</p>
        </article>
        <article className="metric-card">
          <span>Desconocidos</span>
          <strong>{loading ? "..." : stats.total === 0 ? "Sin datos" : stats.unknown}</strong>
          <p>Sin verificacion confiable</p>
        </article>
        <article className="metric-card">
          <span>Porcentaje de acierto</span>
          <strong>{loading ? "..." : formatPercent(stats.accuracyRate)}</strong>
          <p>{hasEnoughResolved ? "Solo predicciones claras resueltas" : "Aun hay pocos resultados medibles"}</p>
        </article>
      </section>

      {!hasEnoughResolved ? (
        <section className="focus-notice active">
          <strong>Pocos resultados medibles</strong>
          <span>
            Aun no hay suficientes mercados resueltos con prediccion clara para medir
            precision con confianza. Usa este historial como organizador hasta tener
            mas cierres reales.
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
            <option value="clear">Predicciones claras</option>
            <option value="not-countable">No cuentan</option>
            <option value="pending">Pendientes</option>
            <option value="finalized">Finalizados</option>
            <option value="hit">Acertados</option>
            <option value="failed">Fallados</option>
            <option value="cancelled">Cancelados</option>
            <option value="unknown">Desconocidos</option>
          </select>
        </label>
      </section>

      <section className="history-chart-grid" aria-label="Graficas del historial">
        <BarChart
          label="Aciertos vs fallos medibles"
          segments={[
            { className: "hit", label: "Aciertos", value: stats.hits },
            { className: "miss", label: "Fallos", value: stats.misses },
          ]}
        />
        <BarChart
          label="Predicciones claras vs sin decision"
          segments={[
            { className: "clear", label: "Claras", value: stats.clearPredictions },
            { className: "weak", label: "Sin decision fuerte", value: stats.weakDecisions },
            { className: "none", label: "Sin estimacion", value: stats.noPolySignalEstimate },
          ]}
        />
        <BarChart
          label="Pendientes vs finalizados"
          segments={[
            { className: "pending", label: "Pendientes", value: stats.pending },
            { className: "resolved", label: "Finalizados", value: stats.finalized },
            { className: "unknown", label: "Desconocidos", value: stats.unknown },
          ]}
        />
        <ConfidenceChart stats={stats} />
        <MonthlyChart stats={stats} />
      </section>

      <section className="dashboard-panel history-comparison-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comparacion mercado vs PolySignal</p>
            <h2>Lecturas comparables</h2>
            <p>
              Solo se comparan registros que tienen probabilidad del mercado y estimacion
              PolySignal guardadas.
            </p>
          </div>
          <span className="badge muted">{comparisonItems.length} comparables</span>
        </div>
        {comparisonItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>Aun no hay datos suficientes para comparar mercado vs PolySignal.</strong>
            <p>
              Guarda analisis que incluyan precio del mercado y estimacion PolySignal
              para ver esta comparacion.
            </p>
          </div>
        ) : (
          <div className="history-comparison-grid">
            <article className="history-chart-card">
              <h3>Promedio del mercado</h3>
              <strong>{formatProbability(comparisonAverages.marketYes)}</strong>
              <p className="section-note">Promedio YES de los precios guardados.</p>
            </article>
            <article className="history-chart-card">
              <h3>Promedio PolySignal</h3>
              <strong>{formatProbability(comparisonAverages.polySignalYes)}</strong>
              <p className="section-note">Promedio YES de estimaciones disponibles.</p>
            </article>
          </div>
        )}
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
              <a className="analysis-link" href="/analyze">
                Analizar enlace
              </a>
              <a className="analysis-link secondary" href="/performance">
                Ver rendimiento
              </a>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>No hay analisis para este filtro.</strong>
            <p>Prueba con otra vista o guarda un analisis desde /analyze.</p>
            <button className="watchlist-button" onClick={() => setFilter("all")} type="button">
              Ver todos
            </button>
          </div>
        ) : (
          <div className="history-list">
            {visibleItems.map((item) => {
              const marketProbability = marketProbabilityForItem(item);
              const marketOutcomes = marketOutcomesLabel(item);
              const polySignalProbability = polySignalProbabilityForItem(item);
              const probabilityGap = getProbabilityGap(marketProbability, polySignalProbability);
              const reanalyzeHref = analyzerHrefForItem(item);
              const lifecycle = getAnalysisLifecycleState(item);
              return (
                <article className="history-card" key={item.id}>
                  <div className="history-card-header">
                    <div>
                      <span className="badge external-hint">{sourceLabel(item.source)}</span>
                      <span className="badge muted">{item.sport || "Mercado"}</span>
                      <span className={`history-result-badge ${item.result || "unknown"}`}>
                        {statusLabel(item)}
                      </span>
                      {item.awaitingResearch || item.researchStatus === "awaiting_samantha" ? (
                        <span className="badge muted">Esperando Samantha</span>
                      ) : null}
                      {item.researchStatus === "ready_to_score" ? (
                        <span className="badge external-hint">Evidencia cargada</span>
                      ) : null}
                    </div>
                    <span className="timestamp-pill">{formatDate(item.analyzedAt)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <div className="history-card-metrics">
                    <span>Decision {decisionLabel(item)}</span>
                    <span>
                      Mercado YES {marketProbability ? formatProbability(marketProbability.yes) : "sin dato"}
                    </span>
                    <span>
                      Mercado NO {marketProbability ? formatProbability(marketProbability.no) : "sin dato"}
                    </span>
                    {marketOutcomes ? <span>Outcomes guardados {marketOutcomes}</span> : null}
                    <span>
                      PolySignal YES {polySignalProbability ? formatProbability(polySignalProbability.yes) : "sin dato"}
                    </span>
                    <span>
                      PolySignal NO {polySignalProbability ? formatProbability(polySignalProbability.no) : "sin dato"}
                    </span>
                    <span>Estimacion {getEstimateQualityLabel(item.estimateQuality ?? "unknown")}</span>
                    <span>Confianza {item.confidence ?? "Desconocida"}</span>
                    <span>Resultado Polymarket {outcomeLabel(item.outcome)}</span>
                    <span>Evaluacion {evaluationLabel(item)}</span>
                    <span>Seguimiento {lifecycle.label}</span>
                    {item.researchStatus ? <span>Investigacion {item.researchStatus}</span> : null}
                    {item.researchBriefReadyAt ? <span>Brief listo {formatDate(item.researchBriefReadyAt)}</span> : null}
                    <span>Fuente {resolutionSourceLabel(item.resolutionSource)}</span>
                    <span>Verificado {item.verifiedAt ? formatDate(item.verifiedAt) : "pendiente"}</span>
                    <span>Ultima revision {item.lastCheckedAt ? formatDate(item.lastCheckedAt) : "sin revision"}</span>
                  </div>
                  <p className="section-note">{lifecycle.summary}</p>
                  <p className="section-note">{item.nextCheckHint || getNextCheckHintForHistory(item)}</p>
                  <p className="section-note">
                    {item.evaluationReason ||
                      "Solo cuenta para precision si hubo prediccion clara y resultado verificable."}
                  </p>
                  {item.resolutionReason ? (
                    <p className="section-note">{item.resolutionReason}</p>
                  ) : (
                    <p className="section-note">
                      No verificado todavia. Usa Actualizar resultados para buscar cierres disponibles.
                    </p>
                  )}
                  {resolutionConfidenceLabel(item) ? (
                    <p className="section-note">{resolutionConfidenceLabel(item)}</p>
                  ) : null}
                  {polySignalProbability ? (
                    probabilityGap ? (
                      <p className="probability-gap-note">{probabilityGap.label}</p>
                    ) : null
                  ) : (
                    <p className="section-note">
                      Guardado con probabilidad del mercado, sin estimacion PolySignal suficiente.
                    </p>
                  )}
                  {item.reasons && item.reasons.length > 0 ? (
                    <p className="section-note">{item.reasons.slice(0, 2).join(" ")}</p>
                  ) : (
                    <p className="section-note">Guardado para comparar cuando exista resultado final.</p>
                  )}
                  <div className="watchlist-actions">
                    {reanalyzeHref ? (
                      <a className="analysis-link" href={reanalyzeHref}>
                        {item.awaitingResearch || item.researchStatus === "awaiting_samantha"
                          ? "Continuar analisis"
                          : "Reanalizar enlace"}
                      </a>
                    ) : null}
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
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
