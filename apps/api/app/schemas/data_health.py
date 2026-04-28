from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DataHealthSportCoverage(BaseModel):
    sport: str
    total: int = 0
    with_snapshot: int = 0
    missing_price: int = 0
    missing_close_time: int = 0


class DataHealthOverviewRead(BaseModel):
    generated_at: datetime
    total_markets: int = 0
    active_markets: int = 0
    upcoming_markets_count: int = 0
    markets_with_snapshots: int = 0
    markets_missing_snapshots: int = 0
    markets_missing_prices: int = 0
    markets_missing_close_time: int = 0
    sport_other_count: int = 0
    latest_snapshot_at: datetime | None = None
    coverage_by_sport: list[DataHealthSportCoverage] = Field(default_factory=list)
