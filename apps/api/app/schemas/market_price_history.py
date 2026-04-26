from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class MarketPriceHistoryPoint(BaseModel):
    snapshot_id: int
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    captured_at: datetime


class MarketPriceHistoryRead(BaseModel):
    market_id: int
    points: list[MarketPriceHistoryPoint] = Field(default_factory=list)
    latest: MarketPriceHistoryPoint | None = None
    first: MarketPriceHistoryPoint | None = None
    change_yes_abs: Decimal | None = None
    change_yes_pct: Decimal | None = None
    count: int
