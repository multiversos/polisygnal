from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot


def test_get_market_price_history_returns_summary(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market_with_snapshots(db_session)
    db_session.commit()

    response = client.get(f"/markets/{market.id}/price-history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["count"] == 3
    assert [point["yes_price"] for point in payload["points"]] == [
        "0.4000",
        "0.4500",
        "0.5000",
    ]
    assert payload["first"]["yes_price"] == "0.4000"
    assert payload["latest"]["yes_price"] == "0.5000"
    assert payload["change_yes_abs"] == "0.1000"
    assert payload["change_yes_pct"] == "0.25"


def test_get_market_price_history_supports_desc_order_and_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market_with_snapshots(db_session)
    db_session.commit()

    response = client.get(f"/markets/{market.id}/price-history?limit=2&order=desc")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert [point["yes_price"] for point in payload["points"]] == ["0.5000", "0.4500"]
    assert payload["first"]["yes_price"] == "0.4500"
    assert payload["latest"]["yes_price"] == "0.5000"
    assert payload["change_yes_abs"] == "0.0500"


def test_get_market_price_history_returns_empty_points_without_snapshots(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="empty")
    db_session.commit()

    response = client.get(f"/markets/{market.id}/price-history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["points"] == []
    assert payload["count"] == 0
    assert payload["latest"] is None
    assert payload["first"] is None
    assert payload["change_yes_abs"] is None
    assert payload["change_yes_pct"] is None


def test_get_market_price_history_returns_404_for_unknown_market(client: TestClient) -> None:
    response = client.get("/markets/999999/price-history")

    assert response.status_code == 404


def test_get_market_price_history_is_read_only(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market_with_snapshots(db_session)
    db_session.commit()
    before_snapshots = db_session.scalar(select(func.count()).select_from(MarketSnapshot))

    response = client.get(f"/markets/{market.id}/price-history")

    assert response.status_code == 200
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == before_snapshots


def test_market_price_history_endpoint_is_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/markets/{market_id}/price-history" in response.json()["paths"]


def _create_market_with_snapshots(db_session: Session) -> Market:
    market = _create_market(db_session, suffix="history")
    base_time = datetime(2026, 4, 26, 12, 0, tzinfo=UTC)
    for offset, yes_price in enumerate(
        [Decimal("0.4000"), Decimal("0.4500"), Decimal("0.5000")]
    ):
        db_session.add(
            MarketSnapshot(
                market_id=market.id,
                captured_at=base_time + timedelta(minutes=offset),
                yes_price=yes_price,
                no_price=Decimal("1.0000") - yes_price,
                midpoint=yes_price,
                last_trade_price=yes_price,
                spread=Decimal("0.0200"),
                volume=Decimal("1000.0000") + Decimal(offset),
                liquidity=Decimal("500.0000") + Decimal(offset),
            )
        )
    return market


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"price-history-event-{suffix}",
        title="NBA Finals",
        category="sports",
        slug=f"price-history-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"price-history-market-{suffix}",
        event_id=event.id,
        question="Will the Boston Celtics win the NBA Finals?",
        slug=f"price-history-market-{suffix}",
        sport_type="nba",
        market_type="championship",
        active=True,
        closed=False,
    )
    db_session.add(market)
    db_session.flush()
    return market
