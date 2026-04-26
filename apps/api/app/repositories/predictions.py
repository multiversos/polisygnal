from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.prediction import DEFAULT_PREDICTION_FAMILY, Prediction


def create_prediction(
    db: Session,
    *,
    market_id: int,
    run_at: datetime,
    model_version: str,
    prediction_family: str = DEFAULT_PREDICTION_FAMILY,
    research_run_id: int | None = None,
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
    components_json: dict[str, object] | list[object] | None = None,
) -> Prediction:
    prediction = Prediction(
        market_id=market_id,
        run_at=run_at,
        model_version=model_version,
        prediction_family=prediction_family,
        research_run_id=research_run_id,
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
        components_json=components_json,
    )
    db.add(prediction)
    db.flush()
    return prediction


def get_latest_prediction_for_market(
    db: Session,
    market_id: int,
    *,
    prediction_family: str | None = DEFAULT_PREDICTION_FAMILY,
) -> Prediction | None:
    stmt = select(Prediction).where(Prediction.market_id == market_id)
    stmt = _apply_prediction_family_filter(stmt, prediction_family)
    stmt = stmt.order_by(Prediction.run_at.desc(), Prediction.id.desc()).limit(1)
    return db.scalar(stmt)


def list_latest_predictions_for_markets(
    db: Session,
    market_ids: list[int],
    *,
    prediction_family: str | None = DEFAULT_PREDICTION_FAMILY,
) -> dict[int, Prediction]:
    if not market_ids:
        return {}

    stmt = select(Prediction).where(Prediction.market_id.in_(market_ids))
    stmt = _apply_prediction_family_filter(stmt, prediction_family)
    stmt = stmt.order_by(
        Prediction.market_id.asc(),
        Prediction.run_at.desc(),
        Prediction.id.desc(),
    )

    predictions_by_market: dict[int, Prediction] = {}
    for prediction in db.scalars(stmt):
        predictions_by_market.setdefault(prediction.market_id, prediction)
    return predictions_by_market


def list_predictions_for_market(
    db: Session,
    market_id: int,
    *,
    prediction_family: str | None = DEFAULT_PREDICTION_FAMILY,
    limit: int | None = None,
) -> list[Prediction]:
    stmt = select(Prediction).where(Prediction.market_id == market_id)
    stmt = _apply_prediction_family_filter(stmt, prediction_family)
    stmt = stmt.order_by(Prediction.run_at.desc(), Prediction.id.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())


def get_latest_prediction_for_research_run(
    db: Session,
    research_run_id: int,
) -> Prediction | None:
    stmt = (
        select(Prediction)
        .where(Prediction.research_run_id == research_run_id)
        .order_by(Prediction.run_at.desc(), Prediction.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def _apply_prediction_family_filter(
    stmt: object,
    prediction_family: str | None,
) -> object:
    if prediction_family is None:
        return stmt
    return stmt.where(Prediction.prediction_family == prediction_family)
