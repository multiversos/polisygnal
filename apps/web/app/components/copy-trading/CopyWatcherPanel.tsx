"use client";

import type {
  CopyTradingWatcherStatus,
  CopyTradingWatcherWalletScanResult,
} from "../../lib/copyTradingTypes";
import { formatDateTime, formatDurationMs } from "../../lib/copyTrading";

type CopyWatcherPanelProps = {
  busyAction: "run-once" | "start" | "stop" | null;
  onRunOnce: () => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  watcher: CopyTradingWatcherStatus;
};

export function CopyWatcherPanel({
  busyAction,
  onRunOnce,
  onStart,
  onStop,
  watcher,
}: CopyWatcherPanelProps) {
  const busy = busyAction !== null;
  const stateLabel = watcher.enabled
    ? watcher.running
      ? "Escaneando"
      : "Activo"
    : watcher.running
      ? "Pausando"
      : "Pausado";
  const autoCopyLabel = watcher.enabled ? "Auto-copy demo activo" : "Auto-copy demo pausado";
  const nextRunLabel = watcher.enabled
    ? formatDateTime(watcher.next_run_at)
    : watcher.running
      ? "Terminando ciclo actual"
      : "Watcher pausado";
  const walletScanResults = watcher.last_result?.wallet_scan_results ?? [];
  const topSlowWallets = walletScanResults
    .filter((entry) => entry.status === "slow" || entry.status === "timeout")
    .sort((left, right) => (right.duration_ms ?? 0) - (left.duration_ms ?? 0))
    .slice(0, 3);
  const scannedWallets = watcher.last_result?.wallets_scanned ?? 0;
  const pendingWallets = watcher.last_result?.pending_wallets ?? 0;
  const cycleMessage = watcher.last_result?.cycle_budget_exceeded
    ? "Ciclo recortado por carga"
    : watcher.is_over_interval
      ? "Atrasado por carga"
      : stateLabel;
  const resultSummary = watcher.last_result
    ? `Ultimo resultado: wallets ${scannedWallets} | pendientes ${pendingWallets} | nuevos ${watcher.last_result.new_trades} | compras demo ${watcher.last_result.buy_simulated ?? 0} | ventas demo ${watcher.last_result.sell_simulated ?? 0}`
    : "Ultimo resultado: sin ejecuciones todavia";

  return (
    <section className="copy-panel copy-watcher-panel">
      <div className="copy-panel-heading">
        <span>Watcher demo</span>
        <strong>{autoCopyLabel}</strong>
      </div>
      <p>
        El watcher prioriza wallets activas para mantener el escaneo live. No ejecuta operaciones reales y deja el
        historico pesado para escaneos manuales o ciclos posteriores.
      </p>
      <div className="copy-wallet-details">
        <small>Intervalo objetivo: {watcher.interval_seconds} segundos</small>
        <small>Budget maximo por ciclo: {watcher.cycle_budget_seconds} segundos</small>
        <small>Ciclo en curso desde {formatDateTime(watcher.current_run_started_at)}</small>
        <small>Ultimo escaneo {formatDateTime(watcher.last_run_at)}</small>
        <small>Ultimo ciclo: {formatDurationMs(watcher.last_run_duration_ms)}</small>
        <small>Promedio reciente: {formatDurationMs(watcher.average_run_duration_ms)}</small>
        <small>Proximo escaneo {nextRunLabel}</small>
        <small>Estado: {cycleMessage}</small>
        <small>Wallets lentas {watcher.slow_wallet_count}</small>
        <small>Timeouts {watcher.timeout_count}</small>
        <small>Escaneadas / pendientes: {scannedWallets} / {pendingWallets}</small>
        {watcher.is_over_interval ? (
          <small>Atrasado por carga: {watcher.behind_by_seconds}s sobre el intervalo</small>
        ) : null}
        {watcher.last_result?.cycle_budget_exceeded ? (
          <small>Ciclo recortado por carga para dejar wallets pendientes en el proximo barrido.</small>
        ) : null}
        <small>{resultSummary}</small>
        {watcher.last_error ? <small>Ultimo error: {watcher.last_error}</small> : null}
      </div>

      {topSlowWallets.length > 0 ? (
        <div className="copy-wallet-subsection">
          <span className="copy-wallet-subsection-title">Top wallets lentas</span>
          <div className="copy-wallet-details">
            {topSlowWallets.map((wallet) => (
              <small key={wallet.wallet_id}>
                {formatWalletScanLine(wallet)}
              </small>
            ))}
          </div>
        </div>
      ) : null}

      <div className="copy-status-strip">
        <span className="copy-badge subtle">El watcher priorizo wallets activas para mantener el escaneo live.</span>
        {watcher.timeout_count > 0 ? (
          <span className="copy-badge locked">Una wallet lenta fue saltada para no frenar el ciclo.</span>
        ) : null}
      </div>

      <div className="copy-action-row">
        <button
          className="copy-primary-button"
          disabled={busy || watcher.enabled}
          onClick={() => void onStart()}
          type="button"
        >
          {busyAction === "start" ? "Iniciando..." : "Iniciar watcher demo"}
        </button>
        <button
          className="copy-secondary-button"
          disabled={busy || !watcher.enabled}
          onClick={() => void onStop()}
          type="button"
        >
          {busyAction === "stop" ? "Pausando..." : "Pausar watcher"}
        </button>
        <button
          className="copy-action-button"
          disabled={busy}
          onClick={() => void onRunOnce()}
          type="button"
        >
          {busyAction === "run-once" ? "Ejecutando..." : "Ejecutar una vez"}
        </button>
      </div>
      <small>Prueba manual de un solo escaneo.</small>
    </section>
  );
}

function formatWalletScanLine(entry: CopyTradingWatcherWalletScanResult): string {
  const alias = entry.alias || entry.wallet_address_short;
  const duration = entry.duration_ms === null ? "sin tiempo" : formatDurationMs(entry.duration_ms);
  const status =
    entry.status === "timeout"
      ? "Timeout"
      : entry.status === "slow"
        ? "Wallet lenta"
        : entry.status === "skipped"
          ? "Pendiente"
          : entry.status === "error"
            ? "Con aviso"
            : "Saludable";
  return `${alias} | ${status} | ${duration}${entry.next_scan_hint ? ` | ${entry.next_scan_hint}` : ""}`;
}
