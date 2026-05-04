"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { friendlyApiError } from "../lib/api";
import {
  INVESTIGATION_STATUS_LABELS,
  INVESTIGATION_STATUS_ORDER,
  fetchInvestigationStatuses,
  updateMarketInvestigationStatus,
  type InvestigationStatus,
  type InvestigationStatusItem,
} from "../lib/investigationStatus";

const sportLabels: Record<string, string> = {
  nba: "Baloncesto",
  basketball: "Baloncesto",
  nfl: "NFL",
  soccer: "Fútbol",
  mma: "UFC",
  nhl: "NHL",
  tennis: "Tenis",
  cricket: "Cricket",
  mlb: "Béisbol",
  baseball: "Béisbol",
  ufc: "UFC",
  horse_racing: "Carreras de caballos",
  other: "Otro",
};

function formatSport(value?: string | null): string {
  if (!value) {
    return "Sin deporte";
  }
  return sportLabels[value] ?? value.replaceAll("_", " ");
}

function formatMarketShape(value?: string | null): string {
  return value ? value.replaceAll("_", " ") : "tipo no definido";
}

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

function sortWorkflowItems(items: InvestigationStatusItem[]): InvestigationStatusItem[] {
  return [...items].sort((left, right) => {
    const leftPriority = left.priority ?? 9999;
    const rightPriority = right.priority ?? 9999;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.updated_at.localeCompare(left.updated_at);
  });
}

export default function WorkflowPage() {
  const [items, setItems] = useState<InvestigationStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMarketId, setSavingMarketId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchInvestigationStatuses());
    } catch (error) {
      setError(friendlyApiError(error, "workflow de investigacion"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  const groupedItems = useMemo(() => {
    const groups = new Map<InvestigationStatus, InvestigationStatusItem[]>();
    for (const status of INVESTIGATION_STATUS_ORDER) {
      groups.set(status, []);
    }
    for (const item of items) {
      groups.get(item.status)?.push(item);
    }
    for (const status of INVESTIGATION_STATUS_ORDER) {
      groups.set(status, sortWorkflowItems(groups.get(status) ?? []));
    }
    return groups;
  }, [items]);

  const updateStatus = useCallback(
    async (item: InvestigationStatusItem, status: InvestigationStatus) => {
      setSavingMarketId(item.market_id);
      setError(null);
      try {
        const updated = await updateMarketInvestigationStatus(item.market_id, {
          status,
          note: item.note ?? null,
          priority: item.priority ?? null,
        });
        setItems((current) =>
          current.map((existing) =>
            existing.market_id === updated.market_id ? updated : existing,
          ),
        );
      } catch {
        setError("No se pudo actualizar el estado de investigación.");
      } finally {
        setSavingMarketId(null);
      }
    },
    [],
  );

  return (
    <main className="dashboard-shell workflow-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Workflow de investigación</h1>
          <p className="subtitle">
            Tablero operativo para mover mercados entre etapas de análisis. No
            recomienda apuestas ni ejecuta trading.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadWorkflow()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Organización manual:</strong>
        <span>
          Cambiar una columna solo actualiza el estado operativo del mercado; no crea
          research, predicciones ni órdenes.
        </span>
      </section>

      {error ? (
        <section className="alert-panel" role="status">
          <strong>Workflow no disponible</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <section className="empty-state">
          <strong>Workflow listo, sin estados manuales todavia.</strong>
          <p>
            El dashboard tiene mercados reales; este tablero se llenara cuando
            marques estados de investigacion desde el detalle de mercado.
          </p>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de workflow">
        {INVESTIGATION_STATUS_ORDER.map((status) => (
          <article className="metric-card" key={status}>
            <span>{INVESTIGATION_STATUS_LABELS[status]}</span>
            <strong>{loading ? "..." : groupedItems.get(status)?.length ?? 0}</strong>
            <p>Mercados en esta etapa</p>
          </article>
        ))}
      </section>

      <section className="workflow-board" aria-label="Tablero Kanban">
        {INVESTIGATION_STATUS_ORDER.map((status) => {
          const columnItems = groupedItems.get(status) ?? [];
          return (
            <div className="workflow-column" key={status}>
              <div className="workflow-column-heading">
                <h2>{INVESTIGATION_STATUS_LABELS[status]}</h2>
                <span className="badge muted">{columnItems.length}</span>
              </div>
              {loading ? (
                <div className="empty-state compact">Cargando...</div>
              ) : columnItems.length === 0 ? (
                <div className="empty-state compact">Sin mercados en esta columna.</div>
              ) : (
                <div className="workflow-card-list">
                  {columnItems.map((item) => (
                    <article className="workflow-card" key={item.id}>
                      <div className="workflow-card-meta">
                        <span className="badge">#{item.market_id}</span>
                        <span className="badge muted">{formatSport(item.sport)}</span>
                        <span className="badge muted">
                          {formatMarketShape(item.market_shape)}
                        </span>
                      </div>
                      <h3>{item.market_question}</h3>
                      <dl className="workflow-card-metrics">
                        <div>
                          <dt>SÍ</dt>
                          <dd>{formatPercent(item.latest_yes_price)}</dd>
                        </div>
                        <div>
                          <dt>NO</dt>
                          <dd>{formatPercent(item.latest_no_price)}</dd>
                        </div>
                      </dl>
                      {item.note ? <p>{item.note}</p> : null}
                      <label className="workflow-status-select">
                        Estado
                        <select
                          disabled={savingMarketId === item.market_id}
                          onChange={(event) =>
                            void updateStatus(
                              item,
                              event.target.value as InvestigationStatus,
                            )
                          }
                          value={item.status}
                        >
                          {INVESTIGATION_STATUS_ORDER.map((option) => (
                            <option key={option} value={option}>
                              {INVESTIGATION_STATUS_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <a className="analysis-link" href={`/markets/${item.market_id}`}>
                        Ver análisis
                      </a>
                    </article>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
