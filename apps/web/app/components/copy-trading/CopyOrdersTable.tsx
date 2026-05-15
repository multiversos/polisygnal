import { formatDateTime, formatUsd } from "../../lib/copyTrading";
import type { CopyOrder } from "../../lib/copyTradingTypes";

export function CopyOrdersTable({ orders }: { orders: CopyOrder[] }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Ordenes demo</strong>
      </div>
      {orders.length === 0 ? (
        <div className="copy-empty-state">Sin ordenes simuladas todavia.</div>
      ) : (
        <div className="copy-feed">
          {orders.map((order) => (
            <article className="copy-feed-item" key={order.id}>
              <div>
                <span className={`copy-side ${order.action}`}>{order.action.toUpperCase()}</span>
                <strong>{formatUsd(order.intended_amount_usd)}</strong>
                <small>{order.reason || "Monto fijo aplicado"}</small>
              </div>
              <div className="copy-feed-numbers">
                <span>{order.simulated_price ? Number(order.simulated_price).toFixed(3) : "-"}</span>
                <span className={`copy-badge ${order.status}`}>{order.status}</span>
                <small>{formatDateTime(order.created_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
