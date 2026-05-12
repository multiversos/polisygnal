"use client";

import { useEffect, useMemo, useState } from "react";

import {
  calculateAnalysisHistoryStats,
  getAnalysisHistory,
  type AnalysisHistoryItem,
} from "./lib/analysisHistory";

function formatAccuracy(value: number | null): string {
  if (value === null) {
    return "Sin datos suficientes";
  }
  return `${Math.round(value * 100)}%`;
}

export default function HomePage() {
  const [historyItems, setHistoryItems] = useState<AnalysisHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let active = true;
    void getAnalysisHistory()
      .then((items) => {
        if (active) {
          setHistoryItems(items);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingHistory(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => calculateAnalysisHistoryStats(historyItems), [historyItems]);
  const hasMeasuredResults = stats.countableResolved > 0;

  return (
    <main className="dashboard-shell home-page">
      <section className="home-analyzer-hero">
        <div className="home-analyzer-copy">
          <p className="eyebrow">Analizador de enlaces Polymarket</p>
          <h1>Analiza enlaces de Polymarket y mide si PolySignal acierta.</h1>
          <p>
            Pega un enlace, confirma el mercado, guarda la lectura y vuelve al
            historial cuando Polymarket publique el resultado final.
          </p>
          <div className="home-analyzer-actions">
            <a className="analysis-link" href="/analyze">
              Analizar enlace
            </a>
            <a className="analysis-link secondary" href="/history">
              Ver historial
            </a>
            <a className="analysis-link secondary" href="/performance">
              Ver rendimiento
            </a>
          </div>
        </div>

        <aside className="home-analyzer-preview" aria-label="Resumen de rendimiento">
          <div className="home-analyzer-preview-header">
            <span className="badge external-hint">Rendimiento honesto</span>
            <strong>{loadingHistory ? "Leyendo historial" : formatAccuracy(stats.accuracyRate)}</strong>
          </div>
          <p className="section-note">
            {hasMeasuredResults
              ? `${stats.hits} aciertos y ${stats.misses} fallos medibles. Pendientes, cancelados y sin decision clara no cuentan.`
              : "Aun no hay suficientes resultados cerrados con prediccion clara para medir precision."}
          </p>
          <div className="home-analyzer-layers">
            <span>Guardados {stats.total}</span>
            <span>Claras {stats.clearPredictions}</span>
            <span>Pendientes {stats.pending}</span>
            <span>Medibles {stats.countableResolved}</span>
          </div>
        </aside>
      </section>

      <section className="home-analyzer-steps" aria-label="Como funciona PolySignal">
        <article>
          <span>1</span>
          <strong>Pega un enlace</strong>
          <p>PolySignal lee el evento o mercado directamente desde Polymarket.</p>
        </article>
        <article>
          <span>2</span>
          <strong>Confirma el mercado</strong>
          <p>Si el enlace trae varias opciones, eliges una antes de analizar.</p>
        </article>
        <article>
          <span>3</span>
          <strong>Guarda la lectura</strong>
          <p>El historial conserva la decision, las capas revisadas y el enlace original.</p>
        </article>
        <article>
          <span>4</span>
          <strong>Verifica el resultado</strong>
          <p>Cuando el mercado termina, PolySignal lo compara contra el resultado final.</p>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Herramientas del analisis</p>
            <h2>Todo parte del enlace</h2>
            <p>
              El analizador organiza las capas disponibles sin convertir el precio del
              mercado en una estimacion propia.
            </p>
          </div>
        </div>
        <div className="home-analyzer-steps compact">
          <article>
            <span>PM</span>
            <strong>Precio del mercado</strong>
            <p>Probabilidad y outcomes publicados por Polymarket.</p>
          </article>
          <article>
            <span>WI</span>
            <strong>Wallet Intelligence</strong>
            <p>Actividad publica de wallets cuando hay datos compatibles.</p>
          </article>
          <article>
            <span>HP</span>
            <strong>Historial de precio</strong>
            <p>Capa preparada para entender cambios antes del cierre.</p>
          </article>
          <article>
            <span>IR</span>
            <strong>Investigacion externa futura</strong>
            <p>Fuentes verificadas, odds externas y contexto por categoria cuando existan.</p>
          </article>
          <article>
            <span>VF</span>
            <strong>Verificacion final</strong>
            <p>Solo cuenta para precision si hubo prediccion clara y resultado confiable.</p>
          </article>
        </div>
      </section>

      <section className="safety-strip">
        <strong>Lectura responsable:</strong>
        <span>
          PolySignal organiza senales disponibles; no garantiza resultados. Si no hay
          evidencia suficiente, no genera una prediccion propia.
        </span>
      </section>
    </main>
  );
}
