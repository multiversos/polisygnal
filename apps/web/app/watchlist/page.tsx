"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MainNavigation } from "../components/MainNavigation";
import { getMarketActivityLabel, getMarketReviewReason } from "../lib/publicMarketInsights";
import { getPublicMarketStatus } from "../lib/publicMarketStatus";
import { formatLastUpdated } from "../lib/useAutoRefresh";
import {
  WATCHLIST_STATUS_LABELS,
  WATCHLIST_STORAGE_EVENT,
  clearWatchlistItems,
  fetchWatchlistItems,
  removeWatchlistItem,
  type WatchlistItem,
} from "../lib/watchlist";

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasVisiblePrice(item: WatchlistItem): boolean {
  return toNumber(item.latest_yes_price) !== null || toNumber(item.latest_no_price) !== null;
}

function formatPercent(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return `${Math.round(parsed * 100)}%`;
}

function formatMarketMetric(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "sin dato";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: parsed >= 100 ? 0 : 1,
    notation: parsed >= 100000 ? "compact" : "standard",
  }).format(parsed);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "sin fecha";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function sportLabel(value?: string | null): string {
  if (!value) {
    return "Deporte";
  }
  const labels: Record<string, string> = {
    baseball: "Beisbol",
    basketball: "Baloncesto",
    horse_racing: "Carreras",
    nfl: "NFL",
    soccer: "Futbol",
    tennis: "Tenis",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function insightInput(item: WatchlistItem) {
  return {
    active: item.active,
    closeTime: item.close_time,
    closed: item.closed,
    hasAnalysis: false,
    hasPrice: hasVisiblePrice(item),
    liquidity: item.liquidity,
    updatedAt: item.updated_at,
    volume: item.volume,
  };
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadWatchlist = useCallback(async () => {
    setError(null);
    try {
      const nextItems = await fetchWatchlistItems();
      setItems(nextItems);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos leer tu lista ahora. Mostramos lo ultimo disponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    const syncWatchlist = () => {
      void loadWatchlist();
    };
    window.addEventListener(WATCHLIST_STORAGE_EVENT, syncWatchlist);
    window.addEventListener("storage", syncWatchlist);
    return () => {
      window.removeEventListener(WATCHLIST_STORAGE_EVENT, syncWatchlist);
      window.removeEventListener("storage", syncWatchlist);
    };
  }, [loadWatchlist]);

  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }, [items]);

  const activeCount = useMemo(() => items.filter((item) => item.active && !item.closed).length, [items]);
  const withPriceCount = useMemo(() => items.filter(hasVisiblePrice).length, [items]);

  const handleRemove = useCallback(async (itemId: number) => {
    setBusyItemId(itemId);
    setError(null);
    try {
      await removeWatchlistItem(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos quitar este mercado ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setBusyItemId(null);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    if (items.length === 0) {
      return;
    }
    const confirmed = window.confirm("Borrar todos los mercados guardados en este navegador?");
    if (!confirmed) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      await clearWatchlistItems();
      setItems([]);
      setUpdatedAt(new Date());
    } catch {
      setError("No pudimos vaciar Mi lista ahora. Intenta de nuevo en unos segundos.");
    } finally {
      setClearing(false);
    }
  }, [items.length]);

  return (
    <main className="dashboard-shell watchlist-page">
      <MainNavigation />
      <header className="topbar">
        <div>
          <p className="eyebrow">Mi lista</p>
          <h1>Mercados guardados</h1>
          <p className="subtitle">
            Un lugar simple para volver a los mercados que quieres revisar mas rapido.
          </p>
        </div>
        <div className="topbar-actions">
          <span className="timestamp-pill">{formatLastUpdated(updatedAt)}</span>
          <button className="theme-toggle" onClick={() => void loadWatchlist()} type="button">
            {loading ? "Actualizando" : "Actualizar"}
          </button>
          <button
            className="watchlist-button danger"
            disabled={clearing || loading || items.length === 0}
            onClick={() => void handleClearAll()}
            type="button"
          >
            {clearing ? "Vaciando" : "Vaciar Mi lista"}
          </button>
        </div>
      </header>

      <section className="safety-strip">
        <strong>Guardado local:</strong>
        <span>
          Esta lista se guarda en este navegador. Si cambias de dispositivo, no se
          sincroniza todavia. Puedes vaciarla cuando quieras; mas adelante podra
          guardarse en una cuenta.
        </span>
      </section>

      <section className="metric-grid" aria-label="Resumen de Mi lista">
        <article className="metric-card">
          <span>Guardados</span>
          <strong>{loading ? "..." : items.length}</strong>
          <p>Mercados en este navegador</p>
        </article>
        <article className="metric-card">
          <span>Activos</span>
          <strong>{loading ? "..." : activeCount}</strong>
          <p>Disponibles para revisar</p>
        </article>
        <article className="metric-card">
          <span>Con precio</span>
          <strong>{loading ? "..." : withPriceCount}</strong>
          <p>Con informacion visible</p>
        </article>
      </section>

      {error ? (
        <section className="alert-panel compact" role="status">
          <strong>Mi lista no se pudo actualizar</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="dashboard-panel watchlist-page-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Seguimiento</p>
            <h2>Mercados que sigues</h2>
            <p>Ordenados por los guardados o actualizados mas recientemente.</p>
          </div>
          <span className="badge muted">{items.length} guardados</span>
        </div>

        {loading ? (
          <div className="empty-state compact">Cargando tu lista...</div>
        ) : sortedItems.length === 0 ? (
          <div className="empty-state compact">
            <strong>Todavia no tienes mercados guardados.</strong>
            <p>Cuando sigas un mercado, aparecera aqui para revisarlo mas rapido.</p>
            <div className="empty-state-actions">
              <a className="analysis-link" href="/sports">
                Explorar mercados deportivos
              </a>
              <a className="analysis-link secondary" href="/sports/soccer">
                Ver futbol
              </a>
            </div>
          </div>
        ) : (
          <div className="watchlist-card-grid">
            {sortedItems.map((item) => {
              const input = insightInput(item);
              const publicStatus = getPublicMarketStatus(input);
              const activity = getMarketActivityLabel(input);
              const reason = getMarketReviewReason(input);
              return (
                <article className="watchlist-card watchlist-page-card" key={item.id}>
                  <div className="watchlist-card-header">
                    <div className="badge-row">
                      <span className={`market-status-badge ${publicStatus.tone}`}>
                        {publicStatus.label}
                      </span>
                      <span className="badge muted">{sportLabel(item.sport)}</span>
                      <span className="badge external-hint">
                        {WATCHLIST_STATUS_LABELS[item.status]}
                      </span>
                    </div>
                  </div>
                  <h3>{item.market_question}</h3>
                  <p className="section-note">{reason.reason}</p>
                  <div className="watchlist-market-metrics">
                    <span>Si {formatPercent(item.latest_yes_price)}</span>
                    <span>No {formatPercent(item.latest_no_price)}</span>
                    <span>Liquidez {formatMarketMetric(item.liquidity)}</span>
                    <span>Volumen {formatMarketMetric(item.volume)}</span>
                    <span>Guardado {formatDate(item.updated_at)}</span>
                  </div>
                  {activity ? (
                    <p className="watchlist-note">
                      {activity.label}: {activity.detail}
                    </p>
                  ) : null}
                  {item.note ? <p className="watchlist-note">{item.note}</p> : null}
                  <div className="watchlist-actions">
                    <a className="analysis-link" href={`/markets/${item.market_id}`}>
                      Ver detalle
                    </a>
                    <button
                      className="watchlist-button danger"
                      disabled={busyItemId === item.id}
                      onClick={() => void handleRemove(item.id)}
                      type="button"
                    >
                      {busyItemId === item.id ? "Quitando" : "Quitar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
