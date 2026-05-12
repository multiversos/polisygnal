"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ANALYSIS_HISTORY_STORAGE_EVENT,
  getAnalysisHistory,
  type AnalysisHistoryItem,
} from "../lib/analysisHistory";
import { getAnalysisLifecycleState } from "../lib/analysisLifecycle";
import { formatLastUpdated } from "../lib/useAutoRefresh";

function formatDate(value?: string): string {
  if (!value) {
    return "sin fecha";
  }
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

function analyzerHrefForItem(item: AnalysisHistoryItem): string | null {
  if (!item.url) {
    return null;
  }
  const params = new URLSearchParams({ auto: "1", url: item.url });
  return `/analyze?${params.toString()}`;
}

export default function AlertsPage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const history = await getAnalysisHistory();
      setItems(history);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos leer los analisis guardados ahora.");
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

  const pendingItems = useMemo(() => {
    return items
      .filter((item) => item.result === "pending" || item.status === "open")
      .slice(0, 8);
  }, [items]);
  const unknownItems = useMemo(() => {
    return items
      .filter((item) => item.result === "unknown" || item.status === "unknown")
      .slice(0, 5);
  }, [items]);

  return (
    <main className="dashboard-shell alerts-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Alertas</p>
          <h1>Seguimiento de analisis guardados</h1>
          <p className="subtitle">
            Alertas enfocadas en lecturas guardadas: pendientes de resolucion,
            revisiones necesarias y enlaces que conviene volver a analizar.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/analyze">
            Analizar enlace
          </a>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadHistory()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Sin seguimiento automatico en segundo plano:</strong>
        <span>
          Mientras no haya cuenta o servicio persistente, la revision ocurre cuando
          abres PolySignal y actualizas resultados desde Historial.
        </span>
      </section>

      {error ? (
        <section className="alert-panel compact" role="status">
          <strong>Alertas no disponibles</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de alertas">
        <article className="metric-card">
          <span>Analisis guardados</span>
          <strong>{loading ? "..." : items.length}</strong>
          <p>Registros locales</p>
        </article>
        <article className="metric-card">
          <span>Pendientes</span>
          <strong>{loading ? "..." : pendingItems.length}</strong>
          <p>Esperan resultado final</p>
        </article>
        <article className="metric-card">
          <span>Revisar</span>
          <strong>{loading ? "..." : unknownItems.length}</strong>
          <p>No se pudieron verificar</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pendientes</p>
            <h2>Analisis en seguimiento</h2>
            <p>Usa Historial para buscar resultados finales disponibles.</p>
          </div>
          <a className="analysis-link secondary" href="/history">
            Actualizar resultados
          </a>
        </div>

        {items.length === 0 ? (
          <div className="empty-state compact">
            <strong>Todavia no tienes analisis guardados.</strong>
            <p>Pega un enlace de Polymarket para crear el primer seguimiento.</p>
            <a className="analysis-link" href="/analyze">
              Analizar enlace
            </a>
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>No hay analisis pendientes de resolucion.</strong>
            <p>Cuando guardes una lectura abierta, aparecera aqui.</p>
          </div>
        ) : (
          <div className="history-list compact">
            {pendingItems.map((item) => {
              const lifecycle = getAnalysisLifecycleState(item);
              const href = analyzerHrefForItem(item);
              return (
                <article className="history-card" key={item.id}>
                  <div className="history-card-header">
                    <span className="badge external-hint">{lifecycle.label}</span>
                    <span className="timestamp-pill">{formatDate(item.analyzedAt)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="section-note">{lifecycle.summary}</p>
                  <p className="section-note">{item.nextCheckHint || lifecycle.nextCheckHint}</p>
                  <div className="watchlist-actions">
                    <a className="analysis-link" href="/history">
                      Actualizar resultados
                    </a>
                    {href ? (
                      <a className="analysis-link secondary" href={href}>
                        Reanalizar enlace
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisar</p>
            <h2>Analisis sin verificacion confiable</h2>
            <p>No cuentan como fallos. Puedes volver a intentar cuando el mercado tenga resultado.</p>
          </div>
        </div>
        {unknownItems.length === 0 ? (
          <div className="empty-state compact">Sin revisiones pendientes.</div>
        ) : (
          <div className="history-list compact">
            {unknownItems.map((item) => {
              const href = analyzerHrefForItem(item);
              return (
                <article className="history-card" key={item.id}>
                  <h3>{item.title}</h3>
                  <p className="section-note">
                    {item.resolutionReason || "No pudimos verificar el resultado todavia."}
                  </p>
                  {href ? (
                    <a className="analysis-link secondary" href={href}>
                      Reanalizar enlace
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
