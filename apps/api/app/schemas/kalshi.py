from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class KalshiImpliedProbabilityResult(BaseModel):
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class KalshiNormalizedMarket(BaseModel):
    source: str = "kalshi"
    source_ticker: str
    event_ticker: str | None = None
    title: str | None = None
    subtitle: str | None = None
    rules: str | None = None
    category: str | None = None
    status: str | None = None
    yes_bid: Decimal | None = None
    yes_ask: Decimal | None = None
    no_bid: Decimal | None = None
    no_ask: Decimal | None = None
    last_price: Decimal | None = None
    volume: Decimal | None = None
    open_interest: Decimal | None = None
    close_time: datetime | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal
    warnings: list[str] = Field(default_factory=list)
    raw_summary: dict[str, object] | None = None

    model_config = ConfigDict(from_attributes=True)


class KalshiOrderbookPreview(BaseModel):
    source: str = "kalshi"
    source_ticker: str
    best_yes_bid: Decimal | None = None
    best_yes_ask: Decimal | None = None
    best_no_bid: Decimal | None = None
    best_no_ask: Decimal | None = None
    yes_levels_count: int = 0
    no_levels_count: int = 0
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class KalshiMarketSignalPreview(BaseModel):
    source: str = "kalshi"
    source_ticker: str
    event_ticker: str | None = None
    title: str | None = None
    status: str | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    open_interest: Decimal | None = None
    source_confidence: Decimal
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
