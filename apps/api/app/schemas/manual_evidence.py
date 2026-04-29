from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


ManualEvidenceStance = Literal["favor_yes", "against_yes", "neutral", "risk"]
ManualEvidenceReviewStatus = Literal["pending_review", "reviewed", "rejected"]


class ManualEvidenceCreate(BaseModel):
    source_name: str = Field(min_length=1, max_length=256)
    source_url: HttpUrl | None = None
    title: str | None = Field(default=None, max_length=512)
    claim: str = Field(min_length=1)
    stance: ManualEvidenceStance
    evidence_type: str | None = Field(default=None, max_length=64)
    credibility_score: Decimal | None = Field(default=None, ge=0, le=1)
    notes: str | None = None


class ManualEvidenceUpdate(BaseModel):
    source_name: str | None = Field(default=None, min_length=1, max_length=256)
    source_url: HttpUrl | None = None
    title: str | None = Field(default=None, max_length=512)
    claim: str | None = Field(default=None, min_length=1)
    stance: ManualEvidenceStance | None = None
    evidence_type: str | None = Field(default=None, max_length=64)
    credibility_score: Decimal | None = Field(default=None, ge=0, le=1)
    notes: str | None = None
    review_status: ManualEvidenceReviewStatus | None = None


class ManualEvidenceRead(BaseModel):
    id: int
    market_id: int
    source_name: str
    source_url: str | None = None
    title: str | None = None
    claim: str
    stance: str
    evidence_type: str | None = None
    credibility_score: Decimal | None = None
    notes: str | None = None
    review_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManualEvidenceDashboardItem(ManualEvidenceRead):
    market_question: str | None = None
    market_slug: str | None = None
    sport: str | None = None
    market_shape: str | None = None


class ManualEvidenceListResponse(BaseModel):
    items: list[ManualEvidenceDashboardItem]
    count: int
