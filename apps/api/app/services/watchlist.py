from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.market import Market
from app.models.watchlist_item import WatchlistItem
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.schemas.watchlist import WatchlistItemCreate, WatchlistItemRead, WatchlistItemUpdate


def list_watchlist_items(db: Session) -> list[WatchlistItemRead]:
    stmt = (
        select(WatchlistItem)
        .options(joinedload(WatchlistItem.market))
        .order_by(WatchlistItem.updated_at.desc(), WatchlistItem.id.desc())
    )
    items = list(db.scalars(stmt).all())
    return _serialize_items(db, items)


def get_watchlist_item(db: Session, item_id: int) -> WatchlistItem | None:
    stmt = (
        select(WatchlistItem)
        .options(joinedload(WatchlistItem.market))
        .where(WatchlistItem.id == item_id)
        .limit(1)
    )
    return db.scalar(stmt)


def get_watchlist_item_by_market(db: Session, market_id: int) -> WatchlistItem | None:
    _require_market(db, market_id)
    stmt = (
        select(WatchlistItem)
        .options(joinedload(WatchlistItem.market))
        .where(WatchlistItem.market_id == market_id)
        .limit(1)
    )
    return db.scalar(stmt)


def add_to_watchlist(db: Session, payload: WatchlistItemCreate) -> WatchlistItem:
    _require_market(db, payload.market_id)
    existing = get_watchlist_item_by_market(db, payload.market_id)
    if existing is not None:
        existing.status = payload.status
        if payload.note is not None:
            existing.note = payload.note
        db.add(existing)
        db.flush()
        return existing

    item = WatchlistItem(
        market_id=payload.market_id,
        status=payload.status,
        note=payload.note,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_watchlist_item(
    db: Session,
    item: WatchlistItem,
    payload: WatchlistItemUpdate,
) -> WatchlistItem:
    if "status" in payload.model_fields_set and payload.status is not None:
        item.status = payload.status
    if "note" in payload.model_fields_set:
        item.note = payload.note
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def remove_from_watchlist(db: Session, item: WatchlistItem) -> None:
    db.delete(item)
    db.flush()


def toggle_watchlist_market(db: Session, market_id: int) -> tuple[WatchlistItem | None, bool]:
    _require_market(db, market_id)
    existing = get_watchlist_item_by_market(db, market_id)
    if existing is not None:
        remove_from_watchlist(db, existing)
        return None, False
    item = add_to_watchlist(db, WatchlistItemCreate(market_id=market_id))
    return item, True


def serialize_watchlist_item(db: Session, item: WatchlistItem) -> WatchlistItemRead:
    return _serialize_items(db, [item])[0]


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise WatchlistMarketNotFoundError(market_id)
    return market


def _serialize_items(db: Session, items: list[WatchlistItem]) -> list[WatchlistItemRead]:
    market_ids = [item.market_id for item in items]
    snapshots_by_market = list_latest_market_snapshots_for_markets(db, market_ids)
    serialized: list[WatchlistItemRead] = []
    for item in items:
        market = item.market
        snapshot = snapshots_by_market.get(item.market_id)
        serialized.append(
            WatchlistItemRead(
                id=item.id,
                market_id=item.market_id,
                status=item.status,  # type: ignore[arg-type]
                note=item.note,
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


class WatchlistMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id
