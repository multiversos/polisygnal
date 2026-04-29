from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RefreshRunRead(BaseModel):
    id: int
    refresh_type: str
    mode: str
    status: str
    markets_checked: int = 0
    markets_updated: int = 0
    errors_count: int = 0
    summary_json: dict[str, Any] | None = None
    started_at: datetime
    finished_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RefreshRunsRead(BaseModel):
    items: list[RefreshRunRead] = Field(default_factory=list)
