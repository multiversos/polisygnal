from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.external_market_signal import ExternalMarketSignal
from app.schemas.external_market_signal import ExternalMarketSignalCreate
from app.schemas.kalshi import KalshiNormalizedMarket


def create_external_market_signal(
    db: Session,
    payload: ExternalMarketSignalCreate,
) -> ExternalMarketSignal:
    duplicate = find_exact_external_market_signal_duplicate(db, payload)
    if duplicate is not None:
        return duplicate

    signal = ExternalMarketSignal(
        source=payload.source,
        source_market_id=payload.source_market_id,
        source_event_id=payload.source_event_id,
        source_ticker=payload.source_ticker,
        polymarket_market_id=payload.polymarket_market_id,
        title=payload.title,
        yes_probability=payload.yes_probability,
        no_probability=payload.no_probability,
        best_yes_bid=payload.best_yes_bid,
        best_yes_ask=payload.best_yes_ask,
        best_no_bid=payload.best_no_bid,
        best_no_ask=payload.best_no_ask,
        mid_price=payload.mid_price,
        last_price=payload.last_price,
        volume=payload.volume,
        liquidity=payload.liquidity,
        open_interest=payload.open_interest,
        spread=payload.spread,
        source_confidence=payload.source_confidence,
        match_confidence=payload.match_confidence,
        match_reason=payload.match_reason,
        warnings=payload.warnings,
        raw_json=payload.raw_json,
        fetched_at=payload.fetched_at or datetime.now(tz=UTC),
    )
    db.add(signal)
    db.flush()
    return signal


def find_exact_external_market_signal_duplicate(
    db: Session,
    payload: ExternalMarketSignalCreate,
) -> ExternalMarketSignal | None:
    if payload.fetched_at is None or not payload.source_ticker:
        return None
    stmt = (
        select(ExternalMarketSignal)
        .where(
            ExternalMarketSignal.source == payload.source,
            ExternalMarketSignal.source_ticker == payload.source_ticker,
            ExternalMarketSignal.fetched_at == payload.fetched_at,
        )
        .limit(1)
    )
    return db.scalar(stmt)


def list_external_market_signals(
    db: Session,
    *,
    source: str | None = None,
    ticker: str | None = None,
    market_id: int | None = None,
    limit: int = 50,
) -> list[ExternalMarketSignal]:
    stmt = select(ExternalMarketSignal).order_by(
        ExternalMarketSignal.fetched_at.desc(),
        ExternalMarketSignal.id.desc(),
    )
    if source:
        stmt = stmt.where(ExternalMarketSignal.source == source)
    if ticker:
        stmt = stmt.where(ExternalMarketSignal.source_ticker == ticker)
    if market_id is not None:
        stmt = stmt.where(ExternalMarketSignal.polymarket_market_id == market_id)
    stmt = stmt.limit(max(limit, 0))
    return list(db.scalars(stmt).all())


def list_external_market_signals_by_source(
    db: Session,
    *,
    source: str,
    limit: int = 50,
) -> list[ExternalMarketSignal]:
    return list_external_market_signals(db, source=source, limit=limit)


def list_external_market_signals_by_ticker(
    db: Session,
    *,
    ticker: str,
    source: str | None = None,
    limit: int = 50,
) -> list[ExternalMarketSignal]:
    return list_external_market_signals(db, source=source, ticker=ticker, limit=limit)


def list_external_market_signals_by_market_id(
    db: Session,
    *,
    market_id: int,
    source: str | None = None,
    limit: int = 50,
) -> list[ExternalMarketSignal]:
    return list_external_market_signals(
        db,
        source=source,
        market_id=market_id,
        limit=limit,
    )


def external_signal_create_from_kalshi_market(
    market: KalshiNormalizedMarket,
    *,
    polymarket_market_id: int | None = None,
    fetched_at: datetime | None = None,
) -> ExternalMarketSignalCreate:
    return ExternalMarketSignalCreate(
        source="kalshi",
        source_market_id=market.source_ticker,
        source_event_id=market.event_ticker,
        source_ticker=market.source_ticker,
        polymarket_market_id=polymarket_market_id,
        title=market.title,
        yes_probability=market.yes_probability,
        no_probability=market.no_probability,
        best_yes_bid=market.yes_bid,
        best_yes_ask=market.yes_ask,
        best_no_bid=market.no_bid,
        best_no_ask=market.no_ask,
        mid_price=market.mid_price,
        last_price=market.last_price,
        volume=market.volume,
        liquidity=market.liquidity,
        open_interest=market.open_interest,
        spread=market.spread,
        source_confidence=market.source_confidence,
        warnings=market.warnings,
        raw_json={
            "normalized_market": market.model_dump(mode="json"),
            "raw_summary": market.raw_summary,
        },
        fetched_at=fetched_at or datetime.now(tz=UTC),
    )
