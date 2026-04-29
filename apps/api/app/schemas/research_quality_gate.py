from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ResearchQualityGateIssue(BaseModel):
    code: str | None = None
    message: str


class ResearchQualityGateRead(BaseModel):
    research_run_id: int
    market_id: int
    status: str
    report_exists: bool = False
    report_generated_at: datetime | None = None
    recommended_action: str | None = None
    severity: str | None = None
    errors: list[ResearchQualityGateIssue] = Field(default_factory=list)
    warnings: list[ResearchQualityGateIssue] = Field(default_factory=list)
    source_quality_score: str | None = None
    evidence_balance_score: str | None = None
    confidence_adjusted: str | None = None
    research_mode: str | None = None
    source_review_required: bool | None = None
    dry_run_command: str
    ingest_command: str
    validation_report_name: str | None = None
    validation_report: dict[str, object] | None = None
    instructions: list[str] = Field(default_factory=list)
    system_warnings: list[str] = Field(default_factory=list)
