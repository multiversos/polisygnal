from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WalletProfileStatus = Literal["candidate", "watching", "demo_follow", "paused", "rejected"]
WalletMetricStatus = Literal["verified", "estimated", "unavailable"]
WalletConfidence = Literal["low", "medium", "high"]
WalletSignalStrength = Literal["weak", "moderate", "strong"]
WalletAnalysisJobStatus = Literal[
    "pending",
    "resolving_market",
    "discovering_wallets",
    "analyzing_wallets",
    "scoring",
    "completed",
    "partial",
    "failed",
    "cancelled",
]
WalletAnalysisCandidateSortBy = Literal["score", "volume_30d", "win_rate_30d", "pnl_30d", "created_at"]
SortOrder = Literal["asc", "desc"]
WalletAnalysisResolveStatus = Literal["ok", "partial", "not_found", "unsupported", "error"]
WalletAnalysisRunState = Literal["progressed", "already_running", "no_work_remaining", "failed"]
MarketSignalStatus = Literal[
    "pending_resolution",
    "resolved_hit",
    "resolved_miss",
    "cancelled",
    "unknown",
    "no_clear_signal",
]
MarketResolutionStatus = Literal["open", "resolved", "cancelled", "unknown"]


class WalletAnalysisCreateRequest(BaseModel):
    polymarket_url: str = Field(max_length=2048)


class WalletAnalysisOutcomeRead(BaseModel):
    label: str
    side: str
    token_id: str | None = None


class WalletAnalysisResolvedLinkRead(BaseModel):
    source_url: str
    normalized_url: str
    status: WalletAnalysisResolveStatus
    raw_source: str
    market_title: str | None = None
    condition_id: str | None = None
    market_slug: str | None = None
    event_slug: str | None = None
    sport_or_league: str | None = None
    outcomes: list[WalletAnalysisOutcomeRead] = Field(default_factory=list)
    token_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class WalletAnalysisJobProgressRead(BaseModel):
    wallets_found: int = 0
    wallets_analyzed: int = 0
    wallets_with_sufficient_history: int = 0
    yes_wallets: int = 0
    no_wallets: int = 0
    current_batch: int = 0


class WalletAnalysisSignalSummaryRead(BaseModel):
    id: str
    predicted_side: str | None = None
    predicted_outcome: str | None = None
    polysignal_score: Decimal | None = None
    confidence: WalletConfidence
    data_confidence: WalletConfidence | None = None
    signal_strength: WalletSignalStrength | None = None
    signal_margin: Decimal | None = None
    yes_score: Decimal | None = None
    no_score: Decimal | None = None
    outcome_scores_json: dict[str, Any] | None = None
    outcome_wallet_counts_json: dict[str, int] | None = None
    signal_status: MarketSignalStatus
    warnings_json: list[str] = Field(default_factory=list)


class WalletAnalysisJobRead(BaseModel):
    id: str
    source_url: str
    normalized_url: str
    market_slug: str | None = None
    event_slug: str | None = None
    condition_id: str | None = None
    market_title: str | None = None
    status: WalletAnalysisJobStatus
    outcomes: list[WalletAnalysisOutcomeRead] = Field(default_factory=list)
    token_ids: list[str] = Field(default_factory=list)
    progress: WalletAnalysisJobProgressRead
    result_json: dict[str, Any] | None = None
    warnings: list[str] = Field(default_factory=list)
    status_detail: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    candidates_count: int = 0
    signal_summary: WalletAnalysisSignalSummaryRead | None = None


class WalletAnalysisJobCreateResponse(BaseModel):
    job_id: str
    status: WalletAnalysisJobStatus
    message: str
    market: WalletAnalysisJobRead


class WalletAnalysisJobRunRequest(BaseModel):
    max_wallets: int = Field(default=50, ge=1, le=250)
    max_wallets_discovery: int = Field(default=100, ge=1, le=500)
    batch_size: int = Field(default=20, ge=1, le=100)
    history_limit: int = Field(default=100, ge=1, le=250)
    max_runtime_seconds: int = Field(default=12, ge=5, le=25)


class WalletAnalysisJobRunResponse(BaseModel):
    job_id: str
    status: WalletAnalysisJobStatus
    run_state: WalletAnalysisRunState
    message: str
    wallets_found: int
    wallets_analyzed: int
    wallets_with_sufficient_history: int
    candidates_count: int
    warnings: list[str] = Field(default_factory=list)
    status_detail: str | None = None
    has_more: bool = False
    next_action: str | None = None
    signal_id: str | None = None
    signal_status: MarketSignalStatus | None = None
    market: WalletAnalysisJobRead


class WalletAnalysisCandidateRead(BaseModel):
    id: str
    job_id: str
    wallet_address: str
    outcome: str | None = None
    side: str | None = None
    token_id: str | None = None
    observed_market_position_usd: Decimal | None = None
    score: Decimal | None = None
    confidence: WalletConfidence
    roi_30d_status: WalletMetricStatus
    roi_30d_value: Decimal | None = None
    win_rate_30d_status: WalletMetricStatus
    win_rate_30d_value: Decimal | None = None
    pnl_30d_status: WalletMetricStatus
    pnl_30d_value: Decimal | None = None
    trades_30d: int | None = None
    volume_30d: Decimal | None = None
    markets_traded_30d: int | None = None
    last_activity_at: datetime | None = None
    reasons_json: list[str] = Field(default_factory=list)
    risks_json: list[str] = Field(default_factory=list)
    raw_summary_json: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class WalletAnalysisCandidateList(BaseModel):
    items: list[WalletAnalysisCandidateRead]
    total: int


class WalletProfileUpsert(BaseModel):
    wallet_address: str = Field(max_length=42)
    alias: str | None = Field(default=None, max_length=160)
    status: WalletProfileStatus = "candidate"
    score: Decimal | None = None
    confidence: WalletConfidence = "low"
    roi_30d_status: WalletMetricStatus = "unavailable"
    roi_30d_value: Decimal | None = None
    win_rate_30d_status: WalletMetricStatus = "unavailable"
    win_rate_30d_value: Decimal | None = None
    pnl_30d_status: WalletMetricStatus = "unavailable"
    pnl_30d_value: Decimal | None = None
    trades_30d: int | None = Field(default=None, ge=0)
    volume_30d: Decimal | None = None
    drawdown_30d_status: WalletMetricStatus = "unavailable"
    drawdown_30d_value: Decimal | None = None
    markets_traded_30d: int | None = Field(default=None, ge=0)
    last_activity_at: datetime | None = None
    discovered_from_market: str | None = Field(default=None, max_length=320)
    discovered_from_url: str | None = Field(default=None, max_length=512)
    discovered_at: datetime | None = None
    reasons_json: list[str] = Field(default_factory=list, max_length=50)
    risks_json: list[str] = Field(default_factory=list, max_length=50)
    notes: str | None = Field(default=None, max_length=4000)

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("wallet_address", mode="before")
    @classmethod
    def normalize_wallet_address(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("wallet_address must be a public wallet address")
        return value.strip().lower()

    @field_validator(
        "score",
        "roi_30d_value",
        "win_rate_30d_value",
        "pnl_30d_value",
        "volume_30d",
        "drawdown_30d_value",
        mode="before",
    )
    @classmethod
    def normalize_decimal(cls, value: object) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return value
        if isinstance(value, int | float | str):
            try:
                return Decimal(str(value).strip())
            except (InvalidOperation, ValueError):
                return None
        return None


class WalletProfileRead(BaseModel):
    id: str
    wallet_address: str
    alias: str | None = None
    status: WalletProfileStatus
    score: Decimal | None = None
    confidence: WalletConfidence
    roi_30d_status: WalletMetricStatus
    roi_30d_value: Decimal | None = None
    win_rate_30d_status: WalletMetricStatus
    win_rate_30d_value: Decimal | None = None
    pnl_30d_status: WalletMetricStatus
    pnl_30d_value: Decimal | None = None
    trades_30d: int | None = None
    volume_30d: Decimal | None = None
    drawdown_30d_status: WalletMetricStatus
    drawdown_30d_value: Decimal | None = None
    markets_traded_30d: int | None = None
    last_activity_at: datetime | None = None
    discovered_from_market: str | None = None
    discovered_from_url: str | None = None
    discovered_at: datetime | None = None
    reasons_json: list[str] = Field(default_factory=list)
    risks_json: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WalletProfileList(BaseModel):
    items: list[WalletProfileRead]
    total: int


class WalletProfileUpdate(BaseModel):
    alias: str | None = Field(default=None, max_length=160)
    status: WalletProfileStatus | None = None
    notes: str | None = Field(default=None, max_length=4000)


class WalletProfileDemoFollowResponse(BaseModel):
    profile: WalletProfileRead
    copy_wallet: dict[str, Any]
    already_following: bool = False
    baseline_created_at: datetime
    message: str


class PolySignalMarketSignalRead(BaseModel):
    id: str
    job_id: str | None = None
    source_url: str | None = None
    market_slug: str | None = None
    event_slug: str | None = None
    condition_id: str | None = None
    market_title: str | None = None
    outcomes_json: list[dict[str, Any]] = Field(default_factory=list)
    token_ids_json: list[str] = Field(default_factory=list)
    predicted_side: str | None = None
    predicted_outcome: str | None = None
    polysignal_score: Decimal | None = None
    confidence: WalletConfidence
    data_confidence: WalletConfidence | None = None
    signal_strength: WalletSignalStrength | None = None
    signal_margin: Decimal | None = None
    yes_score: Decimal | None = None
    no_score: Decimal | None = None
    outcome_scores_json: dict[str, Any] | None = None
    outcome_wallet_counts_json: dict[str, int] | None = None
    wallets_analyzed: int | None = None
    wallets_with_sufficient_history: int | None = None
    top_wallets_json: list[dict[str, Any]] = Field(default_factory=list)
    warnings_json: list[str] = Field(default_factory=list)
    signal_status: MarketSignalStatus
    final_outcome: str | None = None
    final_resolution_source: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PolySignalMarketResolutionRead(BaseModel):
    status: MarketResolutionStatus
    final_outcome: str | None = None
    source: str
    confidence: WalletConfidence
    reason: str
    checked_at: datetime


class PolySignalMarketSignalSettlementRead(BaseModel):
    signal: PolySignalMarketSignalRead
    resolution: PolySignalMarketResolutionRead
    changed: bool = False


class PolySignalMarketSignalMetricsBucketRead(BaseModel):
    total: int = 0
    resolved_hit: int = 0
    resolved_miss: int = 0
    win_rate: Decimal | None = None


class PolySignalMarketSignalMetricsRead(BaseModel):
    total: int = 0
    pending_resolution: int = 0
    resolved_hit: int = 0
    resolved_miss: int = 0
    cancelled: int = 0
    unknown: int = 0
    no_clear_signal: int = 0
    win_rate: Decimal | None = None
    avg_score_resolved_hit: Decimal | None = None
    avg_score_resolved_miss: Decimal | None = None
    by_confidence: dict[str, PolySignalMarketSignalMetricsBucketRead] = Field(default_factory=dict)


class PolySignalMarketSignalList(BaseModel):
    items: list[PolySignalMarketSignalRead]
    total: int
    metrics: PolySignalMarketSignalMetricsRead


class PolySignalMarketSignalSettlePendingRequest(BaseModel):
    limit: int = Field(default=10, ge=1, le=50)
    job_id: str | None = None
    market_slug: str | None = Field(default=None, max_length=256)


class PolySignalMarketSignalSettlePendingResponse(BaseModel):
    checked: int = 0
    still_pending: int = 0
    resolved_hit: int = 0
    resolved_miss: int = 0
    cancelled: int = 0
    unknown: int = 0
    errors: int = 0
    items: list[PolySignalMarketSignalSettlementRead] = Field(default_factory=list)
