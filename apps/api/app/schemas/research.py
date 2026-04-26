from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prediction import PredictionItemResponse

ResearchMode = Literal["local_only", "cheap_research"]


class ResearchFindingRead(BaseModel):
    id: int
    research_run_id: int
    market_id: int
    source_id: int | None = None
    factor_type: str
    stance: str
    impact_score: Decimal
    freshness_score: Decimal
    credibility_score: Decimal
    claim: str
    evidence_summary: str
    citation_url: str | None = None
    source_name: str | None = None
    published_at: datetime | None = None
    metadata_json: dict[str, object] | list[object] | None = None

    model_config = ConfigDict(from_attributes=True)


class PredictionReportRead(BaseModel):
    id: int
    market_id: int
    prediction_id: int | None = None
    research_run_id: int | None = None
    thesis: str
    evidence_for: dict[str, object] | list[object]
    evidence_against: dict[str, object] | list[object]
    risks: dict[str, object] | list[object]
    final_reasoning: str
    recommendation: str
    created_at: datetime
    metadata_json: dict[str, object] | list[object] | None = None

    model_config = ConfigDict(from_attributes=True)


class ResearchRunRead(BaseModel):
    id: int
    market_id: int
    status: str
    vertical: str
    subvertical: str | None = None
    market_shape: str
    research_mode: str
    model_used: str | None = None
    web_search_used: bool
    degraded_mode: bool
    started_at: datetime
    finished_at: datetime | None = None
    total_sources_found: int
    total_sources_used: int
    confidence_score: Decimal | None = None
    error_message: str | None = None
    metadata_json: dict[str, object] | list[object] | None = None
    findings: list[ResearchFindingRead] = Field(default_factory=list)
    report: PredictionReportRead | None = None
    prediction: PredictionItemResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class ResearchRunRequest(BaseModel):
    research_mode: ResearchMode = "local_only"
    create_prediction: bool = True


class ResearchRunResponse(BaseModel):
    research_run_id: int
    status: str
    research_mode: str
    degraded_mode: bool
    web_search_used: bool
    report: PredictionReportRead | None = None
    prediction: PredictionItemResponse | None = None
    partial_errors: list[str] = Field(default_factory=list)


class ResearchCandidateRead(BaseModel):
    market_id: int
    question: str
    event_title: str | None = None
    vertical: str
    sport: str
    market_shape: str
    research_template_name: str
    market_yes_price: Decimal | None = None
    market_no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    close_time: datetime | None = None
    candidate_score: Decimal
    candidate_reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ResearchCandidatesResponse(BaseModel):
    count: int
    limit: int
    vertical: str | None = None
    sport: str | None = None
    market_shape: str | None = None
    candidates: list[ResearchCandidateRead] = Field(default_factory=list)
