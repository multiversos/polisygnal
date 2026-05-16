export type CopyTradingMode = "demo" | "real";
export type CopyAmountMode = "preset" | "custom";
export type CopyTradeSide = "buy" | "sell";
export type CopyTradeFreshnessStatus =
  | "live_candidate"
  | "recent_outside_window"
  | "historical"
  | "unknown_time";
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
  copy_window_seconds: number | null;
  sports_only: boolean;
  last_scan_at: string | null;
  last_trade_at: string | null;
  recent_trades: number;
  historical_trades: number;
  live_candidates: number;
  demo_copied_count: number;
  demo_buy_count: number;
  demo_sell_count: number;
  demo_skipped_count: number;
  last_demo_copy_at: string | null;
  last_demo_copy_action: CopyTradeSide | null;
  last_demo_copy_amount_usd: string | null;
  last_trade_freshness_status: CopyTradeFreshnessStatus | null;
  last_trade_freshness_label: string | null;
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
  age_seconds: number | null;
  freshness_status: CopyTradeFreshnessStatus;
  freshness_label: string;
  copy_window_seconds: number | null;
  is_live_candidate: boolean;
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
  freshness_status: CopyTradeFreshnessStatus | null;
  freshness_label: string | null;
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

export type CopyDemoPositionStatus = "open" | "closed" | "price_pending";

export type CopyDemoPosition = {
  id: string;
  wallet_id: string;
  wallet_label: string | null;
  proxy_wallet: string | null;
  opening_order_id: string;
  closing_order_id: string | null;
  condition_id: string | null;
  asset: string | null;
  outcome: string | null;
  market_title: string | null;
  market_slug: string | null;
  entry_action: CopyTradeSide;
  entry_price: string;
  entry_amount_usd: string;
  entry_size: string;
  current_price: string | null;
  current_value_usd: string | null;
  unrealized_pnl_usd: string | null;
  unrealized_pnl_percent: string | null;
  realized_pnl_usd: string | null;
  exit_price: string | null;
  exit_value_usd: string | null;
  close_reason: string | null;
  status: CopyDemoPositionStatus;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

export type CopyTradingDemoPnlSummary = {
  open_positions_count: number;
  closed_positions_count: number;
  open_pnl_usd: string | null;
  realized_pnl_usd: string | null;
  total_demo_pnl_usd: string | null;
  winning_closed_count: number;
  losing_closed_count: number;
  price_pending_count: number;
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
  buy_simulated: number;
  sell_simulated: number;
  orders_skipped: number;
  orders_blocked: number;
  live_candidates: number;
  recent_outside_window: number;
  historical_trades: number;
  skipped_reasons: Record<string, number>;
  errors: string[];
};

export type CopyTradingWatcherStatus = {
  enabled: boolean;
  running: boolean;
  interval_seconds: number;
  current_run_started_at: string | null;
  last_run_started_at: string | null;
  last_run_at: string | null;
  last_run_finished_at: string | null;
  last_run_duration_ms: number | null;
  average_run_duration_ms: number | null;
  next_run_at: string | null;
  last_result: CopyTradingTickSummary | null;
  error_count: number;
  slow_wallet_count: number;
  timeout_count: number;
  is_over_interval: boolean;
  behind_by_seconds: number;
  last_error: string | null;
  message: string | null;
};

export type CopyTradingDashboardData = {
  status: CopyTradingStatus;
  watcher: CopyTradingWatcherStatus;
  wallets: CopyWallet[];
  trades: CopyDetectedTrade[];
  orders: CopyOrder[];
  events: CopyBotEvent[];
  open_demo_positions: CopyDemoPosition[];
  closed_demo_positions: CopyDemoPosition[];
  demo_pnl_summary: CopyTradingDemoPnlSummary;
};

export type CopyWalletCreateInput = {
  wallet_input: string;
  label?: string;
  mode: CopyTradingMode;
  copy_amount_mode: CopyAmountMode;
  copy_amount_usd: number;
  copy_buys: boolean;
  copy_sells: boolean;
  max_delay_seconds?: number;
};

export type CopyWalletUpdateInput = Partial<
  Pick<
    CopyWallet,
    | "copy_amount_mode"
    | "copy_buys"
    | "copy_sells"
    | "enabled"
    | "label"
    | "max_delay_seconds"
    | "mode"
  >
> & {
  copy_amount_usd?: number;
};
