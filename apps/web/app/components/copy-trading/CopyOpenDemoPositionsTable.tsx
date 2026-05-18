"use client";

import { formatDateTime, formatPercent, formatPnl, formatTradeAge, formatUsd, formatWalletAddress } from "../../lib/copyTrading";
import type { CopyDemoPosition, CopyTradingDemoPnlSummary } from "../../lib/copyTradingTypes";

export function CopyOpenDemoPositionsTable({
  positions,
  summary,
}: {
  positions: CopyDemoPosition[];
  summary: CopyTradingDemoPnlSummary | null;
}) {
  const currentOpenValue = summary?.current_open_value_usd ?? summary?.open_current_value_usd ?? null;
  const pendingPriceCount = summary?.pending_price_count ?? summary?.price_pending_count ?? 0;

  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Copias demo abiertas</strong>
      </div>
      <p className="copy-field-helper">
        Posiciones demo que siguen abiertas. Si el precio actual no esta disponible, mostramos estado pendiente sin
        inventar PnL.
      </p>
      {positions.length === 0 ? (
        <div className="copy-empty-state">Todavia no hay copias demo abiertas.</div>
      ) : (
        <>
          <div className="copy-performance-mini-grid copy-open-summary-grid">
            <MiniStat label="Abiertas" value={String(summary?.open_positions_count ?? positions.length)} />
            <MiniStat label="Capital abierto" value={formatUsd(summary?.open_capital_usd ?? null)} />
            <MiniStat label="Valor actual abierto" value={formatUsd(currentOpenValue)} />
            <MiniStat label="PnL abierto" value={formatPnl(summary?.open_pnl_usd ?? null)} tone={pnlTone(summary?.open_pnl_usd ?? null)} />
            <MiniStat label="Precio pendiente" value={String(pendingPriceCount)} tone={pendingPriceCount > 0 ? "warning" : "neutral"} />
          </div>
          <div className="copy-feed">
            {positions.map((position) => (
              <article className="copy-feed-item copy-position-item" key={position.id}>
                <div>
                  <span className={`copy-side ${position.entry_action}`}>{position.entry_action.toUpperCase()}</span>
                  <strong>{position.wallet_label || formatWalletAddress(position.proxy_wallet || position.wallet_id)}</strong>
                  <small>{position.market_title || position.market_slug || "Mercado Polymarket"}</small>
                  <small>{position.outcome || "Outcome no informado"}</small>
                  <div className="copy-status-strip">
                    <span className={`copy-badge ${getOpenPositionTone(position.status)}`}>{getOpenPositionLabel(position.status)}</span>
                    <span className="copy-badge">Entrada {Number(position.entry_price).toFixed(3)}</span>
                    <span className="copy-badge">Capital {formatUsd(position.entry_amount_usd)}</span>
                    <span className="copy-badge">Tiempo {formatTradeAge(ageSecondsFromNow(position.opened_at))}</span>
                    {position.resolution_source ? <span className="copy-badge subtle">Fuente {formatResolutionSource(position.resolution_source)}</span> : null}
                  </div>
                </div>
                <div className="copy-feed-numbers">
                  <span>Precio actual {position.current_price !== null ? Number(position.current_price).toFixed(3) : "Pendiente"}</span>
                  <span>Valor actual {position.current_value_usd !== null ? formatUsd(position.current_value_usd) : "Pendiente"}</span>
                  <span className={getPnlClassName(position.unrealized_pnl_usd)}>PnL actual {formatPnl(position.unrealized_pnl_usd)}</span>
                  <span className={getPnlClassName(position.unrealized_pnl_percent)}>PnL % {formatPercent(position.unrealized_pnl_percent)}</span>
                  <span>{getOpenPositionDescription(position.status)}</span>
                  <small>{formatDateTime(position.opened_at)}</small>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
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

function getOpenPositionLabel(status: CopyDemoPosition["status"]): string {
  switch (status) {
    case "waiting_resolution":
      return "Esperando resolucion";
    case "unknown_resolution":
      return "Resultado no confiable";
    case "price_pending":
      return "Precio actual pendiente";
    default:
      return "Abierta";
  }
}

function getOpenPositionTone(status: CopyDemoPosition["status"]): string {
  switch (status) {
    case "waiting_resolution":
      return "historical";
    case "unknown_resolution":
    case "price_pending":
      return "locked";
    default:
      return "success";
  }
}

function getOpenPositionDescription(status: CopyDemoPosition["status"]): string {
  switch (status) {
    case "waiting_resolution":
      return "Mercado vencido. Esperando resolucion confiable.";
    case "unknown_resolution":
      return "No pudimos confirmar un resultado confiable todavia.";
    case "price_pending":
      return "Sin precio actual confiable por ahora.";
    default:
      return "Mercado activo o sin cierre detectado todavia.";
  }
}

function formatResolutionSource(value: string): string {
  if (value === "local_market_outcome") {
    return "PolySignal";
  }
  if (value === "polymarket_gamma_read_only") {
    return "Polymarket";
  }
  return value.replaceAll("_", " ");
}
