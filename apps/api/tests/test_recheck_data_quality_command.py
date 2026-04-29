from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.recheck_data_quality import _run as run_recheck
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.refresh_run import RefreshRun
from app.models.research_run import ResearchRun
from app.services.refresh_runs import record_refresh_run


def test_recheck_data_quality_reports_current_summary(db_session: Session) -> None:
    now = datetime.now(tz=UTC)
    priced_market = _create_market(db_session, suffix="priced", sport="mlb")
    incomplete_market = _create_market(db_session, suffix="incomplete", sport="nba")
    db_session.add(
        MarketSnapshot(
            market_id=priced_market.id,
            captured_at=now,
            yes_price=Decimal("0.6200"),
            no_price=Decimal("0.3800"),
            liquidity=Decimal("900.0000"),
            volume=Decimal("1200.0000"),
        )
    )
    db_session.commit()

    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    payload = run_recheck(db_session, days=7, limit=10)

    assert payload["status"] == "ok"
    assert payload["read_only"] is True
    assert payload["sync_executed"] is False
    assert payload["total"] == 2
    assert payload["insufficient_count"] >= 1
    assert payload["missing_snapshot_count"] == 1
    assert payload["missing_price_count"] == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs
    assert incomplete_market.id in {item["market_id"] for item in payload["items"]}


def test_recheck_data_quality_filters_by_market_id(db_session: Session) -> None:
    first = _create_market(db_session, suffix="first", sport="mlb")
    second = _create_market(db_session, suffix="second", sport="mlb")
    db_session.commit()

    payload = run_recheck(db_session, market_id=second.id, days=7, limit=10)

    assert payload["total"] == 1
    assert payload["items"][0]["market_id"] == second.id
    assert first.id not in {item["market_id"] for item in payload["items"]}


def test_recheck_data_quality_refresh_run_comparison(db_session: Session) -> None:
    now = datetime.now(tz=UTC)
    market = _create_market(db_session, suffix="refresh-run", sport="mlb")
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=now,
            yes_price=Decimal("0.5400"),
            no_price=Decimal("0.4600"),
        )
    )
    refresh_run = record_refresh_run(
        db_session,
        refresh_type="snapshot",
        mode="apply",
        status="success",
        markets_checked=1,
        markets_updated=1,
        errors_count=0,
        started_at=now,
        finished_at=now,
        summary_json={"market_ids": [market.id]},
    )
    db_session.commit()

    payload = run_recheck(
        db_session,
        days=7,
        limit=10,
        refresh_run_id=refresh_run.id,
    )

    recheck = payload["refresh_run_recheck"]
    assert recheck["found"] is True
    assert recheck["refresh_type"] == "snapshot"
    assert recheck["markets_rechecked"] == 1
    assert recheck["markets_improved"] == 1


def test_recheck_data_quality_json_payload_is_serializable(db_session: Session) -> None:
    _create_market(db_session, suffix="json", sport="soccer")
    db_session.commit()

    payload = run_recheck(db_session, days=7, limit=10)

    encoded = json.dumps(payload, ensure_ascii=True)
    assert '"read_only": true' in encoded
    assert '"sync_executed": false' in encoded


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    sport: str,
) -> Market:
    event = Event(
        polymarket_event_id=f"recheck-event-{suffix}",
        title=f"Recheck Event {suffix}",
        category="sports",
        slug=f"recheck-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"recheck-market-{suffix}",
        event_id=event.id,
        question=f"Recheck market {suffix}",
        slug=f"recheck-market-{suffix}",
        sport_type=sport,
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market
