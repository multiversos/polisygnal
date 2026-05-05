from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


DiscoveryStatus = Literal[
    "already_local_ready",
    "already_local_missing_snapshot",
    "missing_local_market",
    "remote_missing_price",
    "unsupported",
]


class LiveUpcomingDiscoverySummary(BaseModel):
    total_remote_checked: int = 0
    already_local_count: int = 0
    missing_local_count: int = 0
    local_missing_snapshot_count: int = 0
    remote_with_price_count: int = 0
    remote_missing_price_count: int = 0
    remote_with_condition_id_count: int = 0
    remote_with_clob_token_ids_count: int = 0


class LiveUpcomingDiscoveryItem(BaseModel):
    remote_id: str | None = None
    local_market_id: int | None = None
    title: str
    question: str
    event_title: str | None = None
    sport: str
    market_shape: str
    close_time: datetime | None = None
    active: bool | None = None
    closed: bool | None = None
    has_local_market: bool
    has_local_snapshot: bool
    has_local_price: bool
    has_remote_price: bool
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    condition_id: str | None = None
    clob_token_ids: list[str] = Field(default_factory=list)
    market_slug: str | None = None
    event_slug: str | None = None
    discovery_status: DiscoveryStatus
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class LiveUpcomingEventMarketSummary(BaseModel):
    remote_id: str | None = None
    title: str
    market_shape: str
    discovery_status: DiscoveryStatus
    has_remote_price: bool
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    market_slug: str | None = None
    reasons: list[str] = Field(default_factory=list)


class LiveUpcomingEventGroup(BaseModel):
    event_slug: str
    event_title: str | None = None
    league: str | None = None
    close_time: datetime | None = None
    teams: list[str] = Field(default_factory=list)
    has_draw_market: bool = False
    total_markets: int = 0
    main_markets: list[LiveUpcomingEventMarketSummary] = Field(default_factory=list)
    secondary_markets_count: int = 0
    market_shape_counts: dict[str, int] = Field(default_factory=dict)
    status_counts: dict[str, int] = Field(default_factory=dict)
    skip_reasons_count: dict[str, int] = Field(default_factory=dict)
    liquidity: Decimal | None = None
    volume: Decimal | None = None


class LiveUpcomingDiscoveryResponse(BaseModel):
    generated_at: datetime
    summary: LiveUpcomingDiscoverySummary
    items: list[LiveUpcomingDiscoveryItem] = Field(default_factory=list)
    event_groups: list[LiveUpcomingEventGroup] = Field(default_factory=list)
    filters_applied: dict[str, object | None] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
