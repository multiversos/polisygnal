from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SmartAlertSeverity = Literal["info", "warning", "critical"]


class SmartAlertRead(BaseModel):
    id: str
    type: str
    severity: SmartAlertSeverity
    market_id: int | None = None
    title: str
    description: str
    reason: str
    created_from: str
    action_label: str | None = None
    action_url: str | None = None
    data: dict[str, object] = Field(default_factory=dict)


class SmartAlertsResponse(BaseModel):
    generated_at: datetime
    alerts: list[SmartAlertRead] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
