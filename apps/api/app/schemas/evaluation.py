from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ResolutionOutcome = Literal["yes", "no", "cancelled"]


class MarketResolveRequest(BaseModel):
    resolved_outcome: ResolutionOutcome
    notes: str | None = None


class MarketOutcomeResponse(BaseModel):
    market_id: int
    resolved_outcome: ResolutionOutcome
    resolution_source: str
    notes: str | None = None
    resolved_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvaluationSummaryResponse(BaseModel):
    accuracy: float | None = None
    opportunity_accuracy: float | None = None
    brier_score: float | None = None
    total_predictions: int = 0
    evaluable: int = 0
    cancelled: int = 0
    pending: int = 0
    first_resolution: datetime | None = None
    last_resolution: datetime | None = None


class EvaluationHistoryItemResponse(BaseModel):
    market_id: int
    question: str
    detail_path: str
    prediction_id: int
    run_at: datetime
    resolved_at: datetime
    resolved_outcome: ResolutionOutcome
    yes_probability: Decimal
    no_probability: Decimal
    opportunity: bool
    was_correct: bool | None = None
    brier_component: float | None = None


class EvaluationHistoryResponse(BaseModel):
    limit: int
    items: list[EvaluationHistoryItemResponse] = Field(default_factory=list)


class EvaluationMarketHistoryItemResponse(BaseModel):
    prediction_id: int
    run_at: datetime
    yes_probability: Decimal
    no_probability: Decimal
    confidence_score: Decimal
    edge_magnitude: Decimal
    opportunity: bool
    was_correct: bool | None = None
    brier_component: float | None = None


class EvaluationMarketHistoryResponse(BaseModel):
    market_id: int
    question: str
    resolved_outcome: ResolutionOutcome
    resolved_at: datetime
    items: list[EvaluationMarketHistoryItemResponse] = Field(default_factory=list)
