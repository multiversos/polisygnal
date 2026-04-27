from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

WatchlistStatus = Literal["watching", "investigating", "reviewed", "dismissed"]


class WatchlistItemCreate(BaseModel):
    market_id: int
    status: WatchlistStatus = "watching"
    note: str | None = Field(default=None, max_length=4000)


class WatchlistItemUpdate(BaseModel):
    status: WatchlistStatus | None = None
    note: str | None = Field(default=None, max_length=4000)


class WatchlistItemRead(BaseModel):
    id: int
    market_id: int
    status: WatchlistStatus
    note: str | None = None
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
