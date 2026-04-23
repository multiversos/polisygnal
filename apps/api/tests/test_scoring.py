from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.source import Source
from app.services.scoring import score_market


def test_score_market_uses_odds_formula_and_persists_prediction(db_session: Session) -> None:
    run_at = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id="event-score-1",
        title="Knicks vs Celtics",
        category="sports",
        slug="knicks-vs-celtics-score",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-score-1",
        event_id=event.id,
        question="Will the New York Knicks beat the Boston Celtics tonight?",
        slug="will-the-new-york-knicks-beat-the-boston-celtics-tonight-score",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=run_at - timedelta(hours=1),
        yes_price=Decimal("0.5000"),
        no_price=Decimal("0.5000"),
        spread=Decimal("0.0500"),
        liquidity=Decimal("100000.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()

    odds_source = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="odds-event-1",
        title="Boston Celtics at New York Knicks",
        fetched_at=run_at - timedelta(hours=1),
        raw_json={"id": "odds-event-1"},
    )
    news_source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id="https://www.espn.com/story/score-1",
        title="Knicks expect stronger bench rotation",
        url="https://www.espn.com/story/score-1",
        published_at=run_at - timedelta(hours=2),
        fetched_at=run_at - timedelta(hours=2),
        raw_text="Knicks expect stronger bench rotation against Boston.",
    )
    db_session.add_all([odds_source, news_source])
    db_session.flush()

    odds_evidence = EvidenceItem(
        market_id=market.id,
        source_id=odds_source.id,
        provider="the_odds_api",
        evidence_type="odds",
        stance="favor",
        strength=Decimal("0.6000"),
        confidence=Decimal("0.75"),
        summary="The Odds API favors the Knicks.",
        high_contradiction=False,
        bookmaker_count=3,
        metadata_json={"matched_event_id": "odds-event-1"},
    )
    news_evidence = EvidenceItem(
        market_id=market.id,
        source_id=news_source.id,
        provider="espn_rss",
        evidence_type="news",
        stance="unknown",
        strength=None,
        confidence=None,
        summary="Knicks news summary",
        high_contradiction=False,
        metadata_json={"url": "https://www.espn.com/story/score-1"},
    )
    db_session.add_all([odds_evidence, news_evidence])
    db_session.commit()

    settings = get_settings().model_copy(
        update={
            "scoring_model_version": "scoring_v1",
            "scoring_low_liquidity_threshold": 50000.0,
            "scoring_odds_window_hours": 24,
            "scoring_news_window_hours": 48,
            "scoring_freshness_window_hours": 24,
        }
    )
    result = score_market(
        db_session,
        market=market,
        settings=settings,
        run_at=run_at,
    )
    db_session.commit()

    assert result.prediction is not None
    prediction = result.prediction
    assert prediction.yes_probability == Decimal("0.5600")
    assert prediction.no_probability == Decimal("0.4400")
    assert prediction.edge_signed == Decimal("0.0600")
    assert prediction.edge_magnitude == Decimal("0.0600")
    assert prediction.edge_class == "moderate"
    assert prediction.confidence_score == Decimal("1.0000")
    assert prediction.opportunity is True
    assert prediction.review_confidence is True
    assert prediction.review_edge is False
    assert prediction.explanation_json["summary"] == "Model differs from market, moderate edge, high confidence"
    assert prediction.explanation_json["computed"]["base_yes_probability"] == "0.5600"
    assert prediction.explanation_json["computed"]["structured_context_adjustment"] == "0.0000"
    assert prediction.explanation_json["structured_context"]["has_structured_data"] is False
    assert prediction.explanation_json["structured_context"]["missing_components"] == [
        "injury_score",
        "form_score",
        "rest_score",
        "home_advantage_score",
    ]
    assert prediction.explanation_json["structured_context"]["components"]["injury_score"] == {
        "value": "0.0000",
        "available": False,
        "source": None,
        "note": "missing_structured_context",
    }

    count_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    assert count_predictions == 1


def test_score_market_falls_back_to_market_price_without_odds(db_session: Session) -> None:
    run_at = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id="event-score-2",
        title="Kings future",
        category="sports",
        slug="kings-future-score",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-score-2",
        event_id=event.id,
        question="Will the Sacramento Kings win the 2026 NBA Finals?",
        slug="will-the-sacramento-kings-win-the-2026-nba-finals-score",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=run_at - timedelta(hours=1),
        yes_price=Decimal("0.4200"),
        no_price=Decimal("0.5800"),
        spread=Decimal("0.1200"),
        liquidity=Decimal("1000.0000"),
    )
    db_session.add(snapshot)
    db_session.commit()

    result = score_market(
        db_session,
        market=market,
        settings=get_settings().model_copy(update={"scoring_low_liquidity_threshold": 50000.0}),
        run_at=run_at,
    )
    db_session.commit()

    assert result.prediction is not None
    prediction = result.prediction
    assert prediction.yes_probability == Decimal("0.4200")
    assert prediction.no_probability == Decimal("0.5800")
    assert prediction.edge_signed == Decimal("0.0000")
    assert prediction.edge_class == "no_signal"
    assert prediction.opportunity is False
    assert prediction.confidence_score == Decimal("0.1666")
    assert prediction.explanation_json["summary"] == "Insufficient evidence, defaulting close to market"
    assert prediction.explanation_json["computed"]["base_yes_probability"] == "0.4200"
    assert prediction.explanation_json["computed"]["structured_context_adjustment"] == "0.0000"
    assert prediction.explanation_json["structured_context"]["has_structured_data"] is False


def test_score_market_ignores_persisted_evidence_for_non_eligible_market(
    db_session: Session,
) -> None:
    run_at = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id="event-score-3",
        title="Kings future",
        category="sports",
        slug="kings-future-score-ignore-evidence",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-score-3",
        event_id=event.id,
        question="Will the Sacramento Kings win the 2026 NBA Finals?",
        slug="will-the-sacramento-kings-win-the-2026-nba-finals-score-ignore-evidence",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=run_at - timedelta(hours=1),
        yes_price=Decimal("0.4200"),
        no_price=Decimal("0.5800"),
        spread=Decimal("0.0200"),
        liquidity=Decimal("100000.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()

    odds_source = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="odds-event-ignore",
        title="Sacramento Kings at Boston Celtics",
        fetched_at=run_at - timedelta(hours=1),
        raw_json={"id": "odds-event-ignore"},
    )
    db_session.add(odds_source)
    db_session.flush()

    db_session.add(
        EvidenceItem(
            market_id=market.id,
            source_id=odds_source.id,
            provider="the_odds_api",
            evidence_type="odds",
            stance="favor",
            strength=Decimal("0.8000"),
            confidence=Decimal("1.00"),
            summary="Persisted odds that should be ignored for non-eligible markets.",
            high_contradiction=False,
            bookmaker_count=5,
            metadata_json={"matched_event_id": "odds-event-ignore"},
        )
    )
    db_session.commit()

    result = score_market(
        db_session,
        market=market,
        settings=get_settings().model_copy(update={"scoring_low_liquidity_threshold": 50000.0}),
        run_at=run_at,
    )
    db_session.commit()

    assert result.prediction is not None
    prediction = result.prediction
    assert prediction.yes_probability == Decimal("0.4200")
    assert prediction.no_probability == Decimal("0.5800")
    assert prediction.explanation_json["inputs"]["evidence_eligible"] is False
    assert prediction.explanation_json["inputs"]["evidence_skip_reason"] == "single_team_market"
    assert prediction.explanation_json["counts"]["odds_count"] == 0
    assert prediction.explanation_json["computed"]["structured_context_adjustment"] == "0.0000"
    assert prediction.explanation_json["structured_context"]["has_structured_data"] is False


def test_score_market_applies_structured_context_adjustments_when_present(
    db_session: Session,
) -> None:
    run_at = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id="event-score-4",
        title="Lakers vs Warriors",
        category="sports",
        slug="lakers-vs-warriors-score",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-score-4",
        event_id=event.id,
        question="Will the Los Angeles Lakers beat the Golden State Warriors tonight?",
        slug="will-the-los-angeles-lakers-beat-the-golden-state-warriors-tonight-score",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=run_at - timedelta(hours=1),
        yes_price=Decimal("0.5000"),
        no_price=Decimal("0.5000"),
        spread=Decimal("0.0400"),
        liquidity=Decimal("90000.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()

    odds_source = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="odds-event-4",
        title="Golden State Warriors at Los Angeles Lakers",
        fetched_at=run_at - timedelta(hours=1),
        raw_json={"id": "odds-event-4"},
    )
    news_source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id="https://www.espn.com/story/score-4",
        title="Lakers get healthier ahead of Warriors matchup",
        url="https://www.espn.com/story/score-4",
        published_at=run_at - timedelta(minutes=90),
        fetched_at=run_at - timedelta(minutes=90),
        raw_text="Lakers get healthier ahead of Warriors matchup.",
        raw_json={"url": "https://www.espn.com/story/score-4"},
    )
    db_session.add_all([odds_source, news_source])
    db_session.flush()

    odds_evidence = EvidenceItem(
        market_id=market.id,
        source_id=odds_source.id,
        provider="the_odds_api",
        evidence_type="odds",
        stance="favor",
        strength=Decimal("0.6000"),
        confidence=Decimal("0.80"),
        summary="The Odds API slightly favors the Lakers.",
        high_contradiction=False,
        bookmaker_count=3,
        metadata_json={
            "structured_context": {
                "home_advantage_score": "0.0080",
                "availability": {
                    "home_advantage_score": True,
                },
                "reasons": {
                    "home_advantage_score": "target_team_is_home",
                },
            }
        },
    )
    news_evidence = EvidenceItem(
        market_id=market.id,
        source_id=news_source.id,
        provider="espn_rss",
        evidence_type="news",
        stance="favor",
        strength=None,
        confidence=Decimal("0.60"),
        summary="Lakers structured context summary",
        high_contradiction=False,
        metadata_json={
            "url": "https://www.espn.com/story/score-4",
            "structured_context": {
                "injury_score": "0.0100",
                "form_score": "0.0050",
                "rest_score": "-0.0030",
                "availability": {
                    "injury_score": True,
                    "form_score": True,
                    "rest_score": True,
                },
                "reasons": {
                    "injury_score": "positive_injury_score_target_team",
                    "form_score": "positive_form_score_target_team",
                    "rest_score": "negative_rest_score_target_team",
                },
            },
        },
    )
    db_session.add_all([odds_evidence, news_evidence])
    db_session.commit()

    settings = get_settings().model_copy(
        update={
            "scoring_model_version": "scoring_v1",
            "scoring_low_liquidity_threshold": 50000.0,
            "scoring_odds_window_hours": 24,
            "scoring_news_window_hours": 48,
            "scoring_freshness_window_hours": 24,
        }
    )
    result = score_market(
        db_session,
        market=market,
        settings=settings,
        run_at=run_at,
    )
    db_session.commit()

    assert result.prediction is not None
    prediction = result.prediction
    assert prediction.yes_probability == Decimal("0.5800")
    assert prediction.no_probability == Decimal("0.4200")
    assert prediction.edge_signed == Decimal("0.0800")
    assert prediction.edge_magnitude == Decimal("0.0800")
    assert prediction.opportunity is True
    assert prediction.explanation_json["computed"]["base_yes_probability"] == "0.5600"
    assert prediction.explanation_json["computed"]["structured_context_adjustment"] == "0.0200"
    assert prediction.explanation_json["structured_context"]["has_structured_data"] is True
    assert prediction.explanation_json["structured_context"]["applied_to_yes_probability"] is True
    assert prediction.explanation_json["structured_context"]["available_component_count"] == 4
    assert prediction.explanation_json["structured_context"]["missing_components"] == []
    assert prediction.explanation_json["structured_context"]["components"]["injury_score"] == {
        "value": "0.0100",
        "available": True,
        "source": "espn_rss:news:metadata_json",
        "note": "positive_injury_score_target_team",
    }
    assert prediction.explanation_json["structured_context"]["components"]["home_advantage_score"] == {
        "value": "0.0080",
        "available": True,
        "source": "the_odds_api:odds:metadata_json",
        "note": "target_team_is_home",
    }
