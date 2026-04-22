from __future__ import annotations

from pydantic import BaseModel, Field


class PolymarketSyncResponse(BaseModel):
    events_created: int = 0
    events_updated: int = 0
    markets_created: int = 0
    markets_updated: int = 0
    events_processed: int = 0
    markets_processed: int = 0
    partial_errors: list[str] = Field(default_factory=list)
