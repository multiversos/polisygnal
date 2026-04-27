from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ExternalMarketSignalCreate(BaseModel):
    source: str
    source_market_id: str | None = None
    source_event_id: str | None = None
    source_ticker: str | None = None
    polymarket_market_id: int | None = None
    title: str | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    best_yes_bid: Decimal | None = None
    best_yes_ask: Decimal | None = None
    best_no_bid: Decimal | None = None
    best_no_ask: Decimal | None = None
    mid_price: Decimal | None = None
    last_price: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None
    open_interest: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal | None = None
    match_confidence: Decimal | None = None
    match_reason: str | None = None
    warnings: list[str] | dict[str, object] | None = None
    raw_json: dict[str, object] | list[object] | None = None
    fetched_at: datetime | None = None


class ExternalMarketSignalRead(BaseModel):
    id: int
    source: str
    source_market_id: str | None = None
    source_event_id: str | None = None
    source_ticker: str | None = None
    polymarket_market_id: int | None = None
    title: str | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    best_yes_bid: Decimal | None = None
    best_yes_ask: Decimal | None = None
    best_no_bid: Decimal | None = None
    best_no_ask: Decimal | None = None
    mid_price: Decimal | None = None
    last_price: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None
    open_interest: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal | None = None
    match_confidence: Decimal | None = None
    match_reason: str | None = None
    warnings: list[object] | dict[str, object] | None = None
    raw_json: dict[str, object] | list[object] | None = None
    fetched_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExternalMarketSignalPreview(BaseModel):
    id: int
    source: str
    source_ticker: str | None = None
    title: str | None = None
    polymarket_market_id: int | None = None
    yes_probability: Decimal | None = None
    no_probability: Decimal | None = None
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    source_confidence: Decimal | None = None
    match_confidence: Decimal | None = None
    warnings: list[object] | dict[str, object] | None = None
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExternalMarketSignalsResponse(BaseModel):
    count: int
    limit: int
    source: str | None = None
    ticker: str | None = None
    market_id: int | None = None
    signals: list[ExternalMarketSignalRead] = Field(default_factory=list)


class ExternalSignalMatchThresholds(BaseModel):
    auto_link: Decimal
    review_min: Decimal


class ExternalSignalMatchCandidateRead(BaseModel):
    market_id: int
    market_question: str
    sport: str | None = None
    market_shape: str | None = None
    match_confidence: Decimal
    match_reason: str
    warnings: list[str] = Field(default_factory=list)
    action: Literal["would_link", "review_required", "no_match"]


class ExternalSignalMatchCandidatesResponse(BaseModel):
    signal_id: int
    source: str
    source_ticker: str | None = None
    signal_title: str | None = None
    thresholds: ExternalSignalMatchThresholds
    candidates: list[ExternalSignalMatchCandidateRead] = Field(default_factory=list)
