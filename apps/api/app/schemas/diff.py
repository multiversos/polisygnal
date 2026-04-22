from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class DiffRunMetadata(BaseModel):
    generated_at: datetime | None = None
    run_id: str | None = None
    pipeline_summary_path: str | None = None
    total_markets: int | None = None
    top_opportunities_count: int | None = None
    watchlist_count: int | None = None
    snapshot_path: str | None = None
    latest_snapshot_path: str | None = None


class DiffTopOpportunityChange(BaseModel):
    market_id: int
    question: str | None = None
    priority_bucket: str | None = None
    opportunity: bool = False
    yes_probability: Decimal | None = None
    confidence_score: Decimal | None = None
    edge_magnitude: Decimal | None = None
    previous_bucket: str | None = None


class DiffBucketChange(BaseModel):
    market_id: int
    question: str | None = None
    previous_bucket: str | None = None
    current_bucket: str | None = None
    previous_opportunity: bool = False
    current_opportunity: bool = False


class DiffMaterialScoreChange(BaseModel):
    market_id: int
    question: str | None = None
    previous_bucket: str | None = None
    current_bucket: str | None = None
    previous_yes_probability: Decimal | None = None
    current_yes_probability: Decimal | None = None
    delta_yes_probability: Decimal = Decimal("0")
    previous_confidence_score: Decimal | None = None
    current_confidence_score: Decimal | None = None
    delta_confidence_score: Decimal = Decimal("0")
    previous_edge_magnitude: Decimal | None = None
    current_edge_magnitude: Decimal | None = None
    delta_edge_magnitude: Decimal = Decimal("0")
    max_delta: Decimal = Decimal("0")


class DiffSummaryResponse(BaseModel):
    comparison_ready: bool = False
    top_opportunities_entered_count: int = 0
    top_opportunities_exited_count: int = 0
    bucket_changes_count: int = 0
    material_score_changes_count: int = 0
    text: str = "No diff artifact available yet."


class LatestDiffResponse(BaseModel):
    artifact_available: bool = False
    generated_at: datetime | None = None
    comparison_ready: bool = False
    current_run: DiffRunMetadata | None = None
    previous_run: DiffRunMetadata | None = None
    top_opportunities_entered: list[DiffTopOpportunityChange] = Field(default_factory=list)
    top_opportunities_exited: list[DiffTopOpportunityChange] = Field(default_factory=list)
    bucket_changes: list[DiffBucketChange] = Field(default_factory=list)
    material_score_changes: list[DiffMaterialScoreChange] = Field(default_factory=list)
    summary: DiffSummaryResponse


class DiffRunListItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    comparison_ready: bool = False
    status: str | None = None
    current_run_id: str | None = None
    previous_run_id: str | None = None
    top_opportunities_entered_count: int = 0
    top_opportunities_exited_count: int = 0
    bucket_changes_count: int = 0
    material_score_changes_count: int = 0
    summary_text: str | None = None
    summary_path: str | None = None
    json_path: str | None = None
    txt_path: str | None = None


class DiffRunsResponse(BaseModel):
    total_count: int = 0
    limit: int = 10
    items: list[DiffRunListItem] = Field(default_factory=list)


class DiffRunDetailResponse(LatestDiffResponse):
    run_id: str
    summary_path: str | None = None
    json_path: str | None = None
    txt_path: str | None = None
