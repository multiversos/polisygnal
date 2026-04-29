from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.market_timeline import MarketTimelineRead
from app.services.market_timeline import (
    MarketTimelineMarketNotFoundError,
    get_market_timeline,
)

router = APIRouter(tags=["market-timeline"])


@router.get("/markets/{market_id}/timeline", response_model=MarketTimelineRead)
def read_market_timeline(
    market_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> MarketTimelineRead:
    try:
        return get_market_timeline(db, market_id=market_id, limit=limit)
    except MarketTimelineMarketNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {exc.market_id} no encontrado.",
        ) from exc
