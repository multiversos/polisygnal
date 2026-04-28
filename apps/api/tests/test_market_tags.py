from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.market_tag import MarketTag, MarketTagLink
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_create_tag_and_link_to_market(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session)
    _create_snapshot(db_session, market.id, liquidity=Decimal("15000.0000"))
    db_session.commit()

    tag_response = client.post(
        "/tags",
        json={"name": "Requiere revisión", "color": "#f59e0b"},
    )
    link_response = client.post(
        f"/markets/{market.id}/tags",
        json={"tag_id": tag_response.json()["id"]},
    )

    assert tag_response.status_code == 201
    assert tag_response.json()["slug"] == "requiere-revision"
    assert link_response.status_code == 201
    assert link_response.json()["tags"][0]["name"] == "Requiere revisión"
    assert any(tag["slug"] == "high_liquidity" for tag in link_response.json()["suggested_tags"])
    assert db_session.scalar(select(func.count()).select_from(MarketTagLink)) == 1


def test_add_market_tag_by_name_is_idempotent(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="idempotent")
    db_session.commit()

    first = client.post(f"/markets/{market.id}/tags", json={"name": "Sin evidencia"})
    second = client.post(f"/markets/{market.id}/tags", json={"name": "Sin evidencia"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert len(second.json()["tags"]) == 1
    assert db_session.scalar(select(func.count()).select_from(MarketTag)) == 1
    assert db_session.scalar(select(func.count()).select_from(MarketTagLink)) == 1


def test_list_and_remove_market_tags(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="remove")
    db_session.commit()
    created = client.post(f"/markets/{market.id}/tags", json={"name": "Alta prioridad"}).json()
    tag_id = created["tags"][0]["id"]

    list_response = client.get("/tags")
    market_response = client.get(f"/markets/{market.id}/tags")
    delete_response = client.delete(f"/markets/{market.id}/tags/{tag_id}")
    after_delete = client.get(f"/markets/{market.id}/tags")

    assert list_response.status_code == 200
    assert market_response.status_code == 200
    assert market_response.json()["tags"][0]["id"] == tag_id
    assert delete_response.status_code == 204
    assert after_delete.json()["tags"] == []


def test_market_tags_errors_and_no_mutation_side_effects(
    client: TestClient,
    db_session: Session,
) -> None:
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    missing_market = client.get("/markets/999999/tags")
    missing_payload = client.post("/markets/999999/tags", json={"name": "Demo"})
    invalid_payload = client.post("/markets/999999/tags", json={})

    assert missing_market.status_code == 404
    assert missing_payload.status_code == 404
    assert invalid_payload.status_code == 404
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_market_tags_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/tags" in paths
    assert "/markets/{market_id}/tags" in paths
    assert "/markets/{market_id}/tags/{tag_id}" in paths


def _create_market(
    db_session: Session,
    *,
    suffix: str = "tags",
) -> Market:
    event = Event(
        polymarket_event_id=f"tag-event-{suffix}",
        title="Tags Test Event",
        category="sports",
        slug=f"tag-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"tag-market-{suffix}",
        event_id=event.id,
        question="Lakers vs Warriors",
        slug=f"tag-market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime(2026, 4, 27, 2, 0, tzinfo=UTC),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_snapshot(
    db_session: Session,
    market_id: int,
    *,
    liquidity: Decimal,
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market_id,
        captured_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
        yes_price=Decimal("0.4200"),
        no_price=Decimal("0.5800"),
        liquidity=liquidity,
        volume=Decimal("2500.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot
