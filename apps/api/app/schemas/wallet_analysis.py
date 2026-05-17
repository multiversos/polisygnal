from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WalletProfileStatus = Literal["candidate", "watching", "demo_follow", "paused", "rejected"]
WalletMetricStatus = Literal["verified", "estimated", "unavailable"]
WalletConfidence = Literal["low", "medium", "high"]
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


class WalletAnalysisCreateRequest(BaseModel):
    polymarket_url: str = Field(max_length=2048)


class WalletAnalysisOutcomeRead(BaseModel):
    label: str
    side: str
    token_id: str | None = None


class WalletAnalysisJobProgressRead(BaseModel):
    wallets_found: int
    wallets_analyzed: int
    wallets_with_sufficient_history: int
    yes_wallets: int
    no_wallets: int
    current_batch: int


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
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    candidates_count: int = 0


class WalletAnalysisJobCreateResponse(BaseModel):
    job_id: str
    status: WalletAnalysisJobStatus
    message: str
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
