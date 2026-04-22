from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ReportPresetArtifact(BaseModel):
    preset: str
    status: str | None = None
    item_count: int = 0
    items_exported: int = 0
    json_path: str | None = None
    csv_path: str | None = None
    json_payload: dict[str, Any] | None = None


class ReportRunListItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    status: str | None = None
    partial_error_count: int = 0
    preset_count: int = 0
    total_items_exported: int = 0
    presets: list[str] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=list)
    summary_path: str | None = None


class ReportRunsResponse(BaseModel):
    total_count: int = 0
    limit: int = 10
    items: list[ReportRunListItem] = Field(default_factory=list)


class ReportArtifactResponse(BaseModel):
    artifact_available: bool = False
    run_id: str | None = None
    generated_at: datetime | None = None
    status: str | None = None
    message: str | None = None
    partial_error_count: int = 0
    preset_count: int = 0
    total_items_exported: int = 0
    presets: list[str] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=list)
    limit: int | None = None
    frequency_recommendation_minutes: int | None = None
    summary_path: str | None = None
    reports: list[ReportPresetArtifact] = Field(default_factory=list)
