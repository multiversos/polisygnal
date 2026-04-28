from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class SourceQualityItem(BaseModel):
    source_id: int
    source_name: str
    provider: str
    source_type: str
    source_url: str | None = None
    findings_count: int = 0
    evidence_count: int = 0
    avg_credibility: Decimal | None = None
    avg_freshness: Decimal | None = None
    avg_impact: Decimal | None = None
    avg_evidence_confidence: Decimal | None = None
    latest_seen_at: datetime | None = None


class SourceQualityResponse(BaseModel):
    generated_at: datetime
    total_sources: int = 0
    items: list[SourceQualityItem] = Field(default_factory=list)
