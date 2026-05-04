"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiErrorState,
  ComingSoonModule,
  LoadingState,
} from "../components/DataState";
import { MainNavigation } from "../components/MainNavigation";
import { friendlyApiError } from "../lib/api";
import {
  MANUAL_EVIDENCE_REVIEW_STATUS_LABELS,
  MANUAL_EVIDENCE_STANCE_LABELS,
  fetchManualEvidence,
  updateManualEvidence,
  type ManualEvidenceDashboardItem,
  type ManualEvidenceReviewStatus,
  type ManualEvidenceStance,
} from "../lib/manualEvidence";

const statusOptions: Array<{ value: ManualEvidenceReviewStatus | ""; label: string }> = [
  { value: "", label: "Todos" },
  { value: "pending_review", label: MANUAL_EVIDENCE_REVIEW_STATUS_LABELS.pending_review },
  { value: "reviewed", label: MANUAL_EVIDENCE_REVIEW_STATUS_LABELS.reviewed },
  { value: "rejected", label: MANUAL_EVIDENCE_REVIEW_STATUS_LABELS.rejected },
];

const stanceOptions: Array<{ value: ManualEvidenceStance | ""; label: string }> = [
  { value: "", label: "Todas" },
  { value: "favor_yes", label: MANUAL_EVIDENCE_STANCE_LABELS.favor_yes },
  { value: "against_yes", label: MANUAL_EVIDENCE_STANCE_LABELS.against_yes },
  { value: "neutral", label: MANUAL_EVIDENCE_STANCE_LABELS.neutral },
  { value: "risk", label: MANUAL_EVIDENCE_STANCE_LABELS.risk },
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

function formatToken(value?: string | null): string {
  return value ? value.replaceAll("_", " ") : "Sin clasificar";
}

export default function EvidencePage() {
  const [items, setItems] = useState<ManualEvidenceDashboardItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ManualEvidenceReviewStatus | "">("pending_review");
  const [stanceFilter, setStanceFilter] = useState<ManualEvidenceStance | "">("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchManualEvidence({
        status: statusFilter || null,
        stance: stanceFilter || null,
        limit: 100,
      });
      setItems(response.items);
    } catch (error) {
      setError(friendlyApiError(error, "evidencia manual"));
    } finally {
      setLoading(false);
    }
  }, [stanceFilter, statusFilter]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  const counts = useMemo(() => {
    return {
      total: items.length,
      pending: items.filter((item) => item.review_status === "pending_review").length,
      reviewed: items.filter((item) => item.review_status === "reviewed").length,
      rejected: items.filter((item) => item.review_status === "rejected").length,
    };
  }, [items]);

  const markStatus = async (itemId: number, reviewStatus: ManualEvidenceReviewStatus) => {
    setSavingId(itemId);
    setError(null);
    try {
      const updated = await updateManualEvidence(itemId, { review_status: reviewStatus });
      setItems((current) =>
        current
          .map((item) => (item.id === itemId ? { ...item, ...updated } : item))
          .filter((item) => !statusFilter || item.review_status === statusFilter),
      );
    } catch {
      setError("No se pudo actualizar el estado de revisión.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="dashboard-shell evidence-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Evidencia manual</h1>
          <p className="subtitle">
            Revisa fuentes y claims agregados manualmente. Esto no crea predicciones,
            research runs ni acciones de trading.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadEvidence()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Revisión humana:</strong>
        <span>
          La evidencia manual organiza fuentes para análisis posterior. No representa
          verificación automática ni recomendación de apuesta.
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumen de evidencia manual">
        <article className="metric-card">
          <span>Total visible</span>
          <strong>{loading ? "..." : counts.total}</strong>
          <p>Con los filtros actuales</p>
        </article>
        <article className="metric-card">
          <span>Pendiente</span>
          <strong>{loading ? "..." : counts.pending}</strong>
          <p>Requiere revisión</p>
        </article>
        <article className="metric-card">
          <span>Revisada</span>
          <strong>{loading ? "..." : counts.reviewed}</strong>
          <p>Aceptada para contexto</p>
        </article>
        <article className="metric-card">
          <span>Rechazada</span>
          <strong>{loading ? "..." : counts.rejected}</strong>
          <p>No usar como evidencia</p>
        </article>
      </section>

      <section className="filter-panel evidence-filter-panel" aria-label="Filtros de evidencia">
        <label className="filter-group">
          Estado
          <select
            onChange={(event) => setStatusFilter(event.target.value as ManualEvidenceReviewStatus | "")}
            value={statusFilter}
          >
            {statusOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          Postura
          <select
            onChange={(event) => setStanceFilter(event.target.value as ManualEvidenceStance | "")}
            value={stanceFilter}
          >
            {stanceOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <ApiErrorState
          message={`${error} La evidencia externa se conectará en un sprint posterior.`}
          onRetry={() => void loadEvidence()}
          title="Módulo en preparación"
        />
      ) : null}

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Revisión</p>
            <h2>Fuentes pendientes</h2>
          </div>
          <span className="badge muted">{items.length} items</span>
        </div>

        {loading ? (
          <LoadingState copy="Cargando evidencia manual..." />
        ) : items.length === 0 ? (
          <ComingSoonModule copy="No hay evidencia manual con los filtros actuales. La evidencia externa se conectara en un sprint posterior." />
        ) : (
          <div className="evidence-dashboard-list">
            {items.map((item) => (
              <article className="evidence-dashboard-card" key={item.id}>
                <div className="decision-dashboard-header">
                  <span className="badge">{MANUAL_EVIDENCE_STANCE_LABELS[item.stance]}</span>
                  <span className="badge muted">
                    {MANUAL_EVIDENCE_REVIEW_STATUS_LABELS[item.review_status]}
                  </span>
                  <span className="badge">#{item.market_id}</span>
                </div>
                <h3>{item.market_question ?? `Mercado #${item.market_id}`}</h3>
                <p>{item.claim}</p>
                <p className="section-note">
                  {item.source_name} - {formatToken(item.sport)} - {formatToken(item.market_shape)}
                  {" "} - creada {formatDate(item.created_at)}
                </p>
                <div className="evidence-dashboard-actions">
                  <Link className="analysis-link" href={`/markets/${item.market_id}`}>
                    Ver mercado
                  </Link>
                  {item.source_url ? (
                    <a className="text-link" href={item.source_url} rel="noreferrer" target="_blank">
                      Abrir fuente
                    </a>
                  ) : null}
                  <button
                    className="watchlist-button secondary"
                    disabled={savingId === item.id || item.review_status === "reviewed"}
                    onClick={() => void markStatus(item.id, "reviewed")}
                    type="button"
                  >
                    Revisada
                  </button>
                  <button
                    className="watchlist-button secondary"
                    disabled={savingId === item.id || item.review_status === "rejected"}
                    onClick={() => void markStatus(item.id, "rejected")}
                    type="button"
                  >
                    Rechazar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
