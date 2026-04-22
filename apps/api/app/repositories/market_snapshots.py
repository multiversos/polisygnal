from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.market_snapshot import MarketSnapshot


def create_market_snapshot(
    db: Session,
    *,
    market_id: int,
    captured_at: datetime,
    yes_price: Decimal | None,
    no_price: Decimal | None,
    midpoint: Decimal | None,
    last_trade_price: Decimal | None,
    spread: Decimal | None,
    volume: Decimal | None,
    liquidity: Decimal | None,
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market_id,
        captured_at=captured_at,
        yes_price=yes_price,
        no_price=no_price,
        midpoint=midpoint,
        last_trade_price=last_trade_price,
        spread=spread,
        volume=volume,
        liquidity=liquidity,
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def get_latest_market_snapshot(db: Session, market_id: int) -> MarketSnapshot | None:
    stmt = (
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id == market_id)
        .order_by(MarketSnapshot.captured_at.desc(), MarketSnapshot.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def list_latest_market_snapshots_for_markets(
    db: Session,
    market_ids: list[int],
) -> dict[int, MarketSnapshot]:
    if not market_ids:
        return {}

    stmt = (
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id.in_(market_ids))
        .order_by(
            MarketSnapshot.market_id.asc(),
            MarketSnapshot.captured_at.desc(),
            MarketSnapshot.id.desc(),
        )
    )

    snapshots_by_market: dict[int, MarketSnapshot] = {}
    for snapshot in db.scalars(stmt):
        snapshots_by_market.setdefault(snapshot.market_id, snapshot)
    return snapshots_by_market


def list_market_snapshots(
    db: Session,
    *,
    market_id: int,
    limit: int,
    captured_after: datetime | None = None,
    captured_before: datetime | None = None,
) -> list[MarketSnapshot]:
    stmt = select(MarketSnapshot).where(MarketSnapshot.market_id == market_id)
    if captured_after is not None:
        stmt = stmt.where(MarketSnapshot.captured_at >= captured_after)
    if captured_before is not None:
        stmt = stmt.where(MarketSnapshot.captured_at <= captured_before)

    stmt = stmt.order_by(MarketSnapshot.captured_at.desc(), MarketSnapshot.id.desc()).limit(limit)
    return list(db.scalars(stmt).all())
