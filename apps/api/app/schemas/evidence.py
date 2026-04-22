from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class EvidenceSourceSummary(BaseModel):
    id: int
    provider: str
    source_type: str
    external_id: str
    title: str | None = None
    url: str | None = None
    published_at: datetime | None = None
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvidenceItemResponse(BaseModel):
    id: int
    market_id: int
    source_id: int
    provider: str
    evidence_type: str
    stance: str
    strength: Decimal | None = None
    confidence: Decimal | None = None
    summary: str
    high_contradiction: bool
    bookmaker_count: int | None = None
    metadata_json: dict[str, object] | list[object] | None = None
    created_at: datetime
    updated_at: datetime
    source: EvidenceSourceSummary

    model_config = ConfigDict(from_attributes=True)


class MarketReferenceItemResponse(BaseModel):
    provider: str
    source_type: str
    evidence_type: str
    title: str | None = None
    url: str | None = None
    published_at: datetime | None = None
    summary: str
    stance: str
    confidence: Decimal | None = None
    high_contradiction: bool


class MarketReferencesResponse(BaseModel):
    market_id: int
    question: str
    items: list[MarketReferenceItemResponse]
