from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

ResolvedOutcome = Literal["yes", "no", "cancelled"]


class MarketOutcomeCreate(BaseModel):
    resolved_outcome: ResolvedOutcome
    resolved_at: datetime | None = None
    source: str | None = None
    notes: str | None = Field(default=None, max_length=4000)


class MarketOutcomeUpdate(BaseModel):
    resolved_outcome: ResolvedOutcome | None = None
    resolved_at: datetime | None = None
    source: str | None = None
    notes: str | None = Field(default=None, max_length=4000)


class MarketOutcomeRead(BaseModel):
    market_id: int
    question: str
    resolved_outcome: ResolvedOutcome
    resolved_at: datetime
    source: str
    notes: str | None = None


class MarketOutcomesResponse(BaseModel):
    total_count: int = 0
    items: list[MarketOutcomeRead] = Field(default_factory=list)


class BacktestingFamilySummary(BaseModel):
    prediction_family: str
    total_resolved_with_predictions: int = 0
    correct_direction_count: int = 0
    accuracy_direction: Decimal | None = None
    avg_confidence: Decimal | None = None
    brier_score: Decimal | None = None


class BacktestingSummaryResponse(BaseModel):
    generated_at: datetime
    total_resolved_with_predictions: int = 0
    correct_direction_count: int = 0
    accuracy_direction: Decimal | None = None
    avg_confidence: Decimal | None = None
    brier_score: Decimal | None = None
    by_prediction_family: list[BacktestingFamilySummary] = Field(default_factory=list)
