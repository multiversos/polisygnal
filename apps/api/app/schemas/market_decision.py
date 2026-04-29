from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MarketDecision = Literal[
    "monitor",
    "investigate_more",
    "ignore",
    "possible_opportunity",
    "dismissed",
    "waiting_for_data",
]

DecisionConfidenceLabel = Literal["low", "medium", "high"]


class MarketDecisionCreate(BaseModel):
    decision: MarketDecision = "monitor"
    note: str | None = Field(default=None, max_length=4000)
    confidence_label: DecisionConfidenceLabel | None = None


class MarketDecisionUpdate(BaseModel):
    decision: MarketDecision | None = None
    note: str | None = Field(default=None, max_length=4000)
    confidence_label: DecisionConfidenceLabel | None = None


class MarketDecisionRead(BaseModel):
    id: int
    market_id: int
    decision: MarketDecision
    note: str | None = None
    confidence_label: DecisionConfidenceLabel | None = None
    created_at: datetime
    updated_at: datetime
    market_question: str
    market_slug: str
    sport: str | None = None
    market_shape: str | None = None
    close_time: datetime | None = None
