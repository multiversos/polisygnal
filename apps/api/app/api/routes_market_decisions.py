from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.market_decision import (
    MarketDecisionCreate,
    MarketDecisionRead,
    MarketDecisionUpdate,
)
from app.services.market_decisions import (
    MarketDecisionMarketNotFoundError,
    create_market_decision,
    delete_market_decision,
    get_market_decision,
    list_decisions_for_market,
    list_market_decisions,
    serialize_market_decision,
    update_market_decision,
)

router = APIRouter(tags=["market-decisions"])


@router.get("/decisions", response_model=list[MarketDecisionRead])
def get_decisions(
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[MarketDecisionRead]:
    return list_market_decisions(db, limit=limit)


@router.post(
    "/markets/{market_id}/decisions",
    response_model=MarketDecisionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_decision_for_market(
    market_id: int,
    payload: MarketDecisionCreate,
    db: Session = Depends(get_db),
) -> MarketDecisionRead:
    try:
        item = create_market_decision(db, market_id, payload)
    except MarketDecisionMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    db.commit()
    return serialize_market_decision(item)


@router.get("/markets/{market_id}/decisions", response_model=list[MarketDecisionRead])
def get_decisions_for_market(
    market_id: int,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[MarketDecisionRead]:
    try:
        return list_decisions_for_market(db, market_id, limit=limit)
    except MarketDecisionMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc


@router.patch("/decisions/{decision_id}", response_model=MarketDecisionRead)
def patch_decision(
    decision_id: int,
    payload: MarketDecisionUpdate,
    db: Session = Depends(get_db),
) -> MarketDecisionRead:
    item = get_market_decision(db, decision_id)
    if item is None:
        raise _decision_not_found(decision_id)
    item = update_market_decision(db, item, payload)
    db.commit()
    return serialize_market_decision(item)


@router.delete("/decisions/{decision_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_decision(decision_id: int, db: Session = Depends(get_db)) -> Response:
    item = get_market_decision(db, decision_id)
    if item is None:
        raise _decision_not_found(decision_id)
    delete_market_decision(db, item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _market_not_found(market_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Market {market_id} no encontrado.",
    )


def _decision_not_found(decision_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Decision {decision_id} no encontrada.",
    )
