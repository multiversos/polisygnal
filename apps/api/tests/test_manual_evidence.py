from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_manual_evidence_crud_does_not_create_research_outputs(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    create_response = client.post(
        f"/markets/{market.id}/manual-evidence",
        json={
            "source_name": "Official League Site",
            "source_url": "https://example.com/match",
            "title": "Match note",
            "claim": "Fixture page confirms the market participants.",
            "stance": "neutral",
            "evidence_type": "fixture",
            "credibility_score": "0.8000",
            "notes": "Manual review required.",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["review_status"] == "pending_review"
    assert created["market_id"] == market.id
    assert created["source_url"] == "https://example.com/match"

    list_response = client.get(f"/markets/{market.id}/manual-evidence")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [created["id"]]

    update_response = client.patch(
        f"/manual-evidence/{created['id']}",
        json={"review_status": "reviewed", "stance": "risk"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["review_status"] == "reviewed"
    assert update_response.json()["stance"] == "risk"

    delete_response = client.delete(f"/manual-evidence/{created['id']}")
    assert delete_response.status_code == 204
    assert client.get(f"/markets/{market.id}/manual-evidence").json() == []
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_manual_evidence_market_not_found(client: TestClient) -> None:
    response = client.post(
        "/markets/999999/manual-evidence",
        json={
            "source_name": "Official source",
            "claim": "Claim",
            "stance": "neutral",
        },
    )

    assert response.status_code == 404


def test_manual_evidence_invalid_stance_is_422(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/manual-evidence",
        json={
            "source_name": "Official source",
            "claim": "Claim",
            "stance": "made_up",
        },
    )

    assert response.status_code == 422


def test_manual_evidence_dashboard_list_filters_items(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    db_session.commit()
    client.post(
        f"/markets/{market.id}/manual-evidence",
        json={
            "source_name": "Official source",
            "claim": "Neutral context",
            "stance": "neutral",
        },
    )
    risk_response = client.post(
        f"/markets/{market.id}/manual-evidence",
        json={
            "source_name": "Risk source",
            "claim": "Risk context",
            "stance": "risk",
        },
    )

    response = client.get("/manual-evidence?stance=risk&status=pending_review&limit=50")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["id"] == risk_response.json()["id"]
    assert payload["items"][0]["market_question"] == market.question
    assert payload["items"][0]["sport"] == "soccer"
    assert payload["items"][0]["market_shape"] == "match_winner"


def test_manual_evidence_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/manual-evidence" in paths
    assert "/markets/{market_id}/manual-evidence" in paths
    assert "/manual-evidence/{evidence_id}" in paths


def _create_market(db_session: Session) -> Market:
    event = Event(
        polymarket_event_id="manual-evidence-event",
        title="Manual Evidence Event",
        category="sports",
        slug="manual-evidence-event",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id="manual-evidence-market",
        event_id=event.id,
        question="Will Vissel Kobe win on 2026-04-29?",
        slug="manual-evidence-market",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market
