"use client";

import { useMemo, useState } from "react";

import type {
  PublicWalletActivity,
  PublicWalletActivityAction,
  WalletIntelligenceSummary,
  WalletMarketPosition,
} from "../lib/walletIntelligenceTypes";
import {
  buildPolymarketWalletProfileUrl,
  isPolymarketWalletAddress,
} from "../lib/polymarketWalletProfile";

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
  | "yes"
  | `outcome:${string}`;

type WalletDetailsSort = "amount" | "pnl" | "position" | "recent" | "win_rate";

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

function formatWalletDisplay(activity: PublicWalletActivity): string {
  if (activity.walletAddress) {
    return activity.walletAddress;
  }
  return activity.shortAddress || "Wallet no disponible";
}

function getFullWalletAddress(activity: PublicWalletActivity): string | null {
  return isPolymarketWalletAddress(activity.walletAddress) ? activity.walletAddress!.trim() : null;
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

function activityTypeBadge(activity: PublicWalletActivity): string {
  if (activity.activityType === "trade") {
    return "Trade";
  }
  if (activity.activityType === "notable_wallet") {
    return "Notable wallet";
  }
  if (activity.activityType === "position" || activity.action === "position") {
    return "Position";
  }
  return "Actividad";
}

function sideOrOutcomeLabel(activity: PublicWalletActivity): string {
  return activity.outcome || (activity.side === "UNKNOWN" ? "unknown" : activity.side);
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
  if (filter.startsWith("outcome:")) {
    const expected = filter.slice("outcome:".length);
    return sideOrOutcomeLabel(activity).toLowerCase() === expected;
  }
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
    if (sort === "pnl") {
      const rightPnl = right.realizedPnl ?? right.unrealizedPnl ?? Number.NEGATIVE_INFINITY;
      const leftPnl = left.realizedPnl ?? left.unrealizedPnl ?? Number.NEGATIVE_INFINITY;
      return rightPnl - leftPnl;
    }
    if (sort === "win_rate") {
      return (right.winRate ?? Number.NEGATIVE_INFINITY) - (left.winRate ?? Number.NEGATIVE_INFINITY);
    }
    if (sort === "position") {
      return (right.positionSize ?? right.shares ?? 0) - (left.positionSize ?? left.shares ?? 0);
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
  return dedupeActivities(items);
}

function activityKey(activity: PublicWalletActivity): string {
  const walletIdentity = activity.shortAddress || activity.walletAddress || "wallet";
  return [
    activity.activityType ?? "unknown",
    walletIdentity,
    sideOrOutcomeLabel(activity),
    activity.amountUsd ?? "na",
    activity.tokenId ?? "token",
    activity.transactionHash ?? "tx",
  ].join(":");
}

function activityCompleteness(activity: PublicWalletActivity): number {
  return [
    isPolymarketWalletAddress(activity.walletAddress),
    activity.rawSourceFields,
    activity.tokenId,
    activity.conditionId,
    activity.transactionHash,
    activity.timestamp,
    typeof activity.realizedPnl === "number" || typeof activity.unrealizedPnl === "number",
    typeof activity.winRate === "number",
  ].filter(Boolean).length;
}

function dedupeActivities(activities: PublicWalletActivity[]): PublicWalletActivity[] {
  const byKey = new Map<string, PublicWalletActivity>();
  for (const activity of activities) {
    const key = activityKey(activity);
    const existing = byKey.get(key);
    if (!existing || activityCompleteness(activity) > activityCompleteness(existing)) {
      byKey.set(key, activity);
    }
  }
  return [...byKey.values()];
}

function hasTechnicalDetails(activity: PublicWalletActivity): boolean {
  return Boolean(
    activity.tokenId ||
      activity.conditionId ||
      activity.marketId ||
      activity.transactionHash ||
      activity.source ||
      activity.warnings.length > 0 ||
      activity.limitations.length > 0 ||
      activity.rawSourceFields,
  );
}

export function WalletIntelligenceDetails({
  onClose,
  onRetry,
  open,
  summary,
}: WalletIntelligenceDetailsProps) {
  const [copiedActivityId, setCopiedActivityId] = useState<string | null>(null);
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
  const pnlCount = activities.filter(
    (activity) => typeof activity.realizedPnl === "number" || typeof activity.unrealizedPnl === "number",
  ).length;
  const historyCount = activities.filter(
    (activity) =>
      typeof activity.winRate === "number" ||
      typeof activity.closedMarkets === "number" ||
      typeof activity.wins === "number" ||
      typeof activity.losses === "number",
  ).length;
  const outcomeFilters = useMemo(
    () =>
      [...new Set(activities.map((activity) => sideOrOutcomeLabel(activity)).filter((label) => label && label !== "unknown"))]
        .filter((label) => label !== "YES" && label !== "NO")
        .slice(0, 6),
    [activities],
  );
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
  const copyWallet = async (activity: PublicWalletActivity) => {
    const wallet = activity.walletAddress;
    if (!wallet) {
      return;
    }
    try {
      await navigator.clipboard.writeText(wallet);
      setCopiedActivityId(activity.id);
      window.setTimeout(() => setCopiedActivityId((current) => (current === activity.id ? null : current)), 1400);
    } catch {
      setCopiedActivityId(null);
    }
  };

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
            <span>Con PnL real</span>
            <strong>{pnlCount > 0 ? pnlCount : "No disponible"}</strong>
          </div>
          <div>
            <span>Con historial</span>
            <strong>{historyCount > 0 ? historyCount : "No disponible"}</strong>
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
          {outcomeFilters.map((outcome) => (
            <button
              className={filter === `outcome:${outcome.toLowerCase()}` ? "active" : ""}
              key={outcome}
              onClick={() => setFilter(`outcome:${outcome.toLowerCase()}`)}
              type="button"
            >
              {outcome}
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
            <option value="pnl">PnL descendente</option>
            <option value="win_rate">Win rate descendente</option>
            <option value="recent">Mas reciente</option>
            <option value="position">Shares/posicion</option>
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
            {filteredActivities.map((activity) => {
              const fullWalletAddress = getFullWalletAddress(activity);
              const profileUrl = buildPolymarketWalletProfileUrl(fullWalletAddress);
              return (
              <article className="wallet-details-card" key={activity.id} role="listitem">
                <div className="wallet-details-card-heading">
                  <div>
                    <span>{activity.shortAddress || "wallet publica"}</span>
                    <strong>{formatWalletDisplay(activity)}</strong>
                  </div>
                  <div className="wallet-card-badges">
                    <span className="wallet-type-pill">{activityTypeBadge(activity)}</span>
                    <span className={`wallet-side-pill ${activity.side.toLowerCase()}`}>{sideOrOutcomeLabel(activity)}</span>
                  </div>
                </div>
                <div className="wallet-card-actions">
                  {profileUrl ? (
                    <a
                      href={profileUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Ver perfil en Polymarket
                    </a>
                  ) : (
                    <span>Perfil Polymarket no disponible</span>
                  )}
                  <button disabled={!fullWalletAddress} onClick={() => copyWallet(activity)} type="button">
                    {copiedActivityId === activity.id
                      ? "Wallet copiada"
                      : fullWalletAddress
                        ? "Copiar wallet"
                        : "Wallet completa no disponible"}
                  </button>
                </div>
                <p className="wallet-verification-copy">
                  {profileUrl
                    ? "Abre el perfil publico de esta wallet para verificar actividad."
                    : fullWalletAddress
                      ? "No se encontro perfil publico directo; puedes verificar manualmente con la direccion completa."
                      : "La fuente no entrego una wallet completa para verificar directamente."}
                </p>
                <div className="wallet-details-key-grid">
                  <div><span>Monto USD</span><strong>{formatUsd(activity.amountUsd)}</strong></div>
                  <div><span>Outcome/posicion</span><strong>{sideOrOutcomeLabel(activity)}</strong></div>
                  <div><span>Accion</span><strong>{actionLabel(activity.action)}</strong></div>
                  <div><span>Precio</span><strong>{formatNumber(activity.price)}</strong></div>
                  <div><span>Shares/contratos</span><strong>{formatNumber(activity.shares)}</strong></div>
                  <div><span>Posicion actual</span><strong>{formatNumber(activity.positionSize)}</strong></div>
                  <div><span>Realized PnL</span><strong>{formatUsd(activity.realizedPnl)}</strong></div>
                  <div><span>Unrealized PnL</span><strong>{formatUsd(activity.unrealizedPnl)}</strong></div>
                  <div><span>Win rate</span><strong>{formatPercent(activity.winRate)}</strong></div>
                  <div><span>Mercados cerrados</span><strong>{formatNumber(activity.closedMarkets)}</strong></div>
                  <div><span>Wins/Losses</span><strong>{activity.wins ?? "No disponible"} / {activity.losses ?? "No disponible"}</strong></div>
                  <div><span>Fecha</span><strong>{formatDateTime(activity.timestamp)}</strong></div>
                </div>
                {hasTechnicalDetails(activity) ? (
                  <details className="wallet-technical-details">
                    <summary>Ver detalles</summary>
                    <dl>
                      <div><dt>tokenId</dt><dd>{detailValue(activity.tokenId)}</dd></div>
                      <div><dt>conditionId</dt><dd>{detailValue(activity.conditionId)}</dd></div>
                      <div><dt>marketId</dt><dd>{detailValue(activity.marketId)}</dd></div>
                      <div><dt>transactionHash</dt><dd>{detailValue(activity.transactionHash)}</dd></div>
                      <div><dt>source</dt><dd>{activity.source || "Fuente publica no especificada"}</dd></div>
                      {[...activity.warnings, ...activity.limitations].slice(0, 8).map((note, index) => (
                        <div key={`note-${index}`}>
                          <dt>{index < activity.warnings.length ? "warning" : "limitation"}</dt>
                          <dd>{note}</dd>
                        </div>
                      ))}
                      {Object.entries(activity.rawSourceFields ?? {}).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{detailValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            );
            })}
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
