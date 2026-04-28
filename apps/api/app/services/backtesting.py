from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.market import Market
from app.models.market_outcome import MarketOutcome
from app.models.prediction import Prediction
from app.schemas.backtesting import (
    BacktestingFamilySummary,
    BacktestingSummaryResponse,
    MarketOutcomeCreate,
    MarketOutcomeRead,
    MarketOutcomesResponse,
    MarketOutcomeUpdate,
)


def list_market_outcomes(db: Session, *, limit: int = 100) -> MarketOutcomesResponse:
    safe_limit = max(limit, 0)
    rows = db.execute(
        select(MarketOutcome, Market.question)
        .join(Market, MarketOutcome.market_id == Market.id)
        .order_by(MarketOutcome.resolved_at.desc(), MarketOutcome.market_id.desc())
        .limit(safe_limit)
    ).all()
    return MarketOutcomesResponse(
        total_count=len(rows),
        items=[_serialize_outcome(outcome, question) for outcome, question in rows],
    )


def get_market_outcome_read(db: Session, market: Market) -> MarketOutcomeRead | None:
    outcome = db.get(MarketOutcome, market.id)
    if outcome is None:
        return None
    return _serialize_outcome(outcome, market.question)


def upsert_market_outcome(
    db: Session,
    market: Market,
    payload: MarketOutcomeCreate,
) -> MarketOutcomeRead:
    outcome = db.get(MarketOutcome, market.id)
    if outcome is None:
        outcome = MarketOutcome(
            market_id=market.id,
            resolved_outcome=payload.resolved_outcome,
            resolution_source=payload.source or "manual",
            notes=payload.notes,
            resolved_at=payload.resolved_at or datetime.now(tz=UTC),
        )
    else:
        outcome.resolved_outcome = payload.resolved_outcome
        outcome.resolution_source = payload.source or outcome.resolution_source
        outcome.notes = payload.notes
        outcome.resolved_at = payload.resolved_at or outcome.resolved_at
    db.add(outcome)
    db.flush()
    return _serialize_outcome(outcome, market.question)


def update_market_outcome(
    db: Session,
    market: Market,
    payload: MarketOutcomeUpdate,
) -> MarketOutcomeRead | None:
    outcome = db.get(MarketOutcome, market.id)
    if outcome is None:
        return None
    if payload.resolved_outcome is not None:
        outcome.resolved_outcome = payload.resolved_outcome
    if "source" in payload.model_fields_set and payload.source is not None:
        outcome.resolution_source = payload.source
    if "notes" in payload.model_fields_set:
        outcome.notes = payload.notes
    if "resolved_at" in payload.model_fields_set and payload.resolved_at is not None:
        outcome.resolved_at = payload.resolved_at
    db.add(outcome)
    db.flush()
    return _serialize_outcome(outcome, market.question)


def delete_market_outcome(db: Session, market: Market) -> bool:
    outcome = db.get(MarketOutcome, market.id)
    if outcome is None:
        return False
    db.delete(outcome)
    db.flush()
    return True


def build_backtesting_summary(db: Session) -> BacktestingSummaryResponse:
    rows = db.execute(
        select(
            Prediction.prediction_family,
            Prediction.yes_probability,
            Prediction.confidence_score,
            MarketOutcome.resolved_outcome,
        )
        .select_from(Prediction)
        .join(MarketOutcome, Prediction.market_id == MarketOutcome.market_id)
        .where(MarketOutcome.resolved_outcome.in_(["yes", "no"]))
    ).all()

    family_rows: dict[str, list[tuple[Decimal, Decimal, str]]] = {}
    all_rows: list[tuple[Decimal, Decimal, str]] = []
    for row in rows:
        item = (row.yes_probability, row.confidence_score, row.resolved_outcome)
        all_rows.append(item)
        family_rows.setdefault(row.prediction_family, []).append(item)

    return BacktestingSummaryResponse(
        generated_at=datetime.now(tz=UTC),
        **_summarize_rows(all_rows),
        by_prediction_family=[
            BacktestingFamilySummary(
                prediction_family=family,
                **_summarize_rows(items),
            )
            for family, items in sorted(family_rows.items())
        ],
    )


def _serialize_outcome(outcome: MarketOutcome, question: str) -> MarketOutcomeRead:
    return MarketOutcomeRead(
        market_id=outcome.market_id,
        question=question,
        resolved_outcome=outcome.resolved_outcome,  # type: ignore[arg-type]
        resolved_at=outcome.resolved_at,
        source=outcome.resolution_source,
        notes=outcome.notes,
    )


def _summarize_rows(rows: list[tuple[Decimal, Decimal, str]]) -> dict[str, object]:
    total = len(rows)
    if total == 0:
        return {
            "total_resolved_with_predictions": 0,
            "correct_direction_count": 0,
            "accuracy_direction": None,
            "avg_confidence": None,
            "brier_score": None,
        }

    correct = 0
    confidence_total = Decimal("0")
    brier_total = Decimal("0")
    for yes_probability, confidence_score, resolved_outcome in rows:
        actual = Decimal("1") if resolved_outcome == "yes" else Decimal("0")
        predicted_yes = yes_probability >= Decimal("0.5000")
        if (predicted_yes and actual == Decimal("1")) or (
            not predicted_yes and actual == Decimal("0")
        ):
            correct += 1
        confidence_total += confidence_score
        brier_total += (yes_probability - actual) ** 2

    return {
        "total_resolved_with_predictions": total,
        "correct_direction_count": correct,
        "accuracy_direction": _quantize(Decimal(correct) / Decimal(total)),
        "avg_confidence": _quantize(confidence_total / Decimal(total)),
        "brier_score": _quantize(brier_total / Decimal(total)),
    }


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"))
