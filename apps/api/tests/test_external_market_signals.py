from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.kalshi import KalshiMarketPayload, KalshiMarketsPage
from app.commands.fetch_kalshi_signals import build_parser, _run
from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.schemas.external_market_signal import ExternalMarketSignalCreate
from app.services.external_market_signals import (
    create_external_market_signal,
    external_signal_create_from_kalshi_market,
    list_external_market_signals,
    list_external_market_signals_by_market_id,
    list_external_market_signals_by_source,
    list_external_market_signals_by_ticker,
)
from app.services.kalshi_market_signals import normalize_kalshi_market

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "kalshi"


class FakeKalshiClient:
    def __init__(self) -> None:
        self.trading_called = False

    def list_markets(
        self,
        *,
        limit: int,
        status: str | None,
        query: str | None = None,
        cursor: str | None = None,
    ) -> KalshiMarketsPage:
        raw = _fixture("markets_list.json")
        markets = [
            KalshiMarketPayload.model_validate(item)
            for item in raw["markets"][:limit]
            if query is None or query.lower() in json.dumps(item).lower()
        ]
        return KalshiMarketsPage(markets=markets, cursor=None, errors=[])

    def get_market(self, ticker: str) -> KalshiMarketPayload:
        payload = _fixture("market_open_with_bid_ask.json")["market"]
        return KalshiMarketPayload.model_validate({**payload, "ticker": ticker})


def test_external_market_signal_model_schema_and_service_filters(db_session: Session) -> None:
    market = _create_market(db_session)
    payload = ExternalMarketSignalCreate(
        source="kalshi",
        source_market_id="KXNBAFINAL-26CELTICS-CELTICS",
        source_event_id="KXNBAFINAL-26CELTICS",
        source_ticker="KXNBAFINAL-26CELTICS-CELTICS",
        polymarket_market_id=market.id,
        title="Will the Boston Celtics win the 2026 NBA Finals?",
        yes_probability=Decimal("0.5000"),
        no_probability=Decimal("0.5000"),
        best_yes_bid=Decimal("0.4500"),
        best_yes_ask=Decimal("0.5500"),
        mid_price=Decimal("0.5000"),
        volume=Decimal("10000.0000"),
        liquidity=Decimal("25000.0000"),
        open_interest=Decimal("5000.0000"),
        spread=Decimal("0.1000"),
        source_confidence=Decimal("0.8500"),
        warnings=["wide_spread"],
        raw_json={"normalized": True},
        fetched_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
    )

    signal = create_external_market_signal(db_session, payload)
    db_session.commit()

    assert signal.id is not None
    assert signal.polymarket_market_id == market.id
    assert signal.warnings == ["wide_spread"]
    assert signal.raw_json == {"normalized": True}
    assert list_external_market_signals_by_source(db_session, source="kalshi")[0].id == signal.id
    assert (
        list_external_market_signals_by_ticker(
            db_session,
            source="kalshi",
            ticker="KXNBAFINAL-26CELTICS-CELTICS",
        )[0].id
        == signal.id
    )
    assert list_external_market_signals_by_market_id(db_session, market_id=market.id)[0].id == signal.id
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def test_kalshi_mapper_populates_generic_signal_create() -> None:
    normalized = normalize_kalshi_market(_fixture("market_open_with_bid_ask.json")["market"])

    payload = external_signal_create_from_kalshi_market(normalized, polymarket_market_id=123)

    assert payload.source == "kalshi"
    assert payload.source_ticker == "KXNBAFINAL-26CELTICS-CELTICS"
    assert payload.source_event_id == "KXNBAFINAL-26CELTICS"
    assert payload.polymarket_market_id == 123
    assert payload.yes_probability == Decimal("0.5000")
    assert payload.liquidity == Decimal("25000.00")
    assert payload.raw_json is not None


def test_external_signal_routes_are_read_only(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session)
    _create_signal(db_session, market_id=market.id, source="kalshi", ticker="KXNBAFINAL-26CELTICS-CELTICS")
    _create_signal(db_session, market_id=None, source="other_source", ticker="OTHER")
    db_session.commit()
    before = db_session.scalar(select(func.count()).select_from(ExternalMarketSignal))

    response = client.get("/external-signals?source=kalshi&limit=1")
    kalshi_response = client.get("/external-signals/kalshi?limit=5")
    market_response = client.get(f"/markets/{market.id}/external-signals?limit=5")

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["signals"][0]["source"] == "kalshi"
    assert kalshi_response.status_code == 200
    assert kalshi_response.json()["source"] == "kalshi"
    assert market_response.status_code == 200
    assert market_response.json()["market_id"] == market.id
    assert market_response.json()["signals"][0]["polymarket_market_id"] == market.id
    after = db_session.scalar(select(func.count()).select_from(ExternalMarketSignal))
    assert after == before


def test_fetch_kalshi_signals_parser_imports_and_defaults_to_dry_run() -> None:
    parser = build_parser()

    args = parser.parse_args(["--limit", "3", "--status", "open", "--json"])

    assert args.limit == 3
    assert args.status == "open"
    assert args.json is True
    assert args.persist is False


def test_fetch_kalshi_signals_dry_run_does_not_save(db_session: Session) -> None:
    args = _args(limit=2, persist=False)
    payload = _run(args, FakeKalshiClient(), db_session)

    assert payload["dry_run"] is True
    assert payload["saved_to_db"] is False
    assert payload["trading_executed"] is False
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert db_session.scalar(select(func.count()).select_from(ExternalMarketSignal)) == 0


def test_fetch_kalshi_signals_persist_saves_only_with_explicit_flag(db_session: Session) -> None:
    args = _args(limit=1, persist=True)
    payload = _run(args, FakeKalshiClient(), db_session)
    db_session.commit()

    assert payload["dry_run"] is False
    assert payload["persist_enabled"] is True
    assert payload["saved_to_db"] is True
    assert payload["signals_saved"] == 1
    assert payload["trading_executed"] is False
    assert db_session.scalar(select(func.count()).select_from(ExternalMarketSignal)) == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def _fixture(name: str) -> dict[str, object]:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def _create_market(db_session: Session) -> Market:
    event = Event(
        polymarket_event_id="event-external-signal",
        title="NBA Finals",
        category="sports",
        slug="event-external-signal",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id="market-external-signal",
        event_id=event.id,
        question="Will the Boston Celtics win the 2026 NBA Finals?",
        slug="market-external-signal",
        sport_type="nba",
        market_type="championship",
        active=True,
        closed=False,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_signal(
    db_session: Session,
    *,
    market_id: int | None,
    source: str,
    ticker: str,
) -> ExternalMarketSignal:
    signal = create_external_market_signal(
        db_session,
        ExternalMarketSignalCreate(
            source=source,
            source_ticker=ticker,
            source_market_id=ticker,
            polymarket_market_id=market_id,
            title=f"{ticker} title",
            yes_probability=Decimal("0.5000"),
            source_confidence=Decimal("0.7000"),
            warnings=[],
            fetched_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
        ),
    )
    return signal


def _args(*, limit: int, persist: bool) -> argparse.Namespace:
    return argparse.Namespace(
        limit=limit,
        status="open",
        query=None,
        ticker=None,
        orderbook=False,
        depth=3,
        source="kalshi",
        dry_run=False,
        persist=persist,
        json=True,
    )
