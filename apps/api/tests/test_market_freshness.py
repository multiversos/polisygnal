from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

from app.services.market_freshness import build_market_freshness


NOW = datetime(2026, 4, 27, 12, 0, tzinfo=UTC)


def test_market_freshness_marks_missing_snapshot_as_incomplete() -> None:
    freshness = build_market_freshness(
        close_time=NOW + timedelta(days=1),
        latest_snapshot=None,
        yes_price=None,
        no_price=None,
        now=NOW,
    )

    assert freshness.freshness_status == "incomplete"
    assert freshness.recommended_action == "needs_snapshot"
    assert "missing_snapshot" in freshness.reasons
    assert "missing_prices" in freshness.reasons


def test_market_freshness_marks_past_close_time_as_stale() -> None:
    snapshot = _snapshot(captured_at=NOW - timedelta(hours=2))

    freshness = build_market_freshness(
        close_time=NOW - timedelta(minutes=10),
        latest_snapshot=snapshot,
        now=NOW,
    )

    assert freshness.freshness_status == "stale"
    assert freshness.recommended_action == "review_market"
    assert "close_time_past" in freshness.reasons


def test_market_freshness_marks_old_snapshot_as_stale() -> None:
    snapshot = _snapshot(captured_at=NOW - timedelta(hours=30))

    freshness = build_market_freshness(
        close_time=NOW + timedelta(days=1),
        latest_snapshot=snapshot,
        now=NOW,
    )

    assert freshness.freshness_status == "stale"
    assert freshness.recommended_action == "needs_snapshot"
    assert freshness.age_hours == Decimal("30.00")
    assert "snapshot_too_old" in freshness.reasons


def test_market_freshness_marks_missing_prices_as_incomplete() -> None:
    snapshot = _snapshot(captured_at=NOW - timedelta(hours=2), yes_price=None, no_price=None)

    freshness = build_market_freshness(
        close_time=NOW + timedelta(days=1),
        latest_snapshot=snapshot,
        now=NOW,
    )

    assert freshness.freshness_status == "incomplete"
    assert freshness.recommended_action == "needs_snapshot"
    assert "missing_prices" in freshness.reasons


def test_market_freshness_marks_complete_recent_market_as_fresh() -> None:
    snapshot = _snapshot(captured_at=NOW - timedelta(hours=2))

    freshness = build_market_freshness(
        close_time=NOW + timedelta(days=1),
        latest_snapshot=snapshot,
        now=NOW,
    )

    assert freshness.freshness_status == "fresh"
    assert freshness.recommended_action == "ok"
    assert freshness.reasons == []
    assert freshness.age_hours == Decimal("2.00")


def _snapshot(
    *,
    captured_at: datetime,
    yes_price: Decimal | None = Decimal("0.5500"),
    no_price: Decimal | None = Decimal("0.4500"),
) -> SimpleNamespace:
    return SimpleNamespace(
        captured_at=captured_at,
        yes_price=yes_price,
        no_price=no_price,
    )
