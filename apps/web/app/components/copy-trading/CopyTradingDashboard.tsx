"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCopyTradingPrimaryData,
  getCopyTradingSupplementalData,
  runCopyTradingDemoSettlementOnce,
  runCopyTradingDemoTick,
  runCopyTradingWatcherOnce,
  startCopyTradingWatcher,
  stopCopyTradingWatcher,
} from "../../lib/copyTrading";
import type {
  CopyTradingDashboardData,
  CopyTradingTickSummary,
  CopyTradingWatcherStatus,
} from "../../lib/copyTradingTypes";
import { CopyBotEvents } from "./CopyBotEvents";
import { CopyClosedDemoPositionsTable } from "./CopyClosedDemoPositionsTable";
import { CopyDemoPnlSummaryPanel } from "./CopyDemoPnlSummaryPanel";
import { CopyOrdersTable } from "./CopyOrdersTable";
import { CopyOpenDemoPositionsTable } from "./CopyOpenDemoPositionsTable";
import { CopyTradesTable } from "./CopyTradesTable";
import { CopyTradingHeader } from "./CopyTradingHeader";
import { CopyTradingMetrics } from "./CopyTradingMetrics";
import { CopyWatcherPanel } from "./CopyWatcherPanel";
import { CopyWalletsTable } from "./CopyWalletsTable";

const AUTO_REFRESH_INTERVAL_MS = 5_000;
const DASHBOARD_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "wallets", label: "Wallets" },
  { id: "open", label: "Copias abiertas" },
  { id: "history", label: "Historial de trades" },
  { id: "audit", label: "Auditoria" },
] as const;

type CopyTradingDashboardTab = (typeof DASHBOARD_TABS)[number]["id"];

const DEFAULT_WATCHER: CopyTradingWatcherStatus = {
  enabled: false,
  running: false,
  interval_seconds: 5,
  cycle_budget_seconds: 8,
  current_run_started_at: null,
  last_run_started_at: null,
  last_run_at: null,
  last_run_finished_at: null,
  last_run_duration_ms: null,
  average_run_duration_ms: null,
  next_run_at: null,
  last_result: null,
  error_count: 0,
  scanned_wallet_count: 0,
  slow_wallet_count: 0,
  timeout_count: 0,
  errored_wallet_count: 0,
  skipped_due_to_budget_count: 0,
  skipped_due_to_priority_count: 0,
  pending_wallet_count: 0,
  is_over_interval: false,
  behind_by_seconds: 0,
  last_error: null,
  message: null,
};

export function CopyTradingDashboard() {
  const [data, setData] = useState<CopyTradingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickSummary, setTickSummary] = useState<CopyTradingTickSummary | null>(null);
  const [runningTick, setRunningTick] = useState(false);
  const [runningSettlement, setRunningSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [supplementalLoading, setSupplementalLoading] = useState(true);
  const [supplementalRefreshing, setSupplementalRefreshing] = useState(false);
  const [supplementalError, setSupplementalError] = useState<string | null>(null);
  const [watcherBusyAction, setWatcherBusyAction] = useState<"run-once" | "start" | "stop" | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("Sin datos todavia");
  const [activeTab, setActiveTab] = useState<CopyTradingDashboardTab>("summary");
  const isRefreshingRef = useRef(false);
  const supplementalRefreshInFlightRef = useRef(false);
  const hasLoadedSupplementalOnceRef = useRef(false);
  const dataRef = useRef<CopyTradingDashboardData | null>(null);

  const setDashboardData = useCallback(
    (updater: CopyTradingDashboardData | null | ((current: CopyTradingDashboardData | null) => CopyTradingDashboardData | null)) => {
      setData((current) => {
        const nextValue = typeof updater === "function" ? updater(current) : updater;
        dataRef.current = nextValue;
        return nextValue;
      });
    },
    [],
  );

  const refreshSupplemental = useCallback(async () => {
    if (supplementalRefreshInFlightRef.current) {
      return false;
    }
    supplementalRefreshInFlightRef.current = true;
    const currentData = dataRef.current;
    const hasExistingSupplementalData = Boolean(
      currentData?.demo_pnl_summary ||
        (currentData?.open_demo_positions.length ?? 0) > 0 ||
        (currentData?.closed_demo_positions.length ?? 0) > 0,
    );
    setSupplementalError(null);
    if (hasExistingSupplementalData || hasLoadedSupplementalOnceRef.current) {
      setSupplementalRefreshing(true);
      setSupplementalLoading(false);
    } else {
      setSupplementalLoading(true);
      setSupplementalRefreshing(false);
    }

    try {
      const supplemental = await getCopyTradingSupplementalData();
      if (Object.keys(supplemental).length > 0) {
        hasLoadedSupplementalOnceRef.current = true;
        setDashboardData((current) =>
          current
            ? {
                ...current,
                ...supplemental,
                open_demo_positions: supplemental.open_demo_positions ?? current.open_demo_positions,
                closed_demo_positions: supplemental.closed_demo_positions ?? current.closed_demo_positions,
                demo_pnl_summary: supplemental.demo_pnl_summary ?? current.demo_pnl_summary,
              }
            : current,
        );
      } else if (!hasExistingSupplementalData) {
        hasLoadedSupplementalOnceRef.current = true;
      }
      return true;
    } catch {
      setSupplementalError("No pudimos actualizar metricas demo ahora. Mostrando ultimo dato disponible.");
      return false;
    } finally {
      supplementalRefreshInFlightRef.current = false;
      setSupplementalLoading(false);
      setSupplementalRefreshing(false);
    }
  }, [setDashboardData]);

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
      const loadedPrimaryData = await getCopyTradingPrimaryData();
      setDashboardData((current) => ({
        ...loadedPrimaryData,
        open_demo_positions: current?.open_demo_positions ?? loadedPrimaryData.open_demo_positions,
        closed_demo_positions: current?.closed_demo_positions ?? loadedPrimaryData.closed_demo_positions,
        demo_pnl_summary: current?.demo_pnl_summary ?? loadedPrimaryData.demo_pnl_summary,
      }));
      setLastUpdatedAt(new Date());
      if (options?.isBackground) {
        setError(null);
      }
    } catch {
      setError("No pudimos actualizar Copy Trading ahora. Seguiremos intentando.");
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
      isRefreshingRef.current = false;
    }

    void refreshSupplemental();
    return true;
  }, [refreshSupplemental, setDashboardData]);

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

  async function handleDemoSettlement() {
    setRunningSettlement(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runCopyTradingDemoSettlementOnce();
      setNotice(
        `Settlement demo reviso ${result.summary.checked_positions} posiciones. ` +
          `Cerro ${result.summary.closed_by_market_resolution}, ` +
          `esperando ${result.summary.waiting_resolution}, ` +
          `canceladas ${result.summary.cancelled}.`,
      );
      await refresh();
    } catch {
      setError("No pudimos revisar resoluciones demo ahora.");
    } finally {
      setRunningSettlement(false);
    }
  }

  async function handleWatcherStart() {
    setWatcherBusyAction("start");
    setError(null);
    try {
      const watcher = await startCopyTradingWatcher();
      setData((current) => (current ? { ...current, watcher } : current));
      setNotice(watcher.message || "Watcher demo iniciado.");
      await refresh({ isBackground: true });
    } catch {
      setError("No pudimos iniciar el watcher demo ahora.");
    } finally {
      setWatcherBusyAction(null);
    }
  }

  async function handleWatcherStop() {
    setWatcherBusyAction("stop");
    setError(null);
    try {
      const watcher = await stopCopyTradingWatcher();
      setData((current) => (current ? { ...current, watcher } : current));
      setNotice(watcher.message || "Watcher demo pausado.");
      await refresh({ isBackground: true });
    } catch {
      setError("No pudimos pausar el watcher demo ahora.");
    } finally {
      setWatcherBusyAction(null);
    }
  }

  async function handleWatcherRunOnce() {
    setWatcherBusyAction("run-once");
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
      setWatcherBusyAction(null);
    }
  }

  return (
    <main className="copy-trading-page">
      <CopyTradingHeader status={data?.status ?? null} />

      <nav className="copy-tabs" aria-label="Navegacion interna de Copy Trading">
        {DASHBOARD_TABS.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className={`copy-tab-button ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <div className="copy-error-state">{error}</div> : null}
      {notice ? <div className="copy-empty-state">{notice}</div> : null}
      {loading ? (
        <section className="copy-loading-shell" aria-label="Cargando Copy Trading">
          <div className="copy-loading-card copy-loading-card-hero">
            <span className="copy-section-kicker">Cargando wallets y posiciones demo</span>
            <strong>Preparando el dashboard de Copy Trading...</strong>
            <p>Las posiciones demo y el PnL pueden tardar algunos segundos mas en llegar.</p>
          </div>
          <div className="copy-loading-grid">
            <div className="copy-loading-card" />
            <div className="copy-loading-card" />
            <div className="copy-loading-card" />
          </div>
        </section>
      ) : null}

      <section className="copy-tab-panel" hidden={activeTab !== "summary"}>
        <CopyTradingMetrics status={data?.status ?? null} />

        <section className="copy-control-bar" aria-label="Controles del modo demo">
          <div className="copy-control-copy">
            <span>Modo demo funcional</span>
            <strong>
              Auto-refresh actualiza la pantalla. Con el watcher activo, el auto-copy demo ocurre automaticamente cada
              5 segundos.
            </strong>
            <div className="copy-status-strip">
              <span className="copy-badge">Ultima actualizacion {lastUpdatedLabel}</span>
              <span className={`copy-badge ${autoRefreshEnabled && pageVisible ? "success" : "locked"}`}>
                Auto-refresh {autoRefreshStatus}
              </span>
              {supplementalLoading && !loading ? <span className="copy-badge subtle">Metricas demo cargando...</span> : null}
              {supplementalRefreshing ? <span className="copy-badge subtle">Actualizando metricas...</span> : null}
              {supplementalError ? <span className="copy-badge locked">{supplementalError}</span> : null}
            </div>
          </div>
          <div className="copy-action-row">
            <button
              aria-label={refreshing ? "Actualizando Copy Trading" : "Refrescar Copy Trading ahora"}
              className="copy-primary-button"
              data-testid="copy-refresh-now"
              disabled={loading || refreshing}
              onClick={handleManualRefresh}
              type="button"
            >
              {refreshing ? "Actualizando..." : "Refrescar ahora"}
            </button>
            <button
              className="copy-secondary-button"
              disabled={runningTick || loading}
              onClick={() => setAutoRefreshEnabled((current) => !current)}
              type="button"
            >
              {autoRefreshEnabled ? "Pausar auto" : "Reanudar auto"}
            </button>
            <button className="copy-action-button" disabled={runningTick || loading} onClick={handleDemoTick} type="button">
              {runningTick ? "Ejecutando..." : "Demo tick manual"}
            </button>
            <button
              className="copy-secondary-button"
              disabled={runningSettlement || loading}
              onClick={handleDemoSettlement}
              type="button"
            >
              {runningSettlement ? "Revisando..." : "Revisar resoluciones demo"}
            </button>
          </div>
        </section>

        {tickSummary ? (
          <section className="copy-tick-summary" aria-label="Resultado del ultimo demo tick">
            <span>Wallets escaneadas {tickSummary.wallets_scanned}</span>
            <span>Trades nuevos {tickSummary.new_trades}</span>
            <span>Copiables {tickSummary.live_candidates}</span>
            <span>Compras demo {tickSummary.buy_simulated ?? 0}</span>
            <span>Ventas demo {tickSummary.sell_simulated ?? 0}</span>
            <span>Fuera de ventana {tickSummary.recent_outside_window}</span>
            <span>Historicos {tickSummary.historical_trades}</span>
            <span>Simuladas {tickSummary.orders_simulated}</span>
            <span>Saltadas {tickSummary.orders_skipped}</span>
          </section>
        ) : null}

        <div className="copy-dashboard-grid two copy-summary-layout">
          <CopyDemoPnlSummaryPanel
            loading={supplementalLoading}
            refreshing={supplementalRefreshing}
            statusMessage={supplementalError}
            summary={data?.demo_pnl_summary ?? null}
          />
          <CopyWatcherPanel
            busyAction={watcherBusyAction}
            onRunOnce={handleWatcherRunOnce}
            onStart={handleWatcherStart}
            onStop={handleWatcherStop}
            watcher={data?.watcher ?? DEFAULT_WATCHER}
          />
        </div>
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "wallets"}>
        <CopyWalletsTable
          closedPositions={data?.closed_demo_positions ?? []}
          onChanged={async () => {
            await refresh();
          }}
          onNotice={setNotice}
          onScanAll={handleWatcherRunOnce}
          openPositions={data?.open_demo_positions ?? []}
          scanAllBusy={watcherBusyAction === "run-once"}
          summary={data?.demo_pnl_summary ?? null}
          trades={data?.trades ?? []}
          wallets={data?.wallets ?? []}
          watcher={data?.watcher ?? DEFAULT_WATCHER}
          watcherIntervalSeconds={data?.watcher.interval_seconds ?? DEFAULT_WATCHER.interval_seconds}
        />
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "open"}>
        <CopyOpenDemoPositionsTable positions={data?.open_demo_positions ?? []} summary={data?.demo_pnl_summary ?? null} />
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "history"}>
        <CopyClosedDemoPositionsTable positions={data?.closed_demo_positions ?? []} summary={data?.demo_pnl_summary ?? null} />
        <div className="copy-dashboard-grid two copy-history-grid">
          <CopyTradesTable trades={data?.trades ?? []} />
          <CopyOrdersTable orders={data?.orders ?? []} />
        </div>
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "audit"}>
        <CopyBotEvents events={data?.events ?? []} />
      </section>
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
    return `Escaneo completado. ${summary.live_candidates} trades copiables, ${summary.buy_simulated ?? 0} compras demo, ${summary.sell_simulated ?? 0} ventas demo, ${summary.historical_trades} historicos.`;
  }
  if (summary.recent_outside_window > 0 && summary.historical_trades === 0) {
    return `Escaneo completado. Se detectaron ${summary.recent_outside_window} trades recientes, pero llegaron fuera de la ventana de copia en vivo.`;
  }
  if (summary.historical_trades > 0 && summary.orders_simulated === 0) {
    return `Escaneo completado. Se detectaron ${summary.historical_trades} trades historicos. No hubo trades dentro de la ventana de copia en vivo.`;
  }
  return `Escaneo completado. Trades nuevos ${summary.new_trades}, simuladas ${summary.orders_simulated}, fuera de ventana ${summary.recent_outside_window}, saltadas ${summary.orders_skipped}.`;
}
