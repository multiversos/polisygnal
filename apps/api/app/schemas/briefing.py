from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.overview import PriorityBucket, ScoringMode


class BriefingFilters(BaseModel):
    sport_type: str | None = "nba"
    market_type: str | None = "winner"
    active: bool | None = True
    top_limit: int = 5
    watchlist_limit: int = 5
    review_limit: int = 5


class BriefingMarketItem(BaseModel):
    market_id: int
    question: str
    priority_rank: int
    priority_bucket: PriorityBucket
    scoring_mode: ScoringMode
    run_at: datetime | None = None
    snapshot_captured_at: datetime | None = None
    yes_probability: Decimal | None = None
    confidence_score: Decimal | None = None
    edge_magnitude: Decimal | None = None
    edge_class: str | None = None
    opportunity: bool | None = None
    evidence_eligible: bool
    evidence_shape: str
    evidence_skip_reason: str | None = None
    evidence_count: int = 0
    odds_evidence_count: int = 0
    news_evidence_count: int = 0


class BriefingReviewItem(BriefingMarketItem):
    review_edge: bool = False
    review_confidence: bool = False
    review_reasons: list[str] = Field(default_factory=list)


class BriefingOperationalCounts(BaseModel):
    total_markets: int = 0
    opportunity_count: int = 0
    watchlist_count: int = 0
    review_flag_count: int = 0
    review_edge_count: int = 0
    review_confidence_count: int = 0
    evidence_backed_count: int = 0
    fallback_only_count: int = 0
    no_prediction_count: int = 0
    evidence_eligible_count: int = 0
    evidence_non_eligible_count: int = 0


class BriefingFreshness(BaseModel):
    pipeline_status: str | None = None
    pipeline_started_at: datetime | None = None
    pipeline_finished_at: datetime | None = None
    reports_status: str | None = None
    reports_started_at: datetime | None = None
    reports_finished_at: datetime | None = None
    latest_snapshot_at: datetime | None = None
    latest_prediction_at: datetime | None = None
    latest_evidence_at: datetime | None = None


class OperationalBriefingResponse(BaseModel):
    generated_at: datetime
    summary: str
    filters: BriefingFilters
    top_opportunities: list[BriefingMarketItem] = Field(default_factory=list)
    watchlist: list[BriefingMarketItem] = Field(default_factory=list)
    review_flags: list[BriefingReviewItem] = Field(default_factory=list)
    operational_counts: BriefingOperationalCounts
    freshness: BriefingFreshness


class BriefingRunListItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    status: str | None = None
    summary_text: str | None = None
    top_opportunities_count: int = 0
    watchlist_count: int = 0
    review_flags_count: int = 0
    total_markets: int = 0
    summary_path: str | None = None
    json_path: str | None = None
    txt_path: str | None = None


class BriefingRunsResponse(BaseModel):
    total_count: int = 0
    limit: int = 10
    items: list[BriefingRunListItem] = Field(default_factory=list)


class BriefingArtifactResponse(BaseModel):
    artifact_available: bool = False
    run_id: str | None = None
    generated_at: datetime | None = None
    status: str | None = None
    message: str | None = None
    summary_text: str | None = None
    top_opportunities_count: int = 0
    watchlist_count: int = 0
    review_flags_count: int = 0
    total_markets: int = 0
    summary_path: str | None = None
    json_path: str | None = None
    txt_path: str | None = None
    raw_output_path: str | None = None
    briefing: OperationalBriefingResponse | None = None
