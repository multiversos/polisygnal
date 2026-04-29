"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import {
  DECISION_CONFIDENCE_LABELS,
  MARKET_DECISION_LABELS,
  fetchAllMarketDecisions,
  type DecisionConfidenceLabel,
  type MarketDecision,
  type MarketDecisionItem,
} from "../lib/marketDecisions";

const decisionOptions: Array<{ value: MarketDecision | ""; label: string }> = [
  { value: "", label: "Todas" },
  { value: "monitor", label: MARKET_DECISION_LABELS.monitor },
  { value: "investigate_more", label: MARKET_DECISION_LABELS.investigate_more },
  { value: "ignore", label: MARKET_DECISION_LABELS.ignore },
  { value: "possible_opportunity", label: MARKET_DECISION_LABELS.possible_opportunity },
  { value: "dismissed", label: MARKET_DECISION_LABELS.dismissed },
  { value: "waiting_for_data", label: MARKET_DECISION_LABELS.waiting_for_data },
];

const confidenceOptions: Array<{ value: DecisionConfidenceLabel | ""; label: string }> = [
  { value: "", label: "Todas" },
  { value: "low", label: DECISION_CONFIDENCE_LABELS.low },
  { value: "medium", label: DECISION_CONFIDENCE_LABELS.medium },
  { value: "high", label: DECISION_CONFIDENCE_LABELS.high },
];

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

function decisionLabel(value: MarketDecision): string {
  return MARKET_DECISION_LABELS[value] ?? value.replaceAll("_", " ");
}

function confidenceLabel(value?: DecisionConfidenceLabel | null): string {
  return value ? DECISION_CONFIDENCE_LABELS[value] ?? value : "Sin confianza";
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<MarketDecisionItem[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<MarketDecision | "">("");
  const [confidenceFilter, setConfidenceFilter] = useState<DecisionConfidenceLabel | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDecisions(await fetchAllMarketDecisions(200));
    } catch {
      setError("No se pudieron cargar las decisiones humanas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

  const visibleDecisions = useMemo(() => {
    return decisions.filter((item) => {
      const decisionMatches = !decisionFilter || item.decision === decisionFilter;
      const confidenceMatches =
        !confidenceFilter || item.confidence_label === confidenceFilter;
      return decisionMatches && confidenceMatches;
    });
  }, [confidenceFilter, decisionFilter, decisions]);

  const counts = useMemo(() => {
    return {
      total: decisions.length,
      monitor: decisions.filter((item) => item.decision === "monitor").length,
      investigate: decisions.filter((item) => item.decision === "investigate_more").length,
      waiting: decisions.filter((item) => item.decision === "waiting_for_data").length,
    };
  }, [decisions]);

  return (
    <main className="dashboard-shell decisions-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Decisiones humanas</h1>
          <p className="subtitle">
            Registro manual para organizar analisis. No ejecuta apuestas ni trading.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadDecisions()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Manual y local:</strong>
        <span>
          Estas decisiones son notas operativas. No crean predicciones, no abren
          ordenes y no representan recomendacion de apuesta.
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumen de decisiones">
        <article className="metric-card">
          <span>Total</span>
          <strong>{loading ? "..." : counts.total}</strong>
          <p>Decisiones guardadas</p>
        </article>
        <article className="metric-card">
          <span>Seguir observando</span>
          <strong>{loading ? "..." : counts.monitor}</strong>
          <p>Mercados bajo seguimiento mental</p>
        </article>
        <article className="metric-card">
          <span>Investigar mas</span>
          <strong>{loading ? "..." : counts.investigate}</strong>
          <p>Requieren evidencia adicional</p>
        </article>
        <article className="metric-card">
          <span>Esperando datos</span>
          <strong>{loading ? "..." : counts.waiting}</strong>
          <p>Bloqueados por cobertura o snapshots</p>
        </article>
      </section>

      <section className="filter-panel decisions-filter-panel" aria-label="Filtros de decisiones">
        <label className="filter-group">
          Decision
          <select
            onChange={(event) => setDecisionFilter(event.target.value as MarketDecision | "")}
            value={decisionFilter}
          >
            {decisionOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          Confianza
          <select
            onChange={(event) =>
              setConfidenceFilter(event.target.value as DecisionConfidenceLabel | "")
            }
            value={confidenceFilter}
          >
            {confidenceOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>Decisiones no disponibles</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Registro</p>
            <h2>Historial de decisiones</h2>
          </div>
          <span className="badge muted">{visibleDecisions.length} decisiones</span>
        </div>

        {loading ? (
          <div className="empty-state">Cargando decisiones...</div>
        ) : visibleDecisions.length === 0 ? (
          <div className="empty-state">
            No hay decisiones humanas con los filtros actuales.
          </div>
        ) : (
          <div className="decision-dashboard-list">
            {visibleDecisions.map((item) => (
              <article className="decision-dashboard-card" key={item.id}>
                <div className="decision-dashboard-header">
                  <span className="badge">{decisionLabel(item.decision)}</span>
                  <span className="badge muted">{confidenceLabel(item.confidence_label)}</span>
                  <span className="badge">#{item.market_id}</span>
                </div>
                <h3>{item.market_question}</h3>
                {item.note ? <p>{item.note}</p> : <p className="section-note">Sin nota.</p>}
                <p className="section-note">
                  {item.sport ?? "Sin deporte"} - {item.market_shape ?? "Sin shape"} -
                  Creada {formatDate(item.created_at)}
                </p>
                <Link className="analysis-link" href={`/markets/${item.market_id}`}>
                  Ver mercado
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
