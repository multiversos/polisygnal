"use client";

import { formatDateTime, formatPnl, formatTradeAge, formatUsd, formatWalletAddress } from "../../lib/copyTrading";
import type { CopyDemoPosition } from "../../lib/copyTradingTypes";

export function CopyClosedDemoPositionsTable({ positions }: { positions: CopyDemoPosition[] }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Historial de copias demo</strong>
      </div>
      {positions.length === 0 ? (
        <div className="copy-empty-state">Sin historial de copias demo todavia.</div>
      ) : (
        <div className="copy-feed">
          {positions.map((position) => (
            <article className="copy-feed-item" key={position.id}>
              <div>
                <span className={`copy-side ${position.entry_action}`}>{position.entry_action.toUpperCase()}</span>
                <strong>{position.wallet_label || formatWalletAddress(position.proxy_wallet || position.wallet_id)}</strong>
                <small>{position.market_title || position.market_slug || "Mercado Polymarket"}</small>
                <small>{position.outcome || "Outcome no informado"}</small>
                <div className="copy-status-strip">
                  <span className="copy-badge historical">Cerrada</span>
                  <span className="copy-badge">Entrada {Number(position.entry_price).toFixed(3)}</span>
                  <span className="copy-badge">Salida {position.exit_price ? Number(position.exit_price).toFixed(3) : "-"}</span>
                  <span className="copy-badge">Monto {formatUsd(position.entry_amount_usd)}</span>
                </div>
              </div>
              <div className="copy-feed-numbers">
                <span className={getPnlClassName(position.realized_pnl_usd)}>PnL final {formatPnl(position.realized_pnl_usd)}</span>
                <span>Cierre {position.close_reason === "wallet_sell" ? "Wallet vendio" : "Cierre demo"}</span>
                <span>Duracion {formatTradeAge(durationSeconds(position.opened_at, position.closed_at))}</span>
                <small>{formatDateTime(position.closed_at || position.updated_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function durationSeconds(startedAt: string, endedAt: string | null): number | null {
  const start = new Date(startedAt);
  const end = new Date(endedAt || startedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function getPnlClassName(value: string | null): string {
  if (value === null) {
    return "copy-pnl-neutral";
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "copy-pnl-neutral";
  }
  if (numeric > 0) {
    return "copy-pnl-positive";
  }
  if (numeric < 0) {
    return "copy-pnl-negative";
  }
  return "copy-pnl-neutral";
}
