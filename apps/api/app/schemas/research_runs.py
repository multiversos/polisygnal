from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.prediction import PredictionItemResponse
from app.schemas.research import PredictionReportRead, ResearchFindingRead


class ResearchRunMarketSummary(BaseModel):
    id: int
    question: str
    sport: str | None = None
    market_shape: str | None = None
    close_time: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ResearchRunListItem(BaseModel):
    id: int
    market_id: int
    market: ResearchRunMarketSummary | None = None
    status: str
    research_mode: str
    vertical: str
    subvertical: str | None = None
    market_shape: str
    started_at: datetime
    finished_at: datetime | None = None
    degraded_mode: bool
    web_search_used: bool
    prediction_family: str | None = None
    confidence_score: Decimal | None = None
    has_findings: bool
    has_report: bool
    has_prediction: bool
    findings_count: int
    reports_count: int
    predictions_count: int
    request_path: str | None = None
    packet_path: str | None = None
    expected_response_path: str | None = None
    ingest_command: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ResearchRunsResponse(BaseModel):
    count: int
    limit: int
    filters_applied: dict[str, object | None] = Field(default_factory=dict)
    items: list[ResearchRunListItem] = Field(default_factory=list)


class ResearchRunDetailRead(ResearchRunListItem):
    error_message: str | None = None
    metadata_json: dict[str, object] | list[object] | None = None
    findings: list[ResearchFindingRead] = Field(default_factory=list)
    report: PredictionReportRead | None = None
    prediction: PredictionItemResponse | None = None
