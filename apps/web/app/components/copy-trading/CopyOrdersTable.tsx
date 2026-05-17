import { freshnessBadgeClass, formatDateTime, formatFreshnessLabel, formatUsd } from "../../lib/copyTrading";
import type { CopyOrder } from "../../lib/copyTradingTypes";

export function CopyOrdersTable({ orders }: { orders: CopyOrder[] }) {
  const hiddenHistoricalOrders = orders.filter(
    (order) => order.status === "skipped" && order.reason === "trade_too_old" && order.freshness_status === "historical",
  );
  const hiddenLateOrders = orders.filter(
    (order) =>
      order.status === "skipped" &&
      order.reason === "trade_too_old" &&
      order.freshness_status === "recent_outside_window",
  );
  const visibleOrders = orders.filter(
    (order) =>
      !(
        order.status === "skipped" &&
        order.reason === "trade_too_old" &&
        (order.freshness_status === "historical" || order.freshness_status === "recent_outside_window")
      ),
  );

  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Ordenes demo</strong>
      </div>
      {hiddenHistoricalOrders.length > 0 || hiddenLateOrders.length > 0 ? (
        <div className="copy-status-strip" aria-live="polite">
          {hiddenHistoricalOrders.length > 0 ? (
            <span className="copy-badge historical">
              {hiddenHistoricalOrders.length} trades historicos ignorados fuera de la vista principal.
            </span>
          ) : null}
          {hiddenLateOrders.length > 0 ? (
            <span className="copy-badge locked">
              {hiddenLateOrders.length} trades omitidos por seguridad al llegar tarde para copiar.
            </span>
          ) : null}
        </div>
      ) : null}
      {visibleOrders.length === 0 ? (
        <div className="copy-empty-state">
          {orders.length > 0
            ? "Sin ordenes demo relevantes para mostrar en esta vista."
            : "Sin ordenes simuladas todavia."}
        </div>
      ) : (
        <div className="copy-feed">
          {visibleOrders.map((order) => (
            <article className="copy-feed-item" key={order.id}>
              <div>
                <span className={`copy-side ${order.action}`}>{order.action.toUpperCase()}</span>
                <strong>{formatUsd(order.intended_amount_usd)}</strong>
                <small>{formatCopyOrderReason(order)}</small>
                {order.freshness_status ? (
                  <span className={`copy-badge ${freshnessBadgeClass(order.freshness_status)}`}>
                    {formatFreshnessLabel(order.freshness_status, order.freshness_label)}
                  </span>
                ) : null}
              </div>
              <div className="copy-feed-numbers">
                <span>{order.simulated_price ? Number(order.simulated_price).toFixed(3) : "-"}</span>
                <span className={`copy-badge ${copyOrderStatusClass(order)}`}>{formatCopyOrderStatus(order)}</span>
                <small>{formatDateTime(order.created_at)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatCopyOrderStatus(order: CopyOrder): string {
  if (order.status === "skipped" && order.reason === "trade_too_old" && order.freshness_status === "recent_outside_window") {
    return "Fuera de ventana";
  }
  if (order.status === "skipped" && order.reason === "trade_too_old") {
    return "Historico";
  }
  if (order.status === "skipped") {
    return "Saltada";
  }
  if (order.status === "simulated") {
    return "Simulacion creada";
  }
  if (order.status === "blocked") {
    return "Bloqueada";
  }
  return "Pendiente";
}

function copyOrderStatusClass(order: CopyOrder): string {
  if (order.status === "skipped" && order.reason === "trade_too_old" && order.freshness_status === "recent_outside_window") {
    return "locked";
  }
  if (order.status === "skipped" && order.reason === "trade_too_old") {
    return "historical";
  }
  return order.status;
}

function formatCopyOrderReason(order: CopyOrder): string {
  if (!order.reason) {
    return order.status === "simulated" ? "Simulacion creada" : "Sin detalle adicional.";
  }
  if (order.reason === "trade_too_old" && order.freshness_status === "recent_outside_window") {
    return "Omitido por seguridad: detectado tarde para copiar con buen precio.";
  }
  const reasonLabels: Record<string, string> = {
    capped_by_max_trade_usd: "Monto limitado por maximo por trade.",
    copy_buys_disabled: "Compras desactivadas para esta wallet.",
    copy_sells_disabled: "Ventas desactivadas para esta wallet.",
    invalid_copy_amount: "Monto de copia invalido.",
    missing_price: "Sin precio suficiente para simular.",
    missing_side: "Sin direccion de trade suficiente.",
    real_trading_not_configured: "Modo real bloqueado.",
    trade_too_old: "Historico ignorado: anterior a la ventana valida de seguimiento.",
  };
  return reasonLabels[order.reason] || "No se simulo por una regla de seguridad.";
}
