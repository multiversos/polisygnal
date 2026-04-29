from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.clob import ClobOrderBook
from app.commands.refresh_market_snapshots import _run as run_snapshot_refresh
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


class FakeGammaClient:
    def fetch_markets_by_ids(self, market_ids: list[str]) -> dict[str, object]:
        return {
            market_id: type(
                "GammaMarket",
                (),
                {
                    "volume": Decimal("2500.1250"),
                    "liquidity": Decimal("800.7500"),
                },
            )()
            for market_id in market_ids
        }


class FakeClobClient:
    def fetch_midpoint(self, token_id: str) -> Decimal | None:
        if token_id == "yes-token":
            return Decimal("0.6400")
        return None

    def fetch_spread(self, token_id: str) -> Decimal | None:
        if token_id == "yes-token":
            return Decimal("0.0300")
        return None

    def fetch_order_book(self, token_id: str) -> ClobOrderBook:
        return ClobOrderBook(best_bid=Decimal("0.6300"), best_ask=Decimal("0.6500"))

    def fetch_last_trade_prices(self, token_ids: list[str]) -> dict[str, Decimal | None]:
        return {token_id: Decimal("0.6350") for token_id in token_ids}


class ExplodingClient:
    def __getattr__(self, name: str):
        raise AssertionError(f"dry-run should not call remote client method {name}")


def test_snapshot_refresh_dry_run_does_not_create_snapshot(db_session: Session) -> None:
    market = _create_market(db_session, suffix="dry-run")
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    payload = run_snapshot_refresh(
        db_session,
        gamma_client=ExplodingClient(),
        clob_client=ExplodingClient(),
        market_id=market.id,
        dry_run=True,
    )

    assert payload["dry_run"] is True
    assert payload["markets_checked"] == 1
    assert payload["snapshots_created"] == 0
    assert payload["items"][0]["action"] == "would_refresh"
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == 0
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_snapshot_refresh_apply_creates_snapshot_with_mock_clients(db_session: Session) -> None:
    market = _create_market(db_session, suffix="apply")
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    payload = run_snapshot_refresh(
        db_session,
        gamma_client=FakeGammaClient(),
        clob_client=FakeClobClient(),
        market_id=market.id,
        dry_run=False,
    )

    assert payload["dry_run"] is False
    assert payload["apply"] is True
    assert payload["snapshots_created"] == 1
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["trading_executed"] is False
    snapshot = db_session.scalar(select(MarketSnapshot).where(MarketSnapshot.market_id == market.id))
    assert snapshot is not None
    assert snapshot.yes_price == Decimal("0.6400")
    assert snapshot.no_price == Decimal("0.3600")
    assert snapshot.liquidity == Decimal("800.7500")
    assert snapshot.volume == Decimal("2500.1250")
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_snapshot_refresh_market_not_found_has_stable_error(db_session: Session) -> None:
    with pytest.raises(ValueError, match="market_id=999999 no existe"):
        run_snapshot_refresh(
            db_session,
            gamma_client=FakeGammaClient(),
            clob_client=FakeClobClient(),
            market_id=999999,
            dry_run=True,
        )


def test_snapshot_refresh_limit_is_respected(db_session: Session) -> None:
    for index in range(3):
        _create_market(db_session, suffix=f"limit-{index}", end_date=datetime.now(tz=UTC) + timedelta(days=1, hours=index))

    payload = run_snapshot_refresh(
        db_session,
        gamma_client=ExplodingClient(),
        clob_client=ExplodingClient(),
        limit=2,
        days=7,
        dry_run=True,
    )

    assert payload["markets_checked"] == 2
    assert len(payload["items"]) == 2


def test_snapshot_refresh_json_payload_is_serializable(db_session: Session) -> None:
    market = _create_market(db_session, suffix="json")

    payload = run_snapshot_refresh(
        db_session,
        gamma_client=ExplodingClient(),
        clob_client=ExplodingClient(),
        market_id=market.id,
        dry_run=True,
    )

    encoded = json.dumps(payload, ensure_ascii=True)
    assert '"dry_run": true' in encoded
    assert '"trading_executed": false' in encoded


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    end_date: datetime | None = None,
) -> Market:
    event = Event(
        polymarket_event_id=f"snapshot-refresh-event-{suffix}",
        title=f"Snapshot Refresh Event {suffix}",
        category="sports",
        slug=f"snapshot-refresh-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"snapshot-refresh-market-{suffix}",
        event_id=event.id,
        question=f"Snapshot refresh market {suffix}",
        slug=f"snapshot-refresh-market-{suffix}",
        yes_token_id="yes-token",
        no_token_id="no-token",
        sport_type="mlb",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=end_date or datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.commit()
    return market
