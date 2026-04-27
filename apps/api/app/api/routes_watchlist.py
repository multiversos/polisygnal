from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.watchlist import WatchlistItemCreate, WatchlistItemRead, WatchlistItemUpdate
from app.services.watchlist import (
    WatchlistMarketNotFoundError,
    add_to_watchlist,
    get_watchlist_item,
    get_watchlist_item_by_market,
    list_watchlist_items,
    remove_from_watchlist,
    serialize_watchlist_item,
    toggle_watchlist_market,
    update_watchlist_item,
)

router = APIRouter(tags=["watchlist"])


@router.get("/watchlist", response_model=list[WatchlistItemRead])
def get_watchlist(db: Session = Depends(get_db)) -> list[WatchlistItemRead]:
    return list_watchlist_items(db)


@router.post(
    "/watchlist",
    response_model=WatchlistItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_watchlist_item(
    payload: WatchlistItemCreate,
    db: Session = Depends(get_db),
) -> WatchlistItemRead:
    try:
        item = add_to_watchlist(db, payload)
    except WatchlistMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    db.commit()
    return serialize_watchlist_item(db, item)


@router.get("/watchlist/{item_id}", response_model=WatchlistItemRead)
def read_watchlist_item(
    item_id: int,
    db: Session = Depends(get_db),
) -> WatchlistItemRead:
    item = get_watchlist_item(db, item_id)
    if item is None:
        raise _item_not_found(item_id)
    return serialize_watchlist_item(db, item)


@router.patch("/watchlist/{item_id}", response_model=WatchlistItemRead)
def patch_watchlist_item(
    item_id: int,
    payload: WatchlistItemUpdate,
    db: Session = Depends(get_db),
) -> WatchlistItemRead:
    item = get_watchlist_item(db, item_id)
    if item is None:
        raise _item_not_found(item_id)
    updated = update_watchlist_item(db, item, payload)
    db.commit()
    return serialize_watchlist_item(db, updated)


@router.delete("/watchlist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist_item(
    item_id: int,
    db: Session = Depends(get_db),
) -> Response:
    item = get_watchlist_item(db, item_id)
    if item is None:
        raise _item_not_found(item_id)
    remove_from_watchlist(db, item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/markets/{market_id}/watchlist", response_model=WatchlistItemRead | None)
def get_market_watchlist_item(
    market_id: int,
    db: Session = Depends(get_db),
) -> WatchlistItemRead | None:
    try:
        item = get_watchlist_item_by_market(db, market_id)
    except WatchlistMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    if item is None:
        return None
    return serialize_watchlist_item(db, item)


@router.post("/markets/{market_id}/watchlist/toggle", response_model=WatchlistItemRead | None)
def toggle_market_watchlist_item(
    market_id: int,
    db: Session = Depends(get_db),
) -> WatchlistItemRead | None:
    try:
        item, added = toggle_watchlist_market(db, market_id)
    except WatchlistMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    db.commit()
    if not added or item is None:
        return None
    return serialize_watchlist_item(db, item)


def _market_not_found(market_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Market {market_id} no encontrado.",
    )


def _item_not_found(item_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Watchlist item {item_id} no encontrado.",
    )
