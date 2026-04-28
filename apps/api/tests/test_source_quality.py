from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.evidence_item import EvidenceItem
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.models.source import Source


def test_sources_quality_empty_state(client: TestClient, db_session: Session) -> None:
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get("/sources/quality")

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"] == []
    assert payload["total_sources"] == 0
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_sources_quality_returns_aggregate_scores(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session)
    source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id="source-quality-espn",
        title="ESPN injury report",
        url="https://example.com/source",
        published_at=datetime(2026, 4, 26, 8, 0, tzinfo=UTC),
        fetched_at=datetime(2026, 4, 26, 9, 0, tzinfo=UTC),
    )
    db_session.add(source)
    db_session.flush()
    db_session.add(
        EvidenceItem(
            market_id=market.id,
            source_id=source.id,
            provider="espn_rss",
            evidence_type="news",
            stance="favor",
            strength=Decimal("0.7000"),
            confidence=Decimal("0.80"),
            summary="Injury report summary.",
            high_contradiction=False,
        )
    )
    research_run = ResearchRun(
        market_id=market.id,
        status="completed",
        vertical="sports",
        market_shape="match_winner",
        research_mode="local_only",
        web_search_used=False,
        degraded_mode=True,
        started_at=datetime(2026, 4, 26, 10, 0, tzinfo=UTC),
        finished_at=datetime(2026, 4, 26, 10, 30, tzinfo=UTC),
        total_sources_found=1,
        total_sources_used=1,
    )
    db_session.add(research_run)
    db_session.flush()
    db_session.add(
        ResearchFinding(
            research_run_id=research_run.id,
            market_id=market.id,
            source_id=source.id,
            factor_type="injury_context",
            stance="favor",
            impact_score=Decimal("0.6000"),
            freshness_score=Decimal("0.9000"),
            credibility_score=Decimal("0.8000"),
            claim="Starter is available.",
            evidence_summary="Mock source quality finding.",
            source_name="ESPN",
            published_at=datetime(2026, 4, 26, 11, 0, tzinfo=UTC),
        )
    )
    db_session.commit()

    response = client.get("/sources/quality?limit=10")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["source_name"] == "ESPN injury report"
    assert item["source_url"] == "https://example.com/source"
    assert item["findings_count"] == 1
    assert item["evidence_count"] == 1
    assert item["avg_credibility"] == "0.8000"
    assert item["avg_freshness"] == "0.9000"
    assert item["avg_impact"] == "0.6000"
    assert item["avg_evidence_confidence"] == "0.80"


def test_sources_quality_endpoint_is_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/sources/quality" in response.json()["paths"]


def _create_market(db_session: Session) -> Market:
    event = Event(
        polymarket_event_id="source-quality-event",
        title="Source Quality Event",
        category="sports",
        slug="source-quality-event",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id="source-quality-market",
        event_id=event.id,
        question="Lakers vs Warriors",
        slug="source-quality-market",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market
