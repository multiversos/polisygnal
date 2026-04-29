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


def test_upcoming_selector_defaults_to_match_winner_focus(db_session: Session) -> None:
    match = _create_market(
        db_session,
        suffix="focus-match",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )
    player_prop = _create_market(
        db_session,
        suffix="focus-prop",
        question="Will LeBron James score over 25 points?",
        end_date=NOW + timedelta(hours=8),
        market_type="player_prop",
    )
    _add_snapshot(db_session, market=match)
    _add_snapshot(db_session, market=player_prop)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.filters_applied["focus"] == "match_winner"
    assert selection.counts["focus_skipped"] == 1


def test_upcoming_selector_skips_series_markets_by_default(db_session: Session) -> None:
    match = _create_market(
        db_session,
        suffix="single-game-focus",
        question="Lakers vs Warriors",
        end_date=NOW + timedelta(days=2),
    )
    series = _create_market(
        db_session,
        suffix="series-focus",
        question="NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=match)
    _add_snapshot(db_session, market=series)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.counts["focus_skipped"] == 1


def test_upcoming_selector_skips_prop_like_matchups_by_default(db_session: Session) -> None:
    match = _create_market(
        db_session,
        suffix="real-match-focus",
        question="T20 BIFA Cup: Dragon Xi vs Bodoland",
        end_date=NOW + timedelta(hours=20),
    )
    toss = _create_market(
        db_session,
        suffix="toss-focus",
        question="T20 BIFA Cup: Dragon Xi vs Bodoland - Who wins the toss?",
        end_date=NOW + timedelta(hours=20),
    )
    most_sixes = _create_market(
        db_session,
        suffix="sixes-focus",
        question="T20 BIFA Cup: Dragon Xi vs Bodoland - Most Sixes Dragon Xi Winner",
        end_date=NOW + timedelta(hours=20),
    )
    _add_snapshot(db_session, market=match)
    _add_snapshot(db_session, market=toss)
    _add_snapshot(db_session, market=most_sixes)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.counts["focus_skipped"] == 2


def test_upcoming_selector_sport_filter_uses_classification_not_metadata(
    db_session: Session,
) -> None:
    soccer = _create_market(
        db_session,
        suffix="soccer-no-metadata",
        question="Real Madrid vs Barcelona",
        end_date=NOW + timedelta(days=2),
        sport_type=None,
    )
    _add_snapshot(db_session, market=soccer)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="soccer",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [soccer.id]
    assert selection.items[0].sport == "soccer"
    assert selection.items[0].market_shape == "match_winner"


def test_upcoming_selector_includes_j_league_style_soccer_winner(
    db_session: Session,
) -> None:
    soccer = _create_market(
        db_session,
        suffix="j-league-winner",
        question="Will Vissel Kobe win on 2026-04-29?",
        event_title="Vissel Kobe vs. Cerezo Osaka",
        end_date=NOW + timedelta(days=2),
        sport_type=None,
    )
    _add_snapshot(db_session, market=soccer)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="soccer",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [soccer.id]
    assert selection.items[0].sport == "soccer"
    assert selection.items[0].market_shape == "match_winner"


def test_upcoming_selector_supports_mma_filter_without_metadata(db_session: Session) -> None:
    fight = _create_market(
        db_session,
        suffix="mma-no-metadata",
        question="UFC 300: Jones vs. Aspinall",
        end_date=NOW + timedelta(days=2),
        sport_type=None,
    )
    _add_snapshot(db_session, market=fight)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="mma",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [fight.id]
    assert selection.items[0].sport == "mma"


def test_upcoming_selector_supports_cricket_filter_without_metadata(db_session: Session) -> None:
    match = _create_market(
        db_session,
        suffix="cricket-no-metadata",
        question="T20 World Cup: India vs Australia",
        end_date=NOW + timedelta(days=2),
        sport_type=None,
    )
    _add_snapshot(db_session, market=match)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="cricket",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.items[0].sport == "cricket"


def test_upcoming_selector_does_not_require_non_nba_participants(
    db_session: Session,
) -> None:
    fight = _create_market(
        db_session,
        suffix="mma-event-title",
        question="Will Pereira win?",
        event_title="UFC Fight Night: Pereira vs Ankalaev",
        end_date=NOW + timedelta(days=2),
        sport_type=None,
    )
    _add_snapshot(db_session, market=fight)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="mma",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [fight.id]
    assert selection.items[0].participants == []
    assert "participants_uncertain" in selection.items[0].warnings


def test_upcoming_selector_excludes_cricket_props_by_default(db_session: Session) -> None:
    match = _create_market(
        db_session,
        suffix="cricket-main-match",
        question="Pakistan Super League: Lahore Qalandars vs Quetta Gladiators",
        end_date=NOW + timedelta(hours=20),
        sport_type=None,
    )
    toss = _create_market(
        db_session,
        suffix="cricket-toss",
        question="Pakistan Super League: Lahore Qalandars vs Quetta Gladiators - Who wins the toss?",
        end_date=NOW + timedelta(hours=20),
        sport_type=None,
    )
    _add_snapshot(db_session, market=match)
    _add_snapshot(db_session, market=toss)

    selection = list_upcoming_sports_markets(
        db_session,
        sport="cricket",
        limit=10,
        days=7,
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [match.id]
    assert selection.counts["focus_skipped"] == 1


def test_upcoming_selector_all_focus_can_include_sports_props(db_session: Session) -> None:
    player_prop = _create_market(
        db_session,
        suffix="all-focus-prop",
        question="Will LeBron James score over 25 points?",
        end_date=NOW + timedelta(hours=8),
        market_type="player_prop",
    )
    _add_snapshot(db_session, market=player_prop)

    selection = list_upcoming_sports_markets(
        db_session,
        limit=10,
        days=7,
        focus="all",
        now=NOW,
    )

    assert [item.market_id for item in selection.items] == [player_prop.id]
    assert selection.items[0].market_shape == "player_prop"
    assert selection.filters_applied["focus"] == "all"


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
    assert payload["items"][0]["polysignal_score"]["score_probability"] == "0.5500"
    assert payload["items"][0]["polysignal_score"]["source"] == "preliminary_composite"
    assert payload["items"][0]["freshness"]["freshness_status"] == "fresh"
    assert payload["items"][0]["freshness"]["recommended_action"] == "ok"
    assert payload["counts"]["returned"] == 1
    assert payload["filters_applied"]["sport"] == "nba"
    assert payload["filters_applied"]["days"] == 1
    assert payload["filters_applied"]["focus"] == "match_winner"
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


def test_upcoming_sports_endpoint_defaults_to_seven_days_and_match_winner_focus(
    client: TestClient,
    db_session: Session,
) -> None:
    match = _create_market(
        db_session,
        suffix="endpoint-default-match",
        question="Lakers vs Warriors",
        end_date=datetime.now(tz=UTC) + timedelta(days=6),
    )
    future = _create_market(
        db_session,
        suffix="endpoint-default-future",
        question="Will the Boston Celtics win the NBA Finals?",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    closed = _create_market(
        db_session,
        suffix="endpoint-default-closed",
        question="Will the Celtics beat the Knicks?",
        end_date=datetime.now(tz=UTC) + timedelta(hours=4),
        closed=True,
    )
    player_prop = _create_market(
        db_session,
        suffix="endpoint-default-prop",
        question="Will LeBron James score over 25 points?",
        end_date=datetime.now(tz=UTC) + timedelta(hours=4),
        market_type="player_prop",
    )
    series = _create_market(
        db_session,
        suffix="endpoint-default-series",
        question="NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    toss = _create_market(
        db_session,
        suffix="endpoint-default-toss",
        question="T20 BIFA Cup: Dragon Xi vs Bodoland - Who wins the toss?",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    _add_snapshot(db_session, market=match)
    _add_snapshot(db_session, market=future)
    _add_snapshot(db_session, market=closed)
    _add_snapshot(db_session, market=player_prop)
    _add_snapshot(db_session, market=series)
    _add_snapshot(db_session, market=toss)
    db_session.commit()

    response = client.get("/research/upcoming-sports?limit=10")

    assert response.status_code == 200
    payload = response.json()
    returned_ids = [item["market_id"] for item in payload["items"]]
    assert match.id in returned_ids
    assert future.id not in returned_ids
    assert closed.id not in returned_ids
    assert player_prop.id not in returned_ids
    assert series.id not in returned_ids
    assert toss.id not in returned_ids
    assert payload["filters_applied"]["days"] == 7
    assert payload["filters_applied"]["include_futures"] is False
    assert payload["filters_applied"]["focus"] == "match_winner"


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
    event_title: str | None = None,
    event_start_at: datetime | None = None,
    event_category: str = "sports",
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool = True,
    closed: bool = False,
) -> Market:
    event = Event(
        polymarket_event_id=f"upcoming-event-{suffix}",
        title=event_title or f"Upcoming Event {suffix}",
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
