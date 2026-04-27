from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.models.watchlist_item import WatchlistItem


def test_create_watchlist_item_and_prevent_duplicate_market(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    _create_snapshot(db_session, market.id)
    db_session.commit()

    response = client.post(
        "/watchlist",
        json={"market_id": market.id, "status": "watching", "note": "Revisar luego"},
    )
    duplicate = client.post(
        "/watchlist",
        json={"market_id": market.id, "status": "investigating"},
    )

    assert response.status_code == 201
    assert response.json()["market_id"] == market.id
    assert response.json()["status"] == "watching"
    assert response.json()["note"] == "Revisar luego"
    assert response.json()["market_question"] == market.question
    assert response.json()["latest_yes_price"] == "0.4200"
    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == response.json()["id"]
    assert duplicate.json()["status"] == "investigating"
    assert db_session.scalar(select(func.count()).select_from(WatchlistItem)) == 1


def test_list_update_delete_and_get_by_market(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="crud")
    db_session.commit()
    created = client.post("/watchlist", json={"market_id": market.id}).json()

    list_response = client.get("/watchlist")
    market_response = client.get(f"/markets/{market.id}/watchlist")
    update_response = client.patch(
        f"/watchlist/{created['id']}",
        json={"status": "reviewed", "note": "Sin prioridad por ahora"},
    )
    delete_response = client.delete(f"/watchlist/{created['id']}")
    empty_market_response = client.get(f"/markets/{market.id}/watchlist")

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert market_response.status_code == 200
    assert market_response.json()["id"] == created["id"]
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "reviewed"
    assert update_response.json()["note"] == "Sin prioridad por ahora"
    assert delete_response.status_code == 204
    assert empty_market_response.status_code == 200
    assert empty_market_response.json() is None
    assert db_session.scalar(select(func.count()).select_from(WatchlistItem)) == 0


def test_watchlist_market_errors_are_stable(
    client: TestClient,
    db_session: Session,
) -> None:
    response = client.post("/watchlist", json={"market_id": 999999})
    market_response = client.get("/markets/999999/watchlist")
    item_response = client.get("/watchlist/999999")

    assert response.status_code == 404
    assert market_response.status_code == 404
    assert item_response.status_code == 404
    assert db_session.scalar(select(func.count()).select_from(WatchlistItem)) == 0


def test_watchlist_invalid_status_is_rejected(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="invalid-status")
    db_session.commit()

    create_response = client.post(
        "/watchlist",
        json={"market_id": market.id, "status": "betting"},
    )
    update_response = client.patch(
        "/watchlist/999999",
        json={"status": "betting"},
    )

    assert create_response.status_code == 422
    assert update_response.status_code == 422
    assert db_session.scalar(select(func.count()).select_from(WatchlistItem)) == 0


def test_watchlist_endpoints_do_not_create_research_or_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="safe")
    db_session.commit()

    create_response = client.post("/watchlist", json={"market_id": market.id})
    item_id = create_response.json()["id"]
    client.get("/watchlist")
    client.patch(f"/watchlist/{item_id}", json={"status": "investigating"})
    client.get(f"/markets/{market.id}/watchlist")
    client.delete(f"/watchlist/{item_id}")

    assert create_response.status_code == 201
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def test_watchlist_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/watchlist" in paths
    assert "/watchlist/{item_id}" in paths
    assert "/markets/{market_id}/watchlist" in paths
    assert "/markets/{market_id}/watchlist/toggle" in paths


def _create_market(
    db_session: Session,
    *,
    suffix: str = "watchlist",
) -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title="NBA Test Event",
        category="sports",
        slug=f"event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"market-{suffix}",
        event_id=event.id,
        question="Will the Lakers beat the Warriors?",
        slug=f"market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime(2026, 4, 27, 2, 0, tzinfo=UTC),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_snapshot(db_session: Session, market_id: int) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market_id,
        captured_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
        yes_price=Decimal("0.4200"),
        no_price=Decimal("0.5800"),
        liquidity=Decimal("1000.0000"),
        volume=Decimal("2500.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot
