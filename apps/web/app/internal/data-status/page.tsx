"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../../components/MainNavigation";
import { fetchApiJson, friendlyApiError } from "../../lib/api";
import {
  extractSoccerMatchContext,
  getSoccerContextReadiness,
} from "../../lib/soccerMatchContext";
import { formatLastUpdated } from "../../lib/useAutoRefresh";
import { WALLET_INTELLIGENCE_THRESHOLD_USD } from "../../lib/walletIntelligence";

type MarketOverviewItem = {
  market?: {
    active?: boolean | null;
    closed?: boolean | null;
    end_date?: string | null;
    event_slug?: string | null;
    event_title?: string | null;
    id?: number | null;
    market_slug?: string | null;
    question?: string | null;
    sport_type?: string | null;
  } | null;
  latest_prediction?: {
    run_at?: string | null;
  } | null;
  latest_snapshot?: {
    captured_at?: string | null;
    liquidity?: string | number | null;
    no_price?: string | number | null;
    volume?: string | number | null;
    yes_price?: string | number | null;
  } | null;
  evidence_summary?: {
    evidence_count?: number | string | null;
    news_evidence_count?: number | string | null;
    odds_evidence_count?: number | string | null;
  } | null;
};

type MarketsOverviewResponse = {
  items?: MarketOverviewItem[];
  limit?: number;
  offset?: number;
  total_count?: number;
};

type PageState = {
  agentDiagnostic: AnalysisAgentDiagnostic | null;
  error: string | null;
  items: MarketOverviewItem[];
  loadedPages: number;
  loading: boolean;
  proxyStatus: "checking" | "error" | "ok";
  totalCount: number;
  updatedAt: Date | null;
};

type AnalysisAgentDiagnostic = {
  agentId?: string;
  agentName?: string;
  bridgeEnabled?: boolean;
  endpointConfigured?: boolean;
  endpointHost?: string | null;
  expectedState?: "Connected" | "Disabled" | "Misconfigured" | "Unavailable";
  health?: {
    checkedAt?: string;
    httpStatus?: number | null;
    message?: string;
    status?: "error" | "ok" | "skipped";
  };
  message?: string;
  usesGenericEnv?: boolean;
};

const PAGE_SIZE = 50;
const MAX_ITEMS = 200;
const RECENT_HOURS = 48;

function parseDate(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function latestUpdate(item: MarketOverviewItem): number | null {
  const values = [
    parseDate(item.latest_prediction?.run_at),
    parseDate(item.latest_snapshot?.captured_at),
  ].filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function hasPrice(item: MarketOverviewItem): boolean {
  return (
    item.latest_snapshot?.yes_price !== null &&
    item.latest_snapshot?.yes_price !== undefined
  );
}

function hasLiquidity(item: MarketOverviewItem): boolean {
  const value = Number(item.latest_snapshot?.liquidity ?? 0);
  return Number.isFinite(value) && value > 0;
}

function hasVolume(item: MarketOverviewItem): boolean {
  const value = Number(item.latest_snapshot?.volume ?? 0);
  return Number.isFinite(value) && value > 0;
}

function hasExternalEvidence(item: MarketOverviewItem): boolean {
  const evidence =
    Number(item.evidence_summary?.evidence_count ?? 0) +
    Number(item.evidence_summary?.news_evidence_count ?? 0) +
    Number(item.evidence_summary?.odds_evidence_count ?? 0);
  return Number.isFinite(evidence) && evidence > 0;
}

async function fetchSoccerOverview(): Promise<{
  items: MarketOverviewItem[];
  loadedPages: number;
  totalCount: number;
}> {
  const first = await fetchApiJson<MarketsOverviewResponse>(
    `/markets/overview?sport_type=soccer&limit=${PAGE_SIZE}&offset=0`,
  );
  const totalCount = Number(first.total_count ?? first.items?.length ?? 0);
  const items = [...(first.items ?? [])];
  let loadedPages = 1;
  let offset = PAGE_SIZE;

  while (items.length < totalCount && items.length < MAX_ITEMS) {
    const page = await fetchApiJson<MarketsOverviewResponse>(
      `/markets/overview?sport_type=soccer&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    const nextItems = page.items ?? [];
    if (nextItems.length === 0) {
      break;
    }
    loadedPages += 1;
    items.push(...nextItems);
    offset += PAGE_SIZE;
  }

  return { items, loadedPages, totalCount };
}

async function fetchAnalysisAgentDiagnostic(): Promise<AnalysisAgentDiagnostic | null> {
  try {
    const response = await fetch("/api/analysis-agent/diagnostics", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AnalysisAgentDiagnostic;
  } catch {
    return null;
  }
}

export default function InternalDataStatusPage() {
  const [state, setState] = useState<PageState>({
    agentDiagnostic: null,
    error: null,
    items: [],
    loadedPages: 0,
    loading: true,
    proxyStatus: "checking",
    totalCount: 0,
    updatedAt: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, error: null, loading: true, proxyStatus: "checking" }));
    try {
      const [payload, agentDiagnostic] = await Promise.all([
        fetchSoccerOverview(),
        fetchAnalysisAgentDiagnostic(),
      ]);
      setState({
        agentDiagnostic,
        error: null,
        items: payload.items,
        loadedPages: payload.loadedPages,
        loading: false,
        proxyStatus: "ok",
        totalCount: payload.totalCount,
        updatedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error:
          current.items.length > 0
            ? "No se pudo consultar ahora. Mostramos la ultima informacion disponible."
            : friendlyApiError(error, "estado de datos"),
        loading: false,
        proxyStatus: "error",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const recentThreshold = Date.now() - RECENT_HOURS * 60 * 60 * 1000;
    const latest = state.items
      .map(latestUpdate)
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0];
    return {
      active: state.items.filter((item) => item.market?.active && !item.market?.closed).length,
      closed: state.items.filter((item) => item.market?.closed || !item.market?.active).length,
      latest,
      recent: state.items.filter((item) => {
        const value = latestUpdate(item);
        return value !== null && value >= recentThreshold;
      }).length,
      stale: state.items.filter((item) => {
        const value = latestUpdate(item);
        return value === null || value < recentThreshold;
      }).length,
      withCompleteMarketData: state.items.filter(
        (item) => hasPrice(item) && hasLiquidity(item) && hasVolume(item),
      ).length,
      withLiquidity: state.items.filter(hasLiquidity).length,
      withPrediction: state.items.filter((item) => Boolean(item.latest_prediction)).length,
      withPrice: state.items.filter(hasPrice).length,
      withSnapshot: state.items.filter((item) => Boolean(item.latest_snapshot)).length,
      withVolume: state.items.filter(hasVolume).length,
    };
  }, [state.items]);

  const missing = useMemo(
    () => ({
      liquidity: state.items.length - summary.withLiquidity,
      prediction: state.items.length - summary.withPrediction,
      price: state.items.length - summary.withPrice,
      snapshot: state.items.length - summary.withSnapshot,
      volume: state.items.length - summary.withVolume,
    }),
    [state.items.length, summary],
  );
  const soccerReadiness = useMemo(() => {
    const contexts = state.items.map((item) => extractSoccerMatchContext(item));
    const readiness = contexts.map(getSoccerContextReadiness);
    const missingCounts = new Map<string, number>();
    for (const item of readiness) {
      for (const reason of item.missing) {
        missingCounts.set(reason, (missingCounts.get(reason) ?? 0) + 1);
      }
    }
    return {
      contextPartial: readiness.filter((item) => item.level === "partial").length,
      readyForExternalResearch: readiness.filter((item) => item.readyForExternalResearch).length,
      topMissing: Array.from(missingCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5),
      withDate: readiness.filter((item) => item.hasDate).length,
      withTeams: readiness.filter((item) => item.hasTeams).length,
      withoutDate: readiness.filter((item) => !item.hasDate).length,
    };
  }, [state.items]);
  const externalResearchReadiness = useMemo(() => {
    const withContext = soccerReadiness.readyForExternalResearch;
    const withExternalEvidence = state.items.filter(hasExternalEvidence).length;
    return {
      missingExternalEvidence: state.items.length - withExternalEvidence,
      status: "Pendiente de integracion de fuentes",
      withContext,
      withExternalEvidence,
    };
  }, [soccerReadiness.readyForExternalResearch, state.items]);
  const needsSupervisedRefresh =
    summary.stale > 0 || missing.snapshot > 0 || missing.prediction > 0;

  return (
    <main className="page-shell internal-status-page">
      <MainNavigation />
      <section className="hero-panel compact">
        <div>
          <p className="eyebrow">Solo lectura</p>
          <h1>Estado de datos</h1>
          <p>
            Vista interna oculta para confirmar si la cartelera pública de fútbol está
            cargada y actualizada. No contiene acciones de escritura.
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" disabled={state.loading} onClick={() => void load()}>
            {state.loading ? "Actualizando..." : "Actualizar"}
          </button>
          <Link className="primary-button" href="/sports/soccer">
            Ver fútbol
          </Link>
        </div>
      </section>

      {state.error ? (
        <section className="empty-state">
          <strong>No pudimos actualizar ahora.</strong>
          <p>{state.error}</p>
        </section>
      ) : null}

      <section className="internal-status-grid">
        <article className="internal-status-card">
          <span>Estado proxy publico</span>
          <strong>
            {state.proxyStatus === "checking"
              ? "Revisando"
              : state.proxyStatus === "ok"
                ? "Disponible"
                : "No se pudo consultar"}
          </strong>
          <p>
            {state.loadedPages > 0
              ? `${state.loadedPages} paginas leidas desde datos publicos disponibles.`
              : "Sin consulta exitosa en esta carga."}
          </p>
        </article>
        <article className="internal-status-card">
          <span>Total fútbol</span>
          <strong>{state.totalCount}</strong>
          <p>{state.items.length} mercados cargados para esta revisión.</p>
        </article>
        <article className="internal-status-card">
          <span>Con actualización</span>
          <strong>{summary.withSnapshot}</strong>
          <p>{missing.snapshot} sin actualización guardada.</p>
        </article>
        <article className="internal-status-card">
          <span>Con análisis</span>
          <strong>{summary.withPrediction}</strong>
          <p>{missing.prediction} sin análisis guardado.</p>
        </article>
        <article className="internal-status-card">
          <span>Estado</span>
          <strong>{summary.active} activos</strong>
          <p>{summary.closed} cerrados o inactivos.</p>
        </article>
        <article className="internal-status-card">
          <span>Frescura</span>
          <strong>{summary.recent} recientes</strong>
          <p>{summary.stale} sin cambios recientes.</p>
        </article>
        <article className="internal-status-card">
          <span>Con precio visible</span>
          <strong>{summary.withPrice}</strong>
          <p>{missing.price} sin precio cargado.</p>
        </article>
        <article className="internal-status-card">
          <span>Con liquidez visible</span>
          <strong>{summary.withLiquidity}</strong>
          <p>{missing.liquidity} sin liquidez cargada.</p>
        </article>
        <article className="internal-status-card">
          <span>Con volumen visible</span>
          <strong>{summary.withVolume}</strong>
          <p>{missing.volume} sin volumen cargado.</p>
        </article>
        <article className="internal-status-card">
          <span>Datos completos</span>
          <strong>{summary.withCompleteMarketData}</strong>
          <p>Precio, liquidez y volumen visibles.</p>
        </article>
        <article className="internal-status-card">
          <span>Última actividad visible</span>
          <strong>{summary.latest ? formatLastUpdated(new Date(summary.latest)) : "Sin fecha"}</strong>
          <p>{state.updatedAt ? `Revisado ${formatLastUpdated(state.updatedAt)}` : "Pendiente"}</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Investigacion externa</p>
            <h2>{externalResearchReadiness.status}</h2>
            <p>
              Diagnostico read-only para saber cuantos mercados tienen contexto deportivo
              y cuantos siguen sin fuentes externas verificadas.
            </p>
          </div>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Mercados soccer</span>
            <strong>{state.totalCount}</strong>
            <p>{state.items.length} cargados en esta revision.</p>
          </article>
          <article className="internal-status-card">
            <span>Con contexto deportivo</span>
            <strong>{externalResearchReadiness.withContext}</strong>
            <p>Equipos y fecha suficientes para investigar despues.</p>
          </article>
          <article className="internal-status-card">
            <span>Con evidencia externa real</span>
            <strong>{externalResearchReadiness.withExternalEvidence}</strong>
            <p>Segun resumen de evidencias ya cargado.</p>
          </article>
          <article className="internal-status-card">
            <span>Sin evidencia externa</span>
            <strong>{externalResearchReadiness.missingExternalEvidence}</strong>
            <p>No hay fuentes externas verificadas disponibles todavia.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Analysis Agent Bridge</p>
            <h2>{state.agentDiagnostic?.message ?? "Agente pendiente de diagnostico"}</h2>
            <p>
              Diagnostico interno read-only del puente entre PolySignal y el agente
              analizador. Muestra solo estado y dominio configurado, nunca credenciales.
            </p>
          </div>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Provider activo</span>
            <strong>{state.agentDiagnostic?.agentName ?? "No disponible"}</strong>
            <p>{state.agentDiagnostic?.agentId ?? "Sin identificador visible."}</p>
          </article>
          <article className="internal-status-card">
            <span>Bridge enabled</span>
            <strong>{state.agentDiagnostic?.bridgeEnabled ? "Si" : "No"}</strong>
            <p>
              {state.agentDiagnostic?.usesGenericEnv
                ? "Usa variables ANALYSIS_AGENT_*."
                : "Usa compatibilidad legacy o no hay configuracion generica."}
            </p>
          </article>
          <article className="internal-status-card">
            <span>Bridge URL configurada</span>
            <strong>{state.agentDiagnostic?.endpointConfigured ? "Si" : "No"}</strong>
            <p>{state.agentDiagnostic?.endpointHost ?? "Dominio no disponible."}</p>
          </article>
          <article className="internal-status-card">
            <span>Ultimo health check</span>
            <strong>
              {state.agentDiagnostic?.health?.status === "ok"
                ? "OK"
                : state.agentDiagnostic?.health?.status === "error"
                  ? "Error"
                  : "Pendiente"}
            </strong>
            <p>
              {state.agentDiagnostic?.health?.httpStatus
                ? `HTTP ${state.agentDiagnostic.health.httpStatus}`
                : state.agentDiagnostic?.health?.message ?? "Sin consulta reciente."}
            </p>
          </article>
          <article className="internal-status-card">
            <span>Estado esperado</span>
            <strong>{state.agentDiagnostic?.expectedState ?? "Unavailable"}</strong>
            <p>
              {state.agentDiagnostic?.expectedState === "Connected"
                ? "Samantha puede responder lecturas automaticas."
                : "La UI conserva lectura parcial sin flujo manual publico."}
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Inteligencia de billeteras</p>
            <h2>Disponible parcial read-only</h2>
            <p>
              Diagnostico read-only para confirmar que la app puede consultar resumenes
              sanitizados de billeteras publicas sin mostrar direcciones completas ni
              datos personales.
            </p>
          </div>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Estado</span>
            <strong>Disponible parcial read-only</strong>
            <p>La UI consulta resumenes acotados; esta pagina no ejecuta cambios.</p>
          </article>
          <article className="internal-status-card">
            <span>Fuente trades/positions</span>
            <strong>Endpoint detectado</strong>
            <p>GET /markets/{"{market_id}"}/wallet-intelligence con limite y umbral.</p>
          </article>
          <article className="internal-status-card">
            <span>Umbral activo</span>
            <strong>${WALLET_INTELLIGENCE_THRESHOLD_USD}+</strong>
            <p>Solo movimientos relevantes por encima del umbral.</p>
          </article>
          <article className="internal-status-card">
            <span>Adapter frontend</span>
            <strong>Con sanitizacion</strong>
            <p>Usa GET, direcciones abreviadas y no devuelve payloads crudos.</p>
          </article>
          <article className="internal-status-card">
            <span>Uso en PolySignal</span>
            <strong>Senal auxiliar</strong>
            <p>No crea estimacion, predictedSide ni recomendacion de copiar operaciones.</p>
          </article>
          <article className="internal-status-card">
            <span>Privacidad</span>
            <strong>Sin identidades</strong>
            <p>Solo direcciones abreviadas cuando exista una fuente real.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Readiness deportivo</p>
            <h2>Contexto de futbol</h2>
            <p>
              Solo lectura: mide si los mercados tienen partido, equipos y fecha suficientes
              para preparar investigacion deportiva futura.
            </p>
          </div>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Equipos identificados</span>
            <strong>{soccerReadiness.withTeams}</strong>
            <p>Mercados donde el evento permite ver dos equipos.</p>
          </article>
          <article className="internal-status-card">
            <span>Con fecha</span>
            <strong>{soccerReadiness.withDate}</strong>
            <p>{soccerReadiness.withoutDate} sin fecha clara.</p>
          </article>
          <article className="internal-status-card">
            <span>Contexto parcial</span>
            <strong>{soccerReadiness.contextPartial}</strong>
            <p>Mercados con algunos datos, pero todavia incompletos.</p>
          </article>
          <article className="internal-status-card">
            <span>Listos para investigacion</span>
            <strong>{soccerReadiness.readyForExternalResearch}</strong>
            <p>Tienen equipos y fecha para buscar fuentes externas despues.</p>
          </article>
        </div>
        <div className="internal-status-list">
          {soccerReadiness.topMissing.map(([reason, count]) => (
            <article className="internal-status-row" key={reason}>
              <strong>{reason}</strong>
              <span>{count} mercados</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Frescura de datos</p>
            <h2>{needsSupervisedRefresh ? "Requiere refresh supervisado" : "Frescura estable"}</h2>
            <p>
              Esta página es solo lectura: muestra el estado actual y no ejecuta cambios.
            </p>
          </div>
          <Link className="secondary-button" href="/sports/soccer">
            Ver fútbol
          </Link>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Sin actualización</span>
            <strong>{missing.snapshot}</strong>
            <p>Mercados que necesitan una lectura nueva antes de analizarlos.</p>
          </article>
          <article className="internal-status-card">
            <span>Sin análisis</span>
            <strong>{missing.prediction}</strong>
            <p>Mercados que podrían analizarse cuando tengan datos suficientes.</p>
          </article>
          <article className="internal-status-card">
            <span>Stale 48h</span>
            <strong>{summary.stale}</strong>
            <p>Mercados sin actividad visible reciente en esta ventana.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Resolucion de historial</p>
            <h2>Verificacion local y automatica</h2>
            <p>
              Historial sigue en este navegador, no esta sincronizado y no tiene backend persistente.
              La verificacion automatica depende de resultados disponibles en PolySignal.
            </p>
          </div>
        </div>
        <div className="internal-status-grid">
          <article className="internal-status-card">
            <span>Modo</span>
            <strong>Solo lectura</strong>
            <p>Esta pagina no ejecuta cambios ni lee datos personales del historial local.</p>
          </article>
          <article className="internal-status-card">
            <span>Resultado</span>
            <strong>Automatico</strong>
            <p>Si no hay outcome confiable, el analisis queda pendiente o desconocido.</p>
          </article>
          <article className="internal-status-card">
            <span>Persistencia</span>
            <strong>No sincronizado</strong>
            <p>La fase actual no crea tablas ni escribe en base de datos.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <div>
            <h2>Muestras que podrían requerir revisión</h2>
            <p>Se listan mercados sin precio reciente, sin análisis o sin actividad reciente.</p>
          </div>
        </div>
        <div className="internal-status-list">
          {state.items
            .filter((item) => !item.latest_snapshot || !item.latest_prediction || !latestUpdate(item))
            .slice(0, 8)
            .map((item) => (
              <article className="internal-status-row" key={item.market?.id ?? item.market?.question}>
                <strong>{item.market?.question ?? "Mercado sin título"}</strong>
                <span>
                  {item.latest_snapshot ? "Con actualización" : "Sin actualización"} ·{" "}
                  {item.latest_prediction ? "Con análisis" : "Sin análisis"}
                </span>
              </article>
            ))}
          {!state.loading &&
          state.items.filter((item) => !item.latest_snapshot || !item.latest_prediction).length === 0 ? (
            <p className="quiet-text">No hay faltantes básicos en los mercados cargados.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
