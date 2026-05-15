"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCopyTradingDashboardData,
  runCopyTradingDemoTick,
  runCopyTradingWatcherOnce,
  startCopyTradingWatcher,
  stopCopyTradingWatcher,
} from "../../lib/copyTrading";
import type { CopyTradingDashboardData, CopyTradingTickSummary } from "../../lib/copyTradingTypes";
import { AddCopyWalletForm } from "./AddCopyWalletForm";
import { CopyBotEvents } from "./CopyBotEvents";
import { CopyOrdersTable } from "./CopyOrdersTable";
import { CopyTradesTable } from "./CopyTradesTable";
import { CopyTradingHeader } from "./CopyTradingHeader";
import { CopyTradingMetrics } from "./CopyTradingMetrics";
import { CopyWatcherPanel } from "./CopyWatcherPanel";
import { CopyWalletsTable } from "./CopyWalletsTable";
import { ExecutionWalletCard } from "./ExecutionWalletCard";

const AUTO_REFRESH_INTERVAL_MS = 5_000;

export function CopyTradingDashboard() {
  const [data, setData] = useState<CopyTradingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickSummary, setTickSummary] = useState<CopyTradingTickSummary | null>(null);
  const [runningTick, setRunningTick] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watcherBusy, setWatcherBusy] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("Sin datos todavia");
  const isRefreshingRef = useRef(false);

  const refresh = useCallback(async (options?: { isBackground?: boolean }) => {
    if (isRefreshingRef.current) {
      return false;
    }
    isRefreshingRef.current = true;
    setRefreshing(true);
    if (!options?.isBackground) {
      setError(null);
    }
    try {
      const nextData = await getCopyTradingDashboardData();
      setData(nextData);
      setLastUpdatedAt(new Date());
      if (options?.isBackground) {
        setError(null);
      }
      return true;
    } catch {
      setError("No pudimos actualizar Copy Trading ahora. Seguiremos intentando.");
      return false;
    } finally {
      isRefreshingRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function updateVisibility() {
      setPageVisible(document.visibilityState === "visible");
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }
    const intervalId = window.setInterval(() => {
      if (!pageVisible || isRefreshingRef.current) {
        return;
      }
      void refresh({ isBackground: true });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled, pageVisible, refresh]);

  useEffect(() => {
    function updateLastUpdatedLabel() {
      if (!lastUpdatedAt) {
        setLastUpdatedLabel("Sin datos todavia");
        return;
      }
      const ageSeconds = Math.max(0, Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000));
      if (ageSeconds < 60) {
        setLastUpdatedLabel(`Hace ${ageSeconds}s`);
        return;
      }
      const ageMinutes = Math.floor(ageSeconds / 60);
      if (ageMinutes < 60) {
        setLastUpdatedLabel(`Hace ${ageMinutes}m`);
        return;
      }
      const ageHours = Math.floor(ageMinutes / 60);
      setLastUpdatedLabel(`Hace ${ageHours}h`);
    }

    updateLastUpdatedLabel();
    const timerId = window.setInterval(updateLastUpdatedLabel, 1_000);
    return () => window.clearInterval(timerId);
  }, [lastUpdatedAt]);

  const autoRefreshStatus = useMemo(() => {
    if (!autoRefreshEnabled) {
      return "Pausado";
    }
    if (!pageVisible) {
      return "Pausado en pestana oculta";
    }
    return "Cada 5s";
  }, [autoRefreshEnabled, pageVisible]);

  async function handleDemoTick() {
    if (!loading && (data?.wallets.length ?? 0) === 0) {
      setError(null);
      setNotice("Agrega una wallet para ejecutar el demo.");
      setTickSummary(null);
      return;
    }
    setRunningTick(true);
    setError(null);
    setNotice(null);
    try {
      const summary = await runCopyTradingDemoTick();
      setTickSummary(summary);
      setNotice(getDemoTickMessage(summary));
      await refresh();
    } catch {
      setError("No pudimos ejecutar el demo ahora. Revisa la conexion del backend.");
    } finally {
      setRunningTick(false);
    }
  }

  async function handleManualRefresh() {
    setNotice(null);
    await refresh();
  }

  async function handleWatcherStart() {
    setWatcherBusy(true);
    setError(null);
    try {
      const watcher = await startCopyTradingWatcher();
      setData((current) => (current ? { ...current, watcher } : current));
      setNotice(watcher.message || "Watcher demo iniciado.");
      await refresh({ isBackground: true });
    } catch {
      setError("No pudimos iniciar el watcher demo ahora.");
    } finally {
      setWatcherBusy(false);
    }
  }

  async function handleWatcherStop() {
    setWatcherBusy(true);
    setError(null);
    try {
      const watcher = await stopCopyTradingWatcher();
      setData((current) => (current ? { ...current, watcher } : current));
      setNotice(watcher.message || "Watcher demo pausado.");
      await refresh({ isBackground: true });
    } catch {
      setError("No pudimos pausar el watcher demo ahora.");
    } finally {
      setWatcherBusy(false);
    }
  }

  async function handleWatcherRunOnce() {
    setWatcherBusy(true);
    setError(null);
    try {
      const watcher = await runCopyTradingWatcherOnce();
      setData((current) => (current ? { ...current, watcher } : current));
      if (watcher.last_result) {
        setTickSummary(watcher.last_result);
        setNotice(getDemoTickMessage(watcher.last_result));
      } else {
        setNotice(watcher.message || "Watcher demo ejecuto un escaneo.");
      }
      await refresh({ isBackground: true });
    } catch {
      setError("No pudimos ejecutar el watcher demo ahora.");
    } finally {
      setWatcherBusy(false);
    }
  }

  return (
    <main className="copy-trading-page">
      <CopyTradingHeader status={data?.status ?? null} />
      <CopyTradingMetrics status={data?.status ?? null} />

      <section className="copy-control-bar" aria-label="Controles del modo demo">
        <div className="copy-control-copy">
          <span>Modo demo funcional</span>
          <strong>Escanea wallets seguidas y simula copias con monto fijo.</strong>
          <div className="copy-status-strip">
            <span className="copy-badge">Ultima actualizacion {lastUpdatedLabel}</span>
            <span className={`copy-badge ${autoRefreshEnabled && pageVisible ? "success" : "locked"}`}>
              Auto-refresh {autoRefreshStatus}
            </span>
          </div>
        </div>
        <div className="copy-action-row">
          <button
            className="copy-primary-button"
            disabled={loading || refreshing}
            onClick={handleManualRefresh}
            type="button"
          >
            {refreshing ? "Actualizando..." : "Refrescar ahora"}
          </button>
          <button
            disabled={runningTick || loading}
            onClick={() => setAutoRefreshEnabled((current) => !current)}
            type="button"
          >
            {autoRefreshEnabled ? "Pausar auto" : "Reanudar auto"}
          </button>
          <button className="copy-primary-button" disabled={runningTick || loading} onClick={handleDemoTick} type="button">
            {runningTick ? "Ejecutando..." : "Ejecutar demo tick"}
          </button>
        </div>
      </section>

      {tickSummary ? (
        <section className="copy-tick-summary" aria-label="Resultado del ultimo demo tick">
          <span>Wallets escaneadas {tickSummary.wallets_scanned}</span>
          <span>Trades nuevos {tickSummary.new_trades}</span>
          <span>Copiables {tickSummary.live_candidates}</span>
          <span>Fuera de ventana {tickSummary.recent_outside_window}</span>
          <span>Historicos {tickSummary.historical_trades}</span>
          <span>Simuladas {tickSummary.orders_simulated}</span>
          <span>Saltadas {tickSummary.orders_skipped}</span>
        </section>
      ) : null}

      {error ? <div className="copy-error-state">{error}</div> : null}
      {notice ? <div className="copy-empty-state">{notice}</div> : null}
      {loading ? <div className="copy-empty-state">Cargando modulo Copiar Wallets...</div> : null}

      <div className="copy-dashboard-grid">
        <AddCopyWalletForm
          onCreated={async () => {
            await refresh();
          }}
          wallets={data?.wallets ?? []}
        />
        <CopyWatcherPanel
          busy={watcherBusy}
          onRunOnce={handleWatcherRunOnce}
          onStart={handleWatcherStart}
          onStop={handleWatcherStop}
          watcher={
            data?.watcher ?? {
              enabled: false,
              running: false,
              interval_seconds: 10,
              last_run_at: null,
              next_run_at: null,
              last_result: null,
              error_count: 0,
              last_error: null,
              message: null,
            }
          }
        />
        <ExecutionWalletCard />
        <section className="copy-panel copy-real-lock">
          <div className="copy-panel-heading">
            <span>Modo real</span>
            <strong>Real no conectado</strong>
          </div>
          <p>
            Conecta tu wallet de ejecución para preparar el modo real. Bloqueado hasta configurar credenciales,
            permisos y firma de órdenes.
          </p>
          <div className="copy-lock-list">
            <span>Sin clave privada</span>
            <span>Sin firma de órdenes</span>
            <span>Sin envío a CLOB</span>
          </div>
        </section>
      </div>

      <CopyWalletsTable
        onChanged={async () => {
          await refresh();
        }}
        wallets={data?.wallets ?? []}
      />

      <div className="copy-dashboard-grid three">
        <CopyTradesTable trades={data?.trades ?? []} />
        <CopyOrdersTable orders={data?.orders ?? []} />
        <CopyBotEvents events={data?.events ?? []} />
      </div>
    </main>
  );
}

function getDemoTickMessage(summary: CopyTradingTickSummary): string {
  if (summary.wallets_scanned === 0) {
    return "Agrega una wallet para ejecutar el demo.";
  }
  if (summary.errors.length > 0) {
    return `Escaneo completado con avisos. ${summary.errors.length} wallet${summary.errors.length === 1 ? "" : "s"} no respondieron.`;
  }
  if (summary.new_trades === 0) {
    return "Escaneo completado. No se detectaron trades nuevos.";
  }
  if (summary.live_candidates > 0) {
    return `Escaneo completado. ${summary.live_candidates} trades copiables, ${summary.orders_simulated} simulaciones creadas, ${summary.historical_trades} historicos.`;
  }
  if (summary.recent_outside_window > 0 && summary.historical_trades === 0) {
    return `Escaneo completado. Se detectaron ${summary.recent_outside_window} trades recientes, pero llegaron fuera de la ventana de copia en vivo.`;
  }
  if (summary.historical_trades > 0 && summary.orders_simulated === 0) {
    return `Escaneo completado. Se detectaron ${summary.historical_trades} trades historicos. No hubo trades dentro de la ventana de copia en vivo.`;
  }
  return `Escaneo completado. Trades nuevos ${summary.new_trades}, simuladas ${summary.orders_simulated}, fuera de ventana ${summary.recent_outside_window}, saltadas ${summary.orders_skipped}.`;
}
