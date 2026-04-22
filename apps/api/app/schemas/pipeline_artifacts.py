from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PipelineComponentStatuses(BaseModel):
    snapshots: str | None = None
    evidence: str | None = None
    scoring: str | None = None
    reports: str | None = None
    briefing: str | None = None
    diff: str | None = None
    dashboard: str | None = None


class PipelineDashboardArtifact(BaseModel):
    ran: bool | None = None
    status: str | None = None
    skip_reason: str | None = None
    log_dir: str | None = None
    summary_path: str | None = None
    partial_error_count: int = 0
    dashboard_path: str | None = None
    overall_status: str | None = None
    total_top_opportunities: int | None = None
    total_watchlist: int | None = None
    warning_reason: str | None = None


class PipelineRunListItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    status: str | None = None
    partial_error_count: int = 0
    component_statuses: PipelineComponentStatuses
    summary_path: str | None = None
    dashboard: PipelineDashboardArtifact | None = None


class PipelineRunsResponse(BaseModel):
    total_count: int = 0
    limit: int = 10
    items: list[PipelineRunListItem] = Field(default_factory=list)


class PipelineStepArtifact(BaseModel):
    name: str
    status: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    exit_code: int | None = None
    summary_path: str | None = None
    wrapper_output_path: str | None = None
    partial_error_count: int = 0
    metrics: dict[str, Any] = Field(default_factory=dict)


class PipelineExecutionArtifact(BaseModel):
    status: str | None = None
    log_dir: str | None = None
    summary_path: str | None = None
    wrapper_run_id: str | None = None
    steps: dict[str, PipelineStepArtifact] = Field(default_factory=dict)
    operational_summary: dict[str, Any] | None = None


class PipelineLinkedArtifact(BaseModel):
    ran: bool | None = None
    status: str | None = None
    skip_reason: str | None = None
    log_dir: str | None = None
    summary_path: str | None = None
    partial_error_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class PipelineArtifactResponse(BaseModel):
    artifact_available: bool = False
    run_id: str | None = None
    generated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    status: str | None = None
    message: str | None = None
    partial_error_count: int = 0
    limit: int | None = None
    frequency_recommendation_minutes: int | None = None
    subset: dict[str, Any] | None = None
    logs: dict[str, Any] | None = None
    summary_path: str | None = None
    component_statuses: PipelineComponentStatuses
    pipeline: PipelineExecutionArtifact | None = None
    reports: PipelineLinkedArtifact | None = None
    briefing: PipelineLinkedArtifact | None = None
    diff: PipelineLinkedArtifact | None = None
    dashboard: PipelineDashboardArtifact | None = None
