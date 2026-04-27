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


def test_daily_briefing_empty_state_is_stable(client: TestClient, db_session: Session) -> None:
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get("/briefing/daily")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["counts"]["upcoming_count"] == 0
    assert payload["summary"]["counts"]["watchlist_count"] == 0
    assert payload["upcoming_markets"] == []
    assert payload["watchlist"] == []
    assert payload["unmatched_external_signals"] == []
    assert payload["research_gaps"] == []
    assert payload["price_movers"] == []
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_daily_briefing_includes_upcoming_watchlist_signals_gaps_and_movers(
    client: TestClient,
    db_session: Session,
) -> None:
    upcoming = _create_market(
        db_session,
        suffix="briefing-upcoming",
        question="Will the Lakers beat the Warriors?",
        sport_type="nba",
        end_date=datetime.now(tz=UTC) + timedelta(hours=12),
    )
    watchlist_market = _create_market(
        db_session,
        suffix="briefing-watchlist",
        question="Will the Celtics beat the Knicks?",
        sport_type="nba",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    _add_snapshots(db_session, market=upcoming, prices=[Decimal("0.4100"), Decimal("0.4700")])
    _add_snapshots(
        db_session,
        market=watchlist_market,
        prices=[Decimal("0.6100"), Decimal("0.5800")],
    )
    db_session.add(
        WatchlistItem(
            market_id=watchlist_market.id,
            status="investigating",
            note="Revisar antes del cierre",
        )
    )
    db_session.add(
        ExternalMarketSignal(
            source="kalshi",
            source_ticker="KX-NBA-LAL-GSW",
            title="Lakers vs Warriors",
            yes_probability=Decimal("0.4900"),
            source_confidence=Decimal("0.8000"),
            warnings=["review_required"],
        )
    )
    db_session.commit()

    response = client.get("/briefing/daily?limit=5&days=3&sport=nba")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["sport"] == "nba"
    assert payload["summary"]["days"] == 3
    assert payload["summary"]["limit"] == 5
    assert payload["summary"]["counts"]["upcoming_count"] >= 2
    assert payload["summary"]["counts"]["watchlist_count"] == 1
    assert payload["summary"]["counts"]["unmatched_external_signals_count"] == 1
    assert payload["summary"]["counts"]["candidates_count"] >= 1
    assert {item["market_id"] for item in payload["upcoming_markets"]} >= {
        upcoming.id,
        watchlist_market.id,
    }
    assert payload["watchlist"][0]["market_id"] == watchlist_market.id
    assert payload["watchlist"][0]["status"] == "investigating"
    assert payload["unmatched_external_signals"][0]["source_ticker"] == "KX-NBA-LAL-GSW"
    assert any(gap["market_id"] == watchlist_market.id for gap in payload["research_gaps"])
    assert {mover["market_id"] for mover in payload["price_movers"]} >= {
        upcoming.id,
        watchlist_market.id,
    }


def test_daily_briefing_respects_limit_days_and_sport(
    client: TestClient,
    db_session: Session,
) -> None:
    nba = _create_market(
        db_session,
        suffix="briefing-nba",
        question="Lakers vs Warriors",
        sport_type="nba",
        end_date=datetime.now(tz=UTC) + timedelta(hours=10),
    )
    mlb = _create_market(
        db_session,
        suffix="briefing-mlb",
        question="Yankees vs Mets",
        sport_type="mlb",
        end_date=datetime.now(tz=UTC) + timedelta(hours=11),
    )
    far = _create_market(
        db_session,
        suffix="briefing-far",
        question="Celtics vs Knicks",
        sport_type="nba",
        end_date=datetime.now(tz=UTC) + timedelta(days=8),
    )
    _add_snapshots(db_session, market=nba, prices=[Decimal("0.5000")])
    _add_snapshots(db_session, market=mlb, prices=[Decimal("0.5000")])
    _add_snapshots(db_session, market=far, prices=[Decimal("0.5000")])
    db_session.commit()

    response = client.get("/briefing/daily?limit=1&days=1&sport=nba")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["upcoming_markets"]) == 1
    assert payload["upcoming_markets"][0]["market_id"] == nba.id
    assert mlb.id not in [item["market_id"] for item in payload["upcoming_markets"]]
    assert far.id not in [item["market_id"] for item in payload["upcoming_markets"]]


def test_daily_briefing_endpoint_is_documented_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/briefing/daily" in response.json()["paths"]


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    sport_type: str,
    end_date: datetime,
) -> Market:
    event = Event(
        polymarket_event_id=f"daily-briefing-event-{suffix}",
        title=f"Daily Briefing Event {suffix}",
        category="sports",
        slug=f"daily-briefing-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"daily-briefing-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"daily-briefing-market-{suffix}",
        sport_type=sport_type,
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshots(
    db_session: Session,
    *,
    market: Market,
    prices: list[Decimal],
) -> None:
    base_time = datetime.now(tz=UTC) - timedelta(hours=len(prices))
    for offset, yes_price in enumerate(prices):
        db_session.add(
            MarketSnapshot(
                market_id=market.id,
                captured_at=base_time + timedelta(hours=offset),
                yes_price=yes_price,
                no_price=Decimal("1.0000") - yes_price,
                midpoint=yes_price,
                last_trade_price=yes_price,
                spread=Decimal("0.0200"),
                volume=Decimal("12000.0000") + Decimal(offset),
                liquidity=Decimal("6000.0000") + Decimal(offset),
            )
        )
