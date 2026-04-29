from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_decision_log import MarketDecisionLog
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_create_and_list_market_decision(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session)
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/decisions",
        json={
            "decision": "monitor",
            "note": "Seguir movimiento antes del cierre",
            "confidence_label": "medium",
        },
    )
    market_list = client.get(f"/markets/{market.id}/decisions")
    global_list = client.get("/decisions")

    assert response.status_code == 201
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["decision"] == "monitor"
    assert payload["note"] == "Seguir movimiento antes del cierre"
    assert payload["confidence_label"] == "medium"
    assert market_list.status_code == 200
    assert [item["id"] for item in market_list.json()] == [payload["id"]]
    assert global_list.status_code == 200
    assert global_list.json()[0]["id"] == payload["id"]


def test_update_and_delete_market_decision(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="crud")
    db_session.commit()
    created = client.post(
        f"/markets/{market.id}/decisions",
        json={"decision": "investigate_more"},
    ).json()

    update_response = client.patch(
        f"/decisions/{created['id']}",
        json={
            "decision": "waiting_for_data",
            "note": "Faltan snapshots suficientes",
            "confidence_label": "low",
        },
    )
    delete_response = client.delete(f"/decisions/{created['id']}")
    list_response = client.get(f"/markets/{market.id}/decisions")

    assert update_response.status_code == 200
    assert update_response.json()["decision"] == "waiting_for_data"
    assert update_response.json()["confidence_label"] == "low"
    assert delete_response.status_code == 204
    assert list_response.status_code == 200
    assert list_response.json() == []
    assert db_session.scalar(select(func.count()).select_from(MarketDecisionLog)) == 0


def test_market_decision_errors_are_stable(client: TestClient, db_session: Session) -> None:
    missing_market = client.post("/markets/999999/decisions", json={})
    missing_market_list = client.get("/markets/999999/decisions")
    missing_decision_patch = client.patch("/decisions/999999", json={"decision": "monitor"})
    missing_decision_delete = client.delete("/decisions/999999")

    assert missing_market.status_code == 404
    assert missing_market_list.status_code == 404
    assert missing_decision_patch.status_code == 404
    assert missing_decision_delete.status_code == 404
    assert db_session.scalar(select(func.count()).select_from(MarketDecisionLog)) == 0


def test_market_decision_invalid_values_are_rejected(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="invalid")
    db_session.commit()

    decision_response = client.post(
        f"/markets/{market.id}/decisions",
        json={"decision": "trade"},
    )
    confidence_response = client.post(
        f"/markets/{market.id}/decisions",
        json={"decision": "monitor", "confidence_label": "certain"},
    )

    assert decision_response.status_code == 422
    assert confidence_response.status_code == 422
    assert db_session.scalar(select(func.count()).select_from(MarketDecisionLog)) == 0


def test_market_decision_endpoints_do_not_create_research_or_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="safe")
    db_session.commit()

    created = client.post(
        f"/markets/{market.id}/decisions",
        json={"decision": "possible_opportunity"},
    )
    client.get("/decisions")
    client.get(f"/markets/{market.id}/decisions")
    client.patch(f"/decisions/{created.json()['id']}", json={"decision": "dismissed"})
    client.delete(f"/decisions/{created.json()['id']}")

    assert created.status_code == 201
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 0


def test_market_decisions_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/decisions" in paths
    assert "/markets/{market_id}/decisions" in paths
    assert "/decisions/{decision_id}" in paths


def _create_market(db_session: Session, *, suffix: str = "decision") -> Market:
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
