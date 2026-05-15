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

COPY_AMOUNT_PRESETS = {
    Decimal("1"),
    Decimal("5"),
    Decimal("10"),
    Decimal("20"),
}


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
    real_trading_available: bool = False
    real_trading_block_reason: str = "real_trading_not_configured"
    wallets_total: int
    wallets_enabled: int
    trades_detected: int
    orders_simulated: int
    orders_skipped: int
    orders_blocked: int
    last_scan_at: datetime | None = None


class CopyTradingTickResponse(BaseModel):
    wallets_scanned: int = 0
    trades_detected: int = 0
    new_trades: int = 0
    orders_simulated: int = 0
    orders_skipped: int = 0
    orders_blocked: int = 0
    live_candidates: int = 0
    recent_outside_window: int = 0
    historical_trades: int = 0
    skipped_reasons: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)


class CopyTradingWatcherLastResult(BaseModel):
    wallets_scanned: int = 0
    trades_detected: int = 0
    new_trades: int = 0
    orders_simulated: int = 0
    orders_skipped: int = 0
    orders_blocked: int = 0
    live_candidates: int = 0
    recent_outside_window: int = 0
    historical_trades: int = 0
    skipped_reasons: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)


class CopyTradingWatcherStatusResponse(BaseModel):
    enabled: bool
    running: bool
    interval_seconds: int
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    last_result: CopyTradingWatcherLastResult | None = None
    error_count: int = 0
    last_error: str | None = None
    message: str | None = None


class CopyTradingListResponse(BaseModel):
    wallets: list[CopyWalletRead] = Field(default_factory=list)


class CopyTradingTradesResponse(BaseModel):
    trades: list[CopyDetectedTradeRead] = Field(default_factory=list)


class CopyTradingOrdersResponse(BaseModel):
    orders: list[CopyOrderRead] = Field(default_factory=list)


class CopyTradingEventsResponse(BaseModel):
    events: list[CopyBotEventRead] = Field(default_factory=list)


def _validate_copy_amount(value: Decimal) -> Decimal:
    if not value.is_finite() or value <= 0:
        raise ValueError("copy_amount_usd debe ser positivo.")
    return value
