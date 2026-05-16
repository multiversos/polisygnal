"use client";

import { Fragment, useState } from "react";
import {
  deleteCopyWallet,
  formatCopyWindow,
  formatDateTime,
  formatFreshnessLabel,
  formatUsd,
  formatWalletAddress,
  freshnessBadgeClass,
  scanCopyWallet,
  updateCopyWallet,
} from "../../lib/copyTrading";
import type { CopyTradingTickSummary, CopyWallet } from "../../lib/copyTradingTypes";
import { EditCopyWalletForm } from "./EditCopyWalletForm";

type CopyWalletsTableProps = {
  onChanged: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  wallets: CopyWallet[];
};

type RowAction = "delete" | "pause" | "scan" | null;

export function CopyWalletsTable({ onChanged, onNotice, wallets }: CopyWalletsTableProps) {
  const [pendingActionByWallet, setPendingActionByWallet] = useState<Record<string, RowAction>>({});
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);

  function setPendingAction(walletId: string, action: RowAction) {
    setPendingActionByWallet((current) => ({ ...current, [walletId]: action }));
  }

  function clearPendingAction(walletId: string) {
    setPendingActionByWallet((current) => {
      const next = { ...current };
      delete next[walletId];
      return next;
    });
  }

  async function handlePause(wallet: CopyWallet) {
    setPendingAction(wallet.id, "pause");
    try {
      await updateCopyWallet(wallet.id, { enabled: !wallet.enabled });
      onNotice?.(wallet.enabled ? "Wallet pausada." : "Wallet reactivada.");
      await onChanged();
    } catch {
      onNotice?.("No pudimos actualizar esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id);
    }
  }

  function handleEdit(wallet: CopyWallet) {
    setEditingWalletId(wallet.id);
    onNotice?.("Edita la configuracion de esta wallet y guarda los cambios.");
  }

  async function handleDelete(wallet: CopyWallet) {
    setPendingAction(wallet.id, "delete");
    try {
      await deleteCopyWallet(wallet.id);
      onNotice?.("Wallet eliminada.");
      await onChanged();
    } catch {
      onNotice?.("No pudimos eliminar esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id);
    }
  }

  async function handleScan(wallet: CopyWallet) {
    setPendingAction(wallet.id, "scan");
    try {
      const summary = await scanCopyWallet(wallet.id);
      onNotice?.(getWalletScanMessage(summary));
      await onChanged();
    } catch {
      onNotice?.("No pudimos escanear esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id);
    }
  }

  return (
    <section className="copy-panel copy-wide-panel">
      <div className="copy-panel-heading">
        <span>Seguimiento</span>
        <strong>Wallets seguidas</strong>
      </div>
      <p className="copy-field-helper">
        El watcher demo escanea todas las wallets automaticamente cada 5s. Usa Escanear para revisar una wallet
        puntual.
      </p>
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
              {wallets.map((wallet) => {
                const pendingAction = pendingActionByWallet[wallet.id] ?? null;
                const isEditing = editingWalletId === wallet.id;
                return (
                  <Fragment key={wallet.id}>
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
                          <button
                            className="copy-secondary-button"
                            disabled={pendingAction !== null}
                            onClick={() => handlePause(wallet)}
                            type="button"
                          >
                            {pendingAction === "pause" ? (wallet.enabled ? "Pausando..." : "Activando...") : wallet.enabled ? "Pausar" : "Activar"}
                          </button>
                          <button
                            aria-label="Escanea esta wallet una vez ahora."
                            className="copy-action-button"
                            disabled={pendingAction !== null}
                            onClick={() => handleScan(wallet)}
                            title="Escanea esta wallet una vez ahora."
                            type="button"
                          >
                            {pendingAction === "scan" ? "Escaneando..." : "Escanear"}
                          </button>
                          <button
                            aria-label="Editar configuracion de esta wallet"
                            className="copy-secondary-button"
                            disabled={pendingAction !== null}
                            onClick={() => handleEdit(wallet)}
                            title="Editar configuracion de esta wallet"
                            type="button"
                          >
                            {isEditing ? "Editando..." : "Editar"}
                          </button>
                          <button
                            className="copy-danger-button"
                            disabled={pendingAction !== null}
                            onClick={() => handleDelete(wallet)}
                            type="button"
                          >
                            {pendingAction === "delete" ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isEditing ? (
                      <tr>
                        <td className="copy-inline-editor-cell" colSpan={8}>
                          <EditCopyWalletForm
                            onCancel={() => {
                              clearPendingAction(wallet.id);
                              setEditingWalletId(null);
                            }}
                            onSaved={async (message) => {
                              clearPendingAction(wallet.id);
                              setEditingWalletId(null);
                              onNotice?.(message);
                              await onChanged();
                            }}
                            wallet={wallet}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function getWalletScanMessage(summary: CopyTradingTickSummary): string {
  if (summary.errors.length > 0) {
    return "No pudimos escanear esta wallet ahora.";
  }
  if (summary.orders_simulated > 0) {
    return `Escaneo completado. Se generaron ${summary.orders_simulated} orden${summary.orders_simulated === 1 ? "" : "es"} demo.`;
  }
  if (summary.historical_trades > 0) {
    return `Escaneo completado. Se detectaron ${summary.historical_trades} trades historicos para esta wallet.`;
  }
  if (summary.recent_outside_window > 0) {
    return `Escaneo completado. Se detectaron ${summary.recent_outside_window} trades fuera de ventana para esta wallet.`;
  }
  if (summary.new_trades === 0) {
    return "Escaneo completado. No se detectaron trades nuevos para esta wallet.";
  }
  return `Escaneo completado. Se detectaron ${summary.new_trades} trades nuevos para esta wallet.`;
}
