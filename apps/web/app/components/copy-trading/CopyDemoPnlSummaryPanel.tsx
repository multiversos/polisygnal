"use client";

import { formatPnl } from "../../lib/copyTrading";
import type { CopyTradingDemoPnlSummary } from "../../lib/copyTradingTypes";

export function CopyDemoPnlSummaryPanel({ summary }: { summary: CopyTradingDemoPnlSummary | null }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Resumen PnL demo</strong>
      </div>
      {!summary ? (
        <div className="copy-empty-state">Sin resumen demo todavia.</div>
      ) : (
        <div className="copy-tick-summary" aria-label="Resumen pnl demo">
          <span>Abiertas {summary.open_positions_count}</span>
          <span>Cerradas {summary.closed_positions_count}</span>
          <span>PnL abierto {formatPnl(summary.open_pnl_usd)}</span>
          <span>PnL realizado {formatPnl(summary.realized_pnl_usd)}</span>
          <span>PnL total {formatPnl(summary.total_demo_pnl_usd)}</span>
          <span>Ganadoras {summary.winning_closed_count}</span>
          <span>Perdedoras {summary.losing_closed_count}</span>
          <span>Precio pendiente {summary.price_pending_count}</span>
        </div>
      )}
    </section>
  );
}
