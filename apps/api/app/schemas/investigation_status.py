from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

InvestigationStatus = Literal[
    "pending_review",
    "investigating",
    "has_evidence",
    "review_required",
    "dismissed",
    "paused",
]


class InvestigationStatusCreate(BaseModel):
    status: InvestigationStatus = "pending_review"
    note: str | None = Field(default=None, max_length=4000)
    priority: int | None = Field(default=None, ge=0, le=100)


class InvestigationStatusUpdate(BaseModel):
    status: InvestigationStatus | None = None
    note: str | None = Field(default=None, max_length=4000)
    priority: int | None = Field(default=None, ge=0, le=100)


class InvestigationStatusRead(BaseModel):
    id: int
    market_id: int
    status: InvestigationStatus
    note: str | None = None
    priority: int | None = None
    created_at: datetime
    updated_at: datetime
    market_question: str
    market_slug: str
    sport: str | None = None
    market_shape: str | None = None
    close_time: datetime | None = None
    active: bool
    closed: bool
    latest_yes_price: Decimal | None = None
    latest_no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
