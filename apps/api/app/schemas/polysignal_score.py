from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class PolySignalScoreComponent(BaseModel):
    name: str
    probability: Decimal | None = None
    weight: Decimal | None = None
    adjustment: Decimal | None = None
    confidence: Decimal | None = None
    note: str


class PolySignalScoreRead(BaseModel):
    score_probability: Decimal | None = None
    score_percent: Decimal | None = None
    market_yes_price: Decimal | None = None
    edge_signed: Decimal | None = None
    edge_percent_points: Decimal | None = None
    confidence: Decimal
    confidence_label: str
    source: str
    components: list[PolySignalScoreComponent] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    label: str
    color_hint: str
