export type CopyTradingMode = "demo" | "real";
export type CopyAmountMode = "preset" | "custom";
export type CopyTradeSide = "buy" | "sell";
export type CopyOrderStatus =
  | "pending"
  | "simulated"
  | "skipped"
  | "blocked"
  | "submitted"
  | "filled"
  | "partial_failed"
  | "failed";
export type CopyEventLevel = "info" | "warning" | "error";

export type CopyWallet = {
  id: string;
  label: string | null;
  profile_url: string | null;
  proxy_wallet: string;
  enabled: boolean;
  mode: CopyTradingMode;
  real_trading_enabled: boolean;
  copy_buys: boolean;
  copy_sells: boolean;
  copy_amount_mode: CopyAmountMode;
  copy_amount_usd: string;
  max_trade_usd: string | null;
  max_daily_usd: string | null;
  max_slippage_bps: number | null;
  max_delay_seconds: number | null;
  sports_only: boolean;
  last_scan_at: string | null;
  last_trade_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CopyDetectedTrade = {
  id: string;
  wallet_id: string;
  source_transaction_hash: string | null;
  dedupe_key: string;
  source_proxy_wallet: string;
  condition_id: string | null;
  asset: string | null;
  outcome: string | null;
  market_title: string | null;
  market_slug: string | null;
  side: CopyTradeSide;
  source_price: string | null;
  source_size: string | null;
  source_amount_usd: string | null;
  source_timestamp: string | null;
  detected_at: string;
};

export type CopyOrder = {
  id: string;
  wallet_id: string;
  detected_trade_id: string | null;
  mode: CopyTradingMode;
  action: CopyTradeSide;
  status: CopyOrderStatus;
  reason: string | null;
  intended_amount_usd: string | null;
  intended_size: string | null;
  simulated_price: string | null;
  created_at: string;
  updated_at: string;
};

export type CopyBotEvent = {
  id: string;
  wallet_id: string | null;
  level: CopyEventLevel;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type CopyTradingStatus = {
  mode_default: CopyTradingMode;
  real_trading_available: boolean;
  real_trading_block_reason: string;
  wallets_total: number;
  wallets_enabled: number;
  trades_detected: number;
  orders_simulated: number;
  orders_skipped: number;
  orders_blocked: number;
  last_scan_at: string | null;
};

export type CopyTradingTickSummary = {
  wallets_scanned: number;
  trades_detected: number;
  new_trades: number;
  orders_simulated: number;
  orders_skipped: number;
  orders_blocked: number;
  historical_trades: number;
  skipped_reasons: Record<string, number>;
  errors: string[];
};

export type CopyTradingDashboardData = {
  status: CopyTradingStatus;
  wallets: CopyWallet[];
  trades: CopyDetectedTrade[];
  orders: CopyOrder[];
  events: CopyBotEvent[];
};

export type CopyWalletCreateInput = {
  wallet_input: string;
  label?: string;
  mode: CopyTradingMode;
  copy_amount_mode: CopyAmountMode;
  copy_amount_usd: number;
  copy_buys: boolean;
  copy_sells: boolean;
};
