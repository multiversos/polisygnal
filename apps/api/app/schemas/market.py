from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str
    environment: str


class MarketListItem(BaseModel):
    id: int
    polymarket_market_id: str
    event_id: int
    question: str
    slug: str
    sport_type: str | None = None
    market_type: str | None = None
    evidence_eligible: bool
    evidence_shape: str
    evidence_skip_reason: str | None = None
    active: bool
    closed: bool
    end_date: datetime | None
    latest_yes_price: Decimal | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventSummary(BaseModel):
    id: int
    polymarket_event_id: str
    title: str
    category: str | None = None
    slug: str
    active: bool
    closed: bool
    start_at: datetime | None = None
    end_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MarketSnapshotItem(BaseModel):
    id: int
    market_id: int
    captured_at: datetime
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    midpoint: Decimal | None = None
    last_trade_price: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None

    model_config = ConfigDict(from_attributes=True)


class MarketDetail(BaseModel):
    id: int
    polymarket_market_id: str
    event_id: int
    question: str
    slug: str
    yes_token_id: str | None = None
    no_token_id: str | None = None
    sport_type: str | None = None
    market_type: str | None = None
    evidence_eligible: bool
    evidence_shape: str
    evidence_skip_reason: str | None = None
    active: bool
    closed: bool
    end_date: datetime | None = None
    rules_text: str | None = None
    latest_yes_price: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    event: EventSummary
    latest_snapshot: MarketSnapshotItem | None = None
    recent_snapshots: list[MarketSnapshotItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
