from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.schemas.data_health import (
    DataHealthOverviewRead,
    DataHealthSportCoverage,
    SnapshotGapItemRead,
    SnapshotGapsRead,
)
from app.services.market_freshness import build_market_freshness


@dataclass(slots=True)
class _SportCoverageCounter:
    total: int = 0
    with_snapshot: int = 0
    missing_price: int = 0
    missing_close_time: int = 0


@dataclass(frozen=True, slots=True)
class _LatestSnapshotSummary:
    market_id: int
    captured_at: datetime
    has_yes_price: bool
    has_no_price: bool


def build_data_health_overview(
    db: Session,
    *,
    now: datetime | None = None,
    upcoming_days: int = 7,
) -> DataHealthOverviewRead:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    window_end = current_time + timedelta(days=max(upcoming_days, 0))
    rows = db.execute(
        select(
            Market.id,
            Market.sport_type,
            Market.active,
            Market.closed,
            Market.end_date,
        )
    ).all()
    snapshots = _list_latest_snapshot_summaries(db)
    latest_snapshot_at = db.scalar(select(func.max(MarketSnapshot.captured_at)))

    active_markets = 0
    upcoming_markets_count = 0
    markets_missing_prices = 0
    markets_missing_close_time = 0
    sport_other_count = 0
    coverage_by_sport: dict[str, _SportCoverageCounter] = {}

    for row in rows:
        sport = _normalize_sport(row.sport_type)
        coverage = coverage_by_sport.setdefault(sport, _SportCoverageCounter())
        snapshot = snapshots.get(row.id)
        has_snapshot = snapshot is not None
        missing_price = (
            snapshot is None
            or not snapshot.has_yes_price
            or not snapshot.has_no_price
        )
        missing_close_time = row.end_date is None

        coverage.total += 1
        if has_snapshot:
            coverage.with_snapshot += 1
        if missing_price:
            coverage.missing_price += 1
            markets_missing_prices += 1
        if missing_close_time:
            coverage.missing_close_time += 1
            markets_missing_close_time += 1
        if sport == "other":
            sport_other_count += 1
        if bool(row.active):
            active_markets += 1
        if _is_upcoming(row.active, row.closed, row.end_date, current_time, window_end):
            upcoming_markets_count += 1

    markets_with_snapshots = len(snapshots)
    total_markets = len(rows)
    return DataHealthOverviewRead(
        generated_at=current_time,
        total_markets=total_markets,
        active_markets=active_markets,
        upcoming_markets_count=upcoming_markets_count,
        markets_with_snapshots=markets_with_snapshots,
        markets_missing_snapshots=max(total_markets - markets_with_snapshots, 0),
        markets_missing_prices=markets_missing_prices,
        markets_missing_close_time=markets_missing_close_time,
        sport_other_count=sport_other_count,
        latest_snapshot_at=latest_snapshot_at,
        coverage_by_sport=[
            DataHealthSportCoverage(
                sport=sport,
                total=counter.total,
                with_snapshot=counter.with_snapshot,
                missing_price=counter.missing_price,
                missing_close_time=counter.missing_close_time,
            )
            for sport, counter in sorted(coverage_by_sport.items())
        ],
    )


def build_snapshot_gaps(
    db: Session,
    *,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    now: datetime | None = None,
) -> SnapshotGapsRead:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 0)
    safe_limit = max(min(limit, 200), 0)
    window_end = current_time + timedelta(days=safe_days)
    requested_sport = _normalize_sport(sport) if sport else None

    statement = (
        select(
            Market.id,
            Market.question,
            Market.sport_type,
            Market.end_date,
            Market.active,
            Market.closed,
        )
        .where(Market.active.is_(True))
        .where(Market.closed.is_(False))
        .where(Market.end_date.is_not(None))
        .where(Market.end_date >= current_time)
        .where(Market.end_date <= window_end)
        .order_by(Market.end_date.asc(), Market.id.asc())
        .limit(safe_limit)
    )
    if requested_sport:
        statement = statement.where(func.lower(Market.sport_type) == requested_sport)

    rows = db.execute(statement).all()
    snapshots = _list_latest_snapshot_summaries(db)
    items: list[SnapshotGapItemRead] = []
    missing_snapshot_count = 0
    missing_price_count = 0
    stale_snapshot_count = 0

    for row in rows:
        snapshot = snapshots.get(row.id)
        if snapshot is None:
            missing_snapshot_count += 1
        if snapshot is None or not snapshot.has_yes_price or not snapshot.has_no_price:
            missing_price_count += 1

        freshness = build_market_freshness(
            close_time=row.end_date,
            latest_snapshot=snapshot,
            yes_price=None if snapshot is None or not snapshot.has_yes_price else 1,
            no_price=None if snapshot is None or not snapshot.has_no_price else 1,
            active=bool(row.active),
            closed=bool(row.closed),
            now=current_time,
        )
        if "snapshot_too_old" in freshness.reasons:
            stale_snapshot_count += 1

        items.append(
            SnapshotGapItemRead(
                market_id=row.id,
                title=row.question,
                sport=_normalize_sport(row.sport_type),
                close_time=row.end_date,
                latest_snapshot_at=snapshot.captured_at if snapshot is not None else None,
                has_yes_price=bool(snapshot and snapshot.has_yes_price),
                has_no_price=bool(snapshot and snapshot.has_no_price),
                freshness_status=freshness.freshness_status,
                recommended_action=freshness.recommended_action,
            )
        )

    return SnapshotGapsRead(
        generated_at=current_time,
        sport=requested_sport,
        days=safe_days,
        total_checked=len(rows),
        missing_snapshot_count=missing_snapshot_count,
        missing_price_count=missing_price_count,
        stale_snapshot_count=stale_snapshot_count,
        items=items,
    )


def _normalize_sport(value: str | None) -> str:
    normalized = (value or "other").strip().lower()
    return normalized or "other"


def _list_latest_snapshot_summaries(db: Session) -> dict[int, _LatestSnapshotSummary]:
    ranked_snapshots = (
        select(
            MarketSnapshot.market_id.label("market_id"),
            MarketSnapshot.captured_at.label("captured_at"),
            MarketSnapshot.yes_price.label("yes_price"),
            MarketSnapshot.no_price.label("no_price"),
            func.row_number()
            .over(
                partition_by=MarketSnapshot.market_id,
                order_by=(MarketSnapshot.captured_at.desc(), MarketSnapshot.id.desc()),
            )
            .label("row_number"),
        )
        .subquery()
    )
    rows = db.execute(
        select(
            ranked_snapshots.c.market_id,
            ranked_snapshots.c.captured_at,
            ranked_snapshots.c.yes_price,
            ranked_snapshots.c.no_price,
        ).where(ranked_snapshots.c.row_number == 1)
    ).all()
    return {
        row.market_id: _LatestSnapshotSummary(
            market_id=row.market_id,
            captured_at=row.captured_at,
            has_yes_price=row.yes_price is not None,
            has_no_price=row.no_price is not None,
        )
        for row in rows
    }


def _is_upcoming(
    active: bool,
    closed: bool,
    end_date: datetime | None,
    window_start: datetime,
    window_end: datetime,
) -> bool:
    if not active or closed or end_date is None:
        return False
    normalized_end_date = _normalize_datetime(end_date)
    return window_start <= normalized_end_date <= window_end


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
