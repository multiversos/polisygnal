from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.external_market_signal import ExternalMarketSignalsResponse
from app.services.external_market_signals import list_external_market_signals

router = APIRouter(tags=["external-signals"])


@router.get(
    "/external-signals",
    response_model=ExternalMarketSignalsResponse,
)
def get_external_signals(
    source: str | None = Query(default=None),
    ticker: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ExternalMarketSignalsResponse:
    signals = list_external_market_signals(
        db,
        source=source,
        ticker=ticker,
        limit=limit,
    )
    return ExternalMarketSignalsResponse(
        count=len(signals),
        limit=limit,
        source=source,
        ticker=ticker,
        market_id=None,
        signals=signals,
    )


@router.get(
    "/external-signals/kalshi",
    response_model=ExternalMarketSignalsResponse,
)
def get_kalshi_external_signals(
    ticker: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ExternalMarketSignalsResponse:
    signals = list_external_market_signals(
        db,
        source="kalshi",
        ticker=ticker,
        limit=limit,
    )
    return ExternalMarketSignalsResponse(
        count=len(signals),
        limit=limit,
        source="kalshi",
        ticker=ticker,
        market_id=None,
        signals=signals,
    )


@router.get(
    "/markets/{market_id}/external-signals",
    response_model=ExternalMarketSignalsResponse,
)
def get_market_external_signals(
    market_id: int,
    source: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ExternalMarketSignalsResponse:
    signals = list_external_market_signals(
        db,
        source=source,
        market_id=market_id,
        limit=limit,
    )
    return ExternalMarketSignalsResponse(
        count=len(signals),
        limit=limit,
        source=source,
        ticker=None,
        market_id=market_id,
        signals=signals,
    )
