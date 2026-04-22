from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot


def test_get_market_detail_returns_market_with_event(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-1",
        title="2026 NBA Champion",
        category="sports",
        slug="2026-nba-champion",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-1",
        event_id=event.id,
        question="Will the Oklahoma City Thunder win the 2026 NBA Finals?",
        slug="will-the-oklahoma-city-thunder-win-the-2026-nba-finals",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
        yes_token_id="yes-token",
        no_token_id="no-token",
        rules_text="Resuelve segun resultados oficiales de la NBA.",
    )
    db_session.add(market)
    db_session.flush()
    snapshot_old = MarketSnapshot(
        market_id=market.id,
        captured_at=datetime(2026, 4, 19, 12, 0, tzinfo=UTC),
        yes_price=Decimal("0.5300"),
        no_price=Decimal("0.4700"),
        midpoint=Decimal("0.5300"),
        last_trade_price=Decimal("0.5200"),
        spread=Decimal("0.0200"),
        volume=Decimal("1234.5000"),
        liquidity=Decimal("456.7000"),
    )
    snapshot_new = MarketSnapshot(
        market_id=market.id,
        captured_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
        yes_price=Decimal("0.5500"),
        no_price=Decimal("0.4500"),
        midpoint=Decimal("0.5500"),
        last_trade_price=Decimal("0.5400"),
        spread=Decimal("0.0100"),
        volume=Decimal("1500.0000"),
        liquidity=Decimal("500.0000"),
    )
    db_session.add_all([snapshot_old, snapshot_new])
    db_session.commit()

    response = client.get(f"/markets/{market.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == market.id
    assert payload["sport_type"] == "nba"
    assert payload["market_type"] == "winner"
    assert payload["evidence_eligible"] is False
    assert payload["evidence_shape"] == "futures"
    assert payload["evidence_skip_reason"] == "single_team_market"
    assert payload["event"]["polymarket_event_id"] == "event-1"
    assert payload["event"]["title"] == "2026 NBA Champion"
    assert payload["latest_yes_price"] == "0.5500"
    assert payload["latest_snapshot"]["captured_at"].startswith("2026-04-20T12:00:00")
    assert len(payload["recent_snapshots"]) == 2
    assert payload["recent_snapshots"][0]["yes_price"] == "0.5500"
    assert payload["recent_snapshots"][1]["yes_price"] == "0.5300"


def test_get_market_detail_returns_404_for_unknown_market(client: TestClient) -> None:
    response = client.get("/markets/999")

    assert response.status_code == 404


def test_get_market_snapshots_returns_history_in_desc_order(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-2",
        title="2026 NBA Champion",
        category="sports",
        slug="2026-nba-champion-history",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-2",
        event_id=event.id,
        question="Will the Boston Celtics win the 2026 NBA Finals?",
        slug="will-the-boston-celtics-win-the-2026-nba-finals",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
        yes_token_id="yes-token-2",
    )
    db_session.add(market)
    db_session.flush()

    base_time = datetime(2026, 4, 20, 10, 0, tzinfo=UTC)
    snapshots = [
        MarketSnapshot(
            market_id=market.id,
            captured_at=base_time,
            yes_price=Decimal("0.4000"),
        ),
        MarketSnapshot(
            market_id=market.id,
            captured_at=base_time + timedelta(hours=1),
            yes_price=Decimal("0.4200"),
        ),
        MarketSnapshot(
            market_id=market.id,
            captured_at=base_time + timedelta(hours=2),
            yes_price=Decimal("0.4500"),
        ),
    ]
    db_session.add_all(snapshots)
    db_session.commit()

    response = client.get(
        f"/markets/{market.id}/snapshots",
        params={
            "limit": 2,
            "captured_after": (base_time + timedelta(minutes=30)).isoformat(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert payload[0]["yes_price"] == "0.4500"
    assert payload[1]["yes_price"] == "0.4200"
