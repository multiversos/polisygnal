from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.market_outcome import MarketOutcome


def get_market_outcome(
    db: Session,
    market_id: int,
) -> MarketOutcome | None:
    return db.get(MarketOutcome, market_id)


def create_market_outcome(
    db: Session,
    *,
    market_id: int,
    resolved_outcome: str,
    notes: str | None = None,
    resolution_source: str = "manual",
    resolved_at: datetime | None = None,
) -> MarketOutcome:
    outcome = MarketOutcome(
        market_id=market_id,
        resolved_outcome=resolved_outcome,
        resolution_source=resolution_source,
        notes=notes,
        resolved_at=resolved_at or datetime.now(UTC),
    )
    db.add(outcome)
    db.flush()
    return outcome
