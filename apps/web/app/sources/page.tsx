"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiErrorState,
  ComingSoonModule,
  LoadingState,
} from "../components/DataState";
import { MainNavigation } from "../components/MainNavigation";
import { fetchApiJson, friendlyApiError } from "../lib/api";

type SourceQualityItem = {
  source_id: number;
  source_name: string;
  provider: string;
  source_type: string;
  source_url?: string | null;
  findings_count: number;
  evidence_count: number;
  avg_credibility?: string | number | null;
  avg_freshness?: string | number | null;
  avg_impact?: string | number | null;
  avg_evidence_confidence?: string | number | null;
  latest_seen_at?: string | null;
};

type SourceQualityResponse = {
  generated_at: string;
  total_sources: number;
  items: SourceQualityItem[];
};

async function fetchSourceQuality(): Promise<SourceQualityResponse> {
  return fetchApiJson<SourceQualityResponse>("/sources/quality?limit=200");
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
  return `${percent.toFixed(0)}%`;
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

export default function SourcesQualityPage() {
  const [state, setState] = useState<{
    data: SourceQualityResponse | null;
    loading: boolean;
    error: string | null;
    providerFilter: string;
  }>({
    data: null,
    loading: true,
    error: null,
    providerFilter: "all",
  });

  const loadSources = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await fetchSourceQuality();
      setState((current) => ({ ...current, data, loading: false, error: null }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyApiError(error, "calidad de fuentes"),
      }));
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const providers = useMemo(() => {
    const names = new Set((state.data?.items ?? []).map((item) => item.provider));
    return ["all", ...Array.from(names).sort()];
  }, [state.data?.items]);

  const items = useMemo(() => {
    const sourceItems = state.data?.items ?? [];
    if (state.providerFilter === "all") {
      return sourceItems;
    }
    return sourceItems.filter((item) => item.provider === state.providerFilter);
  }, [state.data?.items, state.providerFilter]);

  const totalFindings = items.reduce((total, item) => total + item.findings_count, 0);
  const totalEvidence = items.reduce((total, item) => total + item.evidence_count, 0);

  return (
    <main className="dashboard-shell sources-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">PolySignal</p>
          <h1>Calidad de fuentes</h1>
          <p className="subtitle">
            Vista read-only de fuentes usadas por PolySignal. La calidad de fuente es
            una señal interna, no una garantía.
          </p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle" onClick={() => void loadSources()} type="button">
            Actualizar
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Solo lectura:</strong>
        <span>
          Esta página no ejecuta research, no llama fuentes externas y no crea
          predicciones. Solo resume datos guardados.
        </span>
      </section>

      {state.error ? (
        <ApiErrorState
          message={`${state.error} La calidad de fuentes se conectara cuando haya evidencia persistida.`}
          onRetry={() => void loadSources()}
          title="Modulo en preparacion"
        />
      ) : null}

      <section className="metric-grid" aria-label="Resumen de fuentes">
        <article className="metric-card">
          <span>Fuentes</span>
          <strong>{state.loading ? "..." : items.length}</strong>
          <p>Filtradas por proveedor</p>
        </article>
        <article className="metric-card">
          <span>Findings</span>
          <strong>{state.loading ? "..." : totalFindings}</strong>
          <p>Evidencias estructuradas desde research guardado</p>
        </article>
        <article className="metric-card">
          <span>Evidence items</span>
          <strong>{state.loading ? "..." : totalEvidence}</strong>
          <p>Items locales vinculados a fuentes</p>
        </article>
        <article className="metric-card">
          <span>Generado</span>
          <strong>{state.data ? formatDate(state.data.generated_at) : "N/D"}</strong>
          <p>Sin fetch externo</p>
        </article>
      </section>

      <section className="filter-panel sources-filter-panel">
        <div className="filter-group">
          <label htmlFor="provider-filter">Proveedor</label>
          <select
            id="provider-filter"
            value={state.providerFilter}
            onChange={(event) =>
              setState((current) => ({ ...current, providerFilter: event.target.value }))
            }
          >
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider === "all" ? "Todos" : provider}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Fuentes conocidas</p>
            <h2>Calidad por fuente</h2>
          </div>
          <span className="badge muted">{state.data?.total_sources ?? 0} fuentes guardadas</span>
        </div>

        {state.loading ? (
          <LoadingState copy="Cargando fuentes..." />
        ) : items.length === 0 ? (
          <ComingSoonModule copy="No hay fuentes guardadas con el filtro actual. Esta vista se conectara al pipeline de evidencia cuando haya fuentes persistidas." />
        ) : (
          <div className="source-quality-grid">
            {items.map((item) => (
              <article className="source-quality-card" key={item.source_id}>
                <div>
                  <span className="badge">{item.provider}</span>
                  <span className="badge muted">{item.source_type}</span>
                </div>
                <h3>{item.source_name}</h3>
                {item.source_url ? (
                  <a className="text-link" href={item.source_url} rel="noreferrer" target="_blank">
                    Abrir fuente
                  </a>
                ) : (
                  <span className="quiet-text">Sin URL guardada</span>
                )}
                <dl className="source-quality-metrics">
                  <div>
                    <dt>Credibilidad</dt>
                    <dd>{formatPercent(item.avg_credibility)}</dd>
                  </div>
                  <div>
                    <dt>Freshness</dt>
                    <dd>{formatPercent(item.avg_freshness)}</dd>
                  </div>
                  <div>
                    <dt>Impacto</dt>
                    <dd>{formatPercent(item.avg_impact)}</dd>
                  </div>
                  <div>
                    <dt>Evidence conf.</dt>
                    <dd>{formatPercent(item.avg_evidence_confidence)}</dd>
                  </div>
                  <div>
                    <dt>Findings</dt>
                    <dd>{item.findings_count}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{item.evidence_count}</dd>
                  </div>
                </dl>
                <p className="section-note">Última vez usada: {formatDate(item.latest_seen_at)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
