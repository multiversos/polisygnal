import { formatDateTime } from "../../lib/copyTrading";
import type { CopyTradingStatus } from "../../lib/copyTradingTypes";

export function CopyTradingMetrics({
  loading = false,
  status,
}: {
  loading?: boolean;
  status: CopyTradingStatus | null;
}) {
  const metrics = [
    ["Wallets seguidas", loading ? "—" : String(status?.wallets_enabled ?? 0)],
    ["Trades detectados", loading ? "—" : String(status?.trades_detected ?? 0)],
    ["Copias simuladas", loading ? "—" : String(status?.orders_simulated ?? 0)],
    ["Saltados", loading ? "—" : String(status?.orders_skipped ?? 0)],
    ["Ultimo escaneo", loading ? "Consultando..." : formatDateTime(status?.last_scan_at)],
  ];

  return (
    <section className="copy-metrics-grid" aria-label="Metricas de Copy Trading">
      {metrics.map(([label, value]) => (
        <div className="copy-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
