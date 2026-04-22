from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.clob import ClobOrderBook
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.services.market_snapshots import capture_market_snapshots


class FakeGammaClient:
    def fetch_markets_by_ids(self, market_ids: list[str]) -> dict[str, object]:
        return {
            market_id: type(
                "GammaMarket",
                (),
                {
                    "volume": Decimal("1500.1250"),
                    "liquidity": Decimal("700.7500"),
                },
            )()
            for market_id in market_ids
        }


class FakeClobClient:
    def fetch_midpoint(self, token_id: str) -> Decimal | None:
        if token_id == "yes-token":
            return Decimal("0.6100")
        return None

    def fetch_spread(self, token_id: str) -> Decimal | None:
        if token_id == "yes-token":
            return Decimal("0.0200")
        return None

    def fetch_order_book(self, token_id: str) -> ClobOrderBook:
        return ClobOrderBook(best_bid=Decimal("0.6000"), best_ask=Decimal("0.6200"))

    def fetch_last_trade_prices(self, token_ids: list[str]) -> dict[str, Decimal | None]:
        return {token_id: Decimal("0.6050") for token_id in token_ids}


def test_capture_market_snapshots_persists_snapshot_values(db_session: Session) -> None:
    event = Event(
        polymarket_event_id="event-snapshots",
        title="2026 NBA Champion",
        category="sports",
        slug="2026-nba-champion-snapshots",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-snapshots",
        event_id=event.id,
        question="Will the Thunder win the 2026 NBA Finals?",
        slug="will-the-thunder-win-the-2026-nba-finals",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
        yes_token_id="yes-token",
        no_token_id="no-token",
    )
    db_session.add(market)
    db_session.commit()

    summary = capture_market_snapshots(
        db_session,
        gamma_client=FakeGammaClient(),
        clob_client=FakeClobClient(),
        discovery_scope="nba",
        gamma_batch_size=25,
    )

    assert summary.markets_considered == 1
    assert summary.snapshots_created == 1
    assert summary.snapshots_skipped == 0
    assert summary.partial_errors == []

    snapshot = db_session.scalar(
        select(MarketSnapshot).where(MarketSnapshot.market_id == market.id)
    )
    assert snapshot is not None
    assert snapshot.yes_price == Decimal("0.6100")
    assert snapshot.no_price == Decimal("0.3900")
    assert snapshot.midpoint == Decimal("0.6100")
    assert snapshot.last_trade_price == Decimal("0.6050")
    assert snapshot.spread == Decimal("0.0200")
    assert snapshot.volume == Decimal("1500.1250")
    assert snapshot.liquidity == Decimal("700.7500")
    assert isinstance(snapshot.captured_at, datetime)
    assert snapshot.captured_at.tzinfo in (UTC, None)
