from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MarketTimelineItem(BaseModel):
    timestamp: datetime
    type: str
    title: str
    description: str
    source: str
    url: str | None = None
    severity: str | None = None
    status: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class MarketTimelineRead(BaseModel):
    market_id: int
    items: list[MarketTimelineItem]
