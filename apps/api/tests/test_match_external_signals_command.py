from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.match_external_signals import _run, build_parser
from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_match_external_signals_parser_defaults_to_dry_run() -> None:
    parser = build_parser()

    args = parser.parse_args(["--source", "kalshi", "--limit", "5", "--json"])

    assert args.source == "kalshi"
    assert args.limit == 5
    assert args.apply is False
    assert args.dry_run is False
    assert args.json is True


def test_match_external_signals_dry_run_does_not_update_db(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="dry-run",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    signal = _create_signal(
        db_session,
        title="Boston Celtics NBA Championship 2026",
        source_ticker="KXNBAFINAL-26CELTICS-CELTICS",
    )
    db_session.commit()

    payload = _run(_args(limit=5), db_session, min_confidence=Decimal("0.8000"))
    db_session.refresh(signal)

    assert payload["dry_run"] is True
    assert payload["links_applied"] == 0
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["trading_executed"] is False
    assert payload["results"][0]["action"] == "would_link"
    assert payload["results"][0]["proposed_market_id"] == market.id
    assert signal.polymarket_market_id is None


def test_match_external_signals_apply_links_only_above_threshold(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="apply",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    signal = _create_signal(
        db_session,
        title="Boston Celtics NBA Championship 2026",
        source_ticker="KXNBAFINAL-26CELTICS-CELTICS",
    )
    db_session.commit()

    payload = _run(
        _args(limit=5, apply=True),
        db_session,
        min_confidence=Decimal("0.8000"),
    )
    db_session.commit()
    db_session.refresh(signal)

    assert payload["dry_run"] is False
    assert payload["links_applied"] == 1
    assert payload["results"][0]["action"] == "linked"
    assert signal.polymarket_market_id == market.id
    assert signal.match_confidence is not None
    assert signal.match_confidence >= Decimal("0.8000")
    assert signal.match_reason is not None
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def test_match_external_signals_apply_skips_below_threshold(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="low",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    signal = _create_signal(
        db_session,
        title="Lakers vs Warriors",
        source_ticker="KXNBAGAME-LAL-GSW",
    )
    db_session.commit()

    payload = _run(
        _args(limit=5, apply=True),
        db_session,
        min_confidence=Decimal("0.8000"),
    )
    db_session.commit()
    db_session.refresh(signal)

    assert payload["links_applied"] == 0
    assert payload["results"][0]["action"] == "no_match"
    assert payload["results"][0]["proposed_market_id"] == market.id
    assert signal.polymarket_market_id is None


def test_match_external_signals_filters_by_signal_and_market_id(db_session: Session) -> None:
    celtics = _create_market(
        db_session,
        suffix="filter-celtics",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    lakers = _create_market(
        db_session,
        suffix="filter-lakers",
        question="Will the Lakers beat the Warriors?",
    )
    signal_one = _create_signal(
        db_session,
        title="Boston Celtics NBA Championship 2026",
        source_ticker="KXNBAFINAL-26CELTICS-CELTICS",
    )
    _create_signal(
        db_session,
        title="Lakers vs Warriors",
        source_ticker="KXNBAGAME-LAL-GSW",
    )
    db_session.commit()

    payload = _run(
        _args(limit=10, signal_id=signal_one.id, market_id=lakers.id),
        db_session,
        min_confidence=Decimal("0.8000"),
    )

    assert payload["signals_considered"] == 1
    assert payload["candidate_markets_considered"] == 1
    assert payload["results"][0]["proposed_market_id"] == lakers.id
    assert payload["results"][0]["proposed_market_id"] != celtics.id


def test_match_external_signals_json_payload_is_serializable(db_session: Session) -> None:
    _create_market(
        db_session,
        suffix="json",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    _create_signal(
        db_session,
        title="Boston Celtics NBA Championship 2026",
        source_ticker="KXNBAFINAL-26CELTICS-CELTICS",
    )
    db_session.commit()

    payload = _run(_args(limit=5), db_session, min_confidence=Decimal("0.8000"))

    encoded = json.dumps(payload)
    assert "KXNBAFINAL-26CELTICS-CELTICS" in encoded


def _create_market(db_session: Session, *, suffix: str, question: str) -> Market:
    event = Event(
        polymarket_event_id=f"match-command-event-{suffix}",
        title="NBA Finals 2026",
        category="sports",
        slug=f"match-command-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"match-command-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"match-command-market-{suffix}",
        sport_type="nba",
        market_type="championship" if "Finals" in question else "match_winner",
        active=True,
        closed=False,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_signal(
    db_session: Session,
    *,
    title: str,
    source_ticker: str,
) -> ExternalMarketSignal:
    signal = ExternalMarketSignal(
        source="kalshi",
        source_market_id=source_ticker,
        source_event_id=source_ticker.rsplit("-", 1)[0],
        source_ticker=source_ticker,
        polymarket_market_id=None,
        title=title,
        yes_probability=Decimal("0.5000"),
        no_probability=Decimal("0.5000"),
        mid_price=Decimal("0.5000"),
        spread=Decimal("0.0200"),
        source_confidence=Decimal("0.8000"),
        warnings=[],
        fetched_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
    )
    db_session.add(signal)
    db_session.flush()
    return signal


def _args(
    *,
    limit: int,
    apply: bool = False,
    signal_id: int | None = None,
    market_id: int | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(
        source="kalshi",
        limit=limit,
        min_confidence="0.8000",
        dry_run=False,
        apply=apply,
        signal_id=signal_id,
        market_id=market_id,
        json=True,
    )
