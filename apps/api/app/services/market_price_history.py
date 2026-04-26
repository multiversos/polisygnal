from __future__ import annotations

from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.models.market_snapshot import MarketSnapshot
from app.repositories.market_snapshots import list_market_snapshots
from app.schemas.market_price_history import MarketPriceHistoryPoint, MarketPriceHistoryRead


def build_market_price_history(
    db: Session,
    *,
    market_id: int,
    limit: int,
    order: Literal["asc", "desc"] = "asc",
) -> MarketPriceHistoryRead:
    snapshots = list_market_snapshots(db, market_id=market_id, limit=limit)
    chronological = sorted(snapshots, key=lambda snapshot: (snapshot.captured_at, snapshot.id))
    ordered = chronological if order == "asc" else list(reversed(chronological))
    points = [_serialize_history_point(snapshot) for snapshot in ordered]
    first = _serialize_history_point(chronological[0]) if chronological else None
    latest = _serialize_history_point(chronological[-1]) if chronological else None
    change_abs = _calculate_change_abs(first, latest)
    return MarketPriceHistoryRead(
        market_id=market_id,
        points=points,
        latest=latest,
        first=first,
        change_yes_abs=change_abs,
        change_yes_pct=_calculate_change_pct(first, change_abs),
        count=len(points),
    )


def _serialize_history_point(snapshot: MarketSnapshot) -> MarketPriceHistoryPoint:
    return MarketPriceHistoryPoint(
        snapshot_id=snapshot.id,
        yes_price=snapshot.yes_price,
        no_price=snapshot.no_price,
        liquidity=snapshot.liquidity,
        volume=snapshot.volume,
        captured_at=snapshot.captured_at,
    )


def _calculate_change_abs(
    first: MarketPriceHistoryPoint | None,
    latest: MarketPriceHistoryPoint | None,
) -> Decimal | None:
    if first is None or latest is None:
        return None
    if first.yes_price is None or latest.yes_price is None:
        return None
    return latest.yes_price - first.yes_price


def _calculate_change_pct(
    first: MarketPriceHistoryPoint | None,
    change_abs: Decimal | None,
) -> Decimal | None:
    if first is None or first.yes_price is None or change_abs is None:
        return None
    if first.yes_price == Decimal("0"):
        return None
    return change_abs / first.yes_price
