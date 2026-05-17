from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CopyTradingMode = Literal["demo", "real"]
CopyAmountMode = Literal["preset", "custom"]
CopyTradeSide = Literal["buy", "sell"]
CopyTradeFreshnessStatus = Literal[
    "live_candidate",
    "recent_outside_window",
    "historical",
    "unknown_time",
]
CopyOrderStatus = Literal[
    "pending",
    "simulated",
    "skipped",
    "blocked",
    "submitted",
    "filled",
    "partial_failed",
    "failed",
]
CopyEventLevel = Literal["info", "warning", "error"]
CopyDemoPositionStatus = Literal[
    "open",
    "waiting_resolution",
    "unknown_resolution",
    "closed",
    "cancelled",
    "price_pending",
]
CopyWatcherWalletScanStatus = Literal[
    "scanned_ok",
    "slow",
    "timeout",
    "skipped_budget",
    "skipped_priority",
    "skipped_paused",
    "error",
]
CopyWatcherWalletPriority = Literal["high", "normal", "low"]
CopyTradingWorkerStatus = Literal["not_started", "running", "stale", "stopped", "error", "unknown"]

COPY_AMOUNT_PRESETS = {
    Decimal("1"),
    Decimal("5"),
    Decimal("10"),
    Decimal("20"),
}
COPY_WINDOW_SECONDS_ALLOWED = {10, 30, 60, 120, 300}


class CopyWalletCreate(BaseModel):
    wallet_input: str = Field(min_length=1, max_length=1024)
    label: str | None = Field(default=None, max_length=160)
    mode: CopyTradingMode = "demo"
    copy_amount_mode: CopyAmountMode = "preset"
    copy_amount_usd: Decimal = Field(default=Decimal("5"), gt=0, max_digits=12, decimal_places=2)
    copy_buys: bool = True
    copy_sells: bool = True
    max_trade_usd: Decimal | None = Field(default=Decimal("20"), gt=0, max_digits=12, decimal_places=2)
    max_daily_usd: Decimal | None = Field(default=Decimal("100"), gt=0, max_digits=12, decimal_places=2)
    max_slippage_bps: int | None = Field(default=300, ge=0, le=10000)
    max_delay_seconds: int | None = Field(default=10, ge=0, le=86400)
    sports_only: bool = False

    @field_validator("copy_amount_usd")
    @classmethod
    def validate_copy_amount(cls, value: Decimal) -> Decimal:
        return _validate_copy_amount(value)

    @field_validator("max_delay_seconds")
    @classmethod
    def validate_copy_window(cls, value: int | None) -> int | None:
        return _validate_copy_window_seconds(value)

    @model_validator(mode="after")
    def validate_preset_amount(self) -> CopyWalletCreate:
        if self.copy_amount_mode == "preset" and self.copy_amount_usd not in COPY_AMOUNT_PRESETS:
            raise ValueError("copy_amount_usd debe ser 1, 5, 10 o 20 cuando copy_amount_mode es preset.")
        return self


class CopyWalletUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=160)
    enabled: bool | None = None
    mode: CopyTradingMode | None = None
    copy_buys: bool | None = None
    copy_sells: bool | None = None
    copy_amount_mode: CopyAmountMode | None = None
    copy_amount_usd: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    max_trade_usd: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    max_daily_usd: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    max_slippage_bps: int | None = Field(default=None, ge=0, le=10000)
    max_delay_seconds: int | None = Field(default=None, ge=0, le=86400)
    sports_only: bool | None = None

    @field_validator("copy_amount_usd")
    @classmethod
    def validate_copy_amount(cls, value: Decimal | None) -> Decimal | None:
        if value is None:
            return None
        return _validate_copy_amount(value)

    @field_validator("max_delay_seconds")
    @classmethod
    def validate_copy_window(cls, value: int | None) -> int | None:
        return _validate_copy_window_seconds(value)


class CopyWalletRead(BaseModel):
    id: str
    label: str | None = None
    profile_url: str | None = None
    proxy_wallet: str
    enabled: bool
    mode: CopyTradingMode
    real_trading_enabled: bool
    copy_buys: bool
    copy_sells: bool
    copy_amount_mode: CopyAmountMode
    copy_amount_usd: Decimal
    max_trade_usd: Decimal | None = None
    max_daily_usd: Decimal | None = None
    max_slippage_bps: int | None = None
    max_delay_seconds: int | None = None
    copy_window_seconds: int | None = None
    sports_only: bool
    last_scan_at: datetime | None = None
    last_trade_at: datetime | None = None
    recent_trades: int = 0
    historical_trades: int = 0
    live_candidates: int = 0
    demo_copied_count: int = 0
    demo_buy_count: int = 0
    demo_sell_count: int = 0
    demo_skipped_count: int = 0
    last_demo_copy_at: datetime | None = None
    last_demo_copy_action: CopyTradeSide | None = None
    last_demo_copy_amount_usd: Decimal | None = None
    last_trade_freshness_status: CopyTradeFreshnessStatus | None = None
    last_trade_freshness_label: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CopyDetectedTradeRead(BaseModel):
    id: str
    wallet_id: str
    source_transaction_hash: str | None = None
    dedupe_key: str
    source_proxy_wallet: str
    condition_id: str | None = None
    asset: str | None = None
    outcome: str | None = None
    market_title: str | None = None
    market_slug: str | None = None
    side: CopyTradeSide
    source_price: Decimal | None = None
    source_size: Decimal | None = None
    source_amount_usd: Decimal | None = None
    source_timestamp: datetime | None = None
    detected_at: datetime
    age_seconds: int | None = None
    freshness_status: CopyTradeFreshnessStatus
    freshness_label: str
    copy_window_seconds: int | None = None
    is_live_candidate: bool = False

    model_config = ConfigDict(from_attributes=True)


class CopyOrderRead(BaseModel):
    id: str
    wallet_id: str
    detected_trade_id: str | None = None
    mode: CopyTradingMode
    action: CopyTradeSide
    status: CopyOrderStatus
    reason: str | None = None
    intended_amount_usd: Decimal | None = None
    intended_size: Decimal | None = None
    limit_price: Decimal | None = None
    simulated_price: Decimal | None = None
    filled_price: Decimal | None = None
    filled_size: Decimal | None = None
    polymarket_order_id: str | None = None
    freshness_status: CopyTradeFreshnessStatus | None = None
    freshness_label: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CopyBotEventRead(BaseModel):
    id: str
    wallet_id: str | None = None
    level: CopyEventLevel
    event_type: str
    message: str
    metadata: dict[str, object] | None = Field(default=None, validation_alias="event_metadata")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CopyTradingStatusResponse(BaseModel):
    mode_default: CopyTradingMode = "demo"
    demo_only: bool = True
    real_trading_available: bool = False
    real_trading_block_reason: str = "real_trading_not_configured"
    wallets_total: int
    wallets_enabled: int
    trades_detected: int
    orders_simulated: int
    orders_skipped: int
    orders_blocked: int
    open_demo_positions_count: int = 0
    last_scan_at: datetime | None = None
    worker_status: CopyTradingWorkerStatus = "not_started"
    worker_owner_id: str | None = None
    last_heartbeat_at: datetime | None = None
    last_loop_started_at: datetime | None = None
    last_loop_finished_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    last_result_json: dict[str, object] | None = None
    consecutive_errors: int = 0
    stale_after_seconds: int = 30


class CopyDemoPositionRead(BaseModel):
    id: str
    wallet_id: str
    wallet_label: str | None = None
    proxy_wallet: str | None = None
    opening_order_id: str
    closing_order_id: str | None = None
    condition_id: str | None = None
    asset: str | None = None
    outcome: str | None = None
    market_title: str | None = None
    market_slug: str | None = None
    entry_action: CopyTradeSide
    entry_price: Decimal
    entry_amount_usd: Decimal
    entry_size: Decimal
    current_price: Decimal | None = None
    current_value_usd: Decimal | None = None
    unrealized_pnl_usd: Decimal | None = None
    unrealized_pnl_percent: Decimal | None = None
    realized_pnl_usd: Decimal | None = None
    exit_price: Decimal | None = None
    exit_value_usd: Decimal | None = None
    close_reason: str | None = None
    resolution_source: str | None = None
    status: CopyDemoPositionStatus
    opened_at: datetime
    closed_at: datetime | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CopyTradingDemoPnlSummary(BaseModel):
    open_positions_count: int = 0
    closed_positions_count: int = 0
    capital_demo_used_usd: Decimal | None = None
    open_capital_usd: Decimal | None = None
    closed_capital_usd: Decimal | None = None
    open_current_value_usd: Decimal | None = None
    open_pnl_usd: Decimal | None = None
    realized_pnl_usd: Decimal | None = None
    total_demo_pnl_usd: Decimal | None = None
    demo_roi_percent: Decimal | None = None
    win_rate_percent: Decimal | None = None
    average_closed_pnl_usd: Decimal | None = None
    best_closed_pnl_usd: Decimal | None = None
    worst_closed_pnl_usd: Decimal | None = None
    winning_closed_count: int = 0
    losing_closed_count: int = 0
    price_pending_count: int = 0


class CopyTradingTickResponse(BaseModel):
    wallets_scanned: int = 0
    scanned_wallet_count: int = 0
    trades_detected: int = 0
    new_trades: int = 0
    orders_simulated: int = 0
    buy_simulated: int = 0
    sell_simulated: int = 0
    orders_skipped: int = 0
    orders_blocked: int = 0
    live_candidates: int = 0
    recent_outside_window: int = 0
    historical_trades: int = 0
    skipped_reasons: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    wallet_scan_results: list["CopyTradingWatcherWalletScanResult"] = Field(default_factory=list)
    cycle_budget_exceeded: bool = False
    skipped_wallets_due_to_budget: int = 0
    pending_wallets: int = 0
    slow_wallet_count: int = 0
    timeout_count: int = 0
    errored_wallet_count: int = 0
    skipped_due_to_budget_count: int = 0
    skipped_due_to_priority_count: int = 0
    pending_wallet_count: int = 0


class CopyTradingWatcherLastResult(BaseModel):
    wallets_scanned: int = 0
    scanned_wallet_count: int = 0
    trades_detected: int = 0
    new_trades: int = 0
    orders_simulated: int = 0
    buy_simulated: int = 0
    sell_simulated: int = 0
    orders_skipped: int = 0
    orders_blocked: int = 0
    live_candidates: int = 0
    recent_outside_window: int = 0
    historical_trades: int = 0
    skipped_reasons: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    wallet_scan_results: list["CopyTradingWatcherWalletScanResult"] = Field(default_factory=list)
    cycle_budget_exceeded: bool = False
    skipped_wallets_due_to_budget: int = 0
    pending_wallets: int = 0
    slow_wallet_count: int = 0
    timeout_count: int = 0
    errored_wallet_count: int = 0
    skipped_due_to_budget_count: int = 0
    skipped_due_to_priority_count: int = 0
    pending_wallet_count: int = 0


class CopyTradingWatcherWalletScanResult(BaseModel):
    wallet_id: str
    alias: str | None = None
    wallet_address_short: str
    status: CopyWatcherWalletScanStatus = "scanned_ok"
    reason: str | None = None
    duration_ms: int | None = None
    trades_detected: int = 0
    new_trades: int = 0
    orders_simulated: int = 0
    orders_skipped: int = 0
    historical_trades: int = 0
    live_candidates: int = 0
    timeout: bool = False
    error_message: str | None = None
    priority: CopyWatcherWalletPriority = "normal"
    next_scan_hint: str | None = None
    skipped_reason: str | None = None
    last_scanned_at: datetime | None = None
    consecutive_timeouts: int = 0
    consecutive_slow_scans: int = 0


class CopyTradingWatcherStatusResponse(BaseModel):
    enabled: bool
    running: bool
    demo_only: bool = True
    interval_seconds: int
    cycle_budget_seconds: int
    current_run_started_at: datetime | None = None
    last_run_started_at: datetime | None = None
    last_run_at: datetime | None = None
    last_run_finished_at: datetime | None = None
    last_run_duration_ms: int | None = None
    average_run_duration_ms: int | None = None
    next_run_at: datetime | None = None
    last_result: CopyTradingWatcherLastResult | None = None
    error_count: int = 0
    scanned_wallet_count: int = 0
    slow_wallet_count: int = 0
    timeout_count: int = 0
    errored_wallet_count: int = 0
    skipped_due_to_budget_count: int = 0
    skipped_due_to_priority_count: int = 0
    pending_wallet_count: int = 0
    is_over_interval: bool = False
    behind_by_seconds: int = 0
    last_error: str | None = None
    message: str | None = None
    worker_status: CopyTradingWorkerStatus = "not_started"
    worker_owner_id: str | None = None
    last_heartbeat_at: datetime | None = None
    last_loop_started_at: datetime | None = None
    last_loop_finished_at: datetime | None = None
    last_success_at: datetime | None = None
    last_result_json: dict[str, object] | None = None
    consecutive_errors: int = 0
    stale_after_seconds: int = 30


class CopyTradingListResponse(BaseModel):
    wallets: list[CopyWalletRead] = Field(default_factory=list)


class CopyTradingTradesResponse(BaseModel):
    trades: list[CopyDetectedTradeRead] = Field(default_factory=list)


class CopyTradingOrdersResponse(BaseModel):
    orders: list[CopyOrderRead] = Field(default_factory=list)


class CopyTradingEventsResponse(BaseModel):
    events: list[CopyBotEventRead] = Field(default_factory=list)


class CopyTradingDemoPositionsResponse(BaseModel):
    positions: list[CopyDemoPositionRead] = Field(default_factory=list)


class CopyTradingDemoPnlSummaryResponse(BaseModel):
    summary: CopyTradingDemoPnlSummary


class CopyTradingDemoSettlementPositionResult(BaseModel):
    position_id: str
    wallet_alias: str | None = None
    market_title: str | None = None
    outcome: str | None = None
    previous_status: CopyDemoPositionStatus
    new_status: CopyDemoPositionStatus
    close_reason: str | None = None
    realized_pnl_usd: Decimal | None = None
    resolution_source: str | None = None
    reason: str


class CopyTradingDemoSettlementSummary(BaseModel):
    checked_positions: int = 0
    closed_by_market_resolution: int = 0
    waiting_resolution: int = 0
    still_open: int = 0
    cancelled: int = 0
    unknown_resolution: int = 0
    errors: int = 0


class CopyTradingDemoSettlementResponse(BaseModel):
    summary: CopyTradingDemoSettlementSummary
    positions: list[CopyTradingDemoSettlementPositionResult] = Field(default_factory=list)
    ran_at: datetime


def _validate_copy_amount(value: Decimal) -> Decimal:
    if not value.is_finite() or value <= 0:
        raise ValueError("copy_amount_usd debe ser positivo.")
    return value


def _validate_copy_window_seconds(value: int | None) -> int | None:
    if value is None:
        return None
    if value not in COPY_WINDOW_SECONDS_ALLOWED:
        raise ValueError("max_delay_seconds debe ser 10, 30, 60, 120 o 300.")
    return value
