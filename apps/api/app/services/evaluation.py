from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.market import Market
from app.models.market_outcome import MarketOutcome
from app.models.prediction import DEFAULT_PREDICTION_FAMILY, Prediction
from app.schemas.evaluation import (
    EvaluationHistoryItemResponse,
    EvaluationHistoryResponse,
    EvaluationMarketHistoryItemResponse,
    EvaluationMarketHistoryResponse,
    EvaluationSummaryResponse,
)

PREDICTION_THRESHOLD = Decimal("0.5000")
EVALUATION_HISTORY_DEFAULT_LIMIT = 20


def build_evaluation_summary(db: Session) -> EvaluationSummaryResponse:
    stmt = (
        select(
            Prediction.yes_probability,
            Prediction.opportunity,
            MarketOutcome.resolved_outcome,
            MarketOutcome.resolved_at,
        )
        .select_from(Prediction)
        .outerjoin(MarketOutcome, Prediction.market_id == MarketOutcome.market_id)
        .where(Prediction.prediction_family == DEFAULT_PREDICTION_FAMILY)
    )
    rows = db.execute(stmt).all()

    total_predictions = len(rows)
    evaluable = 0
    cancelled = 0
    pending = 0
    correct_predictions = 0
    opportunity_evaluable = 0
    opportunity_correct = 0
    brier_total = 0.0
    first_resolution: datetime | None = None
    last_resolution: datetime | None = None

    for row in rows:
        resolved_outcome = row.resolved_outcome
        resolved_at = row.resolved_at
        yes_probability = row.yes_probability
        opportunity = bool(row.opportunity)

        if resolved_outcome is None:
            pending += 1
            continue

        first_resolution = _min_datetime(first_resolution, resolved_at)
        last_resolution = _max_datetime(last_resolution, resolved_at)

        if resolved_outcome == "cancelled":
            cancelled += 1
            continue
        if resolved_outcome not in {"yes", "no"}:
            pending += 1
            continue

        evaluable += 1
        actual_outcome = _prediction_actual_outcome(resolved_outcome)
        assert actual_outcome is not None
        is_correct = _prediction_was_correct(yes_probability, resolved_outcome)
        assert is_correct is not None
        if is_correct:
            correct_predictions += 1
        if opportunity:
            opportunity_evaluable += 1
            if is_correct:
                opportunity_correct += 1

        brier_component = _prediction_brier_component(yes_probability, resolved_outcome)
        assert brier_component is not None
        brier_total += brier_component

    return EvaluationSummaryResponse(
        accuracy=_safe_ratio(correct_predictions, evaluable),
        opportunity_accuracy=_safe_ratio(opportunity_correct, opportunity_evaluable),
        brier_score=(round(brier_total / evaluable, 4) if evaluable > 0 else None),
        total_predictions=total_predictions,
        evaluable=evaluable,
        cancelled=cancelled,
        pending=pending,
        first_resolution=first_resolution,
        last_resolution=last_resolution,
    )


def build_evaluation_history(
    db: Session,
    *,
    limit: int = EVALUATION_HISTORY_DEFAULT_LIMIT,
) -> EvaluationHistoryResponse:
    stmt = (
        select(
            Prediction.market_id,
            Market.question,
            Prediction.id.label("prediction_id"),
            Prediction.run_at,
            MarketOutcome.resolved_at,
            MarketOutcome.resolved_outcome,
            Prediction.yes_probability,
            Prediction.no_probability,
            Prediction.opportunity,
        )
        .select_from(Prediction)
        .join(MarketOutcome, Prediction.market_id == MarketOutcome.market_id)
        .join(Market, Prediction.market_id == Market.id)
        .where(Prediction.prediction_family == DEFAULT_PREDICTION_FAMILY)
        .order_by(
            MarketOutcome.resolved_at.desc(),
            Prediction.run_at.desc(),
            Prediction.id.desc(),
        )
        .limit(limit)
    )
    rows = db.execute(stmt).all()

    return EvaluationHistoryResponse(
        limit=limit,
        items=[
            EvaluationHistoryItemResponse(
                market_id=row.market_id,
                question=row.question,
                detail_path=f"/evaluation/history/{row.market_id}",
                prediction_id=row.prediction_id,
                run_at=row.run_at,
                resolved_at=row.resolved_at,
                resolved_outcome=row.resolved_outcome,
                yes_probability=row.yes_probability,
                no_probability=row.no_probability,
                opportunity=bool(row.opportunity),
                was_correct=_prediction_was_correct(
                    row.yes_probability,
                    row.resolved_outcome,
                ),
                brier_component=_prediction_brier_component(
                    row.yes_probability,
                    row.resolved_outcome,
                ),
            )
            for row in rows
        ],
    )


def build_evaluation_market_history(
    db: Session,
    *,
    market_id: int,
    question: str,
    resolved_outcome: str,
    resolved_at: datetime,
) -> EvaluationMarketHistoryResponse:
    stmt = (
        select(
            Prediction.id.label("prediction_id"),
            Prediction.run_at,
            Prediction.yes_probability,
            Prediction.no_probability,
            Prediction.confidence_score,
            Prediction.edge_magnitude,
            Prediction.opportunity,
        )
        .select_from(Prediction)
        .join(MarketOutcome, Prediction.market_id == MarketOutcome.market_id)
        .join(Market, Prediction.market_id == Market.id)
        .where(
            Prediction.market_id == market_id,
            Prediction.prediction_family == DEFAULT_PREDICTION_FAMILY,
        )
        .order_by(Prediction.run_at.asc(), Prediction.id.asc())
    )
    rows = db.execute(stmt).all()

    return EvaluationMarketHistoryResponse(
        market_id=market_id,
        question=question,
        resolved_outcome=resolved_outcome,
        resolved_at=resolved_at,
        items=[
            EvaluationMarketHistoryItemResponse(
                prediction_id=row.prediction_id,
                run_at=row.run_at,
                yes_probability=row.yes_probability,
                no_probability=row.no_probability,
                confidence_score=row.confidence_score,
                edge_magnitude=row.edge_magnitude,
                opportunity=bool(row.opportunity),
                was_correct=_prediction_was_correct(
                    row.yes_probability,
                    resolved_outcome,
                ),
                brier_component=_prediction_brier_component(
                    row.yes_probability,
                    resolved_outcome,
                ),
            )
            for row in rows
        ],
    )


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def _min_datetime(
    left: datetime | None,
    right: datetime | None,
) -> datetime | None:
    if right is None:
        return left
    if left is None or right < left:
        return right
    return left


def _max_datetime(
    left: datetime | None,
    right: datetime | None,
) -> datetime | None:
    if right is None:
        return left
    if left is None or right > left:
        return right
    return left


def _prediction_actual_outcome(resolved_outcome: str | None) -> float | None:
    if resolved_outcome == "yes":
        return 1.0
    if resolved_outcome == "no":
        return 0.0
    return None


def _prediction_was_correct(
    yes_probability: Decimal,
    resolved_outcome: str | None,
) -> bool | None:
    actual_outcome = _prediction_actual_outcome(resolved_outcome)
    if actual_outcome is None:
        return None
    predicted_yes = yes_probability >= PREDICTION_THRESHOLD
    return (
        (predicted_yes and actual_outcome == 1.0)
        or (not predicted_yes and actual_outcome == 0.0)
    )


def _prediction_brier_component(
    yes_probability: Decimal,
    resolved_outcome: str | None,
) -> float | None:
    actual_outcome = _prediction_actual_outcome(resolved_outcome)
    if actual_outcome is None:
        return None
    return round((float(yes_probability) - actual_outcome) ** 2, 4)
