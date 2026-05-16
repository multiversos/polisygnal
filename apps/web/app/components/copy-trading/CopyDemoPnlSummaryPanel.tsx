"use client";

import { formatPercent, formatPnl, formatUsd } from "../../lib/copyTrading";
import type { CopyTradingDemoPnlSummary } from "../../lib/copyTradingTypes";

export function CopyDemoPnlSummaryPanel({
  loading = false,
  refreshing = false,
  statusMessage = null,
  summary,
}: {
  loading?: boolean;
  refreshing?: boolean;
  statusMessage?: string | null;
  summary: CopyTradingDemoPnlSummary | null;
}) {
  const hasAnyDemoData = Boolean(summary?.open_positions_count || summary?.closed_positions_count);

  return (
    <section className="copy-panel copy-performance-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Rendimiento demo</strong>
      </div>
      <p className="copy-field-helper">
        Vista financiera simulada del copy trading demo. No representa dinero real ni ganancias garantizadas.
      </p>
      {statusMessage || refreshing ? (
        <div className="copy-status-strip" aria-live="polite">
          {refreshing ? <span className="copy-badge subtle">Actualizando metricas...</span> : null}
          {statusMessage ? <span className="copy-badge locked">{statusMessage}</span> : null}
        </div>
      ) : null}
      {loading && !summary ? (
        <div className="copy-empty-state">Cargando metricas demo...</div>
      ) : !hasAnyDemoData || !summary ? (
        <div className="copy-empty-state">Todavia no hay copias demo suficientes para calcular rendimiento.</div>
      ) : (
        <div className="copy-performance-grid">
          <div className="copy-performance-row copy-performance-row-primary">
            <MetricCard label="Capital demo usado" tone="neutral" value={formatUsd(summary.capital_demo_used_usd)} />
            <MetricCard
              label="PnL total demo"
              tone={pnlTone(summary.total_demo_pnl_usd)}
              value={formatPnl(summary.total_demo_pnl_usd)}
            />
            <MetricCard label="ROI demo" tone={pnlTone(summary.demo_roi_percent)} value={formatPercent(summary.demo_roi_percent)} />
            <MetricCard label="Win rate" tone="neutral" value={formatPercent(summary.win_rate_percent)} />
          </div>

          <div className="copy-performance-row">
            <MetricCard label="PnL abierto" tone={pnlTone(summary.open_pnl_usd)} value={formatPnl(summary.open_pnl_usd)} compact />
            <MetricCard
              label="PnL realizado"
              tone={pnlTone(summary.realized_pnl_usd)}
              value={formatPnl(summary.realized_pnl_usd)}
              compact
            />
            <MetricCard label="Capital abierto" tone="neutral" value={formatUsd(summary.open_capital_usd)} compact />
            <MetricCard
              label="Valor actual abierto"
              tone="neutral"
              value={summary.price_pending_count > 0 && !summary.open_current_value_usd ? "Pendiente" : formatUsd(summary.open_current_value_usd)}
              compact
            />
            <MetricCard label="Precio pendiente" tone="warning" value={String(summary.price_pending_count)} compact />
          </div>

          <div className="copy-performance-mini-grid">
            <MiniStat label="Abiertas" value={String(summary.open_positions_count)} />
            <MiniStat label="Cerradas" value={String(summary.closed_positions_count)} />
            <MiniStat label="Ganadoras" value={String(summary.winning_closed_count)} />
            <MiniStat label="Perdedoras" value={String(summary.losing_closed_count)} />
            <MiniStat label="Promedio cerradas" value={formatPnl(summary.average_closed_pnl_usd)} tone={pnlTone(summary.average_closed_pnl_usd)} />
            <MiniStat label="Mejor copia" value={formatPnl(summary.best_closed_pnl_usd)} tone={pnlTone(summary.best_closed_pnl_usd)} />
            <MiniStat label="Peor copia" value={formatPnl(summary.worst_closed_pnl_usd)} tone={pnlTone(summary.worst_closed_pnl_usd)} />
            <MiniStat label="Capital cerrado" value={formatUsd(summary.closed_capital_usd)} />
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  compact?: boolean;
}) {
  return (
    <article className={`copy-performance-card ${tone} ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
}) {
  return (
    <div className={`copy-performance-mini ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pnlTone(value: string | null): "positive" | "negative" | "neutral" | "warning" {
  if (value === null) {
    return "warning";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "warning";
  }
  if (numeric > 0) {
    return "positive";
  }
  if (numeric < 0) {
    return "negative";
  }
  return "neutral";
}
