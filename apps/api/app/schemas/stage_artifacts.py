from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class StageRunListItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    status: str | None = None
    partial_error_count: int = 0
    summary_path: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class StageRunsResponse(BaseModel):
    stage: str
    total_count: int = 0
    limit: int = 10
    items: list[StageRunListItem] = Field(default_factory=list)


class StageArtifactResponse(BaseModel):
    artifact_available: bool = False
    stage: str
    run_id: str | None = None
    generated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    status: str | None = None
    message: str | None = None
    partial_error_count: int = 0
    log_dir: str | None = None
    summary_path: str | None = None
    raw_output_path: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
