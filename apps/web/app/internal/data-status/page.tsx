"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../../components/MainNavigation";
import { fetchApiJson, friendlyApiError } from "../../lib/api";
import { formatLastUpdated } from "../../lib/useAutoRefresh";

type MarketOverviewItem = {
  market?: {
    active?: boolean | null;
    closed?: boolean | null;
    end_date?: string | null;
    id?: number | null;
    question?: string | null;
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
};

type MarketsOverviewResponse = {
  items?: MarketOverviewItem[];
  limit?: number;
  offset?: number;
  total_count?: number;
};

type PageState = {
  error: string | null;
  items: MarketOverviewItem[];
  loading: boolean;
  totalCount: number;
  updatedAt: Date | null;
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

async function fetchSoccerOverview(): Promise<{ items: MarketOverviewItem[]; totalCount: number }> {
  const first = await fetchApiJson<MarketsOverviewResponse>(
    `/markets/overview?sport_type=soccer&limit=${PAGE_SIZE}&offset=0`,
  );
  const totalCount = Number(first.total_count ?? first.items?.length ?? 0);
  const items = [...(first.items ?? [])];
  let offset = PAGE_SIZE;

  while (items.length < totalCount && items.length < MAX_ITEMS) {
    const page = await fetchApiJson<MarketsOverviewResponse>(
      `/markets/overview?sport_type=soccer&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    const nextItems = page.items ?? [];
    if (nextItems.length === 0) {
      break;
    }
    items.push(...nextItems);
    offset += PAGE_SIZE;
  }

  return { items, totalCount };
}

export default function InternalDataStatusPage() {
  const [state, setState] = useState<PageState>({
    error: null,
    items: [],
    loading: true,
    totalCount: 0,
    updatedAt: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, error: null, loading: true }));
    try {
      const payload = await fetchSoccerOverview();
      setState({
        error: null,
        items: payload.items,
        loading: false,
        totalCount: payload.totalCount,
        updatedAt: new Date(),
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: friendlyApiError(error, "estado de datos"),
        loading: false,
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
