from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


AnalysisReadinessStatus = Literal["ready", "needs_refresh", "blocked"]


class AnalysisReadinessSummary(BaseModel):
    total_checked: int = 0
    ready_count: int = 0
    refresh_needed_count: int = 0
    blocked_count: int = 0
    missing_snapshot_count: int = 0
    missing_price_count: int = 0
    score_pending_count: int = 0


class AnalysisReadinessItem(BaseModel):
    market_id: int
    title: str
    sport: str
    market_shape: str
    close_time: datetime | None = None
    time_window_label: str
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    data_quality_label: str
    freshness_status: str
    polysignal_score_status: str
    readiness_status: AnalysisReadinessStatus
    readiness_score: int
    reasons: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    suggested_next_action: str
    suggested_refresh_snapshot_command: str
    suggested_refresh_metadata_command: str


class AnalysisReadinessResponse(BaseModel):
    generated_at: datetime
    sport: str | None = None
    days: int = 7
    limit: int = 50
    summary: AnalysisReadinessSummary
    items: list[AnalysisReadinessItem] = Field(default_factory=list)
    filters_applied: dict[str, object | None] = Field(default_factory=dict)
