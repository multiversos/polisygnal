from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun


def test_list_research_runs_empty_state(client: TestClient) -> None:
    response = client.get("/research/runs")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 0
    assert payload["items"] == []


def test_list_research_runs_filters_and_metadata(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session)
    other_market = _create_market(db_session, suffix="other")
    run = _create_research_run(
        db_session,
        market.id,
        status="pending_agent",
        research_mode="codex_agent",
        metadata_json={
            "request_path": "logs/research-agent/requests/1.json",
            "packet_path": "logs/research-agent/packets/1.md",
            "expected_response_path": "logs/research-agent/responses/1.json",
            "ingest_command": "python -m app.commands.ingest_codex_research --run-id 1",
        },
    )
    _create_research_run(
        db_session,
        other_market.id,
        status="completed",
        research_mode="local_only",
        started_at=datetime(2026, 4, 26, 13, 0, tzinfo=UTC),
    )
    db_session.add(
        ResearchFinding(
            research_run_id=run.id,
            market_id=market.id,
            factor_type="injury_context",
            stance="favor",
            impact_score=Decimal("0.5000"),
            freshness_score=Decimal("0.7000"),
            credibility_score=Decimal("0.8000"),
            claim="Starter available.",
            evidence_summary="Useful context.",
        )
    )
    db_session.commit()

    response = client.get(
        f"/research/runs?status=pending_agent&market_id={market.id}&research_mode=codex_agent"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    item = payload["items"][0]
    assert item["id"] == run.id
    assert item["market"]["question"] == "Will the Lakers beat the Warriors?"
    assert item["status"] == "pending_agent"
    assert item["research_mode"] == "codex_agent"
    assert item["has_findings"] is True
    assert item["has_report"] is False
    assert item["has_prediction"] is False
    assert item["request_path"].endswith("1.json")
    assert item["packet_path"].endswith("1.md")
    assert "pending_agent_response" in item["warnings"]


def test_research_run_detail_includes_outputs(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="detail")
    run = _create_research_run(db_session, market.id, status="completed")
    prediction = Prediction(
        market_id=market.id,
        research_run_id=run.id,
        model_version="test",
        prediction_family="manual_eval",
        yes_probability=Decimal("0.6000"),
        no_probability=Decimal("0.4000"),
        confidence_score=Decimal("0.7000"),
        edge_signed=Decimal("0.0500"),
        edge_magnitude=Decimal("0.0500"),
        edge_class="small",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"counts": {"odds_count": 0, "news_count": 0}},
    )
    db_session.add(prediction)
    db_session.flush()
    db_session.add(
        PredictionReport(
            market_id=market.id,
            research_run_id=run.id,
            prediction_id=prediction.id,
            thesis="Resumen de prueba.",
            evidence_for=[],
            evidence_against=[],
            risks=[],
            final_reasoning="No usar para trading.",
            recommendation="informational",
        )
    )
    db_session.commit()

    response = client.get(f"/research/runs/{run.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == run.id
    assert payload["has_report"] is True
    assert payload["has_prediction"] is True
    assert payload["prediction"]["prediction_family"] == "manual_eval"
    assert payload["report"]["thesis"] == "Resumen de prueba."


def test_research_runs_are_read_only(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="readonly")
    _create_research_run(db_session, market.id)
    db_session.commit()
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))

    response = client.get("/research/runs")

    assert response.status_code == 200
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions


def test_research_runs_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/research/runs" in paths
    assert "/research/runs/{run_id}" in paths
    assert "/research/runs/{run_id}/quality-gate" in paths


def test_research_run_quality_gate_without_report_is_instructional(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="quality-gate")
    run = _create_research_run(
        db_session,
        market.id,
        status="pending_agent",
        metadata_json={
            "expected_response_path": "logs/research-agent/responses/11.json",
            "ingest_command": "python -m app.commands.ingest_codex_research --run-id 11",
        },
    )
    db_session.commit()

    response = client.get(f"/research/runs/{run.id}/quality-gate")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending_dry_run"
    assert payload["dry_run_command"].endswith("--dry-run")
    assert payload["validation_report"] is None
    assert "validation_report_not_found" in payload["warnings"]


def test_research_run_quality_gate_uses_saved_validation_report(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="quality-gate-report")
    run = _create_research_run(
        db_session,
        market.id,
        status="completed",
        metadata_json={
            "validation_path": "logs/research-agent/validation/12.json",
            "validation_report": {
                "severity": "warning",
                "recommended_action": "review_required",
            },
        },
    )
    db_session.commit()

    response = client.get(f"/research/runs/{run.id}/quality-gate")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "requires_review"
    assert payload["validation_path"].endswith("12.json")
    assert payload["validation_report"]["recommended_action"] == "review_required"


def _create_market(db_session: Session, *, suffix: str = "research-run") -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title="NBA Research Event",
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


def _create_research_run(
    db_session: Session,
    market_id: int,
    *,
    status: str = "pending_agent",
    research_mode: str = "codex_agent",
    started_at: datetime | None = None,
    metadata_json: dict[str, object] | None = None,
) -> ResearchRun:
    run = ResearchRun(
        market_id=market_id,
        status=status,
        vertical="sports",
        market_shape="match_winner",
        research_mode=research_mode,
        model_used="codex_agent_external",
        web_search_used=False,
        degraded_mode=False,
        started_at=started_at or datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
        finished_at=(
            (started_at or datetime(2026, 4, 26, 12, 0, tzinfo=UTC)) + timedelta(minutes=10)
            if status == "completed"
            else None
        ),
        total_sources_found=0,
        total_sources_used=0,
        metadata_json=metadata_json,
    )
    db_session.add(run)
    db_session.flush()
    return run
