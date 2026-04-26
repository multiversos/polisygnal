from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.models.source import Source


def test_post_market_research_run_local_only_creates_artifacts(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_research_market(db_session, suffix="post")

    response = client.post(
        f"/markets/{market.id}/research/run",
        json={"research_mode": "local_only"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["research_mode"] == "local_only"
    assert payload["degraded_mode"] is True
    assert payload["web_search_used"] is False
    assert payload["report"] is not None
    assert payload["prediction"] is not None
    assert payload["prediction"]["prediction_family"] == "research_v1_local"

    research_runs = db_session.scalars(select(ResearchRun)).all()
    findings = db_session.scalars(select(ResearchFinding)).all()
    reports = db_session.scalars(select(PredictionReport)).all()
    research_predictions = db_session.scalars(
        select(Prediction).where(Prediction.prediction_family == "research_v1_local")
    ).all()

    assert len(research_runs) == 1
    assert research_runs[0].market_id == market.id
    assert research_runs[0].degraded_mode is True
    assert len(findings) >= 1
    assert len(reports) == 1
    assert len(research_predictions) == 1


def test_get_latest_market_research_returns_findings_and_report(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_research_market(db_session, suffix="latest")
    run_response = client.post(f"/markets/{market.id}/research/run", json={})
    assert run_response.status_code == 201
    run_id = run_response.json()["research_run_id"]

    response = client.get(f"/markets/{market.id}/research/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == run_id
    assert payload["market_id"] == market.id
    assert payload["report"] is not None
    assert payload["prediction"] is not None
    assert payload["prediction"]["prediction_family"] == "research_v1_local"
    assert len(payload["findings"]) >= 1


def test_get_market_research_runs_lists_runs_in_desc_order(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_research_market(db_session, suffix="runs")

    first = client.post(f"/markets/{market.id}/research/run", json={})
    second = client.post(f"/markets/{market.id}/research/run", json={})

    assert first.status_code == 201
    assert second.status_code == 201

    response = client.get(f"/markets/{market.id}/research/runs")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert payload[0]["id"] == second.json()["research_run_id"]
    assert payload[1]["id"] == first.json()["research_run_id"]


def test_get_market_prediction_report_returns_latest_report(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_research_market(db_session, suffix="report")
    run_response = client.post(f"/markets/{market.id}/research/run", json={})
    assert run_response.status_code == 201

    response = client.get(f"/markets/{market.id}/prediction/report")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["prediction_id"] is not None
    assert payload["research_run_id"] == run_response.json()["research_run_id"]
    assert payload["thesis"]
    assert isinstance(payload["evidence_for"], list)
    assert isinstance(payload["risks"], list)


def _create_research_market(db_session: Session, *, suffix: str) -> Market:
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id=f"event-research-{suffix}",
        title=f"NBA Research {suffix}",
        category="sports",
        slug=f"nba-research-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-research-{suffix}",
        event_id=event.id,
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        slug=f"market-research-{suffix}",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=base_time,
            yes_price=Decimal("0.5400"),
            no_price=Decimal("0.4600"),
            midpoint=Decimal("0.5000"),
            last_trade_price=Decimal("0.5400"),
            spread=Decimal("0.0200"),
            volume=Decimal("1500.0000"),
            liquidity=Decimal("250000.0000"),
        )
    )

    odds_source = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id=f"odds-{suffix}",
        title="The Odds API consensus",
        url="https://example.com/odds",
        published_at=base_time - timedelta(hours=2),
        fetched_at=base_time - timedelta(hours=1),
        raw_json={},
    )
    news_source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id=f"news-{suffix}",
        title="ESPN injury update",
        url="https://example.com/news",
        published_at=base_time - timedelta(hours=4),
        fetched_at=base_time - timedelta(hours=3),
        raw_json={},
    )
    db_session.add_all([odds_source, news_source])
    db_session.flush()

    db_session.add(
        EvidenceItem(
            market_id=market.id,
            source_id=odds_source.id,
            provider="the_odds_api",
            evidence_type="odds",
            stance="favor",
            strength=Decimal("0.6200"),
            confidence=Decimal("0.75"),
            summary="Consensus odds lean toward the Knicks side of the market.",
            high_contradiction=False,
            bookmaker_count=4,
            metadata_json={
                "external_market": {
                    "consensus_strength": "0.8000",
                    "availability": {"consensus_strength": True},
                    "reasons": {"consensus_strength": "provided_consensus_strength"},
                }
            },
        )
    )
    db_session.add(
        EvidenceItem(
            market_id=market.id,
            source_id=news_source.id,
            provider="espn_rss",
            evidence_type="news",
            stance="unknown",
            strength=None,
            confidence=None,
            summary="Recent injury note introduces some uncertainty for the Hawks rotation.",
            high_contradiction=False,
            bookmaker_count=None,
            metadata_json={
                "structured_context": {
                    "injury_score": "0.0100",
                    "form_score": "0.0050",
                    "rest_score": "0.0000",
                    "home_advantage_score": "0.0000",
                    "availability": {
                        "injury_score": True,
                        "form_score": True,
                        "rest_score": False,
                        "home_advantage_score": False,
                    },
                    "reasons": {
                        "injury_score": "provided_structured_context",
                        "form_score": "provided_structured_context",
                        "rest_score": "missing_rest_score",
                        "home_advantage_score": "missing_home_advantage_score",
                    },
                }
            },
        )
    )
    db_session.commit()
    return market
