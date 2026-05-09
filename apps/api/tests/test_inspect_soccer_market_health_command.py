from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.commands.inspect_soccer_market_health import inspect_soccer_market_health
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction


def test_inspect_soccer_market_health_is_read_only_and_reports_freshness(
    db_session: Session,
) -> None:
    now = datetime(2026, 5, 8, 12, 0, tzinfo=UTC)
    event = Event(
        polymarket_event_id="event-1",
        title="Brighton vs Wolves",
        slug="brighton-wolves",
        active=True,
        closed=False,
    )
    fresh_market = Market(
        polymarket_market_id="remote-1",
        event=event,
        question="Will Brighton win?",
        slug="brighton-win",
        sport_type="soccer",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=now + timedelta(days=1),
    )
    stale_market = Market(
        polymarket_market_id="remote-2",
        event=event,
        question="Will Wolves win?",
        slug="wolves-win",
        sport_type="soccer",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=now + timedelta(days=1),
    )
    basketball_market = Market(
        polymarket_market_id="remote-3",
        event=event,
        question="Will Example Basketball win?",
        slug="basketball-win",
        sport_type="basketball",
        market_type="match_winner",
        active=True,
        closed=False,
    )
    db_session.add_all([event, fresh_market, stale_market, basketball_market])
    db_session.flush()
    db_session.add(
        MarketSnapshot(
            market_id=fresh_market.id,
            captured_at=now - timedelta(hours=2),
            yes_price=Decimal("0.5100"),
            no_price=Decimal("0.4900"),
            liquidity=Decimal("100.0000"),
            volume=Decimal("50.0000"),
        )
    )
    db_session.add(
        Prediction(
            market_id=fresh_market.id,
            run_at=now - timedelta(hours=2),
            model_version="test",
            prediction_family="test",
            yes_probability=Decimal("0.5100"),
            no_probability=Decimal("0.4900"),
            confidence_score=Decimal("0.2000"),
            edge_signed=Decimal("0.0000"),
            edge_magnitude=Decimal("0.0000"),
            edge_class="no_signal",
            opportunity=False,
            review_confidence=False,
            review_edge=False,
            explanation_json={},
        )
    )
    db_session.flush()

    payload = inspect_soccer_market_health(
        db_session,
        stale_hours=48,
        sample_limit=5,
        now=now,
    )

    assert payload["read_only"] is True
    assert payload["total_soccer_markets"] == 2
    assert payload["with_snapshot"] == 1
    assert payload["without_snapshot"] == 1
    assert payload["with_prediction"] == 1
    assert payload["without_prediction"] == 1
    assert payload["active"] == 2
    assert payload["closed"] == 0
    assert payload["recently_updated"] == 1
    assert payload["stale"] == 1
    assert payload["missing_snapshot"] == 1
    assert payload["missing_prediction"] == 1
    assert payload["missing_price"] == 1
    assert payload["missing_liquidity"] == 1
    assert payload["missing_volume"] == 1
    assert payload["top_stale_markets"][0]["market_id"] == stale_market.id
    assert payload["top_missing_snapshot_markets"][0]["market_id"] == stale_market.id
    assert payload["top_missing_prediction_markets"][0]["market_id"] == stale_market.id
    assert payload["sample_markets_needing_refresh"][0]["market_id"] == stale_market.id
    assert "missing_snapshot" in payload["sample_markets_needing_refresh"][0]["reasons"]
    assert payload["sample_markets_needing_refresh"][0]["has_snapshot"] is False
    assert payload["sample_markets_needing_refresh"][0]["has_prediction"] is False
