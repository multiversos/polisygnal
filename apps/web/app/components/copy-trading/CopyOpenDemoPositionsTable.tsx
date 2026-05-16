"use client";

import { formatDateTime, formatPercent, formatPnl, formatTradeAge, formatUsd, formatWalletAddress } from "../../lib/copyTrading";
import type { CopyDemoPosition } from "../../lib/copyTradingTypes";

export function CopyOpenDemoPositionsTable({ positions }: { positions: CopyDemoPosition[] }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Copias demo abiertas</strong>
      </div>
      {positions.length === 0 ? (
        <div className="copy-empty-state">Sin copias demo abiertas todavia.</div>
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
                  <span className={`copy-badge ${position.status === "price_pending" ? "locked" : "success"}`}>
                    {position.status === "price_pending" ? "Precio actual pendiente" : "Abierta"}
                  </span>
                  <span className="copy-badge">Entrada {Number(position.entry_price).toFixed(3)}</span>
                  <span className="copy-badge">Monto {formatUsd(position.entry_amount_usd)}</span>
                  <span className="copy-badge">Tiempo {formatTradeAge(ageSecondsFromNow(position.opened_at))}</span>
                </div>
              </div>
              <div className="copy-feed-numbers">
                <span>Precio actual {position.current_price !== null ? Number(position.current_price).toFixed(3) : "Pendiente"}</span>
                <span className={getPnlClassName(position.unrealized_pnl_usd)}>PnL actual {formatPnl(position.unrealized_pnl_usd)}</span>
                <span className={getPnlClassName(position.unrealized_pnl_percent)}>PnL % {formatPercent(position.unrealized_pnl_percent)}</span>
                <small>{formatDateTime(position.opened_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ageSecondsFromNow(value: string): number | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
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
