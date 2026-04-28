from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_data_health_overview_counts_coverage(
    client: TestClient,
    db_session: Session,
) -> None:
    now = datetime.now(tz=UTC)
    nba_market = _create_market(
        db_session,
        suffix="nba-priced",
        sport="nba",
        end_date=now + timedelta(days=2),
    )
    soccer_market = _create_market(
        db_session,
        suffix="soccer-missing-price",
        sport="soccer",
        end_date=now + timedelta(days=3),
    )
    other_market = _create_market(
        db_session,
        suffix="other-no-close",
        sport=None,
        end_date=None,
    )
    db_session.add(
        MarketSnapshot(
            market_id=nba_market.id,
            captured_at=now,
            yes_price=Decimal("0.6100"),
            no_price=Decimal("0.3900"),
            volume=Decimal("100.0000"),
            liquidity=Decimal("500.0000"),
        )
    )
    db_session.add(
        MarketSnapshot(
            market_id=soccer_market.id,
            captured_at=now,
            yes_price=None,
            no_price=Decimal("0.4800"),
        )
    )
    db_session.commit()

    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    response = client.get("/data-health/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_markets"] == 3
    assert payload["active_markets"] == 3
    assert payload["upcoming_markets_count"] == 2
    assert payload["markets_with_snapshots"] == 2
    assert payload["markets_missing_snapshots"] == 1
    assert payload["markets_missing_prices"] == 2
    assert payload["markets_missing_close_time"] == 1
    assert payload["sport_other_count"] == 1
    assert payload["latest_snapshot_at"] is not None
    coverage = {item["sport"]: item for item in payload["coverage_by_sport"]}
    assert coverage["nba"]["with_snapshot"] == 1
    assert coverage["soccer"]["missing_price"] == 1
    assert coverage["other"]["missing_close_time"] == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_data_health_openapi_includes_endpoint(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/data-health/overview" in response.json()["paths"]


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    sport: str | None,
    end_date: datetime | None,
) -> Market:
    event = Event(
        polymarket_event_id=f"data-health-event-{suffix}",
        title=f"Data Health Event {suffix}",
        category="sports",
        slug=f"data-health-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"data-health-market-{suffix}",
        event_id=event.id,
        question=f"Data health market {suffix}",
        slug=f"data-health-market-{suffix}",
        sport_type=sport,
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market
