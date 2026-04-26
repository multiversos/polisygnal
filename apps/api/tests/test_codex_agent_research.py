from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.commands import ingest_codex_research, prepare_codex_research
from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.models.source import Source
from app.repositories.predictions import get_latest_prediction_for_market
from app.schemas.codex_agent_research import CODEX_AGENT_OUTPUT_SCHEMA_VERSION
from app.services.research.codex_agent_adapter import (
    CODEX_AGENT_PREDICTION_FAMILY,
    ingest_codex_agent_research_response,
    prepare_codex_agent_research_request,
)


def test_prepare_codex_research_request_writes_safe_json(
    db_session: Session,
    tmp_path,
) -> None:
    market = _create_market_with_context(db_session, suffix="prepare")

    prepared = prepare_codex_agent_research_request(
        db_session,
        market=market,
        output_dir=tmp_path,
    )
    db_session.commit()

    payload = json.loads(prepared.request_path.read_text(encoding="utf-8"))
    raw_text = prepared.request_path.read_text(encoding="utf-8")

    assert prepared.research_run.status == "pending_agent"
    assert prepared.research_run.research_mode == "codex_agent"
    assert payload["run_id"] == prepared.research_run.id
    assert payload["market_id"] == market.id
    assert payload["vertical"] == "sports"
    assert payload["sport"] == "nba"
    assert payload["market_shape"] == "match_winner"
    assert payload["research_template_name"] == "sports_nba_match_winner"
    assert payload["classification_reason"]
    assert payload["classification_metadata"]["market_shape_reason"]
    assert payload["constraints"]["no_automatic_betting"] is True
    assert payload["existing_evidence"]
    assert "OPENAI_API_KEY" not in raw_text
    assert "auth.json" not in raw_text
    assert "sk-" not in raw_text


def test_ingest_valid_codex_response_creates_artifacts_and_keeps_families(
    db_session: Session,
    tmp_path,
) -> None:
    market = _create_market_with_context(db_session, suffix="valid")
    base_time = datetime(2026, 4, 22, 12, 0, tzinfo=UTC)
    scoring_prediction = _add_prediction(
        db_session,
        market=market,
        run_at=base_time,
        prediction_family="scoring_v1",
    )
    llm_prediction = _add_prediction(
        db_session,
        market=market,
        run_at=base_time + timedelta(minutes=1),
        prediction_family="research_v1_llm",
    )
    prepared = prepare_codex_agent_research_request(
        db_session,
        market=market,
        output_dir=tmp_path / "requests",
    )
    response_path = tmp_path / "responses" / f"{prepared.research_run.id}.json"
    response_path.parent.mkdir(parents=True, exist_ok=True)
    response_path.write_text(
        json.dumps(_valid_response(prepared.research_run.id, market.id), indent=2),
        encoding="utf-8",
    )

    result = ingest_codex_agent_research_response(
        db_session,
        run_id=prepared.research_run.id,
        response_path=response_path,
    )
    db_session.commit()

    assert result.ok is True
    assert result.research_run.status == "completed"
    assert len(result.findings) == 2
    assert result.report is not None
    assert result.prediction is not None
    assert result.prediction.prediction_family == CODEX_AGENT_PREDICTION_FAMILY
    assert result.prediction.components_json["research_mode"] == "codex_agent"
    assert result.prediction.yes_probability == Decimal("0.5900")

    findings = db_session.scalars(select(ResearchFinding)).all()
    reports = db_session.scalars(select(PredictionReport)).all()
    codex_predictions = db_session.scalars(
        select(Prediction).where(Prediction.prediction_family == CODEX_AGENT_PREDICTION_FAMILY)
    ).all()
    latest_scoring = get_latest_prediction_for_market(db_session, market.id)
    latest_llm = get_latest_prediction_for_market(
        db_session,
        market.id,
        prediction_family="research_v1_llm",
    )

    assert len(findings) == 2
    assert len(reports) == 1
    assert len(codex_predictions) == 1
    assert latest_scoring is not None
    assert latest_scoring.id == scoring_prediction.id
    assert latest_llm is not None
    assert latest_llm.id == llm_prediction.id


def test_ingest_invalid_codex_response_marks_failed_without_prediction(
    db_session: Session,
    tmp_path,
) -> None:
    market = _create_market_with_context(db_session, suffix="invalid")
    prepared = prepare_codex_agent_research_request(
        db_session,
        market=market,
        output_dir=tmp_path / "requests",
    )
    response_path = tmp_path / "responses" / f"{prepared.research_run.id}.json"
    response_path.parent.mkdir(parents=True, exist_ok=True)
    response_path.write_text(
        json.dumps(
            {
                "run_id": prepared.research_run.id,
                "market_id": market.id,
                "output_schema_version": CODEX_AGENT_OUTPUT_SCHEMA_VERSION,
                "market_summary": "Missing required fields.",
            }
        ),
        encoding="utf-8",
    )

    result = ingest_codex_agent_research_response(
        db_session,
        run_id=prepared.research_run.id,
        response_path=response_path,
    )
    db_session.commit()

    assert result.ok is False
    assert result.research_run.status == "failed"
    assert result.error_message is not None
    assert "Respuesta codex_agent invalida" in result.error_message
    assert db_session.scalars(select(Prediction)).all() == []
    assert db_session.scalars(select(PredictionReport)).all() == []


def test_ingest_codex_response_accepts_utf8_bom(
    db_session: Session,
    tmp_path,
) -> None:
    market = _create_market_with_context(db_session, suffix="bom")
    prepared = prepare_codex_agent_research_request(
        db_session,
        market=market,
        output_dir=tmp_path / "requests",
    )
    response_path = tmp_path / "responses" / f"{prepared.research_run.id}.json"
    response_path.parent.mkdir(parents=True, exist_ok=True)
    response_path.write_text(
        "\ufeff" + json.dumps(_valid_response(prepared.research_run.id, market.id)),
        encoding="utf-8",
    )

    result = ingest_codex_agent_research_response(
        db_session,
        run_id=prepared.research_run.id,
        response_path=response_path,
    )

    assert result.ok is True
    assert result.prediction is not None
    assert result.prediction.prediction_family == CODEX_AGENT_PREDICTION_FAMILY


def test_codex_agent_commands_import() -> None:
    assert prepare_codex_research.main is not None
    assert ingest_codex_research.main is not None


def _create_market_with_context(db_session: Session, *, suffix: str) -> Market:
    base_time = datetime(2026, 4, 22, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id=f"event-codex-{suffix}",
        title=f"NBA Codex {suffix}",
        category="sports",
        slug=f"nba-codex-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-codex-{suffix}",
        event_id=event.id,
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        slug=f"market-codex-{suffix}",
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
    source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id=f"codex-news-{suffix}",
        title="ESPN local context",
        url="https://example.com/codex-news",
        published_at=base_time - timedelta(hours=2),
        fetched_at=base_time - timedelta(hours=1),
        raw_json={},
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
            strength=None,
            confidence=Decimal("0.70"),
            summary="Existing local evidence favors the Knicks side.",
            high_contradiction=False,
            bookmaker_count=None,
            metadata_json={},
        )
    )
    db_session.commit()
    return market


def _add_prediction(
    db_session: Session,
    *,
    market: Market,
    run_at: datetime,
    prediction_family: str,
) -> Prediction:
    prediction = Prediction(
        market_id=market.id,
        run_at=run_at,
        model_version=prediction_family,
        prediction_family=prediction_family,
        yes_probability=Decimal("0.5400"),
        no_probability=Decimal("0.4600"),
        confidence_score=Decimal("0.6000"),
        edge_signed=Decimal("0.0000"),
        edge_magnitude=Decimal("0.0000"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": prediction_family},
    )
    db_session.add(prediction)
    db_session.flush()
    return prediction


def _valid_response(run_id: int, market_id: int) -> dict[str, object]:
    return {
        "run_id": run_id,
        "market_id": market_id,
        "output_schema_version": CODEX_AGENT_OUTPUT_SCHEMA_VERSION,
        "market_summary": "Codex agent sees a modest YES lean with matchup risk.",
        "participants": ["Knicks", "Hawks"],
        "evidence_for_yes": [
            {
                "claim": "Fact: Knicks have healthier rotation context in the cited update.",
                "factor_type": "injury_context",
                "stance": "favor",
                "impact_score": "0.8000",
                "freshness_score": "0.9000",
                "credibility_score": "0.8500",
                "source_name": "ESPN",
                "citation_url": "https://www.espn.com/nba/codex-agent",
                "published_at": "2026-04-22T10:00:00+00:00",
                "reasoning": "Healthier rotation supports a small YES adjustment.",
            }
        ],
        "evidence_against_yes": [
            {
                "claim": "Inference: Hawks transition scoring keeps upset risk live.",
                "factor_type": "matchup_risk",
                "stance": "against",
                "impact_score": "0.5500",
                "freshness_score": "0.8000",
                "credibility_score": "0.7000",
                "source_name": "NBA.com",
                "citation_url": "https://www.nba.com/codex-agent",
                "published_at": "2026-04-22T09:00:00+00:00",
                "reasoning": "The matchup risk limits conviction.",
            }
        ],
        "risks": [{"code": "playoff_variance", "summary": "Series variance remains high."}],
        "confidence_score": "0.7200",
        "recommended_probability_adjustment": "0.0500",
        "final_reasoning": "Use a small YES lean, not an automatic bet.",
        "recommendation": "lean_yes",
    }
