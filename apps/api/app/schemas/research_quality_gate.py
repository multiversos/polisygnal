from __future__ import annotations

from pydantic import BaseModel, Field


class ResearchQualityGateRead(BaseModel):
    research_run_id: int
    market_id: int
    status: str
    dry_run_command: str
    validation_path: str | None = None
    validation_report: dict[str, object] | None = None
    instructions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
