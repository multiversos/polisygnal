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
  const hasAnyDemoActivity = Boolean(summary?.open_positions_count || summary?.closed_positions_count);
  const effectiveMessage = statusMessage || summary?.message || fallbackSummaryMessage(summary);
  const effectiveTone = statusMessage ? "locked" : statusTone(summary?.status ?? null);
  const capitalUsed = summary?.demo_capital_used_usd ?? summary?.capital_demo_used_usd ?? null;
  const currentOpenValue = summary?.current_open_value_usd ?? summary?.open_current_value_usd ?? null;
  const totalPnl = summary?.total_pnl_usd ?? summary?.total_demo_pnl_usd ?? null;
  const pendingPriceCount = summary?.pending_price_count ?? summary?.price_pending_count ?? 0;
  const winCount = summary?.win_count ?? summary?.winning_closed_count ?? 0;
  const lossCount = summary?.loss_count ?? summary?.losing_closed_count ?? 0;

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
      ) : !summary ? (
        <div className="copy-empty-state">No pudimos actualizar el PnL demo ahora.</div>
      ) : (
        <div className="copy-performance-grid">
          {effectiveMessage ? (
            <div className="copy-status-strip" aria-live="polite">
              <span className={`copy-badge ${effectiveTone}`}>{effectiveMessage}</span>
            </div>
          ) : null}

          <div className="copy-performance-row copy-performance-row-primary">
            <MetricCard label="Capital demo usado" tone="neutral" value={formatUsd(capitalUsed)} />
            <MetricCard
              label="PnL total demo"
              tone={pnlTone(totalPnl)}
              value={formatPnl(totalPnl)}
            />
            <MetricCard label="ROI demo" tone={pnlTone(summary.demo_roi_percent)} value={formatPercent(summary.demo_roi_percent)} />
            <MetricCard
              label="Win rate demo"
              tone={summary.win_rate_percent === null ? "warning" : "neutral"}
              value={summary.win_rate_percent === null ? "Pendiente" : formatPercent(summary.win_rate_percent)}
            />
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
              value={pendingPriceCount > 0 && !currentOpenValue ? "Pendiente" : formatUsd(currentOpenValue)}
              compact
            />
            <MetricCard label="Precio pendiente" tone={pendingPriceCount > 0 ? "warning" : "neutral"} value={String(pendingPriceCount)} compact />
          </div>

          <div className="copy-performance-mini-grid">
            <MiniStat label="Abiertas" value={String(summary.open_positions_count)} />
            <MiniStat label="Cerradas" value={String(summary.closed_positions_count)} />
            <MiniStat label="Ganadoras" value={String(winCount)} />
            <MiniStat label="Perdedoras" value={String(lossCount)} />
            <MiniStat label="Break-even" value={String(summary.break_even_closed_count)} />
            <MiniStat label="Canceladas" value={String(summary.cancelled_closed_count)} tone={summary.cancelled_closed_count > 0 ? "warning" : "neutral"} />
            <MiniStat label="No verificables" value={String(summary.unknown_closed_count)} tone={summary.unknown_closed_count > 0 ? "warning" : "neutral"} />
            <MiniStat label="Promedio cerradas" value={formatPnl(summary.average_closed_pnl_usd)} tone={pnlTone(summary.average_closed_pnl_usd)} />
            <MiniStat label="Mejor copia" value={formatPnl(summary.best_closed_pnl_usd)} tone={pnlTone(summary.best_closed_pnl_usd)} />
            <MiniStat label="Peor copia" value={formatPnl(summary.worst_closed_pnl_usd)} tone={pnlTone(summary.worst_closed_pnl_usd)} />
            <MiniStat label="Capital cerrado" value={formatUsd(summary.closed_capital_usd)} />
          </div>

          {!hasAnyDemoActivity ? (
            <div className="copy-empty-state">Aun no hay copias demo abiertas ni cerradas.</div>
          ) : null}
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

function statusTone(status: CopyTradingDemoPnlSummary["status"] | null): "neutral" | "warning" | "locked" {
  switch (status) {
    case "ok":
      return "neutral";
    case "partial":
      return "warning";
    case "error":
      return "locked";
    case "no_data":
    default:
      return "neutral";
  }
}

function fallbackSummaryMessage(summary: CopyTradingDemoPnlSummary | null): string | null {
  if (!summary) {
    return null;
  }
  if (summary.status === "partial") {
    return "Hay posiciones abiertas, pero algunas no tienen precio actual disponible.";
  }
  if (summary.status === "no_data") {
    return "Aun no hay copias demo abiertas ni cerradas.";
  }
  if ((summary.closed_positions_count ?? 0) === 0) {
    return "El win rate aparecera cuando existan copias cerradas con resultado confiable.";
  }
  return null;
}
