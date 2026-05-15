import { fetchApiJson } from "./api";
import type {
  CopyTradingDashboardData,
  CopyTradingStatus,
  CopyTradingTickSummary,
  CopyWallet,
  CopyWalletCreateInput,
  CopyBotEvent,
  CopyDetectedTrade,
  CopyOrder,
} from "./copyTradingTypes";

type WalletsResponse = { wallets: CopyWallet[] };
type TradesResponse = { trades: CopyDetectedTrade[] };
type OrdersResponse = { orders: CopyOrder[] };
type EventsResponse = { events: CopyBotEvent[] };

export async function getCopyTradingDashboardData(): Promise<CopyTradingDashboardData> {
  const [status, wallets, trades, orders, events] = await Promise.all([
    fetchApiJson<CopyTradingStatus>("/copy-trading/status"),
    fetchApiJson<WalletsResponse>("/copy-trading/wallets"),
    fetchApiJson<TradesResponse>("/copy-trading/trades?limit=20"),
    fetchApiJson<OrdersResponse>("/copy-trading/orders?limit=20"),
    fetchApiJson<EventsResponse>("/copy-trading/events?limit=20"),
  ]);
  return {
    status,
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
  input: Partial<Pick<CopyWallet, "enabled" | "copy_buys" | "copy_sells" | "mode">>,
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
