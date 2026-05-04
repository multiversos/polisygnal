from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.research.upcoming_data_quality import list_upcoming_data_quality


NOW = datetime(2026, 4, 27, 12, 0, tzinfo=UTC)


def test_upcoming_data_quality_empty_state(db_session: Session) -> None:
    selection = list_upcoming_data_quality(db_session, limit=10, now=NOW)

    assert selection.summary == {
        "total": 0,
        "complete_count": 0,
        "partial_count": 0,
        "insufficient_count": 0,
        "missing_price_count": 0,
        "missing_snapshot_count": 0,
        "missing_close_time_count": 0,
        "sport_other_count": 0,
    }
    assert selection.items == []
    assert selection.filters_applied["days"] == 7
    assert selection.filters_applied["focus"] == "match_winner"


def test_upcoming_data_quality_marks_complete_market(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="complete",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=market)
    _add_prediction(db_session, market=market)
    _add_research_run(db_session, market=market)
    _add_external_signal(db_session, market=market)

    selection = list_upcoming_data_quality(db_session, sport="nba", limit=10, now=NOW)

    assert selection.summary["total"] == 1
    assert selection.summary["complete_count"] == 1
    item = selection.items[0]
    assert item.market_id == market.id
    assert item.quality_label == "Completo"
    assert item.quality_score >= 80
    assert item.has_snapshot is True
    assert item.has_yes_price is True
    assert item.has_no_price is True
    assert item.has_prediction is True
    assert item.has_research is True
    assert item.has_external_signal is True
    assert item.has_polysignal_score is True
    assert item.missing_fields == []
    assert item.freshness is not None
    assert item.freshness.freshness_status == "fresh"
    assert item.freshness.recommended_action == "ok"


def test_upcoming_data_quality_detects_missing_price(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="missing-price",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=market, yes_price=None, no_price=None)

    selection = list_upcoming_data_quality(db_session, sport="nba", limit=10, now=NOW)

    item = selection.items[0]
    assert selection.summary["missing_price_count"] == 1
    assert item.has_snapshot is True
    assert item.has_yes_price is False
    assert item.has_no_price is False
    assert "yes_price" in item.missing_fields
    assert "no_price" in item.missing_fields
    assert "missing_price" in item.warnings
    assert "polysignal_score_pending" in item.warnings


def test_upcoming_data_quality_detects_missing_snapshot(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="missing-snapshot",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )

    selection = list_upcoming_data_quality(db_session, sport="nba", limit=10, now=NOW)

    item = selection.items[0]
    assert item.market_id == market.id
    assert selection.summary["missing_snapshot_count"] == 1
    assert item.has_snapshot is False
    assert "snapshot" in item.missing_fields
    assert "missing_snapshot" in item.warnings
    assert "polysignal_score" in item.missing_fields
    assert item.freshness is not None
    assert item.freshness.freshness_status == "incomplete"
    assert item.freshness.recommended_action == "needs_snapshot"


def test_upcoming_data_quality_detects_missing_close_time_with_event_time(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="event-time",
        question="Lakers vs Warriors",
        end_date=None,
        event_start_at=NOW + timedelta(hours=20),
    )
    _add_snapshot(db_session, market=market)

    selection = list_upcoming_data_quality(db_session, sport="nba", limit=10, now=NOW)

    item = selection.items[0]
    assert item.market_id == market.id
    assert selection.summary["missing_close_time_count"] == 1
    assert item.close_time is None
    assert "close_time" in item.missing_fields
    assert "missing_close_time" in item.warnings


def test_upcoming_data_quality_endpoint_responds_without_mutating_db(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="endpoint",
        question="Lakers vs Warriors",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    _add_snapshot(db_session, market=market)
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    before_new = len(db_session.new)
    before_dirty = len(db_session.dirty)
    before_deleted = len(db_session.deleted)

    response = client.get("/research/upcoming-sports/data-quality?sport=nba&limit=10")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total"] == 1
    assert payload["items"][0]["market_id"] == market.id
    assert payload["items"][0]["quality_label"] in {"Completo", "Parcial", "Insuficiente"}
    assert payload["items"][0]["freshness"]["freshness_status"] in {
        "fresh",
        "incomplete",
        "stale",
        "unknown",
    }
    assert payload["filters_applied"]["sport"] == "basketball"
    assert payload["filters_applied"]["days"] == 7
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs
    assert len(db_session.new) == before_new
    assert len(db_session.dirty) == before_dirty
    assert len(db_session.deleted) == before_deleted


def test_upcoming_data_quality_endpoint_is_documented_in_openapi(
    client: TestClient,
) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/research/upcoming-sports/data-quality" in response.json()["paths"]


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    end_date: datetime | None,
    event_start_at: datetime | None = None,
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
) -> Market:
    event = Event(
        polymarket_event_id=f"quality-event-{suffix}",
        title=f"Quality Event {suffix}",
        category="sports",
        slug=f"quality-event-{suffix}",
        active=True,
        closed=False,
        start_at=event_start_at,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"quality-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"quality-market-{suffix}",
        active=True,
        closed=False,
        sport_type=sport_type,
        market_type=market_type,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    *,
    market: Market,
    yes_price: Decimal | None = Decimal("0.5500"),
    no_price: Decimal | None = Decimal("0.4500"),
    liquidity: Decimal | None = Decimal("10000.0000"),
    volume: Decimal | None = Decimal("20000.0000"),
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=datetime.now(tz=UTC),
        yes_price=yes_price,
        no_price=no_price,
        midpoint=Decimal("0.5000"),
        last_trade_price=yes_price,
        spread=Decimal("0.0200"),
        liquidity=liquidity,
        volume=volume,
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot


def _add_prediction(db_session: Session, *, market: Market) -> Prediction:
    prediction = Prediction(
        market_id=market.id,
        model_version="test",
        prediction_family="test",
        yes_probability=Decimal("0.6100"),
        no_probability=Decimal("0.3900"),
        confidence_score=Decimal("0.8000"),
        edge_signed=Decimal("0.0600"),
        edge_magnitude=Decimal("0.0600"),
        edge_class="positive",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={},
    )
    db_session.add(prediction)
    db_session.flush()
    return prediction


def _add_research_run(db_session: Session, *, market: Market) -> ResearchRun:
    run = ResearchRun(
        market_id=market.id,
        status="completed",
        vertical="sports",
        subvertical="nba",
        market_shape="match_winner",
        research_mode="local_only",
        web_search_used=False,
        degraded_mode=False,
        total_sources_found=0,
        total_sources_used=0,
    )
    db_session.add(run)
    db_session.flush()
    return run


def _add_external_signal(db_session: Session, *, market: Market) -> ExternalMarketSignal:
    signal = ExternalMarketSignal(
        source="kalshi",
        source_market_id=f"kalshi-quality-{market.id}",
        source_ticker=f"KXQUALITY-{market.id}",
        polymarket_market_id=market.id,
        title=market.question,
        yes_probability=Decimal("0.6000"),
        source_confidence=Decimal("0.8000"),
        match_confidence=Decimal("0.8500"),
    )
    db_session.add(signal)
    db_session.flush()
    return signal
