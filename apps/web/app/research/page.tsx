"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiErrorState,
  ComingSoonModule,
  LoadingState,
} from "../components/DataState";
import { MainNavigation } from "../components/MainNavigation";
import { fetchResearchRuns, type ResearchRunItem } from "../lib/researchRuns";

const statusLabels: Record<string, string> = {
  completed: "Completado",
  failed: "Fallido",
  pending_agent: "Pendiente de agente",
  running: "En curso",
};

const modeLabels: Record<string, string> = {
  cheap_research: "Research económico",
  codex_agent: "Codex Agent",
  local_only: "Solo local",
};

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

function formatStatus(status: string): string {
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

function formatMode(mode: string): string {
  return modeLabels[mode] ?? mode.replaceAll("_", " ");
}

function hasPacket(run: ResearchRunItem): boolean {
  return Boolean(run.request_path || run.packet_path || run.expected_response_path);
}

export default function ResearchDashboardPage() {
  const [runs, setRuns] = useState<ResearchRunItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchResearchRuns({
        status: statusFilter || null,
        researchMode: modeFilter || null,
        marketId: marketFilter.trim() || null,
        limit: 50,
      });
      setRuns(response.items);
    } catch {
      setError("No se pudieron cargar los research runs.");
    } finally {
      setLoading(false);
    }
  }, [marketFilter, modeFilter, statusFilter]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const summary = useMemo(() => {
    return {
      total: runs.length,
      pending: runs.filter((run) => run.status === "pending_agent").length,
      withPackets: runs.filter(hasPacket).length,
      withOutputs: runs.filter(
        (run) => run.has_findings || run.has_report || run.has_prediction,
      ).length,
    };
  }, [runs]);

  return (
    <main className="dashboard-shell research-dashboard-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Centro de investigación</h1>
          <p className="subtitle">
            Revisa research runs y packets generados. Esta página no ejecuta
            investigación automáticamente, no ingesta respuestas y no crea predicciones.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadRuns()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          El centro de investigación sirve para auditar paquetes y estados. Las
          acciones de research e ingestión siguen siendo manuales y explícitas.
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumen de research runs">
        <article className="metric-card">
          <span>Runs visibles</span>
          <strong>{loading ? "..." : summary.total}</strong>
          <p>Con filtros actuales</p>
        </article>
        <article className="metric-card">
          <span>Pendientes</span>
          <strong>{loading ? "..." : summary.pending}</strong>
          <p>Esperando respuesta del agente</p>
        </article>
        <article className="metric-card">
          <span>Packets</span>
          <strong>{loading ? "..." : summary.withPackets}</strong>
          <p>Con rutas request/packet/response</p>
        </article>
        <article className="metric-card">
          <span>Con salidas</span>
          <strong>{loading ? "..." : summary.withOutputs}</strong>
          <p>Findings, reporte o predicción guardada</p>
        </article>
      </section>

      <section className="filter-panel research-filter-panel" aria-label="Filtros de research">
        <label className="filter-group">
          Estado
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="">Todos</option>
            <option value="pending_agent">Pendiente de agente</option>
            <option value="completed">Completado</option>
            <option value="failed">Fallido</option>
            <option value="running">En curso</option>
          </select>
        </label>
        <label className="filter-group">
          Modo
          <select onChange={(event) => setModeFilter(event.target.value)} value={modeFilter}>
            <option value="">Todos</option>
            <option value="codex_agent">Codex Agent</option>
            <option value="local_only">Solo local</option>
            <option value="cheap_research">Research económico</option>
          </select>
        </label>
        <label className="filter-group">
          Market ID
          <input
            inputMode="numeric"
            onChange={(event) => setMarketFilter(event.target.value)}
            placeholder="Ej. 146"
            value={marketFilter}
          />
        </label>
      </section>

      {error ? (
        <ApiErrorState
          message={`${error} El centro de investigación se conectará al pipeline cuando los runs estén disponibles.`}
          onRetry={() => void loadRuns()}
          title="Módulo en preparación"
        />
      ) : null}

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Runs y packets</p>
            <h2>Research runs generados</h2>
          </div>
          <span className="badge muted">{runs.length} runs</span>
        </div>

        {loading ? (
          <LoadingState copy="Cargando research runs..." />
        ) : runs.length === 0 ? (
          <ComingSoonModule copy="No hay research runs todavía. Los packets aparecerán aquí cuando el pipeline de investigación se active desde un mercado." />
        ) : (
          <div className="research-run-list">
            {runs.map((run) => (
              <article className="research-run-card" key={run.id}>
                <div className="research-run-header">
                  <div>
                    <span className="badge">Run #{run.id}</span>
                    <span className="badge muted">Market #{run.market_id}</span>
                    <span className={`badge status-${run.status}`}>
                      {formatStatus(run.status)}
                    </span>
                  </div>
                  <span className="quiet-text">{formatDate(run.started_at)}</span>
                </div>
                <h3>{run.market?.question ?? `Mercado #${run.market_id}`}</h3>
                <p className="section-note">
                  Modo: {formatMode(run.research_mode)} - Shape: {run.market_shape}
                </p>
                <dl className="research-run-metrics">
                  <div>
                    <dt>Findings</dt>
                    <dd>{run.findings_count}</dd>
                  </div>
                  <div>
                    <dt>Report</dt>
                    <dd>{run.has_report ? "Si" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Prediction</dt>
                    <dd>{run.has_prediction ? "Si" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Packet</dt>
                    <dd>{hasPacket(run) ? "Si" : "No"}</dd>
                  </div>
                </dl>
                {run.warnings.length > 0 ? (
                  <div className="quality-badge-row">
                    {run.warnings.map((warning) => (
                      <span className="quality-badge warning" key={warning}>
                        {warning.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="card-actions">
                  <Link className="analysis-link" href={`/markets/${run.market_id}`}>
                    Ver mercado
                  </Link>
                  <Link className="analysis-link secondary" href={`/research/runs/${run.id}`}>
                    Ver detalle del run
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
