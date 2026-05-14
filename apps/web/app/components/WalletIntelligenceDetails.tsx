"use client";

import { useMemo, useState } from "react";

import type {
  PublicWalletActivity,
  PublicWalletActivityAction,
  WalletIntelligenceSummary,
  WalletMarketPosition,
} from "../lib/walletIntelligenceTypes";

type WalletDetailsFilter =
  | "all"
  | "buy"
  | "history"
  | "no"
  | "over_threshold"
  | "pnl"
  | "position"
  | "notable_wallet"
  | "sell"
  | "trade"
  | "yes";

type WalletDetailsSort = "amount" | "capital" | "recent";

type WalletIntelligenceDetailsProps = {
  onClose: () => void;
  onRetry?: () => void;
  open: boolean;
  summary?: WalletIntelligenceSummary | null;
};

function formatUsd(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return new Intl.NumberFormat("es", {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No disponible";
  }
  return `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Fecha no disponible";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function actionLabel(action?: PublicWalletActivityAction): string {
  if (action === "buy") {
    return "Compra";
  }
  if (action === "sell") {
    return "Venta";
  }
  if (action === "position") {
    return "Posicion";
  }
  return "Accion no especificada";
}

function activityTypeLabel(activity: PublicWalletActivity): string {
  if (activity.activityType === "trade") {
    return "Operacion";
  }
  if (activity.activityType === "notable_wallet") {
    return "Billetera notable";
  }
  if (activity.activityType === "position" || activity.action === "position") {
    return "Posicion";
  }
  return actionLabel(activity.action);
}

function biasLabel(summary?: WalletIntelligenceSummary | null): string {
  if (!summary || summary.relevantWalletsCount <= 0) {
    return "unknown";
  }
  if (summary.signalDirection === "YES" || summary.signalDirection === "NO") {
    return summary.signalDirection;
  }
  if (summary.signalDirection === "NEUTRAL" || summary.signalDirection === "BOTH") {
    return "neutral";
  }
  return "unknown";
}

function sourceLabel(summary?: WalletIntelligenceSummary | null): string {
  if (!summary?.source) {
    return "Fuente publica no especificada";
  }
  if (summary.source === "polymarket_data") {
    return "Polymarket Data API";
  }
  if (summary.source === "backend") {
    return "PolySignal backend";
  }
  if (summary.source === "local") {
    return "Datos locales";
  }
  return "Fuente no disponible";
}

function statusCopy(summary?: WalletIntelligenceSummary | null): string {
  if (!summary) {
    return "Fuente no disponible";
  }
  if (summary.queryStatus === "timeout") {
    return "No respondio a tiempo";
  }
  if (summary.queryStatus === "error" || summary.queryStatus === "unavailable") {
    return "Fuente no disponible";
  }
  if (summary.available && summary.relevantWalletsCount > 0) {
    return "Actividad encontrada";
  }
  return "Sin actividad relevante";
}

function searchText(activity: PublicWalletActivity): string {
  return [
    activity.walletAddress,
    activity.shortAddress,
    activity.tokenId,
    activity.transactionHash,
    activity.conditionId,
    activity.marketId,
    activity.outcome,
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchesFilter(activity: PublicWalletActivity, filter: WalletDetailsFilter, threshold: number): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "yes") {
    return activity.side === "YES";
  }
  if (filter === "no") {
    return activity.side === "NO";
  }
  if (filter === "position") {
    return activity.activityType === "position" || (activity.action === "position" && activity.activityType !== "notable_wallet");
  }
  if (filter === "buy" || filter === "sell") {
    return activity.action === filter;
  }
  if (filter === "trade") {
    return (
      (activity.activityType === "trade" || activity.action === "buy" || activity.action === "sell") &&
      typeof activity.amountUsd === "number" &&
      activity.amountUsd >= threshold
    );
  }
  if (filter === "notable_wallet") {
    return activity.activityType === "notable_wallet";
  }
  if (filter === "over_threshold") {
    return typeof activity.amountUsd === "number" && activity.amountUsd >= threshold;
  }
  if (filter === "pnl") {
    return typeof activity.realizedPnl === "number" || typeof activity.unrealizedPnl === "number";
  }
  return (
    typeof activity.winRate === "number" ||
    typeof activity.closedMarkets === "number" ||
    typeof activity.wins === "number" ||
    typeof activity.losses === "number"
  );
}

function sortActivities(activities: PublicWalletActivity[], sort: WalletDetailsSort): PublicWalletActivity[] {
  return [...activities].sort((left, right) => {
    if (sort === "recent") {
      return new Date(right.timestamp ?? 0).getTime() - new Date(left.timestamp ?? 0).getTime();
    }
    return (right.amountUsd ?? 0) - (left.amountUsd ?? 0);
  });
}

function detailValue(value?: string | number | boolean | null): string {
  if (value === null || value === undefined || value === "") {
    return "No disponible";
  }
  return String(value);
}

function activityFromPosition(
  position: WalletMarketPosition,
  index: number,
  activityType: PublicWalletActivity["activityType"],
): PublicWalletActivity {
  return {
    action: activityType === "trade" ? "unknown" : "position",
    activityType,
    amountUsd: position.amountUsd ?? null,
    conditionId: position.marketId ?? null,
    id: `${activityType}-${index}-${position.shortAddress || position.walletAddress || "wallet"}-${position.amountUsd ?? "na"}`,
    limitations: [
      activityType === "notable_wallet"
        ? "La fuente reporto esta billetera como relevante, pero puede no entregar operaciones individuales."
        : "La fuente entrego una posicion estructurada; algunos campos pueden no estar disponibles.",
    ],
    marketId: position.marketId ?? null,
    outcome: position.side === "YES" || position.side === "NO" ? position.side : null,
    positionSize: null,
    price: position.averageEntryPrice ?? null,
    shortAddress: position.shortAddress || null,
    side: position.side === "YES" || position.side === "NO" ? position.side : "UNKNOWN",
    source: "polymarket_data_api",
    timestamp: position.lastActivityAt ?? null,
    unrealizedPnl: position.unrealizedPnlUsd ?? null,
    walletAddress: position.walletAddress || position.shortAddress || null,
    warnings: ["Actividad publica observada; no es una decision ni una recomendacion."],
  };
}

function mergeActivities(summary?: WalletIntelligenceSummary | null): PublicWalletActivity[] {
  if (!summary) {
    return [];
  }
  const items: PublicWalletActivity[] = [...(summary.publicActivities ?? [])];
  const seen = new Set(items.map((item) => item.id));
  const append = (activity: PublicWalletActivity) => {
    if (seen.has(activity.id)) {
      return;
    }
    seen.add(activity.id);
    items.push(activity);
  };
  (summary.largeTrades ?? []).forEach((position, index) => append(activityFromPosition(position, index, "trade")));
  (summary.largePositions ?? []).forEach((position, index) => append(activityFromPosition(position, index, "position")));
  (summary.notableWallets ?? []).forEach((position, index) => append(activityFromPosition(position, index, "notable_wallet")));
  return items;
}

export function WalletIntelligenceDetails({
  onClose,
  onRetry,
  open,
  summary,
}: WalletIntelligenceDetailsProps) {
  const [filter, setFilter] = useState<WalletDetailsFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WalletDetailsSort>("amount");
  const activities = useMemo(() => mergeActivities(summary), [summary]);
  const threshold = summary?.thresholdUsd ?? 100;
  const overThresholdTradeCount = activities.filter(
    (activity) =>
      (activity.activityType === "trade" || activity.action === "buy" || activity.action === "sell") &&
      typeof activity.amountUsd === "number" &&
      activity.amountUsd >= threshold,
  ).length;
  const positionCount = activities.filter(
    (activity) => activity.activityType === "position" || activity.action === "position",
  ).length;
  const notableCount =
    activities.filter((activity) => activity.activityType === "notable_wallet").length ||
    (summary?.notableWallets ?? []).length;
  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortActivities(
      activities.filter((activity) => {
        if (!matchesFilter(activity, filter, threshold)) {
          return false;
        }
        return !normalizedQuery || searchText(activity).includes(normalizedQuery);
      }),
      sort,
    );
  }, [activities, filter, query, sort, threshold]);
  const hasBelowThreshold = activities.some(
    (activity) => typeof activity.amountUsd === "number" && activity.amountUsd < threshold,
  );

  if (!open) {
    return null;
  }

  return (
    <div className="wallet-details-backdrop" role="presentation">
      <section aria-modal="true" className="wallet-details-drawer" role="dialog">
        <div className="wallet-details-header">
          <div>
            <p className="eyebrow">Wallet Intelligence</p>
            <h2>Billeteras analizadas</h2>
            <p>Actividad publica disponible para este mercado.</p>
          </div>
          <button aria-label="Cerrar detalle de billeteras" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <div className="wallet-details-badges">
          <span className="badge external-hint">Operaciones &gt; ${threshold}</span>
          <span className={summary?.available ? "badge external-hint" : "badge muted"}>{statusCopy(summary)}</span>
          {hasBelowThreshold ? <span className="badge muted">Hay actividad bajo umbral disponible</span> : null}
        </div>

        <div className="wallet-details-summary">
          <div>
            <span>Billeteras relevantes</span>
            <strong>{summary?.relevantWalletsCount ?? 0}</strong>
          </div>
          <div>
            <span>Operaciones &gt; ${threshold}</span>
            <strong>{overThresholdTradeCount}</strong>
          </div>
          <div>
            <span>Posiciones relevantes</span>
            <strong>{positionCount}</strong>
          </div>
          <div>
            <span>Billeteras notables</span>
            <strong>{notableCount}</strong>
          </div>
          <div>
            <span>Capital observado</span>
            <strong>{formatUsd(summary?.analyzedCapitalUsd)}</strong>
          </div>
          <div>
            <span>Capital YES</span>
            <strong>{formatUsd(summary?.yesCapitalUsd)}</strong>
          </div>
          <div>
            <span>Capital NO</span>
            <strong>{formatUsd(summary?.noCapitalUsd)}</strong>
          </div>
          <div>
            <span>Capital outcome/neutral</span>
            <strong>{formatUsd(summary?.neutralCapitalUsd)}</strong>
          </div>
          <div>
            <span>Sesgo agregado</span>
            <strong>{biasLabel(summary)}</strong>
          </div>
          <div>
            <span>Ultima actualizacion</span>
            <strong>{formatDateTime(summary?.checkedAt)}</strong>
          </div>
          <div>
            <span>Fuente</span>
            <strong>{sourceLabel(summary)}</strong>
          </div>
        </div>

        <div className="wallet-details-controls">
          {[
            ["all", "Todas"],
            ["trade", "Operaciones > $100"],
            ["position", "Posiciones"],
            ["notable_wallet", "Billeteras notables"],
            ["yes", "YES"],
            ["no", "NO"],
            ["buy", "Compras"],
            ["sell", "Ventas"],
            ["over_threshold", "> $100"],
            ["pnl", "Con PnL"],
            ["history", "Con historial"],
          ].map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value as WalletDetailsFilter)}
              type="button"
            >
              {label}
            </button>
          ))}
          {hasBelowThreshold ? (
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">
              Mostrar todas
            </button>
          ) : null}
        </div>

        <div className="wallet-details-search">
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar wallet, tokenId o transaction hash"
            type="search"
            value={query}
          />
          <select onChange={(event) => setSort(event.target.value as WalletDetailsSort)} value={sort}>
            <option value="amount">Monto USD descendente</option>
            <option value="recent">Mas reciente</option>
            <option value="capital">Capital observado</option>
          </select>
        </div>

        {summary?.queryStatus === "timeout" ? (
          <div className="wallet-details-empty">
            <strong>La consulta de billeteras tardo demasiado.</strong>
            <p>Puedes reintentar el analisis para consultar la fuente otra vez.</p>
            {onRetry ? <button onClick={onRetry} type="button">Reintentar billeteras</button> : null}
          </div>
        ) : filteredActivities.length > 0 ? (
          <div className="wallet-details-list" role="list">
            {filteredActivities.map((activity) => (
              <article className="wallet-details-card" key={activity.id} role="listitem">
                <div className="wallet-details-card-heading">
                  <div>
                    <span>{activity.shortAddress || "wallet publica"}</span>
                    <strong>{activity.walletAddress || "Wallet no disponible"}</strong>
                  </div>
                  <span className={`wallet-side-pill ${activity.side.toLowerCase()}`}>{activity.side}</span>
                </div>
                <div className="wallet-details-grid">
                  <div><span>Tipo</span><strong>{activityTypeLabel(activity)}</strong></div>
                  <div><span>Accion</span><strong>{actionLabel(activity.action)}</strong></div>
                  <div><span>Outcome</span><strong>{activity.outcome || activity.side || "unknown"}</strong></div>
                  <div><span>Monto USD</span><strong>{formatUsd(activity.amountUsd)}</strong></div>
                  <div><span>Precio</span><strong>{formatNumber(activity.price)}</strong></div>
                  <div><span>Shares/contratos</span><strong>{formatNumber(activity.shares)}</strong></div>
                  <div><span>Posicion actual</span><strong>{formatNumber(activity.positionSize)}</strong></div>
                  <div><span>TokenId</span><strong>{activity.tokenId || "No disponible"}</strong></div>
                  <div><span>ConditionId</span><strong>{activity.conditionId || "No disponible"}</strong></div>
                  <div><span>MarketId</span><strong>{activity.marketId || "No disponible"}</strong></div>
                  <div><span>Transaction hash</span><strong>{activity.transactionHash || "No disponible"}</strong></div>
                  <div><span>Fecha</span><strong>{formatDateTime(activity.timestamp)}</strong></div>
                  <div><span>Realized PnL</span><strong>{formatUsd(activity.realizedPnl)}</strong></div>
                  <div><span>Unrealized PnL</span><strong>{formatUsd(activity.unrealizedPnl)}</strong></div>
                  <div><span>Win rate</span><strong>{formatPercent(activity.winRate)}</strong></div>
                  <div><span>Mercados cerrados</span><strong>{formatNumber(activity.closedMarkets)}</strong></div>
                  <div><span>Wins/Losses</span><strong>{activity.wins ?? "No disponible"} / {activity.losses ?? "No disponible"}</strong></div>
                  <div><span>Fuente</span><strong>{activity.source || "Fuente publica no especificada"}</strong></div>
                </div>
                {(activity.warnings.length > 0 || activity.limitations.length > 0) ? (
                  <div className="wallet-details-notes">
                    {[...activity.warnings, ...activity.limitations].slice(0, 6).map((note) => (
                      <span className="warning-chip" key={note}>{note}</span>
                    ))}
                  </div>
                ) : null}
                {activity.rawSourceFields ? (
                  <details className="wallet-technical-details">
                    <summary>Datos tecnicos</summary>
                    <dl>
                      {Object.entries(activity.rawSourceFields).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{detailValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="wallet-details-empty">
            <strong>
              {summary?.queryStatus === "unavailable" || summary?.queryStatus === "error"
                ? "Wallet Intelligence no esta disponible para este mercado en este momento."
                : summary && summary.relevantWalletsCount > 0
                  ? "Hay billeteras relevantes reportadas por la fuente, pero no se entregaron operaciones individuales mayores a $100 para este filtro."
                  : "No encontramos operaciones publicas mayores a $100 para este mercado."}
            </strong>
            <p>
              {summary && summary.relevantWalletsCount > 0
                ? `La fuente reporto ${summary.relevantWalletsCount} billetera(s) relevante(s). Revisa Todas, Posiciones o Billeteras notables para ver cualquier dato parcial disponible.`
                : "Esto no significa que no existan operaciones; puede que la fuente no tenga datos suficientes o que esten fuera del limite consultado."}
            </p>
          </div>
        )}

        <p className="wallet-details-disclaimer">
          Esta vista muestra actividad publica cuando la fuente la entrega. No identifica personas reales,
          no inventa PnL ni win rate, y no convierte billeteras en una recomendacion.
        </p>
      </section>
    </div>
  );
}
