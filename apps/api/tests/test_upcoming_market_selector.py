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
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets


NOW = datetime(2026, 4, 27, 12, 0, tzinfo=UTC)


def test_upcoming_selector_finds_near_match_winner(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="near-match",
        question="Will the Lakers beat the Warriors?",
        end_date=NOW + timedelta(hours=18),
    )
    _add_snapshot(db_session, market=market)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=1,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [market.id]
    assert selection.items[0].market_shape == "match_winner"
    assert selection.items[0].urgency_score > Decimal("0")
    assert "closes_within_24h:+30" in selection.items[0].reasons


def test_upcoming_selector_excludes_futures_by_default(db_session: Session) -> None:
    futures = _create_market(
        db_session,
        suffix="future-market",
        question="Will the Boston Celtics win the NBA Finals?",
        end_date=NOW + timedelta(days=2),
    )
    match = _create_market(
        db_session,
        suffix="match-market",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=futures)
    _add_snapshot(db_session, market=match)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.counts["championship_futures"] == 1


def test_upcoming_selector_can_include_futures(db_session: Session) -> None:
    futures = _create_market(
        db_session,
        suffix="include-future",
        question="Will the Boston Celtics win the NBA Finals?",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=futures)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        include_futures=True,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [futures.id]
    assert selection.items[0].market_shape == "championship"
    assert "future_or_championship_market" in selection.items[0].warnings


def test_upcoming_selector_respects_days_and_past_close_time(db_session: Session) -> None:
    near = _create_market(
        db_session,
        suffix="within-days",
        question="Will the Lakers beat the Warriors?",
        end_date=NOW + timedelta(days=2),
    )
    far = _create_market(
        db_session,
        suffix="outside-days",
        question="Will the Celtics beat the Knicks?",
        end_date=NOW + timedelta(days=8),
    )
    past = _create_market(
        db_session,
        suffix="past",
        question="Will the Nuggets beat the Suns?",
        end_date=NOW - timedelta(hours=2),
    )
    _add_snapshot(db_session, market=near)
    _add_snapshot(db_session, market=far)
    _add_snapshot(db_session, market=past)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=3,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [near.id]
    assert far.id not in [item.market_id for item in selection.items]
    assert past.id not in [item.market_id for item in selection.items]


def test_upcoming_selector_can_use_event_time_when_close_time_missing(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="event-time",
        question="Will the Lakers beat the Warriors?",
        end_date=None,
        event_start_at=NOW + timedelta(hours=12),
    )
    _add_snapshot(db_session, market=market)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=1,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [market.id]
    assert selection.items[0].close_time is None
    assert selection.items[0].event_time == NOW + timedelta(hours=12)


def test_upcoming_sports_endpoint_lists_items_without_mutating_db(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="endpoint",
        question="Will the Lakers beat the Warriors?",
        end_date=datetime.now(tz=UTC) + timedelta(hours=12),
    )
    _add_snapshot(db_session, market=market)
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    before_new = len(db_session.new)
    before_dirty = len(db_session.dirty)
    before_deleted = len(db_session.deleted)

    response = client.get("/research/upcoming-sports?limit=5&days=1&sport=nba")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["limit"] == 5
    assert payload["items"][0]["market_id"] == market.id
    assert payload["items"][0]["market_shape"] == "match_winner"
    assert payload["items"][0]["urgency_score"] is not None
    assert payload["counts"]["returned"] == 1
    assert payload["filters_applied"]["sport"] == "nba"
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs
    assert len(db_session.new) == before_new
    assert len(db_session.dirty) == before_dirty
    assert len(db_session.deleted) == before_deleted


def test_upcoming_sports_endpoint_respects_limit(client: TestClient, db_session: Session) -> None:
    first = _create_market(
        db_session,
        suffix="limit-first",
        question="Will the Lakers beat the Warriors?",
        end_date=datetime.now(tz=UTC) + timedelta(hours=12),
    )
    second = _create_market(
        db_session,
        suffix="limit-second",
        question="Will the Celtics beat the Knicks?",
        end_date=datetime.now(tz=UTC) + timedelta(hours=18),
    )
    _add_snapshot(db_session, market=first)
    _add_snapshot(db_session, market=second)
    db_session.commit()

    response = client.get("/research/upcoming-sports?limit=1&days=1&sport=nba")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert len(payload["items"]) == 1


def test_upcoming_sports_endpoint_is_documented_in_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/research/upcoming-sports" in response.json()["paths"]


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    end_date: datetime | None,
    event_start_at: datetime | None = None,
    event_category: str = "sports",
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool = True,
    closed: bool = False,
) -> Market:
    event = Event(
        polymarket_event_id=f"upcoming-event-{suffix}",
        title=f"Upcoming Event {suffix}",
        category=event_category,
        slug=f"upcoming-event-{suffix}",
        active=active,
        closed=closed,
        start_at=event_start_at,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"upcoming-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"upcoming-market-{suffix}",
        active=active,
        closed=closed,
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
    yes_price: Decimal = Decimal("0.5500"),
    no_price: Decimal = Decimal("0.4500"),
    liquidity: Decimal = Decimal("10000.0000"),
    volume: Decimal = Decimal("20000.0000"),
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
