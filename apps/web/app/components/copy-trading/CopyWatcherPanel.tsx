"use client";

import type {
  CopyTradingStatus,
  CopyTradingWatcherStatus,
  CopyTradingWatcherWalletScanResult,
} from "../../lib/copyTradingTypes";
import { formatDateTime, formatDurationMs } from "../../lib/copyTrading";

type CopyWatcherPanelProps = {
  busyAction: "run-once" | "start" | "stop" | null;
  onRunOnce: () => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  status: CopyTradingStatus;
  watcher: CopyTradingWatcherStatus;
};

export function CopyWatcherPanel({
  busyAction,
  onRunOnce,
  onStart,
  onStop,
  status,
  watcher,
}: CopyWatcherPanelProps) {
  const persistedStateLabel = describeWorkerState(watcher.worker_status);
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
    .filter((entry) => entry.status === "slow")
    .sort((left, right) => (right.duration_ms ?? 0) - (left.duration_ms ?? 0))
    .slice(0, 3);
  const timeoutWallets = walletScanResults.filter((entry) => entry.status === "timeout").slice(0, 3);
  const pendingWalletsList = walletScanResults
    .filter((entry) => entry.status === "skipped_budget" || entry.status === "skipped_priority")
    .slice(0, 4);
  const scannedWallets = watcher.last_result?.scanned_wallet_count ?? watcher.scanned_wallet_count ?? 0;
  const pendingWallets = watcher.last_result?.pending_wallet_count ?? watcher.pending_wallet_count ?? 0;
  const cycleMessage = watcher.last_result?.cycle_budget_exceeded
    ? "Ciclo recortado por carga"
    : watcher.is_over_interval
      ? "Atrasado por carga"
      : stateLabel;
  const resultSummary = watcher.last_result
    ? `Ultimo resultado: wallets ${scannedWallets} | pendientes ${pendingWallets} | nuevos ${watcher.last_result.new_trades} | compras demo ${watcher.last_result.buy_simulated ?? 0} | ventas demo ${watcher.last_result.sell_simulated ?? 0}`
    : "Ultimo resultado: sin ejecuciones todavia";
  const persistentSummary =
    watcher.worker_status === "not_started"
      ? "Worker demo no iniciado todavia."
      : `${persistedStateLabel}. Heartbeat ${formatDateTime(watcher.last_heartbeat_at)}.`;

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
        <small>Estado persistido del worker: {persistedStateLabel}</small>
        <small>{persistentSummary}</small>
        <small>Modo demo: no ejecuta dinero real.</small>
        <small>Wallets activas: {status.wallets_enabled}</small>
        <small>Posiciones abiertas: {status.open_demo_positions_count}</small>
        <small>Ultimo heartbeat: {formatDateTime(watcher.last_heartbeat_at)}</small>
        <small>Ultimo loop iniciado: {formatDateTime(watcher.last_loop_started_at)}</small>
        <small>Ultimo loop terminado: {formatDateTime(watcher.last_loop_finished_at)}</small>
        <small>Ultimo exito: {formatDateTime(watcher.last_success_at)}</small>
        <small>Errores consecutivos: {watcher.consecutive_errors}</small>
        <small>Intervalo objetivo: {watcher.interval_seconds} segundos</small>
        <small>Budget maximo por ciclo: {watcher.cycle_budget_seconds} segundos</small>
        <small>Ciclo en curso desde {formatDateTime(watcher.current_run_started_at)}</small>
        <small>Ultimo escaneo {formatDateTime(watcher.last_run_at)}</small>
        <small>Ultimo ciclo: {formatDurationMs(watcher.last_run_duration_ms)}</small>
        <small>Promedio reciente: {formatDurationMs(watcher.average_run_duration_ms)}</small>
        <small>Proximo escaneo {nextRunLabel}</small>
        <small>Estado: {cycleMessage}</small>
        <small>Escaneadas: {scannedWallets}</small>
        <small>Pendientes: {pendingWallets}</small>
        <small>Wallets lentas: {watcher.slow_wallet_count}</small>
        <small>Timeouts reales: {watcher.timeout_count}</small>
        <small>Saltadas por budget: {watcher.skipped_due_to_budget_count}</small>
        <small>Saltadas por prioridad: {watcher.skipped_due_to_priority_count}</small>
        <small>Con aviso: {watcher.errored_wallet_count}</small>
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

      {timeoutWallets.length > 0 ? (
        <div className="copy-wallet-subsection">
          <span className="copy-wallet-subsection-title">Wallets con timeout real</span>
          <div className="copy-wallet-details">
            {timeoutWallets.map((wallet) => (
              <small key={wallet.wallet_id}>{formatWalletScanLine(wallet)}</small>
            ))}
          </div>
        </div>
      ) : null}

      {pendingWalletsList.length > 0 ? (
        <div className="copy-wallet-subsection">
          <span className="copy-wallet-subsection-title">Wallets pendientes para proximo ciclo</span>
          <div className="copy-wallet-details">
            {pendingWalletsList.map((wallet) => (
              <small key={wallet.wallet_id}>{formatWalletScanLine(wallet)}</small>
            ))}
          </div>
        </div>
      ) : null}

      <div className="copy-status-strip">
        <span className="copy-badge subtle">El watcher priorizo wallets activas para mantener el escaneo live.</span>
        {watcher.skipped_due_to_budget_count > 0 ? (
          <span className="copy-badge warning">Pendiente por carga no es error: vuelve en el proximo ciclo.</span>
        ) : null}
        {watcher.timeout_count > 0 ? (
          <span className="copy-badge locked">Timeout real: una wallet o la API tardaron demasiado.</span>
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
      ? "Timeout real"
      : entry.status === "slow"
        ? "Wallet lenta"
        : entry.status === "skipped_budget"
          ? "Pendiente por carga"
          : entry.status === "skipped_priority"
            ? "Pendiente por prioridad"
            : entry.status === "skipped_paused"
              ? "Pausada"
          : entry.status === "error"
            ? "Con aviso"
            : "Saludable";
  const reason = entry.reason ? ` | ${entry.reason}` : "";
  return `${alias} | ${status} | ${duration}${reason}${entry.next_scan_hint ? ` | ${entry.next_scan_hint}` : ""}`;
}

function describeWorkerState(state: CopyTradingWatcherStatus["worker_status"]): string {
  switch (state) {
    case "running":
      return "Activo";
    case "stale":
      return "Desactualizado";
    case "stopped":
      return "Detenido";
    case "error":
      return "Error";
    case "not_started":
      return "No iniciado";
    default:
      return "Estado desconocido";
  }
}
