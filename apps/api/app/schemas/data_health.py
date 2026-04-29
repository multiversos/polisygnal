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


class SnapshotGapItemRead(BaseModel):
    market_id: int
    title: str
    sport: str
    close_time: datetime | None = None
    latest_snapshot_at: datetime | None = None
    has_yes_price: bool = False
    has_no_price: bool = False
    freshness_status: str
    recommended_action: str


class SnapshotGapsRead(BaseModel):
    generated_at: datetime
    sport: str | None = None
    days: int = 7
    total_checked: int = 0
    missing_snapshot_count: int = 0
    missing_price_count: int = 0
    stale_snapshot_count: int = 0
    items: list[SnapshotGapItemRead] = Field(default_factory=list)
