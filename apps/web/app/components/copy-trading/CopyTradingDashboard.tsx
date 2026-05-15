"use client";

import { useCallback, useEffect, useState } from "react";
import { getCopyTradingDashboardData, runCopyTradingDemoTick } from "../../lib/copyTrading";
import type { CopyTradingDashboardData, CopyTradingTickSummary } from "../../lib/copyTradingTypes";
import { AddCopyWalletForm } from "./AddCopyWalletForm";
import { CopyBotEvents } from "./CopyBotEvents";
import { CopyOrdersTable } from "./CopyOrdersTable";
import { CopyTradesTable } from "./CopyTradesTable";
import { CopyTradingHeader } from "./CopyTradingHeader";
import { CopyTradingMetrics } from "./CopyTradingMetrics";
import { CopyWalletsTable } from "./CopyWalletsTable";
import { ExecutionWalletCard } from "./ExecutionWalletCard";

export function CopyTradingDashboard() {
  const [data, setData] = useState<CopyTradingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tickSummary, setTickSummary] = useState<CopyTradingTickSummary | null>(null);
  const [runningTick, setRunningTick] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const nextData = await getCopyTradingDashboardData();
      setData(nextData);
    } catch {
      setError("Backend no disponible. El modo demo queda en espera.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return (
    <main className="copy-trading-page">
      <CopyTradingHeader status={data?.status ?? null} />
      <CopyTradingMetrics status={data?.status ?? null} />

      <section className="copy-control-bar" aria-label="Controles del modo demo">
        <div className="copy-control-copy">
          <span>Modo demo funcional</span>
          <strong>Escanea wallets seguidas y simula copias con monto fijo.</strong>
        </div>
        <button className="copy-primary-button" disabled={runningTick || loading} onClick={handleDemoTick} type="button">
          {runningTick ? "Ejecutando..." : "Ejecutar demo tick"}
        </button>
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
        <AddCopyWalletForm onCreated={refresh} wallets={data?.wallets ?? []} />
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

      <CopyWalletsTable onChanged={refresh} wallets={data?.wallets ?? []} />

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
