from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_decision_log import MarketDecisionLog
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun


def test_market_timeline_returns_ordered_items(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session)
    base_time = datetime(2026, 4, 26, 12, 0, tzinfo=UTC)
    run = ResearchRun(
        market_id=market.id,
        status="pending_agent",
        vertical="sports",
        market_shape="match_winner",
        research_mode="codex_agent",
        model_used="codex_agent_external",
        web_search_used=False,
        degraded_mode=False,
        started_at=base_time,
        total_sources_found=0,
        total_sources_used=0,
    )
    db_session.add(run)
    db_session.flush()
    db_session.add_all(
        [
            MarketSnapshot(
                market_id=market.id,
                captured_at=base_time + timedelta(minutes=10),
                yes_price=Decimal("0.4200"),
                no_price=Decimal("0.5800"),
            ),
            ResearchFinding(
                market_id=market.id,
                research_run_id=run.id,
                factor_type="injury_context",
                stance="favor",
                impact_score=Decimal("0.7000"),
                freshness_score=Decimal("0.8000"),
                credibility_score=Decimal("0.9000"),
                claim="Starter available.",
                evidence_summary="Availability improves context.",
                published_at=base_time + timedelta(minutes=20),
            ),
            ExternalMarketSignal(
                polymarket_market_id=market.id,
                source="kalshi",
                title="External comparison",
                fetched_at=base_time + timedelta(minutes=30),
                yes_probability=Decimal("0.4500"),
            ),
            MarketDecisionLog(
                market_id=market.id,
                decision="monitor",
                note="Seguir observando.",
                confidence_label="medium",
                created_at=base_time + timedelta(minutes=40),
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/markets/{market.id}/timeline")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    types = [item["type"] for item in payload["items"]]
    assert "decision" in types
    assert "external_signal" in types
    assert "finding" in types
    assert "research_run" in types
    assert "price_snapshot" in types
    timestamps = [item["timestamp"] for item in payload["items"]]
    assert timestamps == sorted(timestamps, reverse=True)


def test_market_timeline_empty_state_and_not_found(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="empty")
    db_session.commit()

    empty_response = client.get(f"/markets/{market.id}/timeline")
    missing_response = client.get("/markets/999999/timeline")

    assert empty_response.status_code == 200
    assert empty_response.json()["items"] == []
    assert missing_response.status_code == 404


def test_market_timeline_is_read_only(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="readonly")
    db_session.commit()
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))

    response = client.get(f"/markets/{market.id}/timeline")

    assert response.status_code == 200
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions


def test_market_timeline_openapi_includes_endpoint(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/markets/{market_id}/timeline" in response.json()["paths"]


def _create_market(db_session: Session, *, suffix: str = "timeline") -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title="NBA Timeline Event",
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
