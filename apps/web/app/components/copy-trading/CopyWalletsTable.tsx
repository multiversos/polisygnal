"use client";

import {
  deleteCopyWallet,
  freshnessBadgeClass,
  formatCopyWindow,
  formatDateTime,
  formatFreshnessLabel,
  formatUsd,
  formatWalletAddress,
  scanCopyWallet,
  updateCopyWallet,
} from "../../lib/copyTrading";
import type { CopyWallet } from "../../lib/copyTradingTypes";

type CopyWalletsTableProps = {
  onChanged: () => void;
  wallets: CopyWallet[];
};

export function CopyWalletsTable({ onChanged, wallets }: CopyWalletsTableProps) {
  async function handlePause(wallet: CopyWallet) {
    await updateCopyWallet(wallet.id, { enabled: !wallet.enabled });
    onChanged();
  }

  async function handleMode(wallet: CopyWallet) {
    await updateCopyWallet(wallet.id, { mode: wallet.mode === "demo" ? "real" : "demo" });
    onChanged();
  }

  async function handleDelete(wallet: CopyWallet) {
    await deleteCopyWallet(wallet.id);
    onChanged();
  }

  async function handleScan(wallet: CopyWallet) {
    await scanCopyWallet(wallet.id);
    onChanged();
  }

  return (
    <section className="copy-panel copy-wide-panel">
      <div className="copy-panel-heading">
        <span>Seguimiento</span>
        <strong>Wallets seguidas</strong>
      </div>
      {wallets.length === 0 ? (
        <div className="copy-empty-state">Sin wallets. Agrega una direccion publica para iniciar el modo demo.</div>
      ) : (
        <div className="copy-table-wrap">
          <table className="copy-table">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Wallet</th>
                <th>Modo</th>
                <th>Estado</th>
                <th>Monto</th>
                <th>Compras/Ventas</th>
                <th>Lectura publica</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>{wallet.label || "Sin alias"}</td>
                  <td className="copy-mono">{formatWalletAddress(wallet.proxy_wallet)}</td>
                  <td>
                    <span className={`copy-badge ${wallet.mode === "demo" ? "success" : "locked"}`}>
                      {wallet.mode === "demo" ? "Demo" : "Real bloqueado"}
                    </span>
                  </td>
                  <td>{wallet.enabled ? "Activa" : "Pausada"}</td>
                  <td>{formatUsd(wallet.copy_amount_usd)}</td>
                  <td>{`${wallet.copy_buys ? "BUY" : "-"} / ${wallet.copy_sells ? "SELL" : "-"}`}</td>
                  <td>
                    <div className="copy-wallet-details">
                      <span className={`copy-badge ${freshnessBadgeClass(wallet.last_trade_freshness_status)}`}>
                        {wallet.last_trade_freshness_label
                          ? formatFreshnessLabel(wallet.last_trade_freshness_status, wallet.last_trade_freshness_label)
                          : "Sin actividad reciente"}
                      </span>
                      <small>Ultimo trade {formatDateTime(wallet.last_trade_at)}</small>
                      <small>{formatCopyWindow(wallet.copy_window_seconds)}</small>
                      <small>
                        Recientes {wallet.recent_trades} · Historicos {wallet.historical_trades} · Copiables {wallet.live_candidates}
                      </small>
                      <small>Ultimo escaneo {formatDateTime(wallet.last_scan_at)}</small>
                    </div>
                  </td>
                  <td>
                    <div className="copy-action-row">
                      <button onClick={() => handlePause(wallet)} type="button">
                        {wallet.enabled ? "Pausar" : "Activar"}
                      </button>
                      <button onClick={() => handleScan(wallet)} type="button">
                        Escanear
                      </button>
                      <button onClick={() => handleMode(wallet)} type="button">
                        Editar modo
                      </button>
                      <button className="danger" onClick={() => handleDelete(wallet)} type="button">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
