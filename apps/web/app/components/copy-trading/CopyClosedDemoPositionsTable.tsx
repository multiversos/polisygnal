"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatPercent, formatPnl, formatTradeAge, formatUsd, formatWalletAddress } from "../../lib/copyTrading";
import type { CopyDemoPosition, CopyTradingDemoPnlSummary } from "../../lib/copyTradingTypes";

type HistoryFilter = "all" | "winners" | "losers";
type SideFilter = "all" | "buy" | "sell";

export function CopyClosedDemoPositionsTable({
  positions,
  summary,
}: {
  positions: CopyDemoPosition[];
  summary: CopyTradingDemoPnlSummary | null;
}) {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      const pnl = Number(position.realized_pnl_usd ?? 0);
      const historyMatches =
        historyFilter === "all" ||
        (historyFilter === "winners" && pnl > 0) ||
        (historyFilter === "losers" && pnl < 0);
      const sideMatches = sideFilter === "all" || position.entry_action === sideFilter;
      return historyMatches && sideMatches;
    });
  }, [historyFilter, positions, sideFilter]);

  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Modo demo</span>
        <strong>Copias demo cerradas</strong>
      </div>
      <p className="copy-field-helper">
        Historial de cierres demo con PnL realizado. Canceladas y no verificables no inflan el win rate.
      </p>

      {positions.length === 0 ? (
        <div className="copy-empty-state">
          Aun no hay copias demo cerradas. Las posiciones apareceran aqui cuando el mercado cierre o la wallet seguida venda.
        </div>
      ) : (
        <>
          <div className="copy-performance-mini-grid copy-history-summary-grid">
            <MiniStat label="Cerradas" value={String(summary?.closed_positions_count ?? positions.length)} />
            <MiniStat label="Ganadoras" value={String(summary?.winning_closed_count ?? 0)} tone={(summary?.winning_closed_count ?? 0) > 0 ? "positive" : "neutral"} />
            <MiniStat label="Perdedoras" value={String(summary?.losing_closed_count ?? 0)} tone={(summary?.losing_closed_count ?? 0) > 0 ? "negative" : "neutral"} />
            <MiniStat label="Break-even" value={String(summary?.break_even_closed_count ?? 0)} />
            <MiniStat label="Canceladas" value={String(summary?.cancelled_closed_count ?? 0)} tone={(summary?.cancelled_closed_count ?? 0) > 0 ? "warning" : "neutral"} />
            <MiniStat label="No verificables" value={String(summary?.unknown_closed_count ?? 0)} tone={(summary?.unknown_closed_count ?? 0) > 0 ? "warning" : "neutral"} />
            <MiniStat label="PnL realizado" value={formatPnl(summary?.realized_pnl_usd ?? null)} tone={pnlTone(summary?.realized_pnl_usd ?? null)} />
          </div>

          <div className="copy-filter-row" aria-label="Filtros del historial demo">
            <div className="copy-filter-group">
              <span>Resultado</span>
              <div className="copy-action-row">
                <FilterButton active={historyFilter === "all"} label="Todas" onClick={() => setHistoryFilter("all")} />
                <FilterButton active={historyFilter === "winners"} label="Ganadoras" onClick={() => setHistoryFilter("winners")} />
                <FilterButton active={historyFilter === "losers"} label="Perdedoras" onClick={() => setHistoryFilter("losers")} />
              </div>
            </div>
            <div className="copy-filter-group">
              <span>Lado</span>
              <div className="copy-action-row">
                <FilterButton active={sideFilter === "all"} label="Todas" onClick={() => setSideFilter("all")} />
                <FilterButton active={sideFilter === "buy"} label="BUY" onClick={() => setSideFilter("buy")} />
                <FilterButton active={sideFilter === "sell"} label="SELL" onClick={() => setSideFilter("sell")} />
              </div>
            </div>
          </div>

          {filteredPositions.length === 0 ? (
            <div className="copy-empty-state">No hay copias demo cerradas para ese filtro.</div>
          ) : (
            <div className="copy-feed">
              {filteredPositions.map((position) => (
                <article className="copy-feed-item copy-position-item" key={position.id}>
                  <div>
                    <span className={`copy-side ${position.entry_action}`}>{position.entry_action.toUpperCase()}</span>
                    <strong>{position.wallet_label || formatWalletAddress(position.proxy_wallet || position.wallet_id)}</strong>
                    <small>{position.market_title || position.market_slug || "Mercado Polymarket"}</small>
                    <small>{position.outcome || "Outcome no informado"}</small>
                    <div className="copy-status-strip">
                      <span className="copy-badge historical">Cerrada</span>
                      <span className="copy-badge">Entrada {Number(position.entry_price).toFixed(3)}</span>
                      <span className="copy-badge">Salida {position.exit_price ? Number(position.exit_price).toFixed(3) : "-"}</span>
                      <span className="copy-badge">Monto {formatUsd(position.entry_amount_usd)}</span>
                      <span className={`copy-badge ${getOutcomeTone(position)}`}>Resultado {getResolvedOutcomeLabel(position)}</span>
                      {position.resolution_source ? <span className="copy-badge subtle">Fuente {formatResolutionSource(position.resolution_source)}</span> : null}
                    </div>
                  </div>
                  <div className="copy-feed-numbers">
                    <span className={getPnlClassName(position.realized_pnl_usd)}>PnL final {formatPnl(position.realized_pnl_usd)}</span>
                    <span className={getPnlClassName(position.realized_pnl_percent)}>PnL % {formatPercent(position.realized_pnl_percent)}</span>
                    <span>Cierre {getCloseReasonLabel(position.close_reason)}</span>
                    <span>Valor final {formatUsd(position.exit_value_usd)}</span>
                    <span>Apertura {formatDateTime(position.opened_at)}</span>
                    <span>Cierre {formatDateTime(position.closed_at || position.updated_at)}</span>
                    <span>Duracion {formatTradeAge(durationSeconds(position.opened_at, position.closed_at))}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`copy-pill-button ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
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

function durationSeconds(startedAt: string, endedAt: string | null): number | null {
  const start = new Date(startedAt);
  const end = new Date(endedAt || startedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
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

function getCloseReasonLabel(reason: string | null): string {
  switch (reason) {
    case "copied_sell":
    case "wallet_sell":
      return "Cierre copiado";
    case "late_copied_sell":
      return "Cierre copiado";
    case "reconciled_sell":
      return "Cierre reconciliado";
    case "market_resolved":
      return "Mercado resuelto";
    case "market_cancelled":
      return "Mercado cancelado";
    case "no_reliable_resolution":
      return "Sin resolucion confiable";
    case "unknown":
      return "Cierre no verificable";
    default:
      return "Cierre demo";
  }
}

function getResolvedOutcomeLabel(position: CopyDemoPosition): string {
  switch (position.result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "break_even":
      return "Break-even";
    case "cancelled":
      return "Cancelado";
    case "unknown":
      return "No verificable";
    default:
      return "Pendiente";
  }
}

function getOutcomeTone(position: CopyDemoPosition): string {
  switch (position.result) {
    case "win":
      return "success";
    case "loss":
      return "locked";
    case "break_even":
      return "historical";
    case "cancelled":
      return "locked";
    case "unknown":
    default:
      return "subtle";
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
