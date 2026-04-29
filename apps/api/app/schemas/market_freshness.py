from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


FreshnessStatus = Literal["fresh", "stale", "incomplete", "unknown"]
FreshnessRecommendedAction = Literal[
    "ok",
    "needs_snapshot",
    "review_market",
    "exclude_from_scoring",
]


class MarketFreshnessRead(BaseModel):
    freshness_status: FreshnessStatus
    reasons: list[str] = Field(default_factory=list)
    latest_snapshot_at: datetime | None = None
    close_time: datetime | None = None
    age_hours: Decimal | None = None
    recommended_action: FreshnessRecommendedAction
