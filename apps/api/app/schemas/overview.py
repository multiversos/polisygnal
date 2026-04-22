from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prediction import PredictionMarketSummary

EdgeClass = Literal["no_signal", "moderate", "strong", "review"]
OverviewSortBy = Literal["priority", "edge_magnitude", "confidence_score", "run_at"]
PriorityBucket = Literal["priority", "watchlist", "review_fallback", "fallback_only", "no_prediction"]
ScoringMode = Literal["evidence_backed", "fallback_only", "no_prediction"]


class OverviewFilters(BaseModel):
    sport_type: str | None = None
    market_type: str | None = None
    active: bool | None = None
    opportunity_only: bool = False
    evidence_eligible_only: bool = False
    evidence_only: bool = False
    fallback_only: bool = False
    bucket: PriorityBucket | None = None
    edge_class: EdgeClass | None = None
    sort_by: OverviewSortBy = "priority"


class OverviewSnapshotSummary(BaseModel):
    captured_at: datetime
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None

    model_config = ConfigDict(from_attributes=True)


class OverviewPredictionSummary(BaseModel):
    id: int
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
    used_odds_count: int = 0
    used_news_count: int = 0
    used_evidence_in_scoring: bool = False

    model_config = ConfigDict(from_attributes=True)


class OverviewEvidenceSummary(BaseModel):
    evidence_count: int = 0
    odds_evidence_count: int = 0
    news_evidence_count: int = 0
    latest_evidence_at: datetime | None = None


class MarketOverviewItem(BaseModel):
    priority_rank: int = 0
    priority_bucket: PriorityBucket
    scoring_mode: ScoringMode
    market: PredictionMarketSummary
    latest_snapshot: OverviewSnapshotSummary | None = None
    latest_prediction: OverviewPredictionSummary | None = None
    evidence_summary: OverviewEvidenceSummary


class MarketOverviewResponse(BaseModel):
    filters: OverviewFilters
    total_count: int
    limit: int
    offset: int
    items: list[MarketOverviewItem] = Field(default_factory=list)
