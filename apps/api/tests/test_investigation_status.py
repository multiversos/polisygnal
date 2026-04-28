from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_investigation_status import MarketInvestigationStatus
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_create_investigation_status_and_prevent_duplicate_market(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    _create_snapshot(db_session, market.id)
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/investigation-status",
        json={
            "status": "pending_review",
            "note": "Mirar lesiones antes del partido",
            "priority": 20,
        },
    )
    duplicate = client.post(
        f"/markets/{market.id}/investigation-status",
        json={"status": "investigating", "priority": 5},
    )

    assert response.status_code == 201
    assert response.json()["market_id"] == market.id
    assert response.json()["status"] == "pending_review"
    assert response.json()["note"] == "Mirar lesiones antes del partido"
    assert response.json()["priority"] == 20
    assert response.json()["latest_yes_price"] == "0.4200"
    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == response.json()["id"]
    assert duplicate.json()["status"] == "investigating"
    assert duplicate.json()["priority"] == 5
    assert db_session.scalar(select(func.count()).select_from(MarketInvestigationStatus)) == 1


def test_list_update_delete_and_get_by_market(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="crud")
    db_session.commit()
    created = client.post(f"/markets/{market.id}/investigation-status", json={}).json()

    list_response = client.get("/investigation-status")
    market_response = client.get(f"/markets/{market.id}/investigation-status")
    update_response = client.patch(
        f"/markets/{market.id}/investigation-status",
        json={"status": "has_evidence", "note": "Ya hay fuentes", "priority": 3},
    )
    delete_response = client.delete(f"/markets/{market.id}/investigation-status")
    empty_market_response = client.get(f"/markets/{market.id}/investigation-status")

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert market_response.status_code == 200
    assert market_response.json()["id"] == created["id"]
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "has_evidence"
    assert update_response.json()["note"] == "Ya hay fuentes"
    assert update_response.json()["priority"] == 3
    assert delete_response.status_code == 204
    assert empty_market_response.status_code == 200
    assert empty_market_response.json() is None
    assert db_session.scalar(select(func.count()).select_from(MarketInvestigationStatus)) == 0


def test_patch_creates_status_for_existing_market(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="patch-create")
    db_session.commit()

    response = client.patch(
        f"/markets/{market.id}/investigation-status",
        json={"status": "review_required"},
    )

    assert response.status_code == 200
    assert response.json()["market_id"] == market.id
    assert response.json()["status"] == "review_required"
    assert db_session.scalar(select(func.count()).select_from(MarketInvestigationStatus)) == 1


def test_investigation_status_market_errors_are_stable(
    client: TestClient,
    db_session: Session,
) -> None:
    create_response = client.post("/markets/999999/investigation-status", json={})
    market_response = client.get("/markets/999999/investigation-status")
    delete_response = client.delete("/markets/999999/investigation-status")

    assert create_response.status_code == 404
    assert market_response.status_code == 404
    assert delete_response.status_code == 404
    assert db_session.scalar(select(func.count()).select_from(MarketInvestigationStatus)) == 0


def test_investigation_status_invalid_status_is_rejected(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="invalid-status")
    db_session.commit()

    create_response = client.post(
        f"/markets/{market.id}/investigation-status",
        json={"status": "betting"},
    )
    update_response = client.patch(
        f"/markets/{market.id}/investigation-status",
        json={"status": "betting"},
    )

    assert create_response.status_code == 422
    assert update_response.status_code == 422
    assert db_session.scalar(select(func.count()).select_from(MarketInvestigationStatus)) == 0


def test_investigation_status_endpoints_do_not_create_research_or_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="safe")
    db_session.commit()

    create_response = client.post(f"/markets/{market.id}/investigation-status", json={})
    client.get("/investigation-status")
    client.patch(
        f"/markets/{market.id}/investigation-status",
        json={"status": "investigating"},
    )
    client.get(f"/markets/{market.id}/investigation-status")
    client.delete(f"/markets/{market.id}/investigation-status")

    assert create_response.status_code == 201
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def test_investigation_status_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/investigation-status" in paths
    assert "/markets/{market_id}/investigation-status" in paths


def _create_market(
    db_session: Session,
    *,
    suffix: str = "investigation-status",
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
