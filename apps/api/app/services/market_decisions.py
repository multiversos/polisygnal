from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.market import Market
from app.models.market_decision_log import MarketDecisionLog
from app.schemas.market_decision import (
    MarketDecisionCreate,
    MarketDecisionRead,
    MarketDecisionUpdate,
)


def list_market_decisions(db: Session, *, limit: int = 100) -> list[MarketDecisionRead]:
    stmt = (
        select(MarketDecisionLog)
        .options(joinedload(MarketDecisionLog.market))
        .order_by(MarketDecisionLog.created_at.desc(), MarketDecisionLog.id.desc())
        .limit(limit)
    )
    return [_serialize(item) for item in db.scalars(stmt).all()]


def list_decisions_for_market(
    db: Session,
    market_id: int,
    *,
    limit: int = 100,
) -> list[MarketDecisionRead]:
    _require_market(db, market_id)
    stmt = (
        select(MarketDecisionLog)
        .options(joinedload(MarketDecisionLog.market))
        .where(MarketDecisionLog.market_id == market_id)
        .order_by(MarketDecisionLog.created_at.desc(), MarketDecisionLog.id.desc())
        .limit(limit)
    )
    return [_serialize(item) for item in db.scalars(stmt).all()]


def get_market_decision(db: Session, decision_id: int) -> MarketDecisionLog | None:
    stmt = (
        select(MarketDecisionLog)
        .options(joinedload(MarketDecisionLog.market))
        .where(MarketDecisionLog.id == decision_id)
        .limit(1)
    )
    return db.scalar(stmt)


def create_market_decision(
    db: Session,
    market_id: int,
    payload: MarketDecisionCreate,
) -> MarketDecisionLog:
    _require_market(db, market_id)
    item = MarketDecisionLog(
        market_id=market_id,
        decision=payload.decision,
        note=payload.note,
        confidence_label=payload.confidence_label,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_market_decision(
    db: Session,
    item: MarketDecisionLog,
    payload: MarketDecisionUpdate,
) -> MarketDecisionLog:
    if "decision" in payload.model_fields_set and payload.decision is not None:
        item.decision = payload.decision
    if "note" in payload.model_fields_set:
        item.note = payload.note
    if "confidence_label" in payload.model_fields_set:
        item.confidence_label = payload.confidence_label
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def delete_market_decision(db: Session, item: MarketDecisionLog) -> None:
    db.delete(item)
    db.flush()


def serialize_market_decision(item: MarketDecisionLog) -> MarketDecisionRead:
    return _serialize(item)


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise MarketDecisionMarketNotFoundError(market_id)
    return market


def _serialize(item: MarketDecisionLog) -> MarketDecisionRead:
    market = item.market
    return MarketDecisionRead(
        id=item.id,
        market_id=item.market_id,
        decision=item.decision,  # type: ignore[arg-type]
        note=item.note,
        confidence_label=item.confidence_label,  # type: ignore[arg-type]
        created_at=item.created_at,
        updated_at=item.updated_at,
        market_question=market.question,
        market_slug=market.slug,
        sport=market.sport_type,
        market_shape=market.market_type,
        close_time=market.end_date,
    )


class MarketDecisionMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id
