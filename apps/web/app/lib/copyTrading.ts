import { fetchApiJson } from "./api";
import type {
  CopyTradingDashboardData,
  CopyTradingStatus,
  CopyTradingTickSummary,
  CopyTradingWatcherStatus,
  CopyWallet,
  CopyWalletCreateInput,
  CopyWalletUpdateInput,
  CopyBotEvent,
  CopyDetectedTrade,
  CopyOrder,
  CopyTradeFreshnessStatus,
} from "./copyTradingTypes";

type WalletsResponse = { wallets: CopyWallet[] };
type TradesResponse = { trades: CopyDetectedTrade[] };
type OrdersResponse = { orders: CopyOrder[] };
type EventsResponse = { events: CopyBotEvent[] };

export async function getCopyTradingDashboardData(): Promise<CopyTradingDashboardData> {
  const [status, watcher, wallets, trades, orders, events] = await Promise.all([
    fetchApiJson<CopyTradingStatus>("/copy-trading/status"),
    fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/status"),
    fetchApiJson<WalletsResponse>("/copy-trading/wallets"),
    fetchApiJson<TradesResponse>("/copy-trading/trades?limit=20"),
    fetchApiJson<OrdersResponse>("/copy-trading/orders?limit=20"),
    fetchApiJson<EventsResponse>("/copy-trading/events?limit=20"),
  ]);
  return {
    status,
    watcher,
    wallets: wallets.wallets,
    trades: trades.trades,
    orders: orders.orders,
    events: events.events,
  };
}

export async function createCopyWallet(input: CopyWalletCreateInput): Promise<CopyWallet> {
  return fetchApiJson<CopyWallet>("/copy-trading/wallets", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function updateCopyWallet(
  walletId: string,
  input: CopyWalletUpdateInput,
): Promise<CopyWallet> {
  return fetchApiJson<CopyWallet>(`/copy-trading/wallets/${encodeURIComponent(walletId)}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function deleteCopyWallet(walletId: string): Promise<void> {
  await fetchApiJson<null>(`/copy-trading/wallets/${encodeURIComponent(walletId)}`, {
    method: "DELETE",
  });
}

export async function scanCopyWallet(walletId: string): Promise<CopyTradingTickSummary> {
  return fetchApiJson<CopyTradingTickSummary>(
    `/copy-trading/wallets/${encodeURIComponent(walletId)}/scan`,
    { method: "POST" },
  );
}

export async function runCopyTradingDemoTick(): Promise<CopyTradingTickSummary> {
  return fetchApiJson<CopyTradingTickSummary>("/copy-trading/demo/tick", {
    method: "POST",
  });
}

export async function startCopyTradingWatcher(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/start", {
    method: "POST",
  });
}

export async function stopCopyTradingWatcher(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/stop", {
    method: "POST",
  });
}

export async function runCopyTradingWatcherOnce(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/run-once", {
    method: "POST",
  });
}

export function formatWalletAddress(wallet: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return wallet;
  }
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function formatUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(parsed);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function formatTradeAge(ageSeconds: number | null | undefined): string {
  if (ageSeconds === null || ageSeconds === undefined || ageSeconds < 0) {
    return "Sin hora confiable";
  }
  if (ageSeconds < 60) {
    return `Hace ${ageSeconds}s`;
  }
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) {
    return `Hace ${ageMinutes}m`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `Hace ${ageHours}h`;
  }
  const ageDays = Math.floor(ageHours / 24);
  return `Hace ${ageDays}d`;
}

export function formatCopyWindow(copyWindowSeconds: number | null | undefined): string {
  if (copyWindowSeconds === null || copyWindowSeconds === undefined) {
    return "Ventana no configurada";
  }
  if (copyWindowSeconds < 60) {
    return `Ventana ${copyWindowSeconds}s`;
  }
  const minutes = copyWindowSeconds / 60;
  if (Number.isInteger(minutes)) {
    return `Ventana ${minutes}min`;
  }
  return `Ventana ${minutes.toFixed(1)}min`;
}

export function formatFreshnessLabel(
  status: CopyTradeFreshnessStatus | null | undefined,
  fallbackLabel?: string | null,
): string {
  const labels: Record<CopyTradeFreshnessStatus, string> = {
    historical: "Historico",
    live_candidate: "Copiable ahora",
    recent_outside_window: "Fuera de ventana",
    unknown_time: "Sin hora confiable",
  };
  if (status && labels[status]) {
    return labels[status];
  }
  return fallbackLabel || "Sin clasificar";
}

export function freshnessBadgeClass(status: CopyTradeFreshnessStatus | null | undefined): string {
  switch (status) {
    case "live_candidate":
      return "success";
    case "recent_outside_window":
      return "locked";
    case "historical":
      return "historical";
    default:
      return "skipped";
  }
}

export function formatDurationMs(value: number | null | undefined): string {
  if (value === null || value === undefined || value < 0) {
    return "-";
  }
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}
