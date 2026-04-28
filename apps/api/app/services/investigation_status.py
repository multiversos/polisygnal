from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.market import Market
from app.models.market_investigation_status import MarketInvestigationStatus
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.schemas.investigation_status import (
    InvestigationStatusCreate,
    InvestigationStatusRead,
    InvestigationStatusUpdate,
)


def list_investigation_statuses(db: Session) -> list[InvestigationStatusRead]:
    stmt = (
        select(MarketInvestigationStatus)
        .options(joinedload(MarketInvestigationStatus.market))
        .order_by(
            MarketInvestigationStatus.priority.asc().nullslast(),
            MarketInvestigationStatus.updated_at.desc(),
            MarketInvestigationStatus.id.desc(),
        )
    )
    items = list(db.scalars(stmt).all())
    return _serialize_items(db, items)


def get_investigation_status_by_market(
    db: Session,
    market_id: int,
) -> MarketInvestigationStatus | None:
    _require_market(db, market_id)
    stmt = (
        select(MarketInvestigationStatus)
        .options(joinedload(MarketInvestigationStatus.market))
        .where(MarketInvestigationStatus.market_id == market_id)
        .limit(1)
    )
    return db.scalar(stmt)


def upsert_investigation_status(
    db: Session,
    market_id: int,
    payload: InvestigationStatusCreate,
) -> MarketInvestigationStatus:
    _require_market(db, market_id)
    existing = get_investigation_status_by_market(db, market_id)
    if existing is not None:
        existing.status = payload.status
        if "note" in payload.model_fields_set:
            existing.note = payload.note
        if "priority" in payload.model_fields_set:
            existing.priority = payload.priority
        db.add(existing)
        db.flush()
        db.refresh(existing)
        return existing

    item = MarketInvestigationStatus(
        market_id=market_id,
        status=payload.status,
        note=payload.note,
        priority=payload.priority,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_investigation_status(
    db: Session,
    item: MarketInvestigationStatus,
    payload: InvestigationStatusUpdate,
) -> MarketInvestigationStatus:
    if "status" in payload.model_fields_set and payload.status is not None:
        item.status = payload.status
    if "note" in payload.model_fields_set:
        item.note = payload.note
    if "priority" in payload.model_fields_set:
        item.priority = payload.priority
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def delete_investigation_status(db: Session, item: MarketInvestigationStatus) -> None:
    db.delete(item)
    db.flush()


def serialize_investigation_status(
    db: Session,
    item: MarketInvestigationStatus,
) -> InvestigationStatusRead:
    return _serialize_items(db, [item])[0]


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise InvestigationMarketNotFoundError(market_id)
    return market


def _serialize_items(
    db: Session,
    items: list[MarketInvestigationStatus],
) -> list[InvestigationStatusRead]:
    market_ids = [item.market_id for item in items]
    snapshots_by_market = list_latest_market_snapshots_for_markets(db, market_ids)
    serialized: list[InvestigationStatusRead] = []
    for item in items:
        market = item.market
        snapshot = snapshots_by_market.get(item.market_id)
        serialized.append(
            InvestigationStatusRead(
                id=item.id,
                market_id=item.market_id,
                status=item.status,  # type: ignore[arg-type]
                note=item.note,
                priority=item.priority,
                created_at=item.created_at,
                updated_at=item.updated_at,
                market_question=market.question,
                market_slug=market.slug,
                sport=market.sport_type,
                market_shape=market.market_type,
                close_time=market.end_date,
                active=market.active,
                closed=market.closed,
                latest_yes_price=snapshot.yes_price if snapshot is not None else None,
                latest_no_price=snapshot.no_price if snapshot is not None else None,
                liquidity=snapshot.liquidity if snapshot is not None else None,
                volume=snapshot.volume if snapshot is not None else None,
            )
        )
    return serialized


class InvestigationMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id
