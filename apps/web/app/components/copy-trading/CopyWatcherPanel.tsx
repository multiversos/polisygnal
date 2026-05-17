"use client";

import type {
  CopyTradingStatus,
  CopyTradingWatcherStatus,
  CopyTradingWatcherWalletScanResult,
} from "../../lib/copyTradingTypes";
import { formatDateTime, formatDurationMs } from "../../lib/copyTrading";

type CopyWatcherPanelProps = {
  error?: string | null;
  loading?: boolean;
  status: CopyTradingStatus | null;
  statusLoading?: boolean;
  watcher: CopyTradingWatcherStatus | null;
};

export function CopyWatcherPanel({
  error = null,
  loading = false,
  status,
  statusLoading = false,
  watcher,
}: CopyWatcherPanelProps) {
  const persistedStateLabel =
    loading && !watcher ? "Consultando estado del worker..." : describeWorkerState(watcher?.worker_status ?? "unknown");
  const walletScanResults = watcher?.last_result?.wallet_scan_results ?? [];
  const topSlowWallets = walletScanResults
    .filter((entry) => entry.status === "slow")
    .sort((left, right) => (right.duration_ms ?? 0) - (left.duration_ms ?? 0))
    .slice(0, 3);
  const timeoutWallets = walletScanResults.filter((entry) => entry.status === "timeout").slice(0, 3);
  const pendingWalletsList = walletScanResults
    .filter((entry) => entry.status === "skipped_budget" || entry.status === "skipped_priority")
    .slice(0, 4);
  const scannedWallets = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "wallets_scanned",
    watcher?.last_result?.scanned_wallet_count ?? watcher?.scanned_wallet_count ?? 0,
  );
  const pendingWallets = watcher?.last_result?.pending_wallet_count ?? watcher?.pending_wallet_count ?? 0;
  const tradesDetected = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "trades_detected",
    watcher?.last_result?.trades_detected ?? 0,
  );
  const demoOrdersCreated = getLastResultNumber(
    watcher?.last_result_json ?? null,
    "demo_orders_created",
    watcher?.last_result?.orders_simulated ?? 0,
  );
  const positionsOpened = getLastResultNumber(watcher?.last_result_json ?? null, "positions_opened", 0);
  const positionsClosed = getLastResultNumber(watcher?.last_result_json ?? null, "positions_closed", 0);
  const nextRunLabel = formatDateTime(watcher?.next_run_at);
  const cycleMessage = watcher?.last_result?.cycle_budget_exceeded
    ? "Ciclo recortado por carga"
    : watcher?.is_over_interval
      ? "Atrasado por carga"
      : persistedStateLabel;
  const resultSummary = watcher?.last_result_json
    ? `Ultimo resultado: wallets ${scannedWallets} | trades ${tradesDetected} | ordenes demo ${demoOrdersCreated} | posiciones abiertas ${positionsOpened} | posiciones cerradas ${positionsClosed}`
    : loading
      ? "Ultimo resultado: consultando..."
      : "Ultimo resultado: sin ejecuciones todavia";
  const persistentSummary = !watcher
    ? "Consultando estado del worker..."
    : watcher.worker_status === "not_started"
      ? "Worker demo no iniciado todavia."
      : `${persistedStateLabel}. Heartbeat ${formatDateTime(watcher.last_heartbeat_at)}.`;

  return (
    <section className="copy-panel copy-watcher-panel">
      <div className="copy-panel-heading">
        <span>Watcher demo</span>
        <strong>Estado del worker en Render</strong>
      </div>
      <p>
        El worker demo en Render escanea wallets, detecta trades y actualiza el estado persistido. Esta pagina solo
        muestra estado y resultados. No ejecuta operaciones reales.
      </p>
      {error ? (
        <div className="copy-status-strip" aria-live="polite">
          <span className="copy-badge locked">{error}</span>
        </div>
      ) : null}
      <div className="copy-wallet-details">
        <small>Estado persistido del worker: {persistedStateLabel}</small>
        <small>{persistentSummary}</small>
        <small>Modo demo: no ejecuta dinero real.</small>
        <small>Wallets activas: {statusLoading && !status ? "Cargando..." : String(status?.wallets_enabled ?? "—")}</small>
        <small>
          Posiciones abiertas: {statusLoading && !status ? "Cargando..." : String(status?.open_demo_positions_count ?? "—")}
        </small>
        <small>Ultimo heartbeat: {formatDateTime(watcher?.last_heartbeat_at)}</small>
        <small>Ultimo loop iniciado: {formatDateTime(watcher?.last_loop_started_at)}</small>
        <small>Ultimo loop terminado: {formatDateTime(watcher?.last_loop_finished_at)}</small>
        <small>Ultimo exito: {formatDateTime(watcher?.last_success_at)}</small>
        <small>Errores consecutivos: {watcher?.consecutive_errors ?? "—"}</small>
        <small>Intervalo objetivo: {watcher?.interval_seconds ?? "—"} segundos</small>
        <small>Budget maximo por ciclo: {watcher?.cycle_budget_seconds ?? "—"} segundos</small>
        <small>Ciclo en curso desde {formatDateTime(watcher?.current_run_started_at)}</small>
        <small>Ultimo escaneo {formatDateTime(watcher?.last_run_at)}</small>
        <small>Ultimo ciclo: {formatDurationMs(watcher?.last_run_duration_ms)}</small>
        <small>Promedio reciente: {formatDurationMs(watcher?.average_run_duration_ms)}</small>
        <small>Proximo escaneo {nextRunLabel}</small>
        <small>Estado: {cycleMessage}</small>
        <small>Escaneadas: {scannedWallets}</small>
        <small>Trades detectados: {tradesDetected}</small>
        <small>Ordenes demo nuevas: {demoOrdersCreated}</small>
        <small>Posiciones abiertas por el worker: {positionsOpened}</small>
        <small>Posiciones cerradas por el worker: {positionsClosed}</small>
        <small>Pendientes: {pendingWallets}</small>
        <small>Wallets lentas: {watcher?.slow_wallet_count ?? "—"}</small>
        <small>Timeouts reales: {watcher?.timeout_count ?? "—"}</small>
        <small>Saltadas por budget: {watcher?.skipped_due_to_budget_count ?? "—"}</small>
        <small>Saltadas por prioridad: {watcher?.skipped_due_to_priority_count ?? "—"}</small>
        <small>Con aviso: {watcher?.errored_wallet_count ?? "—"}</small>
        <small>Escaneadas / pendientes: {scannedWallets} / {pendingWallets}</small>
        {watcher?.is_over_interval ? (
          <small>Atrasado por carga: {watcher.behind_by_seconds}s sobre el intervalo</small>
        ) : null}
        {watcher?.last_result?.cycle_budget_exceeded ? (
          <small>Ciclo recortado por carga para dejar wallets pendientes en el proximo barrido.</small>
        ) : null}
        <small>{resultSummary}</small>
        {watcher?.last_error ? <small>Ultimo error: {watcher.last_error}</small> : null}
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
        <span className="copy-badge subtle">La automatizacion corre en Render. Esta vista solo refresca estado y resultados.</span>
        {watcher && watcher.skipped_due_to_budget_count > 0 ? (
          <span className="copy-badge warning">Pendiente por carga no es error: vuelve en el proximo ciclo.</span>
        ) : null}
        {watcher && watcher.timeout_count > 0 ? (
          <span className="copy-badge locked">Timeout real: una wallet o la API tardaron demasiado.</span>
        ) : null}
      </div>
    </section>
  );
}

function getLastResultNumber(
  payload: Record<string, unknown> | null,
  key: string,
  fallback: number,
): number {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
