from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.market import Market
from app.schemas.backtesting import (
    BacktestingSummaryResponse,
    MarketOutcomeCreate,
    MarketOutcomeRead,
    MarketOutcomesResponse,
    MarketOutcomeUpdate,
)
from app.services.backtesting import (
    build_backtesting_summary,
    delete_market_outcome,
    get_market_outcome_read,
    list_market_outcomes,
    update_market_outcome,
    upsert_market_outcome,
)

router = APIRouter(tags=["backtesting"])


@router.get("/outcomes", response_model=MarketOutcomesResponse)
def get_outcomes(
    limit: int = Query(default=100, ge=0, le=500),
    db: Session = Depends(get_db),
) -> MarketOutcomesResponse:
    return list_market_outcomes(db, limit=limit)


@router.get("/markets/{market_id}/outcome", response_model=MarketOutcomeRead)
def get_market_outcome_endpoint(
    market_id: int,
    db: Session = Depends(get_db),
) -> MarketOutcomeRead:
    market = _require_market(db, market_id)
    outcome = get_market_outcome_read(db, market)
    if outcome is None:
        raise _outcome_not_found(market_id)
    return outcome


@router.post(
    "/markets/{market_id}/outcome",
    response_model=MarketOutcomeRead,
    status_code=status.HTTP_201_CREATED,
)
def post_market_outcome(
    market_id: int,
    payload: MarketOutcomeCreate,
    db: Session = Depends(get_db),
) -> MarketOutcomeRead:
    market = _require_market(db, market_id)
    outcome = upsert_market_outcome(db, market, payload)
    db.commit()
    return outcome


@router.patch("/markets/{market_id}/outcome", response_model=MarketOutcomeRead)
def patch_market_outcome(
    market_id: int,
    payload: MarketOutcomeUpdate,
    db: Session = Depends(get_db),
) -> MarketOutcomeRead:
    market = _require_market(db, market_id)
    outcome = update_market_outcome(db, market, payload)
    if outcome is None:
        raise _outcome_not_found(market_id)
    db.commit()
    return outcome


@router.delete("/markets/{market_id}/outcome", status_code=status.HTTP_204_NO_CONTENT)
def delete_market_outcome_endpoint(
    market_id: int,
    db: Session = Depends(get_db),
) -> Response:
    market = _require_market(db, market_id)
    removed = delete_market_outcome(db, market)
    if not removed:
        raise _outcome_not_found(market_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/backtesting/summary", response_model=BacktestingSummaryResponse)
def get_backtesting_summary(db: Session = Depends(get_db)) -> BacktestingSummaryResponse:
    return build_backtesting_summary(db)


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no encontrado.",
        )
    return market


def _outcome_not_found(market_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Market {market_id} no tiene outcome.",
    )
