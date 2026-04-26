from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.services.external_market_matching import (
    ExternalMarketMatchEstimate,
    estimate_match_confidence,
)


MATCH_LINK_THRESHOLD = Decimal("0.8000")
MATCH_REVIEW_THRESHOLD = Decimal("0.6000")


@dataclass(slots=True)
class ExternalSignalMatchCandidate:
    market: Market
    estimate: ExternalMarketMatchEstimate


def list_unlinked_external_signals(
    db: Session,
    *,
    source: str | None,
    limit: int,
    signal_id: int | None = None,
) -> list[ExternalMarketSignal]:
    stmt = select(ExternalMarketSignal).order_by(
        ExternalMarketSignal.fetched_at.desc(),
        ExternalMarketSignal.id.desc(),
    )
    if signal_id is not None:
        stmt = stmt.where(ExternalMarketSignal.id == signal_id)
    else:
        stmt = stmt.where(ExternalMarketSignal.polymarket_market_id.is_(None))
    if source:
        stmt = stmt.where(ExternalMarketSignal.source == source)
    stmt = stmt.limit(max(limit, 0))
    return list(db.scalars(stmt).all())


def list_match_candidate_markets(
    db: Session,
    *,
    market_id: int | None = None,
    limit: int = 500,
) -> list[Market]:
    stmt = (
        select(Market)
        .options(joinedload(Market.event))
        .order_by(Market.active.desc(), Market.id.asc())
    )
    if market_id is not None:
        stmt = stmt.where(Market.id == market_id)
    else:
        stmt = stmt.limit(max(limit, 0))
    return list(db.scalars(stmt).unique().all())


def find_external_signal_match_candidates(
    signal: ExternalMarketSignal,
    markets: list[Market],
    *,
    limit: int = 5,
) -> list[ExternalSignalMatchCandidate]:
    candidates = [
        ExternalSignalMatchCandidate(
            market=market,
            estimate=estimate_match_confidence(market, signal),
        )
        for market in markets
    ]
    candidates.sort(
        key=lambda candidate: (
            candidate.estimate.match_confidence,
            -len(candidate.estimate.warnings),
            -candidate.market.id,
        ),
        reverse=True,
    )
    return candidates[: max(limit, 0)]


def apply_external_signal_match(
    db: Session,
    *,
    signal: ExternalMarketSignal,
    candidate: ExternalSignalMatchCandidate,
) -> ExternalMarketSignal:
    signal.polymarket_market_id = candidate.market.id
    signal.match_confidence = candidate.estimate.match_confidence
    signal.match_reason = candidate.estimate.match_reason
    signal.warnings = _merged_warnings(signal.warnings, candidate.estimate.warnings)
    db.flush()
    return signal


def action_for_match(
    confidence: Decimal | None,
    *,
    min_confidence: Decimal = MATCH_LINK_THRESHOLD,
) -> str:
    if confidence is None:
        return "no_match"
    if confidence >= min_confidence:
        return "would_link"
    if confidence >= MATCH_REVIEW_THRESHOLD:
        return "review_required"
    return "no_match"


def _merged_warnings(
    existing: list[object] | dict[str, object] | None,
    new_warnings: list[str],
) -> list[str]:
    merged: list[str] = []
    if isinstance(existing, list):
        merged.extend(str(item) for item in existing if str(item))
    elif isinstance(existing, dict):
        merged.extend(f"{key}: {value}" for key, value in existing.items())
    for warning in new_warnings:
        if warning not in merged:
            merged.append(warning)
    return merged
