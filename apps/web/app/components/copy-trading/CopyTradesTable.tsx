import { freshnessBadgeClass, formatCopyWindow, formatDateTime, formatFreshnessLabel, formatTradeAge, formatUsd } from "../../lib/copyTrading";
import type { CopyDetectedTrade } from "../../lib/copyTradingTypes";

export function CopyTradesTable({ trades }: { trades: CopyDetectedTrade[] }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Lectura publica</span>
        <strong>Trades detectados</strong>
      </div>
      {trades.length === 0 ? (
        <div className="copy-empty-state">Sin trades detectados todavia.</div>
      ) : (
        <div className="copy-feed">
          {trades.map((trade) => (
            <article className="copy-feed-item" key={trade.id}>
              <div>
                <span className={`copy-side ${trade.side}`}>{trade.side.toUpperCase()}</span>
                <strong>{trade.market_title || trade.market_slug || "Mercado Polymarket"}</strong>
                <small>{trade.outcome || "Outcome no informado"}</small>
                <div className="copy-status-strip">
                  <span className={`copy-badge ${freshnessBadgeClass(trade.freshness_status)}`}>
                    {formatFreshnessLabel(trade.freshness_status, trade.freshness_label)}
                  </span>
                  <span className="copy-badge">{formatTradeAge(trade.age_seconds)}</span>
                  <span className="copy-badge">{formatCopyWindow(trade.copy_window_seconds)}</span>
                </div>
              </div>
              <div className="copy-feed-numbers">
                <span>{trade.source_price ? Number(trade.source_price).toFixed(3) : "-"}</span>
                <span>{formatUsd(trade.source_amount_usd)}</span>
                <small>{formatDateTime(trade.source_timestamp || trade.detected_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
