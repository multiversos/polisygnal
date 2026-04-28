from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.tags import MarketTagCreate, MarketTagLinkCreate, MarketTagRead, MarketTagsRead
from app.services.market_tags import (
    MarketTagMarketNotFoundError,
    MarketTagNotFoundError,
    MarketTagPayloadError,
    add_market_tag,
    create_tag,
    get_market_tags,
    list_tags,
    remove_market_tag,
)

router = APIRouter(tags=["tags"])


@router.get("/tags", response_model=list[MarketTagRead])
def get_tags(db: Session = Depends(get_db)) -> list[MarketTagRead]:
    return list_tags(db)


@router.post("/tags", response_model=MarketTagRead, status_code=status.HTTP_201_CREATED)
def post_tag(payload: MarketTagCreate, db: Session = Depends(get_db)) -> MarketTagRead:
    tag = create_tag(db, payload)
    db.commit()
    return MarketTagRead(
        id=tag.id,
        name=tag.name,
        slug=tag.slug,
        color=tag.color,
        tag_type=tag.tag_type,  # type: ignore[arg-type]
        created_at=tag.created_at,
    )


@router.get("/markets/{market_id}/tags", response_model=MarketTagsRead)
def get_market_tag_list(market_id: int, db: Session = Depends(get_db)) -> MarketTagsRead:
    try:
        return get_market_tags(db, market_id)
    except MarketTagMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc


@router.post("/markets/{market_id}/tags", response_model=MarketTagsRead, status_code=status.HTTP_201_CREATED)
def post_market_tag(
    market_id: int,
    payload: MarketTagLinkCreate,
    db: Session = Depends(get_db),
) -> MarketTagsRead:
    try:
        response = add_market_tag(db, market_id, payload)
    except MarketTagMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    except MarketTagNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag {exc.tag_id} no encontrado.",
        ) from exc
    except MarketTagPayloadError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    db.commit()
    return response


@router.delete("/markets/{market_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_market_tag(
    market_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        remove_market_tag(db, market_id, tag_id)
    except MarketTagMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _market_not_found(market_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Market {market_id} no encontrado.",
    )
