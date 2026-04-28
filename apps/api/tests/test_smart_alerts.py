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
from app.models.watchlist_item import WatchlistItem


def test_smart_alerts_endpoint_generates_read_only_operational_alerts(
    client: TestClient,
    db_session: Session,
) -> None:
    no_snapshot_market = _create_market(
        db_session,
        suffix="missing-snapshot",
        question="Lakers vs Warriors",
        end_date=datetime.now(tz=UTC) + timedelta(hours=8),
    )
    watchlist_market = _create_market(
        db_session,
        suffix="watchlist",
        question="Celtics vs Knicks",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    _create_snapshot(db_session, watchlist_market.id)
    db_session.add(WatchlistItem(market_id=watchlist_market.id, status="watching"))
    db_session.add(
        ExternalMarketSignal(
            source="kalshi",
            source_ticker="KX-NBA-LAL-GSW",
            title="Lakers vs Warriors",
            yes_probability=Decimal("0.5100"),
            source_confidence=Decimal("0.8000"),
        )
    )
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get("/alerts/smart?limit=20&sport=nba")

    assert response.status_code == 200
    payload = response.json()
    alert_types = {alert["type"] for alert in payload["alerts"]}
    reasons = {alert["reason"] for alert in payload["alerts"]}
    assert "missing_data" in alert_types
    assert "watchlist_needs_review" in alert_types
    assert "external_signal_unmatched" in alert_types
    assert "upcoming_close_soon" in alert_types
    assert "missing_snapshot" in reasons
    assert "polysignal_score_pending" in reasons
    assert payload["counts"]["total"] >= len(payload["alerts"])
    assert any(alert["market_id"] == no_snapshot_market.id for alert in payload["alerts"])
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_smart_alerts_respects_limit_and_severity_filter(
    client: TestClient,
    db_session: Session,
) -> None:
    for index in range(3):
        _create_market(
            db_session,
            suffix=f"severity-{index}",
            question=f"Lakers vs Warriors {index}",
            end_date=datetime.now(tz=UTC) + timedelta(hours=6 + index),
        )
    db_session.commit()

    response = client.get("/alerts/smart?limit=1&severity=warning")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["alerts"]) <= 1
    assert all(alert["severity"] == "warning" for alert in payload["alerts"])


def test_smart_alerts_empty_state_and_openapi(client: TestClient) -> None:
    empty_response = client.get("/alerts/smart")
    openapi_response = client.get("/openapi.json")

    assert empty_response.status_code == 200
    assert empty_response.json()["alerts"] == []
    assert empty_response.json()["counts"]["total"] == 0
    assert openapi_response.status_code == 200
    assert "/alerts/smart" in openapi_response.json()["paths"]


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    end_date: datetime,
) -> Market:
    event = Event(
        polymarket_event_id=f"smart-alert-event-{suffix}",
        title=f"Smart Alert Event {suffix}",
        category="sports",
        slug=f"smart-alert-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"smart-alert-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"smart-alert-market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_snapshot(db_session: Session, market_id: int) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market_id,
        captured_at=datetime.now(tz=UTC) - timedelta(hours=1),
        yes_price=Decimal("0.5200"),
        no_price=Decimal("0.4800"),
        liquidity=Decimal("1000.0000"),
        volume=Decimal("2500.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot
