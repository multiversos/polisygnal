"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson, friendlyApiError } from "../lib/api";
import {
  INVESTIGATION_STATUS_LABELS,
  INVESTIGATION_STATUS_ORDER,
  fetchInvestigationStatuses,
  updateMarketInvestigationStatus,
  type InvestigationStatus,
  type InvestigationStatusItem,
} from "../lib/investigationStatus";

type MarketOverviewWorkflowItem = {
  priority_bucket?: string | null;
  scoring_mode?: string | null;
  evidence_summary?: {
    evidence_count?: number | null;
  } | null;
  market?: {
    id?: number | null;
    question?: string | null;
    slug?: string | null;
    sport_type?: string | null;
    market_type?: string | null;
    active?: boolean | null;
    closed?: boolean | null;
    close_time?: string | null;
    end_date?: string | null;
  } | null;
  latest_snapshot?: {
    yes_price?: string | number | null;
    no_price?: string | number | null;
    liquidity?: string | number | null;
    volume?: string | number | null;
    captured_at?: string | null;
  } | null;
  latest_prediction?: {
    confidence_score?: string | number | null;
  } | null;
};

type MarketOverviewWorkflowResponse = {
  items?: MarketOverviewWorkflowItem[];
};

const DERIVED_STATUS_LABELS: Record<InvestigationStatus, string> = {
  pending_review: "Por revisar",
  investigating: "Con predicción",
  has_evidence: "Con evidencia",
  review_required: "Requiere evidencia",
  dismissed: "Descartado/vacío",
  paused: "Solo datos",
};

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

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function workflowColumnLabel(status: InvestigationStatus, derivedMode: boolean): string {
  return derivedMode ? DERIVED_STATUS_LABELS[status] : INVESTIGATION_STATUS_LABELS[status];
}

async function fetchMarketOverviewWorkflow(): Promise<MarketOverviewWorkflowResponse> {
  return fetchApiJson<MarketOverviewWorkflowResponse>("/markets/overview?limit=50");
}

function deriveWorkflowStatus(item: MarketOverviewWorkflowItem): InvestigationStatus {
  if (!item.latest_prediction) {
    return "paused";
  }
  if (item.scoring_mode === "fallback_only") {
    return "investigating";
  }
  const confidence = toNumber(item.latest_prediction.confidence_score);
  if (confidence !== null && confidence < 0.35) {
    return "review_required";
  }
  if ((item.evidence_summary?.evidence_count ?? 0) === 0) {
    return "review_required";
  }
  if (item.priority_bucket === "opportunity" || item.priority_bucket === "watchlist") {
    return "pending_review";
  }
  return "investigating";
}

function deriveWorkflowItems(overview: MarketOverviewWorkflowResponse): InvestigationStatusItem[] {
  const now = new Date().toISOString();
  return (overview.items ?? [])
    .filter((item) => item.market?.id)
    .map((item, index) => {
      const market = item.market;
      const snapshot = item.latest_snapshot ?? {};
      return {
        id: market?.id ?? index,
        market_id: market?.id ?? 0,
        status: deriveWorkflowStatus(item),
        note: "Estado derivado desde market overview; no es una decision humana guardada.",
        priority: index + 1,
        created_at: now,
        updated_at: snapshot.captured_at ?? now,
        market_question: market?.question ?? "Mercado sin titulo",
        market_slug: market?.slug ?? "",
        sport: market?.sport_type,
        market_shape: market?.market_type,
        close_time: market?.close_time ?? market?.end_date ?? null,
        active: market?.active ?? true,
        closed: market?.closed ?? false,
        latest_yes_price: snapshot.yes_price,
        latest_no_price: snapshot.no_price,
        liquidity: snapshot.liquidity,
        volume: snapshot.volume,
      } satisfies InvestigationStatusItem;
    });
}

export default function WorkflowPage() {
  const [items, setItems] = useState<InvestigationStatusItem[]>([]);
  const [derivedMode, setDerivedMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingMarketId, setSavingMarketId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDerivedMode(false);
    try {
      const savedItems = await fetchInvestigationStatuses();
      if (savedItems.length > 0) {
        setItems(savedItems);
      } else {
        const overview = await fetchMarketOverviewWorkflow();
        setItems(deriveWorkflowItems(overview));
        setDerivedMode(true);
      }
    } catch (error) {
      try {
        const overview = await fetchMarketOverviewWorkflow();
        setItems(deriveWorkflowItems(overview));
        setDerivedMode(true);
        setError(null);
      } catch {
        setError(friendlyApiError(error, "workflow de investigacion"));
      }
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

      {derivedMode ? (
        <section className="safety-strip">
          <strong>Workflow derivado:</strong>
          <span>
            Columnas calculadas desde /markets/overview. No se guardan decisiones
            humanas ni se ejecuta research, scoring o trading.
          </span>
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <section className="empty-state">
          <strong>Workflow listo, sin estados manuales todavía.</strong>
          <p>
            El dashboard tiene mercados reales; este tablero se llenará cuando
            marques estados de investigación desde el detalle de mercado.
          </p>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Resumen de workflow">
        {INVESTIGATION_STATUS_ORDER.map((status) => (
          <article className="metric-card" key={status}>
            <span>{workflowColumnLabel(status, derivedMode)}</span>
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
                <h2>{workflowColumnLabel(status, derivedMode)}</h2>
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
                      {derivedMode ? (
                        <span className="badge muted">Estado local derivado</span>
                      ) : (
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
                      )}
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
