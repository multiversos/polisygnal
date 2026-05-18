from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExecutionMode(StrEnum):
    DEMO = "demo"
    DRY_RUN = "dry_run"
    SIGNED_DRY_RUN = "signed_dry_run"
    LIVE = "live"


class ExecutionAction(StrEnum):
    BUY = "buy"
    SELL = "sell"


class ExecutionSimulationStatus(StrEnum):
    SIMULATED = "simulated"
    SKIPPED = "skipped"
    REJECTED = "rejected"
    UNAVAILABLE = "unavailable"


class ExecutionDataQuality(StrEnum):
    VERIFIED = "verified"
    ESTIMATED = "estimated"
    UNAVAILABLE = "unavailable"


class ExecutionLatencyStatus(StrEnum):
    FAST = "fast"
    ACCEPTABLE = "acceptable"
    SLOW = "slow"
    TOO_LATE = "too_late"
    UNAVAILABLE = "unavailable"


class RealReadinessStatus(StrEnum):
    NOT_READY = "not_ready"
    NEEDS_MORE_DEMO_DATA = "needs_more_demo_data"
    WATCH_ONLY = "watch_only"
    DRY_RUN_CANDIDATE = "dry_run_candidate"
    SIGNED_DRY_RUN_CANDIDATE = "signed_dry_run_candidate"
    LIVE_CANDIDATE_LOCKED = "live_candidate_locked"


class WalletConfidence(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


MetricQuality = Literal["verified", "estimated", "unavailable"]


class ExecutionIntent(BaseModel):
    id: str | None = None
    mode: ExecutionMode
    source_wallet_address: str = Field(min_length=1, max_length=42)
    copied_wallet_id: str | None = None
    market: str | None = None
    condition_id: str | None = None
    token_id: str | None = None
    outcome: str | None = None
    action: ExecutionAction
    source_trade_id: str | None = None
    source_trade_price: Decimal | None = None
    source_trade_size: Decimal | None = None
    source_trade_timestamp: datetime | None = None
    detected_at: datetime | None = None
    intended_amount_usd: Decimal | None = None
    max_slippage_bps: int | None = Field(default=None, ge=0)
    max_latency_seconds: int | None = Field(default=None, ge=0)
    reason: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


class ExecutionSimulationResult(BaseModel):
    execution_intent_id: str | None = None
    mode: ExecutionMode
    status: ExecutionSimulationStatus
    source_price: Decimal | None = None
    polysignal_quote_price: Decimal | None = None
    price_delta: Decimal | None = None
    price_delta_percent: Decimal | None = None
    source_size: Decimal | None = None
    intended_size: Decimal | None = None
    estimated_shares: Decimal | None = None
    estimated_gross_pnl: Decimal | None = None
    estimated_fees: Decimal | None = None
    estimated_spread: Decimal | None = None
    estimated_slippage: Decimal | None = None
    estimated_net_pnl: Decimal | None = None
    estimated_net_roi: Decimal | None = None
    worth_copying: bool = False
    rejection_reason: str | None = None
    data_quality: ExecutionDataQuality = ExecutionDataQuality.UNAVAILABLE
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    @model_validator(mode="after")
    def validate_consistency(self) -> "ExecutionSimulationResult":
        has_price_pair = self.source_price is not None and self.polysignal_quote_price is not None
        if self.status == ExecutionSimulationStatus.UNAVAILABLE:
            self.worth_copying = False
            if self.rejection_reason is None:
                self.rejection_reason = "simulation_data_unavailable"
        if not has_price_pair:
            self.price_delta = None
            self.price_delta_percent = None
        if self.data_quality == ExecutionDataQuality.UNAVAILABLE:
            self.worth_copying = False
            self.estimated_gross_pnl = None
            self.estimated_net_pnl = None
            self.estimated_net_roi = None
        return self


class ExecutionLatencyMetrics(BaseModel):
    source_wallet_trade_at: datetime | None = None
    detected_at: datetime | None = None
    detection_latency_ms: int | None = None
    quote_started_at: datetime | None = None
    quote_finished_at: datetime | None = None
    quote_latency_ms: int | None = None
    decision_started_at: datetime | None = None
    decision_finished_at: datetime | None = None
    decision_latency_ms: int | None = None
    order_build_started_at: datetime | None = None
    order_build_finished_at: datetime | None = None
    order_build_latency_ms: int | None = None
    signature_started_at: datetime | None = None
    signature_finished_at: datetime | None = None
    signature_latency_ms: int | None = None
    ready_to_send_at: datetime | None = None
    total_latency_ms: int | None = None
    latency_status: ExecutionLatencyStatus = ExecutionLatencyStatus.UNAVAILABLE

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    @model_validator(mode="after")
    def derive_metrics(self) -> "ExecutionLatencyMetrics":
        self.detection_latency_ms = _duration_ms(self.source_wallet_trade_at, self.detected_at)
        self.quote_latency_ms = _duration_ms(self.quote_started_at, self.quote_finished_at)
        self.decision_latency_ms = _duration_ms(self.decision_started_at, self.decision_finished_at)
        self.order_build_latency_ms = _duration_ms(self.order_build_started_at, self.order_build_finished_at)
        self.signature_latency_ms = _duration_ms(self.signature_started_at, self.signature_finished_at)
        self.total_latency_ms = _duration_ms(self.source_wallet_trade_at, self.ready_to_send_at)
        self.latency_status = _classify_latency(self.total_latency_ms)
        return self


class RealReadinessScore(BaseModel):
    readiness_score: Decimal = Decimal("0")
    status: RealReadinessStatus = RealReadinessStatus.NOT_READY
    real_trading_available: bool = False
    demo_required: bool = True
    allows_dry_run: bool = False
    allows_signed_dry_run: bool = False
    allows_live: bool = False
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


class WalletRealReadinessProfile(BaseModel):
    wallet_address: str = Field(min_length=1, max_length=42)
    wallet_profile_id: str | None = None
    copy_wallet_id: str | None = None
    wallet_profile_status: str | None = None
    real_trading_enabled: bool = False
    real_trading_available: bool = False
    observed_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    days_in_demo: int | None = Field(default=None, ge=0)
    demo_closed_count: int = Field(default=0, ge=0)
    demo_open_count: int = Field(default=0, ge=0)
    demo_realized_pnl_usd: Decimal | None = None
    demo_open_pnl_usd: Decimal | None = None
    demo_win_rate: Decimal | None = None
    demo_drawdown_status: MetricQuality = "unavailable"
    demo_drawdown_value: Decimal | None = None
    avg_detection_latency_ms: int | None = Field(default=None, ge=0)
    p95_detection_latency_ms: int | None = Field(default=None, ge=0)
    avg_total_latency_ms: int | None = Field(default=None, ge=0)
    p95_total_latency_ms: int | None = Field(default=None, ge=0)
    avg_entry_price_delta_bps: Decimal | None = None
    avg_exit_price_delta_bps: Decimal | None = None
    estimated_slippage_bps: Decimal | None = None
    out_of_window_rate: Decimal | None = None
    wallet_profile_score: Decimal | None = None
    wallet_profile_confidence: WalletConfidence = WalletConfidence.LOW
    roi_30d_status: MetricQuality = "unavailable"
    roi_30d_value: Decimal | None = None
    win_rate_30d_status: MetricQuality = "unavailable"
    win_rate_30d_value: Decimal | None = None
    pnl_30d_status: MetricQuality = "unavailable"
    pnl_30d_value: Decimal | None = None
    trades_30d: int | None = Field(default=None, ge=0)
    volume_30d: Decimal | None = None
    markets_traded_30d: int | None = Field(default=None, ge=0)
    candidate_score: Decimal | None = None
    candidate_confidence: WalletConfidence | None = None
    observed_market_position_usd: Decimal | None = None
    signal_score: Decimal | None = None
    signal_confidence: WalletConfidence | None = None
    signal_status: str | None = None
    top_risks: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


def _duration_ms(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    return max(0, int((end - start).total_seconds() * 1000))


def _classify_latency(total_latency_ms: int | None) -> ExecutionLatencyStatus:
    if total_latency_ms is None:
        return ExecutionLatencyStatus.UNAVAILABLE
    if total_latency_ms <= 2_000:
        return ExecutionLatencyStatus.FAST
    if total_latency_ms <= 10_000:
        return ExecutionLatencyStatus.ACCEPTABLE
    if total_latency_ms <= 30_000:
        return ExecutionLatencyStatus.SLOW
    return ExecutionLatencyStatus.TOO_LATE
