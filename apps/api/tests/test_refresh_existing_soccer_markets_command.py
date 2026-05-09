from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.refresh_existing_soccer_markets import (
    build_existing_soccer_refresh_plan,
    parse_args,
    write_report_json,
)
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction


def test_existing_soccer_refresh_defaults_to_dry_run(db_session: Session) -> None:
    now = datetime(2026, 5, 9, 12, 0, tzinfo=UTC)
    _create_market(db_session, suffix="missing-snapshot")

    payload = build_existing_soccer_refresh_plan(db_session, now=now)

    assert payload["read_only"] is True
    assert payload["dry_run"] is True
    assert payload["apply"] is False
    assert payload["apply_enabled"] is False
    assert payload["writes_planned"] is False
    assert payload["trading_executed"] is False
    assert payload["total_candidates"] == 1


def test_existing_soccer_refresh_apply_requires_confirmation_and_is_blocked() -> None:
    with pytest.raises(SystemExit):
        parse_args(["--apply"])

    with pytest.raises(SystemExit):
        parse_args(["--apply", "--yes-i-understand-this-writes-data"])


def test_existing_soccer_refresh_delete_existing_is_not_supported() -> None:
    with pytest.raises(SystemExit):
        parse_args(["--delete-existing"])


def test_existing_soccer_refresh_report_json_has_no_secrets(
    db_session: Session,
    tmp_path,
) -> None:
    _create_market(db_session, suffix="report")
    payload = build_existing_soccer_refresh_plan(db_session)
    report_path = tmp_path / "existing-soccer-refresh.json"

    write_report_json(payload, report_path)

    encoded = report_path.read_text(encoding="utf-8")
    parsed = json.loads(encoded)
    assert parsed["read_only"] is True
    assert "DATABASE_URL" not in encoded
    assert "postgres://" not in encoded
    assert "postgresql://" not in encoded


def test_existing_soccer_refresh_respects_limit(db_session: Session) -> None:
    for index in range(3):
        _create_market(db_session, suffix=f"limit-{index}")

    payload = build_existing_soccer_refresh_plan(db_session, limit=2)

    assert payload["total_candidates"] == 2
    assert len(payload["items"]) == 2


def test_existing_soccer_refresh_respects_stale_hours(db_session: Session) -> None:
    now = datetime(2026, 5, 9, 12, 0, tzinfo=UTC)
    stale_market = _create_market(db_session, suffix="stale")
    fresh_market = _create_market(db_session, suffix="fresh")
    _add_snapshot(db_session, stale_market, captured_at=now - timedelta(hours=72))
    _add_prediction(db_session, stale_market, run_at=now - timedelta(hours=72))
    _add_snapshot(db_session, fresh_market, captured_at=now - timedelta(hours=1))
    _add_prediction(db_session, fresh_market, run_at=now - timedelta(hours=1))

    payload = build_existing_soccer_refresh_plan(
        db_session,
        stale_only=True,
        stale_hours=48,
        now=now,
    )

    assert payload["total_candidates"] == 1
    assert payload["items"][0]["market_id"] == stale_market.id
    assert payload["stale_candidates"] == 1
    assert payload["would_refresh_snapshots"] == 1


def test_existing_soccer_refresh_can_select_missing_snapshot(db_session: Session) -> None:
    missing = _create_market(db_session, suffix="missing-snapshot")
    with_snapshot = _create_market(db_session, suffix="with-snapshot")
    _add_snapshot(db_session, with_snapshot)

    payload = build_existing_soccer_refresh_plan(
        db_session,
        missing_snapshot_only=True,
    )

    assert payload["total_candidates"] == 1
    assert payload["items"][0]["market_id"] == missing.id
    assert payload["missing_snapshot_candidates"] == 1


def test_existing_soccer_refresh_can_select_missing_prediction(db_session: Session) -> None:
    missing = _create_market(db_session, suffix="missing-prediction")
    complete = _create_market(db_session, suffix="complete")
    _add_snapshot(db_session, missing)
    _add_snapshot(db_session, complete)
    _add_prediction(db_session, complete)

    payload = build_existing_soccer_refresh_plan(
        db_session,
        missing_prediction_only=True,
    )

    assert payload["total_candidates"] == 1
    assert payload["items"][0]["market_id"] == missing.id
    assert payload["would_score_predictions"] == 1
    assert payload["would_score_predictions_ready_now"] == 1


def test_existing_soccer_refresh_dry_run_does_not_write(db_session: Session) -> None:
    _create_market(db_session, suffix="dry-run")
    before_snapshots = db_session.scalar(select(func.count()).select_from(MarketSnapshot))
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))

    payload = build_existing_soccer_refresh_plan(db_session)

    assert payload["would_refresh_snapshots"] == 1
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == before_snapshots
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    sport_type: str = "soccer",
    active: bool = True,
    closed: bool = False,
) -> Market:
    event = Event(
        polymarket_event_id=f"existing-refresh-event-{suffix}",
        title=f"Existing Refresh Event {suffix}",
        category="sports",
        slug=f"existing-refresh-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"existing-refresh-market-{suffix}",
        event_id=event.id,
        question=f"Existing refresh market {suffix}",
        slug=f"existing-refresh-market-{suffix}",
        yes_token_id=f"yes-token-{suffix}",
        no_token_id=f"no-token-{suffix}",
        sport_type=sport_type,
        market_type="match_winner",
        active=active,
        closed=closed,
        end_date=datetime(2026, 5, 11, 12, 0, tzinfo=UTC),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    market: Market,
    *,
    captured_at: datetime | None = None,
) -> None:
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=captured_at or datetime(2026, 5, 9, 11, 0, tzinfo=UTC),
            yes_price=Decimal("0.5100"),
            no_price=Decimal("0.4900"),
            liquidity=Decimal("100.0000"),
            volume=Decimal("50.0000"),
        )
    )
    db_session.flush()


def _add_prediction(
    db_session: Session,
    market: Market,
    *,
    run_at: datetime | None = None,
) -> None:
    db_session.add(
        Prediction(
            market_id=market.id,
            run_at=run_at or datetime(2026, 5, 9, 11, 0, tzinfo=UTC),
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
