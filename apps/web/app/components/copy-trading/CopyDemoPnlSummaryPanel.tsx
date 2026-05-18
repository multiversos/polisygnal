"use client";

import { formatDateTime, formatPercent, formatPnl, formatUsd } from "../../lib/copyTrading";
import type { CopyTradingDemoPnlSummary } from "../../lib/copyTradingTypes";

export function CopyDemoPnlSummaryPanel({
  loading = false,
  lastUpdatedLabel = null,
  refreshing = false,
  statusMessage = null,
  summary,
}: {
  loading?: boolean;
  lastUpdatedLabel?: string | null;
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
  const statusLabel = getStatusLabel(summary?.status ?? null, statusMessage);
  const backendUpdatedAt = summary?.last_updated_at ? formatDateTime(summary.last_updated_at) : null;

  return (
    <section className="copy-panel copy-performance-panel">
      <div className="copy-performance-header">
        <div className="copy-panel-heading">
          <span>Modo demo</span>
          <strong>Rendimiento demo</strong>
        </div>
        <div className="copy-status-strip" aria-live="polite">
          <span className={`copy-badge ${effectiveTone}`}>{statusLabel}</span>
          {backendUpdatedAt ? <span className="copy-badge subtle">Backend {backendUpdatedAt}</span> : null}
          {lastUpdatedLabel ? <span className="copy-badge subtle">Vista {lastUpdatedLabel}</span> : null}
          {pendingPriceCount > 0 ? <span className="copy-badge warning">Precio pendiente: {pendingPriceCount}</span> : null}
        </div>
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
            <div className={`copy-performance-banner ${effectiveTone}`} aria-live="polite">
              <div>
                <span>{statusLabel}</span>
                <strong>{effectiveMessage}</strong>
              </div>
              {summary.warnings.length > 0 ? (
                <small>{summary.warnings.length} advertencia(s) informativa(s) en esta pasada.</small>
              ) : null}
            </div>
          ) : null}

          <div className="copy-performance-primary-grid">
            <MetricCard
              detail="Capital comprometido en la simulacion"
              emphasis="primary"
              label="Capital demo usado"
              tone="neutral"
              value={formatUsd(capitalUsed)}
            />
            <MetricCard
              detail="Suma del PnL abierto y realizado"
              emphasis="hero"
              label="PnL total demo"
              tone={pnlTone(totalPnl)}
              value={formatPnl(totalPnl)}
            />
            <MetricCard
              detail="Retorno sobre el capital demo usado"
              emphasis="primary"
              label="ROI demo"
              tone={pnlTone(summary.demo_roi_percent)}
              value={formatPercent(summary.demo_roi_percent)}
            />
            <MetricCard
              detail={
                summary.win_rate_percent === null
                  ? "Aparece cuando existan copias cerradas con resultado confiable"
                  : "Solo cuenta copias cerradas win/loss"
              }
              emphasis="primary"
              label="Win rate demo"
              tone={summary.win_rate_percent === null ? "warning" : "neutral"}
              value={summary.win_rate_percent === null ? "Pendiente" : formatPercent(summary.win_rate_percent)}
            />
          </div>

          <div className="copy-performance-section-grid">
            <section className="copy-performance-subsection">
              <div className="copy-performance-subsection-heading">
                <span>Posiciones abiertas</span>
                <strong>Exposicion actual</strong>
              </div>
              <div className="copy-performance-secondary-grid">
                <MetricCard compact detail="Variacion de posiciones abiertas" label="PnL abierto" tone={pnlTone(summary.open_pnl_usd)} value={formatPnl(summary.open_pnl_usd)} />
                <MetricCard compact detail="Capital aun expuesto" label="Capital abierto" tone="neutral" value={formatUsd(summary.open_capital_usd)} />
                <MetricCard
                  compact
                  detail={pendingPriceCount > 0 ? "Hay mercados sin precio actual confiable" : "Valorizacion abierta actual"}
                  label="Valor actual abierto"
                  tone={pendingPriceCount > 0 ? "warning" : "neutral"}
                  value={pendingPriceCount > 0 && !currentOpenValue ? "Pendiente" : formatUsd(currentOpenValue)}
                />
                <MetricCard compact detail="Copias demo todavia activas" label="Abiertas" tone="neutral" value={String(summary.open_positions_count)} />
                <MetricCard compact detail="Abiertas sin precio actual disponible" label="Precio pendiente" tone={pendingPriceCount > 0 ? "warning" : "neutral"} value={String(pendingPriceCount)} />
              </div>
            </section>

            <section className="copy-performance-subsection">
              <div className="copy-performance-subsection-heading">
                <span>Copias cerradas</span>
                <strong>Resultado realizado</strong>
              </div>
              <div className="copy-performance-secondary-grid">
                <MetricCard compact detail="Resultado ya cerrado" label="PnL realizado" tone={pnlTone(summary.realized_pnl_usd)} value={formatPnl(summary.realized_pnl_usd)} />
                <MetricCard compact detail="Posiciones demo ya finalizadas" label="Cerradas" tone="neutral" value={String(summary.closed_positions_count)} />
                <MetricCard compact detail="Solo win confirmadas" label="Ganadoras" tone={winCount > 0 ? "positive" : "neutral"} value={String(winCount)} />
                <MetricCard compact detail="Solo loss confirmadas" label="Perdedoras" tone={lossCount > 0 ? "negative" : "neutral"} value={String(lossCount)} />
                <MetricCard compact detail="Capital ya realizado" label="Capital cerrado" tone="neutral" value={formatUsd(summary.closed_capital_usd)} />
              </div>
            </section>
          </div>

          <div className="copy-performance-mini-grid copy-performance-tertiary-grid">
            <MiniStat label="Break-even" value={String(summary.break_even_closed_count)} />
            <MiniStat label="Canceladas" tone={summary.cancelled_closed_count > 0 ? "warning" : "neutral"} value={String(summary.cancelled_closed_count)} />
            <MiniStat label="No verificables" tone={summary.unknown_closed_count > 0 ? "warning" : "neutral"} value={String(summary.unknown_closed_count)} />
            <MiniStat label="Promedio cerradas" tone={pnlTone(summary.average_closed_pnl_usd)} value={formatPnl(summary.average_closed_pnl_usd)} />
            <MiniStat label="Mejor copia" tone={pnlTone(summary.best_closed_pnl_usd)} value={formatPnl(summary.best_closed_pnl_usd)} />
            <MiniStat label="Peor copia" tone={pnlTone(summary.worst_closed_pnl_usd)} value={formatPnl(summary.worst_closed_pnl_usd)} />
          </div>

          {summary.best_closed_copy || summary.worst_closed_copy ? (
            <div className="copy-performance-insights">
              {summary.best_closed_copy ? (
                <InsightCard
                  detail={summary.best_closed_copy.close_reason}
                  label="Mejor cerrada"
                  market={summary.best_closed_copy.market_title}
                  outcome={summary.best_closed_copy.outcome}
                  tone={pnlTone(summary.best_closed_copy.realized_pnl_usd)}
                  value={formatPnl(summary.best_closed_copy.realized_pnl_usd)}
                />
              ) : null}
              {summary.worst_closed_copy ? (
                <InsightCard
                  detail={summary.worst_closed_copy.close_reason}
                  label="Peor cerrada"
                  market={summary.worst_closed_copy.market_title}
                  outcome={summary.worst_closed_copy.outcome}
                  tone={pnlTone(summary.worst_closed_copy.realized_pnl_usd)}
                  value={formatPnl(summary.worst_closed_copy.realized_pnl_usd)}
                />
              ) : null}
            </div>
          ) : null}

          {!hasAnyDemoActivity ? <div className="copy-empty-state">Aun no hay copias demo abiertas ni cerradas.</div> : null}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  detail = null,
  emphasis = "secondary",
  label,
  value,
  tone,
  compact = false,
}: {
  detail?: string | null;
  emphasis?: "hero" | "primary" | "secondary";
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  compact?: boolean;
}) {
  return (
    <article className={`copy-performance-card ${tone} ${compact ? "compact" : ""} ${emphasis}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function InsightCard({
  detail,
  label,
  market,
  outcome,
  tone,
  value,
}: {
  detail: string | null;
  label: string;
  market: string | null;
  outcome: string | null;
  tone: "positive" | "negative" | "neutral" | "warning";
  value: string;
}) {
  return (
    <article className={`copy-performance-insight ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{market || "Mercado Polymarket"}</small>
      <div className="copy-status-strip">
        {outcome ? <span className="copy-badge subtle">{outcome}</span> : null}
        {detail ? <span className="copy-badge historical">{formatCloseReason(detail)}</span> : null}
      </div>
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

function getStatusLabel(
  status: CopyTradingDemoPnlSummary["status"] | null,
  statusMessage: string | null,
): string {
  if (statusMessage) {
    return "Error real";
  }
  switch (status) {
    case "ok":
      return "Datos demo actualizados";
    case "partial":
      return "Datos parciales";
    case "error":
      return "Error real";
    case "no_data":
    default:
      return "Sin datos demo";
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

function formatCloseReason(reason: string): string {
  switch (reason) {
    case "copied_sell":
    case "wallet_sell":
      return "Cierre copiado";
    case "late_copied_sell":
      return "Cierre copiado tarde";
    case "reconciled_sell":
      return "Cierre reconciliado";
    case "market_resolved":
      return "Mercado resuelto";
    case "market_cancelled":
      return "Cancelado";
    case "unknown":
      return "No verificable";
    default:
      return reason.replaceAll("_", " ");
  }
}
