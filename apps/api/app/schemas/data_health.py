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


class RefreshPriorityItemRead(BaseModel):
    market_id: int
    title: str
    sport: str
    close_time: datetime | None = None
    time_window_label: str
    missing_snapshot: bool = False
    missing_price: bool = False
    freshness_status: str
    data_quality_label: str
    refresh_priority_score: int = 0
    reasons: list[str] = Field(default_factory=list)
    suggested_command_snapshot: str
    suggested_command_metadata: str


class RefreshPrioritiesRead(BaseModel):
    generated_at: datetime
    sport: str | None = None
    days: int = 7
    total_considered: int = 0
    returned: int = 0
    missing_snapshot_count: int = 0
    missing_price_count: int = 0
    min_hours_to_close: float | None = None
    filters_applied: dict[str, object | None] = Field(default_factory=dict)
    items: list[RefreshPriorityItemRead] = Field(default_factory=list)
