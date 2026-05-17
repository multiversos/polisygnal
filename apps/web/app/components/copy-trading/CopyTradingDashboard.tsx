"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCopyTradingPrimaryData, getCopyTradingSupplementalData } from "../../lib/copyTrading";
import type { CopyTradingDashboardData, CopyTradingStatus, CopyTradingWatcherStatus } from "../../lib/copyTradingTypes";
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

const AUTO_REFRESH_INTERVAL_MS = 15_000;
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
  demo_only: true,
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
  worker_status: "not_started",
  worker_owner_id: null,
  last_heartbeat_at: null,
  last_loop_started_at: null,
  last_loop_finished_at: null,
  last_success_at: null,
  last_result_json: null,
  consecutive_errors: 0,
  stale_after_seconds: 30,
};

const DEFAULT_STATUS: CopyTradingStatus = {
  mode_default: "demo",
  demo_only: true,
  real_trading_available: false,
  real_trading_block_reason: "real_trading_not_configured",
  wallets_total: 0,
  wallets_enabled: 0,
  trades_detected: 0,
  orders_simulated: 0,
  orders_skipped: 0,
  orders_blocked: 0,
  open_demo_positions_count: 0,
  last_scan_at: null,
  worker_status: "not_started",
  worker_owner_id: null,
  last_heartbeat_at: null,
  last_loop_started_at: null,
  last_loop_finished_at: null,
  last_success_at: null,
  last_error: null,
  last_result_json: null,
  consecutive_errors: 0,
  stale_after_seconds: 30,
};

export function CopyTradingDashboard() {
  const [data, setData] = useState<CopyTradingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [supplementalLoading, setSupplementalLoading] = useState(true);
  const [supplementalRefreshing, setSupplementalRefreshing] = useState(false);
  const [supplementalError, setSupplementalError] = useState<string | null>(null);
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
    const intervalId = window.setInterval(() => {
      if (!pageVisible || isRefreshingRef.current) {
        return;
      }
      void refresh({ isBackground: true });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [pageVisible, refresh]);

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

  async function handleManualRefresh() {
    setNotice(null);
    await refresh();
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

        <section className="copy-control-bar" aria-label="Estado del modo demo">
          <div className="copy-control-copy">
            <span>Worker demo en Render</span>
            <strong>
              El worker demo en Render escanea automaticamente. Esta pagina solo muestra estado, posiciones, PnL e
              historial.
            </strong>
            <div className="copy-status-strip">
              <span className="copy-badge">Ultima vista {lastUpdatedLabel}</span>
              <span className={`copy-badge ${pageVisible ? "success" : "locked"}`}>
                Refresh visual {pageVisible ? "cada 15s" : "en pausa por pestana oculta"}
              </span>
              <span className="copy-badge subtle">Modo demo: no ejecuta dinero real</span>
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
              {refreshing ? "Actualizando..." : "Actualizar vista"}
            </button>
          </div>
        </section>

        <div className="copy-dashboard-grid two copy-summary-layout">
          <CopyDemoPnlSummaryPanel
            loading={supplementalLoading}
            refreshing={supplementalRefreshing}
            statusMessage={supplementalError}
            summary={data?.demo_pnl_summary ?? null}
          />
          <CopyWatcherPanel status={data?.status ?? DEFAULT_STATUS} watcher={data?.watcher ?? DEFAULT_WATCHER} />
        </div>
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "wallets"}>
        <CopyWalletsTable
          closedPositions={data?.closed_demo_positions ?? []}
          onChanged={async () => {
            await refresh();
          }}
          onNotice={setNotice}
          openPositions={data?.open_demo_positions ?? []}
          summary={data?.demo_pnl_summary ?? null}
          trades={data?.trades ?? []}
          wallets={data?.wallets ?? []}
          watcher={data?.watcher ?? DEFAULT_WATCHER}
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
