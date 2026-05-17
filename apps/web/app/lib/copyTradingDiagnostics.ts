import { fetchApiJson } from "./api";
import type {
  CopyTradingDemoSettlementResponse,
  CopyTradingTickSummary,
  CopyTradingWatcherStatus,
} from "./copyTradingTypes";

// Manual-only helpers for diagnosis and QA.
// Do not call these automatically from the browser UI.
// The Render background worker owns automatic scanning and demo processing.

export async function diagnosticScanCopyWallet(walletId: string): Promise<CopyTradingTickSummary> {
  return fetchApiJson<CopyTradingTickSummary>(
    `/copy-trading/wallets/${encodeURIComponent(walletId)}/scan`,
    { method: "POST" },
  );
}

export async function diagnosticRunCopyTradingDemoTick(): Promise<CopyTradingTickSummary> {
  return fetchApiJson<CopyTradingTickSummary>("/copy-trading/demo/tick", {
    method: "POST",
  });
}

export async function diagnosticRunCopyTradingDemoSettlementOnce(): Promise<CopyTradingDemoSettlementResponse> {
  return fetchApiJson<CopyTradingDemoSettlementResponse>("/copy-trading/demo/settlement/run-once", {
    method: "POST",
  });
}

export async function diagnosticStartCopyTradingWatcher(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/start", {
    method: "POST",
  });
}

export async function diagnosticStopCopyTradingWatcher(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/stop", {
    method: "POST",
  });
}

export async function diagnosticRunCopyTradingWatcherOnce(): Promise<CopyTradingWatcherStatus> {
  return fetchApiJson<CopyTradingWatcherStatus>("/copy-trading/watcher/run-once", {
    method: "POST",
  });
}
