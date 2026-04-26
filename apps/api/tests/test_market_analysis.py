from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.models.source import Source


def test_get_market_analysis_returns_consolidated_read_only_payload(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_analysis_market(db_session, suffix="full")
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_research_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get(f"/markets/{market.id}/analysis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market"]["id"] == market.id
    assert payload["market"]["question"] == "Will the Boston Celtics win the NBA Finals?"
    assert payload["market"]["event_title"] == "NBA Finals"
    assert payload["latest_snapshot"]["yes_price"] == "0.5200"
    assert payload["candidate_context"]["candidate_score"] is not None
    assert payload["candidate_context"]["research_template_name"]
    assert payload["external_signals"][0]["source"] == "kalshi"
    assert payload["external_signals"][0]["source_ticker"] == "KXNBAFINAL-CELTICS"
    assert payload["research_findings"][0]["claim"] == "Celtics rotation is healthy."
    assert payload["research_findings"][0]["citation_url"] == "https://example.com/finding"
    assert payload["prediction_reports"][0]["recommendation"] == "hold"
    assert payload["latest_prediction"]["prediction_family"] == "research_v1_local"
    assert payload["latest_prediction"]["recommendation"] == "hold"
    assert payload["prediction_history"][0]["id"] == payload["latest_prediction"]["id"]
    assert payload["evidence_items"][0]["citation_url"] == "https://example.com/evidence"
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_research_runs


def test_get_market_analysis_returns_empty_sections_for_market_without_evidence(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="analysis-empty-event",
        title="Empty NBA Market",
        category="sports",
        slug="analysis-empty-event",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id="analysis-empty-market",
        event_id=event.id,
        question="Will the Lakers beat the Warriors?",
        slug="analysis-empty-market",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
    )
    db_session.add(market)
    db_session.commit()

    response = client.get(f"/markets/{market.id}/analysis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_snapshot"] is None
    assert payload["candidate_context"] is not None
    assert payload["prediction_history"] == []
    assert payload["research_runs"] == []
    assert payload["research_findings"] == []
    assert payload["prediction_reports"] == []
    assert payload["evidence_items"] == []
    assert payload["external_signals"] == []
    assert set(payload["warnings"]).issuperset(
        {
            "missing_latest_snapshot",
            "no_evidence_found",
            "no_external_signals",
            "no_prediction_found",
        }
    )


def test_get_market_analysis_returns_404_for_unknown_market(client: TestClient) -> None:
    response = client.get("/markets/999999/analysis")

    assert response.status_code == 404


def test_market_analysis_endpoint_is_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/markets/{market_id}/analysis" in response.json()["paths"]


def _create_analysis_market(db_session: Session, *, suffix: str) -> Market:
    base_time = datetime(2026, 4, 26, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id=f"analysis-event-{suffix}",
        title="NBA Finals",
        category="sports",
        slug=f"analysis-event-{suffix}",
        image_url="https://example.com/event.png",
        icon_url="https://example.com/event-icon.png",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"analysis-market-{suffix}",
        event_id=event.id,
        question="Will the Boston Celtics win the NBA Finals?",
        slug=f"analysis-market-{suffix}",
        image_url="https://example.com/market.png",
        icon_url="https://example.com/market-icon.png",
        sport_type="nba",
        market_type="championship",
        active=True,
        closed=False,
        end_date=base_time + timedelta(days=45),
        rules_text="Resolves according to official NBA results.",
    )
    db_session.add(market)
    db_session.flush()
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=base_time,
            yes_price=Decimal("0.5200"),
            no_price=Decimal("0.4800"),
            midpoint=Decimal("0.5000"),
            last_trade_price=Decimal("0.5100"),
            spread=Decimal("0.0200"),
            volume=Decimal("23800000.0000"),
            liquidity=Decimal("354000.0000"),
        )
    )
    source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id=f"analysis-source-{suffix}",
        title="ESPN injury report",
        url="https://example.com/evidence",
        published_at=base_time - timedelta(hours=4),
        fetched_at=base_time - timedelta(hours=3),
        raw_json={"fixture": True},
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
            strength=Decimal("0.6500"),
            confidence=Decimal("0.80"),
            summary="Evidence summary for Celtics side.",
            high_contradiction=False,
            bookmaker_count=None,
            metadata_json={"source_review_required": False},
        )
    )
    research_run = ResearchRun(
        market_id=market.id,
        status="completed",
        vertical="sports",
        subvertical="nba",
        market_shape="championship",
        research_mode="local_only",
        model_used=None,
        web_search_used=False,
        degraded_mode=True,
        started_at=base_time - timedelta(hours=2),
        finished_at=base_time - timedelta(hours=1),
        total_sources_found=1,
        total_sources_used=1,
        confidence_score=Decimal("0.7300"),
        metadata_json={"mock_structural": True},
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
            impact_score=Decimal("0.8000"),
            freshness_score=Decimal("0.9000"),
            credibility_score=Decimal("0.8500"),
            claim="Celtics rotation is healthy.",
            evidence_summary="Mock fixture finding.",
            citation_url="https://example.com/finding",
            source_name="ESPN",
            published_at=base_time - timedelta(hours=5),
            metadata_json={"source_review_required": False},
        )
    )
    prediction = Prediction(
        market_id=market.id,
        research_run_id=research_run.id,
        run_at=base_time,
        model_version="fixture",
        prediction_family="research_v1_local",
        yes_probability=Decimal("0.5400"),
        no_probability=Decimal("0.4600"),
        confidence_score=Decimal("0.7300"),
        edge_signed=Decimal("0.0200"),
        edge_magnitude=Decimal("0.0200"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"fixture": True},
        components_json={"fixture": True},
    )
    db_session.add(prediction)
    db_session.flush()
    db_session.add(
        PredictionReport(
            market_id=market.id,
            prediction_id=prediction.id,
            research_run_id=research_run.id,
            thesis="Celtics have a modest evidence base.",
            evidence_for=[{"claim": "healthy rotation"}],
            evidence_against=[{"claim": "market already prices it"}],
            risks=[{"risk": "playoff variance"}],
            final_reasoning="Hold pending stronger evidence.",
            recommendation="hold",
            metadata_json={"mock_structural": True},
        )
    )
    db_session.add(
        ExternalMarketSignal(
            source="kalshi",
            source_market_id="KXNBAFINAL-CELTICS",
            source_event_id="KXNBAFINAL",
            source_ticker="KXNBAFINAL-CELTICS",
            polymarket_market_id=market.id,
            title="Kalshi Celtics NBA Finals",
            yes_probability=Decimal("0.5000"),
            no_probability=Decimal("0.5000"),
            mid_price=Decimal("0.5000"),
            last_price=Decimal("0.4900"),
            best_yes_bid=Decimal("0.4500"),
            best_yes_ask=Decimal("0.5500"),
            spread=Decimal("0.1000"),
            volume=Decimal("1000.0000"),
            liquidity=Decimal("2000.0000"),
            open_interest=Decimal("500.0000"),
            source_confidence=Decimal("0.7000"),
            match_confidence=Decimal("0.8000"),
            match_reason="fixture_match",
            warnings=[],
            raw_json={"fixture": True},
            fetched_at=base_time,
        )
    )
    return market
