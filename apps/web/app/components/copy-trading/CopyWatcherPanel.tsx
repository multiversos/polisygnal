"use client";

import type { CopyTradingWatcherStatus } from "../../lib/copyTradingTypes";
import { formatDateTime } from "../../lib/copyTrading";

type CopyWatcherPanelProps = {
  busy: boolean;
  onRunOnce: () => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  watcher: CopyTradingWatcherStatus;
};

export function CopyWatcherPanel({ busy, onRunOnce, onStart, onStop, watcher }: CopyWatcherPanelProps) {
  const stateLabel = watcher.enabled ? (watcher.running ? "Escaneando" : "Activo") : "Pausado";
  const autoCopyLabel = watcher.enabled ? "Auto-copy demo activo" : "Auto-copy demo pausado";
  const nextRunLabel = watcher.enabled ? formatDateTime(watcher.next_run_at) : "Watcher pausado";
  const stateSummary = watcher.last_result?.errors.length ? "Error parcial" : stateLabel;
  const resultSummary = watcher.last_result
    ? `Ultimo resultado: wallets ${watcher.last_result.wallets_scanned} | nuevos ${watcher.last_result.new_trades} | compras demo ${watcher.last_result.buy_simulated ?? 0} | ventas demo ${watcher.last_result.sell_simulated ?? 0} | historicos ${watcher.last_result.historical_trades} | saltadas ${watcher.last_result.orders_skipped}`
    : "Ultimo resultado: sin ejecuciones todavia";

  return (
    <section className="copy-panel copy-watcher-panel">
      <div className="copy-panel-heading">
        <span>Watcher demo</span>
        <strong>{autoCopyLabel}</strong>
      </div>
      <p>Escanea wallets activas cada 5s y crea compras/ventas demo automaticamente. No ejecuta operaciones reales.</p>
      <div className="copy-wallet-details">
        <small>Intervalo: {watcher.interval_seconds} segundos</small>
        <small>Ultimo escaneo {formatDateTime(watcher.last_run_at)}</small>
        <small>Proximo escaneo {nextRunLabel}</small>
        <small>Error count {watcher.error_count}</small>
        <small>Estado: {stateSummary}</small>
        <small>Con el watcher activo, el escaneo ocurre automaticamente cada 5 segundos.</small>
        <small>{resultSummary}</small>
        {watcher.last_error ? <small>Ultimo error: {watcher.last_error}</small> : null}
      </div>
      <div className="copy-action-row">
        <button
          className="copy-primary-button"
          disabled={busy || watcher.enabled}
          onClick={() => void onStart()}
          type="button"
        >
          Iniciar watcher demo
        </button>
        <button disabled={busy || !watcher.enabled} onClick={() => void onStop()} type="button">
          Pausar watcher
        </button>
        <button disabled={busy} onClick={() => void onRunOnce()} type="button">
          Ejecutar una vez
        </button>
      </div>
      <small>Prueba manual de un solo escaneo.</small>
    </section>
  );
}
