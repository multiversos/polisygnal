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
  const stateLabel = watcher.enabled ? (watcher.running ? "Activo" : "Activo en espera") : "Pausado";
  const nextRunLabel = watcher.enabled
    ? formatDateTime(watcher.next_run_at)
    : "Watcher pausado";

  return (
    <section className="copy-panel copy-watcher-panel">
      <div className="copy-panel-heading">
        <span>Watcher demo</span>
        <strong>{stateLabel}</strong>
      </div>
      <p>El watcher demo escanea wallets activas y guarda simulaciones. No ejecuta operaciones reales.</p>
      <div className="copy-wallet-details">
        <small>Intervalo cada {watcher.interval_seconds}s</small>
        <small>Ultimo escaneo {formatDateTime(watcher.last_run_at)}</small>
        <small>Proximo escaneo {nextRunLabel}</small>
        <small>Error count {watcher.error_count}</small>
        {watcher.last_result ? (
          <small>
            Ultimo resultado: wallets {watcher.last_result.wallets_scanned} · nuevos {watcher.last_result.new_trades} ·
            simuladas {watcher.last_result.orders_simulated} · historicos {watcher.last_result.historical_trades}
          </small>
        ) : (
          <small>Ultimo resultado: sin ejecuciones todavia</small>
        )}
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
        <button
          className="copy-primary-button"
          disabled={busy}
          onClick={() => void onRunOnce()}
          type="button"
        >
          Ejecutar una vez
        </button>
      </div>
    </section>
  );
}
