from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market


def test_get_markets_returns_empty_list_by_default(client: TestClient) -> None:
    response = client.get("/markets")

    assert response.status_code == 200
    assert response.json() == []


def test_get_markets_returns_seeded_market(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-1",
        title="NBA Finals",
        category="sports",
        slug="nba-finals",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-1",
        event_id=event.id,
        question="Will Team A win the finals?",
        slug="team-a-finals",
        active=True,
        closed=False,
        end_date=datetime(2026, 6, 20, tzinfo=timezone.utc),
    )
    db_session.add(market)
    db_session.commit()

    response = client.get("/markets")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["polymarket_market_id"] == "market-1"
    assert payload[0]["question"] == "Will Team A win the finals?"
    assert payload[0]["latest_yes_price"] is None

