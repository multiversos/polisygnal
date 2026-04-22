from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PredictionMarketSummary(BaseModel):
    id: int
    question: str
    sport_type: str | None = None
    market_type: str | None = None
    evidence_eligible: bool
    evidence_shape: str
    evidence_skip_reason: str | None = None
    active: bool
    closed: bool

    model_config = ConfigDict(from_attributes=True)


class PredictionItemResponse(BaseModel):
    id: int
    market_id: int
    run_at: datetime
    model_version: str
    yes_probability: Decimal
    no_probability: Decimal
    confidence_score: Decimal
    edge_signed: Decimal
    edge_magnitude: Decimal
    edge_class: str
    opportunity: bool
    review_confidence: bool
    review_edge: bool
    explanation_json: dict[str, object] | list[object]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LatestPredictionResponse(BaseModel):
    market: PredictionMarketSummary
    prediction: PredictionItemResponse | None = None


class PredictionHistoryResponse(BaseModel):
    market: PredictionMarketSummary
    latest_prediction: PredictionItemResponse | None = None
    items: list[PredictionItemResponse] = Field(default_factory=list)
