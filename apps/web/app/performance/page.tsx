"use client";

import { useEffect, useMemo, useState } from "react";

import {
  calculateAnalysisHistoryStats,
  getAnalysisHistory,
  type AnalysisHistoryItem,
} from "../lib/analysisHistory";
import { shouldCountForAccuracy } from "../lib/analysisDecision";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "Sin datos suficientes";
  }
  return `${Math.round(value * 100)}%`;
}

function categoryLabel(value?: string): string {
  if (!value) {
    return "General";
  }
  const labels: Record<string, string> = {
    baseball: "Beisbol",
    basketball: "Baloncesto",
    crypto: "Cripto",
    nba: "NBA",
    nfl: "NFL",
    politics: "Politica",
    soccer: "Futbol",
    tennis: "Tenis",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function accuracyFor(items: AnalysisHistoryItem[]): number | null {
  const hits = items.filter((item) => shouldCountForAccuracy(item) && item.result === "hit").length;
  const misses = items.filter((item) => shouldCountForAccuracy(item) && item.result === "miss").length;
  return hits + misses > 0 ? hits / (hits + misses) : null;
}

export default function PerformancePage() {
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getAnalysisHistory()
      .then((history) => {
        if (active) {
          setItems(history);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => calculateAnalysisHistoryStats(items), [items]);
  const categoryRows = useMemo(() => {
    const groups = new Map<string, AnalysisHistoryItem[]>();
    for (const item of items) {
      const key = categoryLabel(item.sport);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries())
      .map(([label, groupItems]) => ({
        accuracy: accuracyFor(groupItems),
        countable: groupItems.filter(shouldCountForAccuracy).length,
        label,
        total: groupItems.length,
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 6);
  }, [items]);

  return (
    <main className="dashboard-shell performance-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Rendimiento</p>
          <h1>Rendimiento de PolySignal</h1>
          <p className="subtitle">
            Metrica honesta basada solo en predicciones claras con resultado final
            verificable. Pendientes, cancelados y sin decision fuerte no cuentan.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/analyze">
            Analizar enlace
          </a>
          <a className="analysis-link secondary" href="/history">
            Ver historial
          </a>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumen de rendimiento">
        <article className="metric-card">
          <span>Precision general</span>
          <strong>{loading ? "..." : formatPercent(stats.accuracyRate)}</strong>
          <p>Solo aciertos y fallos medibles</p>
        </article>
        <article className="metric-card">
          <span>Medibles</span>
          <strong>{loading ? "..." : stats.countableResolved}</strong>
          <p>Predicciones claras resueltas</p>
        </article>
        <article className="metric-card">
          <span>Aciertos</span>
          <strong>{loading ? "..." : stats.hits}</strong>
          <p>Confirmados por resultado final</p>
        </article>
        <article className="metric-card">
          <span>Fallos</span>
          <strong>{loading ? "..." : stats.misses}</strong>
          <p>Predicciones claras no confirmadas</p>
        </article>
        <article className="metric-card">
          <span>Pendientes</span>
          <strong>{loading ? "..." : stats.pending}</strong>
          <p>No cuentan como fallo</p>
        </article>
        <article className="metric-card">
          <span>Sin decision fuerte</span>
          <strong>{loading ? "..." : stats.weakDecisions}</strong>
          <p>Seguimiento, no precision</p>
        </article>
        <article className="metric-card">
          <span>Sin estimacion propia</span>
          <strong>{loading ? "..." : stats.noPolySignalEstimate}</strong>
          <p>No se convierte en prediccion</p>
        </article>
      </section>

      {stats.countableResolved === 0 ? (
        <section className="focus-notice active">
          <strong>Aun no hay suficientes resultados cerrados para medir precision.</strong>
          <span>
            Guarda analisis desde enlaces de Polymarket y actualiza resultados en
            Historial cuando los mercados terminen.
          </span>
        </section>
      ) : null}

      <section className="history-chart-grid" aria-label="Rendimiento por segmento">
        <article className="history-chart-card">
          <h3>Precision por confianza</h3>
          <div className="history-confidence-list">
            <div className="history-confidence-row">
              <span>Alta</span>
              <strong>{formatPercent(stats.highConfidenceAccuracy)}</strong>
            </div>
            <div className="history-confidence-row">
              <span>Media</span>
              <strong>{formatPercent(stats.mediumConfidenceAccuracy)}</strong>
            </div>
            <div className="history-confidence-row">
              <span>Baja</span>
              <strong>{formatPercent(stats.lowConfidenceAccuracy)}</strong>
            </div>
          </div>
        </article>

        <article className="history-chart-card">
          <h3>Por categoria</h3>
          {categoryRows.length === 0 ? (
            <p className="section-note">Sin analisis guardados todavia.</p>
          ) : (
            <div className="history-confidence-list">
              {categoryRows.map((row) => (
                <div className="history-confidence-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{formatPercent(row.accuracy)}</strong>
                  <small>{row.countable} medibles / {row.total} guardados</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="history-chart-card">
          <h3>Evolucion</h3>
          {stats.completedByMonth.length === 0 ? (
            <p className="section-note">Aun no hay resultados medibles por fecha.</p>
          ) : (
            <div className="history-confidence-list">
              {stats.completedByMonth.map((month) => (
                <div className="history-confidence-row" key={month.label}>
                  <span>{month.label}</span>
                  <strong>{month.hits} / {month.resolved}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="safety-strip">
        <strong>Nota de rendimiento:</strong>
        <span>
          El rendimiento pasado no garantiza resultados futuros. La precision solo
          se calcula cuando existe decision PolySignal clara y resultado confiable.
        </span>
      </section>
    </main>
  );
}
