from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.external_market_signal import ExternalMarketSignal
from app.schemas.external_market_signal import (
    ExternalMarketSignalsResponse,
    ExternalSignalMatchCandidateRead,
    ExternalSignalMatchCandidatesResponse,
    ExternalSignalMatchThresholds,
)
from app.services.external_market_signal_matching import (
    MATCH_LINK_THRESHOLD,
    MATCH_REVIEW_THRESHOLD,
    action_for_match,
    find_external_signal_match_candidates,
    list_match_candidate_markets,
    list_unlinked_external_signals,
)
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
    "/external-signals/unmatched",
    response_model=ExternalMarketSignalsResponse,
)
def get_unmatched_external_signals(
    source: str | None = Query(default="kalshi"),
    limit: int = Query(default=10, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ExternalMarketSignalsResponse:
    signals = list_unlinked_external_signals(db, source=source, limit=limit)
    return ExternalMarketSignalsResponse(
        count=len(signals),
        limit=limit,
        source=source,
        ticker=None,
        market_id=None,
        signals=signals,
    )


@router.get(
    "/external-signals/{signal_id}/match-candidates",
    response_model=ExternalSignalMatchCandidatesResponse,
)
def get_external_signal_match_candidates(
    signal_id: int,
    limit: int = Query(default=5, ge=1, le=25),
    min_confidence: Decimal | None = Query(default=None, ge=Decimal("0"), le=Decimal("1")),
    db: Session = Depends(get_db),
) -> ExternalSignalMatchCandidatesResponse:
    signal = db.get(ExternalMarketSignal, signal_id)
    if signal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="External signal not found",
        )

    link_threshold = min_confidence if min_confidence is not None else MATCH_LINK_THRESHOLD
    markets = list_match_candidate_markets(db, limit=500)
    candidates = find_external_signal_match_candidates(signal, markets, limit=limit)

    return ExternalSignalMatchCandidatesResponse(
        signal_id=signal.id,
        source=signal.source,
        source_ticker=signal.source_ticker,
        signal_title=signal.title,
        thresholds=ExternalSignalMatchThresholds(
            auto_link=link_threshold,
            review_min=MATCH_REVIEW_THRESHOLD,
        ),
        candidates=[
            ExternalSignalMatchCandidateRead(
                market_id=candidate.market.id,
                market_question=candidate.market.question,
                sport=candidate.market.sport_type,
                market_shape=candidate.market.market_type,
                match_confidence=candidate.estimate.match_confidence,
                match_reason=candidate.estimate.match_reason,
                warnings=candidate.estimate.warnings,
                action=action_for_match(
                    candidate.estimate.match_confidence,
                    min_confidence=link_threshold,
                ),
            )
            for candidate in candidates
        ],
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
