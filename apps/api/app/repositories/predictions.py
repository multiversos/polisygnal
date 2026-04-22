from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.prediction import Prediction


def create_prediction(
    db: Session,
    *,
    market_id: int,
    run_at: datetime,
    model_version: str,
    yes_probability: Decimal,
    no_probability: Decimal,
    confidence_score: Decimal,
    edge_signed: Decimal,
    edge_magnitude: Decimal,
    edge_class: str,
    opportunity: bool,
    review_confidence: bool,
    review_edge: bool,
    explanation_json: dict[str, object] | list[object],
) -> Prediction:
    prediction = Prediction(
        market_id=market_id,
        run_at=run_at,
        model_version=model_version,
        yes_probability=yes_probability,
        no_probability=no_probability,
        confidence_score=confidence_score,
        edge_signed=edge_signed,
        edge_magnitude=edge_magnitude,
        edge_class=edge_class,
        opportunity=opportunity,
        review_confidence=review_confidence,
        review_edge=review_edge,
        explanation_json=explanation_json,
    )
    db.add(prediction)
    db.flush()
    return prediction


def get_latest_prediction_for_market(
    db: Session,
    market_id: int,
) -> Prediction | None:
    stmt = (
        select(Prediction)
        .where(Prediction.market_id == market_id)
        .order_by(Prediction.run_at.desc(), Prediction.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def list_latest_predictions_for_markets(
    db: Session,
    market_ids: list[int],
) -> dict[int, Prediction]:
    if not market_ids:
        return {}

    stmt = (
        select(Prediction)
        .where(Prediction.market_id.in_(market_ids))
        .order_by(
            Prediction.market_id.asc(),
            Prediction.run_at.desc(),
            Prediction.id.desc(),
        )
    )

    predictions_by_market: dict[int, Prediction] = {}
    for prediction in db.scalars(stmt):
        predictions_by_market.setdefault(prediction.market_id, prediction)
    return predictions_by_market


def list_predictions_for_market(
    db: Session,
    market_id: int,
    *,
    limit: int | None = None,
) -> list[Prediction]:
    stmt = (
        select(Prediction)
        .where(Prediction.market_id == market_id)
        .order_by(Prediction.run_at.desc(), Prediction.id.desc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())
