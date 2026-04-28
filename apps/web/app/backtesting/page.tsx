"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchBacktestingSummary,
  fetchMarketOutcomes,
  type BacktestingSummary,
  type MarketOutcome,
} from "../lib/backtesting";

function formatPercent(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "N/D";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "N/D";
  }
  const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(1)}%`;
}

function formatNumber(value?: string | number | null): string {
  if (value === null || value === undefined) {
    return "N/D";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(4) : "N/D";
}

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

function formatOutcome(value: MarketOutcome["resolved_outcome"]): string {
  if (value === "yes") {
    return "SÍ";
  }
  if (value === "no") {
    return "NO";
  }
  return "Cancelado";
}

export default function BacktestingPage() {
  const [state, setState] = useState<{
    summary: BacktestingSummary | null;
    outcomes: MarketOutcome[];
    loading: boolean;
    error: string | null;
  }>({
    summary: null,
    outcomes: [],
    loading: true,
    error: null,
  });

  const loadBacktesting = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [summary, outcomes] = await Promise.all([
        fetchBacktestingSummary(),
        fetchMarketOutcomes(),
      ]);
      setState({
        summary,
        outcomes: outcomes.items,
        loading: false,
        error: null,
      });
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: "No se pudo cargar backtesting.",
      }));
    }
  }, []);

  useEffect(() => {
    void loadBacktesting();
  }, [loadBacktesting]);

  const summary = state.summary;

  return (
    <main className="dashboard-shell backtesting-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Backtesting</h1>
          <p className="subtitle">
            Base operativa para comparar predicciones guardadas contra outcomes
            manuales cuando los mercados se resuelvan. No mide trading ni dinero.
          </p>
        </div>
        <div className="topbar-actions">
          <a className="analysis-link" href="/">
            Volver al dashboard
          </a>
          <button className="theme-toggle" onClick={() => void loadBacktesting()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Sin trading:</strong>
        <span>
          Backtesting solo compara datos guardados. No resuelve mercados
          automáticamente, no crea predicciones y no calcula rendimiento financiero.
        </span>
      </section>

      {state.error ? (
        <section className="alert-panel" role="status">
          <strong>Backtesting no disponible</strong>
          <span>{state.error}</span>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de backtesting">
        <article className="metric-card">
          <span>Predicciones evaluables</span>
          <strong>{state.loading ? "..." : summary?.total_resolved_with_predictions ?? 0}</strong>
          <p>Con outcome yes/no manual</p>
        </article>
        <article className="metric-card">
          <span>Aciertos dirección</span>
          <strong>{state.loading ? "..." : summary?.correct_direction_count ?? 0}</strong>
          <p>{formatPercent(summary?.accuracy_direction)} accuracy</p>
        </article>
        <article className="metric-card">
          <span>Confianza promedio</span>
          <strong>{state.loading ? "..." : formatPercent(summary?.avg_confidence)}</strong>
          <p>Sobre predicciones evaluables</p>
        </article>
        <article className="metric-card">
          <span>Brier score</span>
          <strong>{state.loading ? "..." : formatNumber(summary?.brier_score)}</strong>
          <p>Menor es mejor</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Por familia</p>
            <h2>Resumen de predicciones</h2>
          </div>
          <span className="badge muted">{summary?.by_prediction_family.length ?? 0} familias</span>
        </div>

        {state.loading ? (
          <div className="empty-state">Cargando resumen...</div>
        ) : !summary || summary.by_prediction_family.length === 0 ? (
          <div className="empty-state">
            No hay outcomes con predicciones guardadas todavía.
          </div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Familia</th>
                  <th>Evaluables</th>
                  <th>Aciertos</th>
                  <th>Accuracy</th>
                  <th>Confianza</th>
                  <th>Brier</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_prediction_family.map((item) => (
                  <tr key={item.prediction_family}>
                    <td>{item.prediction_family}</td>
                    <td>{item.total_resolved_with_predictions}</td>
                    <td>{item.correct_direction_count}</td>
                    <td>{formatPercent(item.accuracy_direction)}</td>
                    <td>{formatPercent(item.avg_confidence)}</td>
                    <td>{formatNumber(item.brier_score)}</td>
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
            <p className="eyebrow">Outcomes manuales</p>
            <h2>Mercados resueltos</h2>
          </div>
          <span className="badge muted">{state.outcomes.length} outcomes</span>
        </div>

        {state.loading ? (
          <div className="empty-state">Cargando outcomes...</div>
        ) : state.outcomes.length === 0 ? (
          <div className="empty-state">
            No hay outcomes manuales todavía. PolySignal no inventa resultados.
          </div>
        ) : (
          <div className="backtesting-outcome-list">
            {state.outcomes.map((outcome) => (
              <article className="source-quality-card" key={outcome.market_id}>
                <div>
                  <span className="badge">#{outcome.market_id}</span>
                  <span className="badge muted">{formatOutcome(outcome.resolved_outcome)}</span>
                </div>
                <h3>{outcome.question}</h3>
                <p className="section-note">
                  Fuente: {outcome.source} · Resuelto: {formatDate(outcome.resolved_at)}
                </p>
                {outcome.notes ? <p>{outcome.notes}</p> : null}
                <a className="analysis-link" href={`/markets/${outcome.market_id}`}>
                  Ver análisis
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
