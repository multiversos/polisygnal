from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.inspect_snapshot_gaps import _run as run_snapshot_gaps_command
from app.models.event import Event
from app.models.market import Market
from app.models.market_decision_log import MarketDecisionLog
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.models.watchlist_item import WatchlistItem


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
    _create_market(
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
    assert coverage["basketball"]["with_snapshot"] == 1
    assert coverage["soccer"]["missing_price"] == 1
    assert coverage["other"]["missing_close_time"] == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_data_health_openapi_includes_endpoint(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/data-health/overview" in response.json()["paths"]
    assert "/data-health/snapshot-gaps" in response.json()["paths"]


def test_snapshot_gaps_endpoint_reports_missing_and_stale_data(
    client: TestClient,
    db_session: Session,
) -> None:
    now = datetime.now(tz=UTC)
    missing_snapshot_market = _create_market(
        db_session,
        suffix="gap-no-snapshot",
        sport="mlb",
        end_date=now + timedelta(days=1),
    )
    missing_price_market = _create_market(
        db_session,
        suffix="gap-missing-price",
        sport="soccer",
        end_date=now + timedelta(days=2),
    )
    stale_snapshot_market = _create_market(
        db_session,
        suffix="gap-stale-snapshot",
        sport="nba",
        end_date=now + timedelta(days=3),
    )
    outside_window_market = _create_market(
        db_session,
        suffix="gap-outside-window",
        sport="nfl",
        end_date=now + timedelta(days=10),
    )
    db_session.add_all(
        [
            MarketSnapshot(
                market_id=missing_price_market.id,
                captured_at=now - timedelta(hours=2),
                yes_price=None,
                no_price=Decimal("0.4200"),
            ),
            MarketSnapshot(
                market_id=stale_snapshot_market.id,
                captured_at=now - timedelta(hours=30),
                yes_price=Decimal("0.6100"),
                no_price=Decimal("0.3900"),
            ),
            MarketSnapshot(
                market_id=outside_window_market.id,
                captured_at=now,
                yes_price=Decimal("0.5100"),
                no_price=Decimal("0.4900"),
            ),
        ]
    )
    db_session.commit()

    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    response = client.get("/data-health/snapshot-gaps?days=7&limit=50")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_checked"] == 3
    assert payload["missing_snapshot_count"] == 1
    assert payload["missing_price_count"] == 2
    assert payload["stale_snapshot_count"] == 1
    item_by_id = {item["market_id"]: item for item in payload["items"]}
    assert item_by_id[missing_snapshot_market.id]["freshness_status"] == "incomplete"
    assert item_by_id[missing_snapshot_market.id]["recommended_action"] == "needs_snapshot"
    assert item_by_id[missing_price_market.id]["has_yes_price"] is False
    assert item_by_id[stale_snapshot_market.id]["freshness_status"] == "stale"
    assert outside_window_market.id not in item_by_id
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_snapshot_gaps_endpoint_filters_by_sport(
    client: TestClient,
    db_session: Session,
) -> None:
    now = datetime.now(tz=UTC)
    _create_market(
        db_session,
        suffix="gap-filter-mlb",
        sport="mlb",
        end_date=now + timedelta(days=1),
    )
    _create_market(
        db_session,
        suffix="gap-filter-soccer",
        sport="soccer",
        end_date=now + timedelta(days=1),
    )
    db_session.commit()

    response = client.get("/data-health/snapshot-gaps?sport=soccer&days=7&limit=50")

    assert response.status_code == 200
    payload = response.json()
    assert payload["sport"] == "soccer"
    assert payload["total_checked"] == 1
    assert payload["items"][0]["sport"] == "soccer"


def test_inspect_snapshot_gaps_command_is_read_only(db_session: Session) -> None:
    now = datetime.now(tz=UTC)
    _create_market(
        db_session,
        suffix="gap-command",
        sport="mlb",
        end_date=now + timedelta(days=1),
    )
    db_session.commit()

    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    payload = run_snapshot_gaps_command(db_session, days=7, limit=10)

    assert payload["status"] == "ok"
    assert payload["read_only"] is True
    assert payload["sync_executed"] is False
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["total_checked"] == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_refresh_priorities_endpoint_orders_operational_candidates(
    client: TestClient,
    db_session: Session,
) -> None:
    now = datetime.now(tz=UTC)
    watchlisted = _create_market(
        db_session,
        suffix="priority-watchlist",
        sport="mlb",
        end_date=now + timedelta(hours=10),
    )
    lower_priority = _create_market(
        db_session,
        suffix="priority-later",
        sport="mlb",
        end_date=now + timedelta(days=5),
    )
    db_session.add(
        WatchlistItem(
            market_id=watchlisted.id,
            status="investigating",
            note="Needs controlled refresh",
        )
    )
    db_session.add(
        MarketDecisionLog(
            market_id=watchlisted.id,
            decision="waiting_for_data",
            confidence_label="low",
        )
    )
    db_session.commit()

    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    response = client.get("/data-health/refresh-priorities?sport=mlb&days=7&limit=10")

    assert response.status_code == 200
    payload = response.json()
    assert payload["returned"] == 2
    assert payload["min_hours_to_close"] == 6.0
    assert payload["filters_applied"]["min_hours_to_close"] == 6.0
    assert payload["items"][0]["market_id"] == watchlisted.id
    assert payload["items"][0]["refresh_priority_score"] > payload["items"][1]["refresh_priority_score"]
    assert payload["items"][0]["time_window_label"] == "6-24h"
    assert "watchlist:+15" in payload["items"][0]["reasons"]
    assert "decision_waiting_for_data:+12" in payload["items"][0]["reasons"]
    assert f"--market-id {watchlisted.id}" in payload["items"][0]["suggested_command_snapshot"]
    assert "--dry-run --json" in payload["items"][0]["suggested_command_metadata"]
    assert lower_priority.id in {item["market_id"] for item in payload["items"]}
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_refresh_priorities_prioritizes_useful_time_windows(
    client: TestClient,
    db_session: Session,
) -> None:
    now = datetime.now(tz=UTC)
    too_soon = _create_market(
        db_session,
        suffix="priority-too-soon",
        sport="soccer",
        end_date=now + timedelta(minutes=45),
    )
    good_window = _create_market(
        db_session,
        suffix="priority-good-window",
        sport="soccer",
        end_date=now + timedelta(days=2),
    )
    db_session.commit()

    filtered_response = client.get(
        "/data-health/refresh-priorities?sport=soccer&days=7&limit=10"
    )
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    filtered_ids = {item["market_id"] for item in filtered_payload["items"]}
    assert good_window.id in filtered_ids
    assert too_soon.id not in filtered_ids

    unfiltered_response = client.get(
        "/data-health/refresh-priorities"
        "?sport=soccer&days=7&limit=10&min_hours_to_close=0"
    )
    assert unfiltered_response.status_code == 200
    unfiltered_payload = unfiltered_response.json()
    by_id = {item["market_id"]: item for item in unfiltered_payload["items"]}
    assert by_id[good_window.id]["refresh_priority_score"] > by_id[too_soon.id][
        "refresh_priority_score"
    ]
    assert by_id[good_window.id]["time_window_label"] == "1-3 dias"
    assert "good_refresh_window:+35" in by_id[good_window.id]["reasons"]
    assert by_id[too_soon.id]["time_window_label"] == "Menos de 1h"
    assert "closes_within_1h:-60" in by_id[too_soon.id]["reasons"]


def test_refresh_priorities_endpoint_is_documented(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/data-health/refresh-priorities" in response.json()["paths"]


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
