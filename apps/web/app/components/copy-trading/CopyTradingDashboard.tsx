"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCopyTradingClosedPositionsData,
  getCopyTradingDemoPnlSummaryData,
  getCopyTradingEventsData,
  getCopyTradingOpenPositionsData,
  getCopyTradingOrdersData,
  getCopyTradingStatusData,
  getCopyTradingTradesData,
  getCopyTradingWalletsData,
  getCopyTradingWatcherStatusData,
} from "../../lib/copyTrading";
import type {
  CopyBotEvent,
  CopyDemoPosition,
  CopyDetectedTrade,
  CopyOrder,
  CopyTradingDemoPnlSummary,
  CopyTradingStatus,
  CopyTradingWatcherStatus,
  CopyWallet,
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

const AUTO_REFRESH_INTERVAL_MS = 15_000;
const DASHBOARD_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "wallets", label: "Wallets" },
  { id: "open", label: "Copias abiertas" },
  { id: "history", label: "Copias cerradas" },
  { id: "audit", label: "Auditoria" },
] as const;

type CopyTradingDashboardTab = (typeof DASHBOARD_TABS)[number]["id"];
type DashboardSectionKey = "worker" | "wallets" | "open" | "history" | "pnl" | "audit";

type CopyTradingDashboardState = {
  closedDemoPositions: CopyDemoPosition[] | null;
  demoPnlSummary: CopyTradingDemoPnlSummary | null;
  events: CopyBotEvent[] | null;
  openDemoPositions: CopyDemoPosition[] | null;
  orders: CopyOrder[] | null;
  status: CopyTradingStatus | null;
  trades: CopyDetectedTrade[] | null;
  wallets: CopyWallet[] | null;
  watcher: CopyTradingWatcherStatus | null;
};

type SectionState = {
  error: string | null;
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
};

type DashboardSectionsState = Record<DashboardSectionKey, SectionState>;

const INITIAL_DATA: CopyTradingDashboardState = {
  closedDemoPositions: null,
  demoPnlSummary: null,
  events: null,
  openDemoPositions: null,
  orders: null,
  status: null,
  trades: null,
  wallets: null,
  watcher: null,
};

const INITIAL_SECTIONS: DashboardSectionsState = {
  audit: { error: null, loaded: false, loading: true, refreshing: false },
  history: { error: null, loaded: false, loading: true, refreshing: false },
  open: { error: null, loaded: false, loading: true, refreshing: false },
  pnl: { error: null, loaded: false, loading: true, refreshing: false },
  wallets: { error: null, loaded: false, loading: true, refreshing: false },
  worker: { error: null, loaded: false, loading: true, refreshing: false },
};

export function CopyTradingDashboard() {
  const [data, setData] = useState<CopyTradingDashboardState>(INITIAL_DATA);
  const [sections, setSections] = useState<DashboardSectionsState>(INITIAL_SECTIONS);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("Sin datos todavia");
  const [activeTab, setActiveTab] = useState<CopyTradingDashboardTab>("summary");
  const inFlightRef = useRef<Record<DashboardSectionKey, boolean>>({
    audit: false,
    history: false,
    open: false,
    pnl: false,
    wallets: false,
    worker: false,
  });

  const patchData = useCallback((patch: Partial<CopyTradingDashboardState>) => {
    setData((current) => ({ ...current, ...patch }));
  }, []);

  const beginSection = useCallback((key: DashboardSectionKey, isBackground = false) => {
    setSections((current) => {
      const section = current[key];
      return {
        ...current,
        [key]: {
          ...section,
          error: null,
          loading: !section.loaded && !isBackground,
          refreshing: section.loaded || isBackground,
        },
      };
    });
  }, []);

  const completeSection = useCallback((key: DashboardSectionKey, error: string | null = null, markLoaded = true) => {
    setSections((current) => ({
      ...current,
      [key]: {
        error,
        loaded: current[key].loaded || markLoaded,
        loading: false,
        refreshing: false,
      },
    }));
  }, []);

  const markRefreshed = useCallback(() => {
    setLastUpdatedAt(new Date());
  }, []);

  const refreshWorkerSection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.worker) {
        return false;
      }
      inFlightRef.current.worker = true;
      beginSection("worker", options?.isBackground);
      try {
        const [statusResult, watcherResult] = await Promise.allSettled([
          getCopyTradingStatusData(),
          getCopyTradingWatcherStatusData(),
        ]);

        if (statusResult.status === "fulfilled") {
          patchData({ status: statusResult.value });
        }
        if (watcherResult.status === "fulfilled") {
          patchData({ watcher: watcherResult.value });
        }

        if (statusResult.status === "fulfilled" || watcherResult.status === "fulfilled") {
          markRefreshed();
          const partialFailure =
            statusResult.status === "rejected" || watcherResult.status === "rejected"
              ? "Mostrando estado parcial del worker. Intentaremos completar el resto en el proximo refresh."
              : null;
          completeSection("worker", partialFailure);
          return true;
        }

        completeSection("worker", "No pudimos consultar el estado del worker ahora.");
        return false;
      } finally {
        inFlightRef.current.worker = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshWalletsSection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.wallets) {
        return false;
      }
      inFlightRef.current.wallets = true;
      beginSection("wallets", options?.isBackground);
      try {
        const wallets = await getCopyTradingWalletsData();
        patchData({ wallets });
        markRefreshed();
        completeSection("wallets");
        return true;
      } catch {
        completeSection("wallets", "No pudimos actualizar la lista de wallets ahora.");
        return false;
      } finally {
        inFlightRef.current.wallets = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshOpenPositionsSection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.open) {
        return false;
      }
      inFlightRef.current.open = true;
      beginSection("open", options?.isBackground);
      try {
        const openDemoPositions = await getCopyTradingOpenPositionsData();
        patchData({ openDemoPositions });
        markRefreshed();
        completeSection("open");
        return true;
      } catch {
        completeSection("open", "No pudimos actualizar las copias demo abiertas ahora.");
        return false;
      } finally {
        inFlightRef.current.open = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshHistorySection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.history) {
        return false;
      }
      inFlightRef.current.history = true;
      beginSection("history", options?.isBackground);
      try {
        const [tradesResult, ordersResult, closedPositionsResult] = await Promise.allSettled([
          getCopyTradingTradesData(),
          getCopyTradingOrdersData(),
          getCopyTradingClosedPositionsData(),
        ]);

        const patch: Partial<CopyTradingDashboardState> = {};
        const failures: string[] = [];
        if (tradesResult.status === "fulfilled") {
          patch.trades = tradesResult.value;
        } else {
          failures.push("trades");
        }
        if (ordersResult.status === "fulfilled") {
          patch.orders = ordersResult.value;
        } else {
          failures.push("ordenes");
        }
        if (closedPositionsResult.status === "fulfilled") {
          patch.closedDemoPositions = closedPositionsResult.value;
        } else {
          failures.push("historial demo");
        }

        if (Object.keys(patch).length > 0) {
          patchData(patch);
          markRefreshed();
          completeSection(
            "history",
            failures.length > 0
              ? `Mostrando historial parcial. Falto actualizar: ${failures.join(", ")}.`
              : null,
          );
          return true;
        }

        completeSection("history", "No pudimos actualizar el historial ahora.");
        return false;
      } finally {
        inFlightRef.current.history = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshPnlSection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.pnl) {
        return false;
      }
      inFlightRef.current.pnl = true;
      beginSection("pnl", options?.isBackground);
      try {
        const demoPnlSummary = await getCopyTradingDemoPnlSummaryData();
        patchData({ demoPnlSummary });
        markRefreshed();
        completeSection("pnl");
        return true;
      } catch {
        completeSection("pnl", "No pudimos actualizar el PnL demo ahora.");
        return false;
      } finally {
        inFlightRef.current.pnl = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshAuditSection = useCallback(
    async (options?: { isBackground?: boolean }) => {
      if (inFlightRef.current.audit) {
        return false;
      }
      inFlightRef.current.audit = true;
      beginSection("audit", options?.isBackground);
      try {
        const events = await getCopyTradingEventsData();
        patchData({ events });
        markRefreshed();
        completeSection("audit");
        return true;
      } catch {
        completeSection("audit", "No pudimos actualizar la auditoria ahora.");
        return false;
      } finally {
        inFlightRef.current.audit = false;
      }
    },
    [beginSection, completeSection, markRefreshed, patchData],
  );

  const refreshAll = useCallback(
    (options?: { isBackground?: boolean }) => {
      void refreshWorkerSection(options);
      void refreshWalletsSection(options);
      void refreshOpenPositionsSection(options);
      void refreshHistorySection(options);
      void refreshPnlSection(options);
      void refreshAuditSection(options);
    },
    [
      refreshAuditSection,
      refreshHistorySection,
      refreshOpenPositionsSection,
      refreshPnlSection,
      refreshWalletsSection,
      refreshWorkerSection,
    ],
  );

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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
      if (!pageVisible || Object.values(inFlightRef.current).some(Boolean)) {
        return;
      }
      refreshAll({ isBackground: true });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [pageVisible, refreshAll]);

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
    refreshAll();
  }

  const isRefreshingAny = Object.values(sections).some((section) => section.loading || section.refreshing);
  const primaryStatusLoading = sections.worker.loading && !data.status;
  const watcherLoading = sections.worker.loading && !data.watcher;
  const openPositions = data.openDemoPositions ?? [];
  const closedDemoPositions = data.closedDemoPositions ?? [];
  const trades = data.trades ?? [];
  const orders = data.orders ?? [];
  const events = data.events ?? [];
  const wallets = data.wallets ?? [];

  return (
    <main className="copy-trading-page">
      <CopyTradingHeader status={data.status} />

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

      {sections.worker.error && !data.status && !data.watcher ? (
        <div className="copy-error-state">{sections.worker.error}</div>
      ) : null}
      {notice ? <div className="copy-empty-state">{notice}</div> : null}

      <section className="copy-tab-panel" hidden={activeTab !== "summary"}>
        <CopyTradingMetrics loading={primaryStatusLoading} status={data.status} />

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
              {sections.worker.loading && !data.watcher ? (
                <span className="copy-badge subtle">Consultando estado del worker...</span>
              ) : null}
              {sections.wallets.loading && !data.wallets ? <span className="copy-badge subtle">Wallets cargando...</span> : null}
              {sections.pnl.loading && !data.demoPnlSummary ? <span className="copy-badge subtle">Metricas demo cargando...</span> : null}
            </div>
          </div>
          <div className="copy-action-row">
            <button
              aria-label={isRefreshingAny ? "Actualizando Copy Trading" : "Refrescar Copy Trading ahora"}
              className="copy-primary-button"
              data-testid="copy-refresh-now"
              disabled={isRefreshingAny}
              onClick={() => void handleManualRefresh()}
              type="button"
            >
              {isRefreshingAny ? "Actualizando..." : "Actualizar vista"}
            </button>
          </div>
        </section>

        <div className="copy-dashboard-grid two copy-summary-layout">
          <CopyDemoPnlSummaryPanel
            loading={sections.pnl.loading && !data.demoPnlSummary}
            refreshing={sections.pnl.refreshing}
            statusMessage={sections.pnl.error}
            summary={data.demoPnlSummary}
          />
          <CopyWatcherPanel
            error={sections.worker.error}
            loading={watcherLoading}
            status={data.status}
            statusLoading={primaryStatusLoading}
            watcher={data.watcher}
          />
        </div>
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "wallets"}>
        <CopyWalletsTable
          closedPositions={closedDemoPositions}
          onChanged={async () => {
            refreshAll();
          }}
          onNotice={setNotice}
          openPositions={openPositions}
          openPositionsLoading={sections.open.loading && !data.openDemoPositions}
          positionsHistoryLoading={sections.history.loading && !data.closedDemoPositions}
          summary={data.demoPnlSummary}
          summaryLoading={sections.pnl.loading && !data.demoPnlSummary}
          trades={trades}
          wallets={wallets}
          walletsError={sections.wallets.error}
          walletsLoading={sections.wallets.loading && !data.wallets}
          watcher={data.watcher}
        />
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "open"}>
        {sections.open.loading && !data.openDemoPositions ? (
          <SectionStatusMessage>Cargando esta seccion...</SectionStatusMessage>
        ) : sections.open.error && !data.openDemoPositions ? (
          <SectionStatusMessage tone="locked">{sections.open.error}</SectionStatusMessage>
        ) : (
          <>
            {sections.open.error ? <SectionStatusMessage tone="locked">{sections.open.error}</SectionStatusMessage> : null}
            <CopyOpenDemoPositionsTable positions={openPositions} summary={data.demoPnlSummary} />
          </>
        )}
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "history"}>
        {sections.history.loading && !data.trades && !data.orders && !data.closedDemoPositions ? (
          <SectionStatusMessage>Cargando esta seccion...</SectionStatusMessage>
        ) : sections.history.error && !data.trades && !data.orders && !data.closedDemoPositions ? (
          <SectionStatusMessage tone="locked">{sections.history.error}</SectionStatusMessage>
        ) : (
          <>
            {sections.history.error ? <SectionStatusMessage tone="locked">{sections.history.error}</SectionStatusMessage> : null}
            <CopyClosedDemoPositionsTable positions={closedDemoPositions} summary={data.demoPnlSummary} />
            <div className="copy-dashboard-grid two copy-history-grid">
              <CopyTradesTable trades={trades} />
              <CopyOrdersTable orders={orders} />
            </div>
          </>
        )}
      </section>

      <section className="copy-tab-panel" hidden={activeTab !== "audit"}>
        {sections.audit.loading && !data.events ? (
          <SectionStatusMessage>Cargando esta seccion...</SectionStatusMessage>
        ) : sections.audit.error && !data.events ? (
          <SectionStatusMessage tone="locked">{sections.audit.error}</SectionStatusMessage>
        ) : (
          <>
            {sections.audit.error ? <SectionStatusMessage tone="locked">{sections.audit.error}</SectionStatusMessage> : null}
            <CopyBotEvents events={events} />
          </>
        )}
      </section>
    </main>
  );
}

function SectionStatusMessage({
  children,
  tone = "subtle",
}: {
  children: string;
  tone?: "locked" | "subtle";
}) {
  return (
    <div className="copy-status-strip" aria-live="polite">
      <span className={`copy-badge ${tone}`}>{children}</span>
    </div>
  );
}
