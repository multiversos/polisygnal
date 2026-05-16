"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  deleteCopyWallet,
  formatCopyWindow,
  formatDateTime,
  formatFreshnessLabel,
  formatPercent,
  formatPnl,
  formatTradeAge,
  formatUsd,
  formatWalletAddress,
  freshnessBadgeClass,
  scanCopyWallet,
  updateCopyWallet,
} from "../../lib/copyTrading";
import type {
  CopyDemoPosition,
  CopyDetectedTrade,
  CopyTradingDemoPnlSummary,
  CopyTradingTickSummary,
  CopyTradeSide,
  CopyWallet,
} from "../../lib/copyTradingTypes";
import { AddCopyWalletForm } from "./AddCopyWalletForm";
import { EditCopyWalletForm } from "./EditCopyWalletForm";

type CopyWalletsTableProps = {
  closedPositions: CopyDemoPosition[];
  onChanged: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  onScanAll: () => Promise<void> | void;
  openPositions: CopyDemoPosition[];
  scanAllBusy: boolean;
  summary: CopyTradingDemoPnlSummary | null;
  trades: CopyDetectedTrade[];
  wallets: CopyWallet[];
  watcherIntervalSeconds: number;
};

type RowAction = "delete" | "pause" | "scan" | null;
type WalletStatusFilter = "all" | "active" | "paused";
type WalletModeFilter = "all" | "demo" | "real-blocked";
type WalletFreshnessFilter = "all" | "live_candidate" | "recent_outside_window" | "historical";
type WalletSortKey = "last-trade" | "pnl-demo" | "copied" | "alias";

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];
const COPY_WINDOW_OPTIONS = [10, 30, 60, 120, 300];

export function CopyWalletsTable({
  closedPositions,
  onChanged,
  onNotice,
  onScanAll,
  openPositions,
  scanAllBusy,
  summary,
  trades,
  wallets,
  watcherIntervalSeconds,
}: CopyWalletsTableProps) {
  const [pendingActionByWallet, setPendingActionByWallet] = useState<Record<string, RowAction>>({});
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WalletStatusFilter>("all");
  const [modeFilter, setModeFilter] = useState<WalletModeFilter>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<WalletFreshnessFilter>("all");
  const [sortBy, setSortBy] = useState<WalletSortKey>("last-trade");
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);

  const positionsByWallet = useMemo(() => {
    const grouped = new Map<string, CopyDemoPosition[]>();
    for (const position of [...openPositions, ...closedPositions]) {
      const current = grouped.get(position.wallet_id) ?? [];
      current.push(position);
      grouped.set(position.wallet_id, current);
    }
    for (const values of grouped.values()) {
      values.sort((left, right) => {
        return activityTimestamp(right).localeCompare(activityTimestamp(left));
      });
    }
    return grouped;
  }, [closedPositions, openPositions]);

  const tradesByWallet = useMemo(() => {
    const grouped = new Map<string, CopyDetectedTrade[]>();
    for (const trade of trades) {
      const current = grouped.get(trade.wallet_id) ?? [];
      current.push(trade);
      grouped.set(trade.wallet_id, current);
    }
    for (const values of grouped.values()) {
      values.sort((left, right) => {
        return tradeTimestamp(right).localeCompare(tradeTimestamp(left));
      });
    }
    return grouped;
  }, [trades]);

  const walletRows = useMemo(() => {
    return wallets.map((wallet) => {
      const walletPositions = positionsByWallet.get(wallet.id) ?? [];
      const walletTrades = tradesByWallet.get(wallet.id) ?? [];
      const analytics = buildWalletAnalytics(walletPositions);
      const latestTrade = walletTrades[0] ?? null;
      const latestTradeAt = latestTrade?.source_timestamp ?? wallet.last_trade_at;
      const latestActivityAt = walletPositions[0]?.updated_at ?? wallet.last_demo_copy_at ?? latestTradeAt;
      return {
        wallet,
        analytics,
        latestActivityAt,
        latestTrade,
        latestTradeAt,
        positions: walletPositions,
      };
    });
  }, [positionsByWallet, tradesByWallet, wallets]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = walletRows.filter((row) => {
      const alias = (row.wallet.label || "").toLowerCase();
      const address = row.wallet.proxy_wallet.toLowerCase();
      const searchMatches = !query || alias.includes(query) || address.includes(query);
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "active" && row.wallet.enabled) ||
        (statusFilter === "paused" && !row.wallet.enabled);
      const modeMatches =
        modeFilter === "all" ||
        (modeFilter === "demo" && row.wallet.mode === "demo") ||
        (modeFilter === "real-blocked" && !row.wallet.real_trading_enabled);
      const freshnessMatches =
        freshnessFilter === "all" ||
        row.wallet.last_trade_freshness_status === freshnessFilter;
      return searchMatches && statusMatches && modeMatches && freshnessMatches;
    });

    rows.sort((left, right) => compareRows(left, right, sortBy));
    return rows;
  }, [freshnessFilter, modeFilter, search, sortBy, statusFilter, walletRows]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredRows.length, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [freshnessFilter, modeFilter, pageSize, search, sortBy, statusFilter]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedWalletId(null);
      return;
    }
    const currentSelectionStillVisible = filteredRows.some((row) => row.wallet.id === selectedWalletId);
    if (!currentSelectionStillVisible) {
      setSelectedWalletId(filteredRows[0].wallet.id);
    }
  }, [filteredRows, selectedWalletId]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageStartIndex = filteredRows.length === 0 ? 0 : (page - 1) * pageSize;
  const paginatedRows = filteredRows.slice(pageStartIndex, pageStartIndex + pageSize);
  const selectedRow = filteredRows.find((row) => row.wallet.id === selectedWalletId) ?? null;
  const latestTradeAcrossWallets = walletRows.reduce<string | null>((latest, row) => {
    const candidate = row.latestTradeAt;
    if (!candidate) {
      return latest;
    }
    if (!latest || candidate > latest) {
      return candidate;
    }
    return latest;
  }, null);

  const walletsFollowed = wallets.length;
  const activeWallets = wallets.filter((wallet) => wallet.enabled).length;
  const openCopies = summary?.open_positions_count ?? openPositions.length;
  const editingWallet = editingWalletId ? wallets.find((wallet) => wallet.id === editingWalletId) ?? null : null;

  async function handlePause(wallet: CopyWallet) {
    setPendingAction(wallet.id, "pause", setPendingActionByWallet);
    try {
      await updateCopyWallet(wallet.id, { enabled: !wallet.enabled });
      onNotice?.(wallet.enabled ? "Wallet pausada." : "Wallet reactivada.");
      await onChanged();
    } catch {
      onNotice?.("No pudimos actualizar esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id, setPendingActionByWallet);
    }
  }

  async function handleDelete(wallet: CopyWallet) {
    if (!window.confirm(`Eliminar ${wallet.label || formatWalletAddress(wallet.proxy_wallet)} de Wallets seguidas?`)) {
      return;
    }
    setPendingAction(wallet.id, "delete", setPendingActionByWallet);
    try {
      await deleteCopyWallet(wallet.id);
      onNotice?.("Wallet eliminada.");
      await onChanged();
    } catch {
      onNotice?.("No pudimos eliminar esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id, setPendingActionByWallet);
    }
  }

  async function handleScan(wallet: CopyWallet) {
    setPendingAction(wallet.id, "scan", setPendingActionByWallet);
    try {
      const summaryResult = await scanCopyWallet(wallet.id);
      onNotice?.(getWalletScanMessage(summaryResult));
      await onChanged();
    } catch {
      onNotice?.("No pudimos escanear esta wallet ahora.");
    } finally {
      clearPendingAction(wallet.id, setPendingActionByWallet);
    }
  }

  async function handleCopyAddress(wallet: CopyWallet) {
    try {
      await navigator.clipboard.writeText(wallet.proxy_wallet);
      onNotice?.("Direccion copiada.");
    } catch {
      onNotice?.("No pudimos copiar la direccion ahora.");
    }
  }

  return (
    <>
      <section className="copy-wallets-shell">
        <header className="copy-wallets-header copy-panel">
          <div className="copy-wallets-header-copy">
            <span className="copy-section-kicker">Copy Trading demo</span>
            <h2>Wallets seguidas</h2>
            <p>
              Monitorea en tiempo real las wallets que sigues. El watcher demo escanea automaticamente cada{" "}
              {watcherIntervalSeconds}s.
            </p>
          </div>
          <div className="copy-action-row" aria-label="Acciones de wallets seguidas">
            <button className="copy-secondary-button" disabled={scanAllBusy} onClick={() => void onScanAll()} type="button">
              {scanAllBusy ? "Escaneando wallets..." : "Escanear wallets"}
            </button>
            <button className="copy-primary-button" onClick={() => setShowAddWallet(true)} type="button">
              Agregar wallet
            </button>
          </div>
        </header>

        <section className="copy-wallets-kpi-grid" aria-label="Metricas rapidas de wallets">
          <MetricCard
            helper={walletsFollowed === 0 ? "Sin seguimiento activo" : `${activeWallets} activas`}
            label="Wallets seguidas"
            value={String(walletsFollowed)}
          />
          <MetricCard
            helper={walletsFollowed === 0 ? "Sin wallets cargadas" : `${walletsFollowed - activeWallets} pausadas`}
            label="Activas"
            value={String(activeWallets)}
          />
          <MetricCard
            helper={openCopies > 0 ? "En ejecucion" : "Sin posiciones abiertas"}
            label="Copias abiertas"
            value={String(openCopies)}
          />
          <MetricCard
            helper={summary?.demo_roi_percent ? `ROI ${formatPercent(summary.demo_roi_percent)}` : "Pendiente"}
            label="PnL total demo"
            tone={pnlTone(summary?.total_demo_pnl_usd ?? null)}
            value={formatPnl(summary?.total_demo_pnl_usd ?? null)}
          />
          <MetricCard
            helper={latestTradeAcrossWallets ? formatTradeAge(ageSecondsFromNow(latestTradeAcrossWallets)) : "Sin actividad"}
            label="Ultimo trade"
            value={formatDateTime(latestTradeAcrossWallets)}
          />
        </section>

        <div className="copy-wallets-master-detail">
          <section className="copy-panel copy-wallets-list-panel">
            <div className="copy-panel-heading">
              <span>Seguimiento</span>
              <strong>Lista compacta</strong>
            </div>
            <p className="copy-field-helper">
              Usa Escanear para revisar una wallet puntual. El panel derecho concentra el detalle largo para evitar scroll
              gigante.
            </p>

            <div className="copy-wallet-toolbar" aria-label="Busqueda y filtros de wallets">
              <label className="copy-field copy-wallet-toolbar-search">
                <span>Buscar</span>
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por alias o wallet"
                  value={search}
                />
              </label>
              <label className="copy-field">
                <span>Estado</span>
                <select
                  className="copy-select"
                  onChange={(event) => setStatusFilter(event.target.value as WalletStatusFilter)}
                  value={statusFilter}
                >
                  <option value="all">Todas</option>
                  <option value="active">Activas</option>
                  <option value="paused">Pausadas</option>
                </select>
              </label>
              <label className="copy-field">
                <span>Modo</span>
                <select
                  className="copy-select"
                  onChange={(event) => setModeFilter(event.target.value as WalletModeFilter)}
                  value={modeFilter}
                >
                  <option value="all">Todos</option>
                  <option value="demo">Demo</option>
                  <option value="real-blocked">Real bloqueado</option>
                </select>
              </label>
              <label className="copy-field">
                <span>Frescura</span>
                <select
                  className="copy-select"
                  onChange={(event) => setFreshnessFilter(event.target.value as WalletFreshnessFilter)}
                  value={freshnessFilter}
                >
                  <option value="all">Todas</option>
                  <option value="live_candidate">Copiable ahora</option>
                  <option value="recent_outside_window">Fuera de ventana</option>
                  <option value="historical">Historico</option>
                </select>
              </label>
              <label className="copy-field">
                <span>Ordenar por</span>
                <select
                  className="copy-select"
                  onChange={(event) => setSortBy(event.target.value as WalletSortKey)}
                  value={sortBy}
                >
                  <option value="last-trade">Ultimo trade</option>
                  <option value="pnl-demo">PnL demo</option>
                  <option value="copied">Copiadas</option>
                  <option value="alias">Alias</option>
                </select>
              </label>
            </div>

            {wallets.length === 0 ? (
              <div className="copy-empty-state">
                Sin wallets. Agrega una direccion publica para iniciar el modo demo.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="copy-empty-state">No encontramos wallets para esos filtros.</div>
            ) : (
              <>
                <div className="copy-wallet-rows" role="list" aria-label="Wallets seguidas">
                  {paginatedRows.map((row) => {
                    const pendingAction = pendingActionByWallet[row.wallet.id] ?? null;
                    const isSelected = row.wallet.id === selectedWalletId;
                    const walletPnlTone = pnlTone(row.analytics.totalPnlUsd);
                    return (
                      <article
                        aria-pressed={isSelected}
                        className={`copy-wallet-row ${isSelected ? "selected" : ""}`}
                        key={row.wallet.id}
                        onClick={() => setSelectedWalletId(row.wallet.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedWalletId(row.wallet.id);
                          }
                        }}
                      >
                        <div className="copy-wallet-row-top">
                          <div className="copy-wallet-identity">
                            <div className="copy-wallet-avatar">{walletInitials(row.wallet)}</div>
                            <div className="copy-wallet-row-copy">
                              <div className="copy-wallet-row-title-line">
                                <strong>{row.wallet.label || "Sin alias"}</strong>
                              </div>
                              <span className="copy-mono">{formatWalletAddress(row.wallet.proxy_wallet)}</span>
                            </div>
                          </div>
                          <div className="copy-wallet-row-trailing">
                            <span className={`copy-wallet-row-pnl ${walletPnlClassName(walletPnlTone)}`}>
                              {formatPnl(row.analytics.totalPnlUsd)}
                            </span>
                            <span className="copy-wallet-row-freshness">
                              {row.wallet.last_trade_freshness_label
                                ? formatFreshnessLabel(
                                    row.wallet.last_trade_freshness_status,
                                    row.wallet.last_trade_freshness_label,
                                  )
                                : "Sin actividad"}
                            </span>
                            <button
                              aria-label="Ver detalle de esta wallet"
                              className="copy-icon-button"
                              disabled={pendingAction !== null}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedWalletId(row.wallet.id);
                              }}
                              title="Ver detalle de esta wallet"
                              type="button"
                            >
                              ...
                            </button>
                          </div>
                        </div>

                        <div className="copy-wallet-row-badges">
                          <span className={`copy-badge ${row.wallet.mode === "demo" ? "success" : "locked"}`}>
                            {row.wallet.mode === "demo" ? "Demo" : "Real"}
                          </span>
                          {!row.wallet.real_trading_enabled ? <span className="copy-badge locked">Real bloqueado</span> : null}
                          <span className={`copy-badge ${row.wallet.enabled ? "success" : "skipped"}`}>
                            {row.wallet.enabled ? "Activa" : "Pausada"}
                          </span>
                        </div>

                        <div className="copy-wallet-row-meta">
                          <div className="copy-wallet-row-meta-item">
                            <strong>Estado actual</strong>
                            {row.wallet.last_trade_freshness_label
                              ? formatFreshnessLabel(
                                  row.wallet.last_trade_freshness_status,
                                  row.wallet.last_trade_freshness_label,
                                )
                              : "Sin actividad"}
                          </div>
                          <div className="copy-wallet-row-meta-item">
                            <strong>Ultimo trade</strong>
                            {formatTradeAge(ageSecondsFromNow(row.latestTradeAt))}
                          </div>
                          <div className="copy-wallet-row-meta-item">
                            <strong>Copiadas</strong>
                            {row.wallet.demo_copied_count}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <footer className="copy-wallet-pagination">
                  <div className="copy-wallet-pagination-meta">
                    <label className="copy-field">
                      <span>Filas</span>
                      <select
                        className="copy-select"
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        value={pageSize}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>
                      Mostrando {pageStartIndex + 1}-{Math.min(pageStartIndex + paginatedRows.length, filteredRows.length)} de{" "}
                      {filteredRows.length} wallets
                    </span>
                  </div>
                  <div className="copy-action-row">
                    <button
                      className="copy-secondary-button"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      type="button"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        aria-pressed={pageNumber === page}
                        className={`copy-pill-button ${pageNumber === page ? "active" : ""}`}
                        key={pageNumber}
                        onClick={() => setPage(pageNumber)}
                        type="button"
                      >
                        {pageNumber}
                      </button>
                    ))}
                    <button
                      className="copy-secondary-button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      type="button"
                    >
                      Siguiente
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>

          <section className="copy-panel copy-wallet-detail-panel">
            {selectedRow ? (
              <WalletDetailPanel
                onCopyAddress={handleCopyAddress}
                onDelete={handleDelete}
                onEdit={() => {
                  setEditingWalletId(selectedRow.wallet.id);
                  onNotice?.("Edita la configuracion de esta wallet y guarda los cambios.");
                }}
                onPause={handlePause}
                onScan={handleScan}
                pendingAction={pendingActionByWallet[selectedRow.wallet.id] ?? null}
                row={selectedRow}
              />
            ) : (
              <div className="copy-empty-state">
                Selecciona una wallet para ver su detalle. Si no tienes ninguna cargada, usa Agregar wallet.
              </div>
            )}
          </section>
        </div>
      </section>

      {showAddWallet ? (
        <div className="copy-overlay" role="dialog" aria-modal="true" aria-label="Agregar wallet">
          <div className="copy-overlay-backdrop" onClick={() => setShowAddWallet(false)} />
          <div className="copy-overlay-card">
            <AddCopyWalletForm
              onCancel={() => setShowAddWallet(false)}
              onCreated={async () => {
                setShowAddWallet(false);
                await onChanged();
              }}
              submitLabel="Agregar wallet"
              wallets={wallets}
            />
          </div>
        </div>
      ) : null}

      {editingWallet ? (
        <div className="copy-overlay" role="dialog" aria-modal="true" aria-label="Editar wallet">
          <div className="copy-overlay-backdrop" onClick={() => setEditingWalletId(null)} />
          <div className="copy-overlay-card">
            <EditCopyWalletForm
              onCancel={() => setEditingWalletId(null)}
              onSaved={async (message) => {
                setEditingWalletId(null);
                onNotice?.(message);
                await onChanged();
              }}
              wallet={editingWallet}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function WalletDetailPanel({
  onCopyAddress,
  onDelete,
  onEdit,
  onPause,
  onScan,
  pendingAction,
  row,
}: {
  onCopyAddress: (wallet: CopyWallet) => Promise<void>;
  onDelete: (wallet: CopyWallet) => Promise<void>;
  onEdit: () => void;
  onPause: (wallet: CopyWallet) => Promise<void>;
  onScan: (wallet: CopyWallet) => Promise<void>;
  pendingAction: RowAction;
  row: WalletRow;
}) {
  const latestTrade = row.latestTrade;
  const latestAction = latestTrade?.side ? latestTrade.side.toUpperCase() : row.wallet.last_demo_copy_action?.toUpperCase() ?? "-";
  const latestAmount = latestTrade?.source_amount_usd ?? row.wallet.last_demo_copy_amount_usd ?? null;
  const latestPrice = latestTrade?.source_price ?? null;
  const recentActivity = buildRecentActivity(row);
  const walletPnl = pnlTone(row.analytics.totalPnlUsd);
  const walletRoi = pnlTone(row.analytics.totalPnlPercent);

  return (
    <div className="copy-wallet-detail">
      <header className="copy-wallet-detail-header">
        <div className="copy-wallet-detail-hero">
          <div className="copy-wallet-avatar large">{walletInitials(row.wallet)}</div>
          <div className="copy-wallet-detail-heading">
            <span className="copy-section-kicker">Wallet seleccionada</span>
            <h3>{row.wallet.label || "Sin alias"}</h3>
            <div className="copy-wallet-detail-meta">
              <span className="copy-mono">{formatWalletAddress(row.wallet.proxy_wallet)}</span>
              <button className="copy-pill-button" onClick={() => void onCopyAddress(row.wallet)} type="button">
                Copiar direccion
              </button>
              {row.wallet.profile_url ? (
                <a
                  className="copy-pill-button copy-wallet-link"
                  href={row.wallet.profile_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Ver perfil
                </a>
              ) : null}
              <a
                className="copy-pill-button copy-wallet-link"
                href={`https://polygonscan.com/address/${row.wallet.proxy_wallet}`}
                rel="noreferrer"
                target="_blank"
              >
                Ver en explorador
              </a>
            </div>
            <div className="copy-status-strip">
              <span className={`copy-badge ${row.wallet.mode === "demo" ? "success" : "locked"}`}>
                {row.wallet.mode === "demo" ? "Demo" : "Real"}
              </span>
              {!row.wallet.real_trading_enabled ? <span className="copy-badge locked">Real bloqueado</span> : null}
              <span className={`copy-badge ${row.wallet.enabled ? "success" : "skipped"}`}>
                {row.wallet.enabled ? "Activa" : "Pausada"}
              </span>
            </div>
          </div>
        </div>
        <div className="copy-action-row copy-wallet-detail-actions">
          <button
            aria-label="Editar configuracion de esta wallet"
            className="copy-secondary-button"
            disabled={pendingAction !== null}
            onClick={onEdit}
            title="Editar configuracion de esta wallet"
            type="button"
          >
            {pendingAction === null ? "Editar" : "Editando..."}
          </button>
          <button
            className="copy-secondary-button"
            disabled={pendingAction !== null}
            onClick={() => void onPause(row.wallet)}
            type="button"
          >
            {pendingAction === "pause"
              ? row.wallet.enabled
                ? "Pausando..."
                : "Reactivando..."
              : row.wallet.enabled
                ? "Pausar"
                : "Reactivar"}
          </button>
          <button
            aria-label="Escanea esta wallet una vez ahora."
            className="copy-action-button"
            disabled={pendingAction !== null}
            onClick={() => void onScan(row.wallet)}
            title="Escanea esta wallet una vez ahora."
            type="button"
          >
            {pendingAction === "scan" ? "Escaneando..." : "Escanear"}
          </button>
          <button className="copy-danger-button" disabled={pendingAction !== null} onClick={() => void onDelete(row.wallet)} type="button">
            {pendingAction === "delete" ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </header>

      <section className="copy-wallet-detail-grid">
        <article className="copy-wallet-detail-card copy-wallet-metrics-card">
          <div className="copy-panel-heading">
            <span>Demo</span>
            <strong>Metricas de seguimiento</strong>
          </div>
          <div className="copy-wallet-stat-grid copy-wallet-stat-grid-metrics">
            <StatPair
              cardClassName={walletPnl}
              label="PnL demo"
              value={formatPnl(row.analytics.totalPnlUsd)}
              valueClassName={walletPnlClassName(walletPnl)}
            />
            <StatPair
              cardClassName={walletRoi}
              label="PnL %"
              value={formatPercent(row.analytics.totalPnlPercent)}
              valueClassName={walletPnlClassName(walletRoi)}
            />
            <StatPair label="Trades copiados" value={String(row.wallet.demo_copied_count)} />
            <StatPair cardClassName="success" label="BUY" value={String(row.wallet.demo_buy_count)} />
            <StatPair cardClassName="negative" label="SELL" value={String(row.wallet.demo_sell_count)} />
            <StatPair cardClassName="warning" label="Saltadas" value={String(row.wallet.demo_skipped_count)} />
            <StatPair label="Win rate" value={formatPercent(row.analytics.winRatePercent)} />
            <StatPair label="Monto operado" value={formatUsd(row.analytics.totalVolumeUsd)} />
          </div>
        </article>

        <article className="copy-wallet-detail-card copy-wallet-config-card">
          <div className="copy-panel-heading">
            <span>Configuracion de copia</span>
            <strong>Modo y ventana</strong>
          </div>
          <div className="copy-wallet-stat-grid">
            <StatPair label="Monto por trade" value={formatUsd(row.wallet.copy_amount_usd)} />
            <StatPair label="Modo" value={row.wallet.mode === "demo" ? "Demo" : "Real"} />
            <StatPair
              label="BUY / SELL"
              value={`${row.wallet.copy_buys ? "BUY" : "-"} / ${row.wallet.copy_sells ? "SELL" : "-"}`}
            />
            <StatPair label="Ventana" value={formatCopyWindow(row.wallet.copy_window_seconds ?? row.wallet.max_delay_seconds)} />
            <StatPair label="Estado" value={row.wallet.enabled ? "Activa" : "Pausada"} />
          </div>
          <div className="copy-wallet-subsection">
            <span className="copy-wallet-subsection-title">Ventana de copia</span>
            <div className="copy-action-row">
              {COPY_WINDOW_OPTIONS.map((seconds) => (
                <span
                  className={`copy-pill-button copy-window-pill ${row.wallet.max_delay_seconds === seconds ? "active" : ""}`}
                  key={seconds}
                >
                  {formatCopyWindowChip(seconds)}
                </span>
              ))}
            </div>
          </div>
        </article>

        <article className="copy-wallet-detail-card copy-wallet-trade-card">
          <div className="copy-panel-heading">
            <span>Ultimo trade</span>
            <strong>Lectura publica</strong>
          </div>
          <div className="copy-wallet-stat-grid">
            <StatPair label="Fecha" value={formatDateTime(row.latestTradeAt)} />
            <StatPair
              label="Ventana"
              value={formatCopyWindow(row.wallet.copy_window_seconds ?? row.wallet.max_delay_seconds).replace(/^Ventana\s+/i, "")}
            />
            <StatPair
              label="Actividad"
              value={`Recientes ${row.wallet.recent_trades} | Historicos ${row.wallet.historical_trades} | Copiables ${row.wallet.live_candidates}`}
            />
            <StatPair label="Tipo" value={latestAction} />
            <StatPair label="Monto" value={formatUsd(latestAmount)} />
            <StatPair label="Precio" value={latestPrice ? Number(latestPrice).toFixed(3) : "-"} />
          </div>
        </article>

        <article className="copy-wallet-detail-card copy-wallet-last-copy-card">
          <div className="copy-panel-heading">
            <span>Ultima copia demo</span>
            <strong>Resumen demo</strong>
          </div>
          <div className="copy-wallet-last-copy-highlight">
            <strong>{formatLastDemoCopy(row.wallet)}</strong>
            <span>
              {row.wallet.last_scan_at
                ? `Ultimo escaneo ${formatTradeAge(ageSecondsFromNow(row.wallet.last_scan_at))}`
                : "Pendiente de escaneo"}
            </span>
          </div>
          <div className="copy-wallet-detail-footer">
            <span>Freshness actual</span>
            <strong className={`copy-badge ${freshnessBadgeClass(row.wallet.last_trade_freshness_status)}`}>
              {row.wallet.last_trade_freshness_label
                ? formatFreshnessLabel(row.wallet.last_trade_freshness_status, row.wallet.last_trade_freshness_label)
                : "Sin actividad reciente"}
            </strong>
          </div>
        </article>

        <article className="copy-wallet-detail-card copy-wallet-activity-card">
          <div className="copy-panel-heading">
            <span>Actividad</span>
            <strong>Actividad reciente</strong>
          </div>
          {recentActivity.length === 0 ? (
            <div className="copy-empty-state">
              La actividad aparecera cuando haya suficientes copias demo.
            </div>
          ) : (
            <div className="copy-wallet-activity-list">
              {recentActivity.map((event) => (
                <article className={`copy-wallet-activity-item ${event.tone}`} key={event.id}>
                  <div className="copy-wallet-activity-rail">
                    <span className="copy-wallet-activity-time">{event.ageLabel}</span>
                    <span className={`copy-wallet-activity-dot ${event.tone}`} />
                    <span className="copy-wallet-activity-line" />
                  </div>
                  <div className="copy-wallet-activity-copy">
                    <div className="copy-wallet-activity-heading">
                      <div className="copy-wallet-activity-headline">
                        <strong>{event.title}</strong>
                        <span className="copy-wallet-activity-market">{event.valueLabel}</span>
                      </div>
                      <div className="copy-wallet-activity-tags">
                        {event.side ? <span className={`copy-side ${event.side}`}>{event.side.toUpperCase()}</span> : null}
                        {event.amountLabel ? <span className="copy-badge subtle">{event.amountLabel}</span> : null}
                        {event.windowLabel ? <span className="copy-badge subtle">{event.windowLabel}</span> : null}
                      </div>
                    </div>
                    <small>{event.description}</small>
                  </div>
                  <div className="copy-wallet-activity-numbers">
                    <span className={walletPnlClassName(event.valueTone)}>{event.priceLabel}</span>
                    <small>{event.amountLabel ?? "Sin monto"}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function MetricCard({
  helper,
  label,
  tone = "neutral",
  value,
}: {
  helper: string;
  label: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
  value: string;
}) {
  return (
    <article className={`copy-metric copy-wallet-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function StatPair({
  cardClassName,
  label,
  value,
  valueClassName,
}: {
  cardClassName?: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={`copy-wallet-stat ${cardClassName ?? ""}`.trim()}>
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  );
}

type WalletRow = {
  analytics: WalletAnalytics;
  latestActivityAt: string | null;
  latestTrade: CopyDetectedTrade | null;
  latestTradeAt: string | null;
  positions: CopyDemoPosition[];
  wallet: CopyWallet;
};

type WalletAnalytics = {
  totalPnlPercent: number | null;
  totalPnlUsd: number | null;
  totalVolumeUsd: number | null;
  winRatePercent: number | null;
};

type WalletActivityEvent = {
  ageLabel: string;
  amountLabel: string | null;
  description: string;
  id: string;
  priceLabel: string;
  side: CopyTradeSide | null;
  title: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  valueLabel: string;
  valueTone: "positive" | "negative" | "neutral" | "warning";
  windowLabel: string | null;
};

function buildWalletAnalytics(positions: CopyDemoPosition[]): WalletAnalytics {
  if (positions.length === 0) {
    return {
      totalPnlPercent: null,
      totalPnlUsd: null,
      totalVolumeUsd: null,
      winRatePercent: null,
    };
  }

  let totalPnlUsd = 0;
  let totalVolumeUsd = 0;
  let closedCount = 0;
  let winningClosedCount = 0;

  for (const position of positions) {
    const baseAmount = Number(position.entry_amount_usd);
    if (Number.isFinite(baseAmount)) {
      totalVolumeUsd += baseAmount;
    }

    const pnlSource = position.realized_pnl_usd ?? position.unrealized_pnl_usd;
    const pnlValue = Number(pnlSource);
    if (Number.isFinite(pnlValue)) {
      totalPnlUsd += pnlValue;
      if (position.closed_at) {
        closedCount += 1;
        if (pnlValue > 0) {
          winningClosedCount += 1;
        }
      }
    }
  }

  return {
    totalPnlPercent: totalVolumeUsd > 0 ? (totalPnlUsd / totalVolumeUsd) * 100 : null,
    totalPnlUsd,
    totalVolumeUsd,
    winRatePercent: closedCount > 0 ? (winningClosedCount / closedCount) * 100 : null,
  };
}

function compareRows(left: WalletRow, right: WalletRow, sortBy: WalletSortKey): number {
  if (sortBy === "alias") {
    return normalizeAlias(left.wallet).localeCompare(normalizeAlias(right.wallet));
  }
  if (sortBy === "copied") {
    return right.wallet.demo_copied_count - left.wallet.demo_copied_count || normalizeAlias(left.wallet).localeCompare(normalizeAlias(right.wallet));
  }
  if (sortBy === "pnl-demo") {
    return (
      compareNullableNumber(right.analytics.totalPnlUsd, left.analytics.totalPnlUsd) ||
      compareNullableString(right.latestTradeAt, left.latestTradeAt) ||
      normalizeAlias(left.wallet).localeCompare(normalizeAlias(right.wallet))
    );
  }
  return (
    compareNullableString(right.latestTradeAt, left.latestTradeAt) ||
    compareNullableString(right.latestActivityAt, left.latestActivityAt) ||
    normalizeAlias(left.wallet).localeCompare(normalizeAlias(right.wallet))
  );
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return left - right;
}

function compareNullableString(left: string | null, right: string | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return left.localeCompare(right);
}

function normalizeAlias(wallet: CopyWallet): string {
  return (wallet.label || wallet.proxy_wallet).toLowerCase();
}

function walletInitials(wallet: CopyWallet): string {
  const source = (wallet.label || formatWalletAddress(wallet.proxy_wallet)).trim();
  const chunks = source.split(/\s+/).filter(Boolean);
  if (chunks.length === 0) {
    return "WL";
  }
  return chunks
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

function setPendingAction(
  walletId: string,
  action: RowAction,
  setter: Dispatch<SetStateAction<Record<string, RowAction>>>,
) {
  setter((current) => ({ ...current, [walletId]: action }));
}

function clearPendingAction(
  walletId: string,
  setter: Dispatch<SetStateAction<Record<string, RowAction>>>,
) {
  setter((current) => {
    const next = { ...current };
    delete next[walletId];
    return next;
  });
}

function pnlTone(value: string | number | null | undefined): "positive" | "negative" | "neutral" | "warning" {
  if (value === null || value === undefined || value === "") {
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

function walletPnlClassName(tone: "positive" | "negative" | "neutral" | "warning"): string {
  if (tone === "positive") {
    return "copy-pnl-positive";
  }
  if (tone === "negative") {
    return "copy-pnl-negative";
  }
  return "copy-pnl-neutral";
}

function formatCopyWindowChip(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${seconds / 60}m`;
}

function formatLastDemoCopy(wallet: CopyWallet): string {
  if (!wallet.last_demo_copy_at) {
    return "Sin copias demo todavia";
  }
  const action = wallet.last_demo_copy_action ? wallet.last_demo_copy_action.toUpperCase() : "DEMO";
  const amount = wallet.last_demo_copy_amount_usd ? formatUsd(wallet.last_demo_copy_amount_usd) : "-";
  const age = formatTradeAge(ageSecondsFromNow(wallet.last_demo_copy_at));
  return `${action} | ${amount} | ${age}`;
}

function ageSecondsFromNow(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
}

function tradeTimestamp(trade: CopyDetectedTrade): string {
  return trade.source_timestamp ?? trade.detected_at;
}

function activityTimestamp(position: CopyDemoPosition): string {
  return position.closed_at ?? position.updated_at ?? position.opened_at;
}

function buildRecentActivity(row: WalletRow): WalletActivityEvent[] {
  const events: Array<WalletActivityEvent & { timestamp: string | null }> = [];

  if (row.latestTrade) {
    events.push({
      ageLabel: formatTradeAge(ageSecondsFromNow(tradeTimestamp(row.latestTrade))),
      amountLabel: formatUsd(row.latestTrade.source_amount_usd),
      description: row.latestTrade.market_title || row.latestTrade.market_slug || "Nueva senal detectada en la wallet publica.",
      id: `trade-${row.latestTrade.id}`,
      priceLabel: row.latestTrade.source_price ? `Precio ${Number(row.latestTrade.source_price).toFixed(3)}` : "Precio pendiente",
      side: row.latestTrade.side,
      timestamp: tradeTimestamp(row.latestTrade),
      title: "Trade detectado",
      tone: row.latestTrade.is_live_candidate ? "positive" : row.latestTrade.freshness_status === "historical" ? "warning" : "neutral",
      valueLabel: row.latestTrade.outcome || "Mercado publico",
      valueTone: "neutral",
      windowLabel: row.latestTrade.copy_window_seconds ? formatCopyWindowChip(row.latestTrade.copy_window_seconds) : null,
    });
  }

  for (const position of row.positions.slice(0, 6)) {
    const pnlValue = position.realized_pnl_usd ?? position.unrealized_pnl_usd ?? null;
    const positionTone = pnlTone(pnlValue);
    events.push({
      ageLabel: formatTradeAge(ageSecondsFromNow(activityTimestamp(position))),
      amountLabel: formatUsd(position.entry_amount_usd),
      description: position.market_title || position.market_slug || "Copia demo ejecutada correctamente.",
      id: `position-${position.id}`,
      priceLabel: position.entry_price ? `Precio ${Number(position.entry_price).toFixed(3)}` : "Precio pendiente",
      side: position.entry_action,
      timestamp: activityTimestamp(position),
      title: position.status === "closed" ? "Copia cerrada" : position.status === "price_pending" ? "Precio pendiente" : "Copia ejecutada",
      tone: position.status === "price_pending" ? "warning" : positionTone,
      valueLabel: formatPnl(pnlValue),
      valueTone: positionTone,
      windowLabel: row.wallet.max_delay_seconds ? formatCopyWindowChip(row.wallet.max_delay_seconds) : null,
    });
  }

  return events
    .sort((left, right) => compareNullableString(right.timestamp, left.timestamp))
    .slice(0, 6)
    .map(({ timestamp: _timestamp, ...event }) => event);
}

function getWalletScanMessage(summary: CopyTradingTickSummary): string {
  if (summary.errors.length > 0) {
    return "No pudimos escanear esta wallet ahora.";
  }
  if (summary.orders_simulated > 0) {
    return `Escaneo completado. Se generaron ${summary.orders_simulated} orden${summary.orders_simulated === 1 ? "" : "es"} demo.`;
  }
  if (summary.historical_trades > 0) {
    return `Escaneo completado. Se detectaron ${summary.historical_trades} trades historicos para esta wallet.`;
  }
  if (summary.recent_outside_window > 0) {
    return `Escaneo completado. Se detectaron ${summary.recent_outside_window} trades fuera de ventana para esta wallet.`;
  }
  if (summary.new_trades === 0) {
    return "Escaneo completado. No se detectaron trades nuevos para esta wallet.";
  }
  return `Escaneo completado. Se detectaron ${summary.new_trades} trades nuevos para esta wallet.`;
}
