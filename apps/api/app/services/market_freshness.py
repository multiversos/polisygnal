from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.schemas.market_freshness import MarketFreshnessRead


STALE_SNAPSHOT_HOURS = Decimal("24")
INSUFFICIENT_QUALITY_LABEL = "Insuficiente"


def build_market_freshness(
    *,
    market: object | None = None,
    close_time: datetime | None = None,
    latest_snapshot: object | None = None,
    yes_price: Decimal | None = None,
    no_price: Decimal | None = None,
    active: bool | None = None,
    closed: bool | None = None,
    data_quality_label: str | None = None,
    now: datetime | None = None,
) -> MarketFreshnessRead:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    market_close_time = _normalize_datetime(
        close_time
        if close_time is not None
        else _get_attr(market, "end_date")
    )
    latest_snapshot_at = _normalize_datetime(_get_attr(latest_snapshot, "captured_at"))
    market_closed = bool(closed) if closed is not None else bool(_get_attr(market, "closed"))
    market_active = active if active is not None else _get_attr(market, "active")
    snapshot_yes_price = _get_attr(latest_snapshot, "yes_price")
    snapshot_no_price = _get_attr(latest_snapshot, "no_price")
    effective_yes_price = yes_price if yes_price is not None else snapshot_yes_price
    effective_no_price = no_price if no_price is not None else snapshot_no_price

    reasons: list[str] = []
    age_hours: Decimal | None = None

    if market_closed or market_active is False:
        reasons.append("market_closed")
    if market_close_time is None:
        reasons.append("close_time_missing")
    elif market_close_time < current_time:
        reasons.append("close_time_past")
    if latest_snapshot_at is None:
        reasons.append("missing_snapshot")
    else:
        age_hours = _hours_between(current_time, latest_snapshot_at)
        if age_hours > STALE_SNAPSHOT_HOURS:
            reasons.append("snapshot_too_old")
    if effective_yes_price is None or effective_no_price is None:
        reasons.append("missing_prices")
    if data_quality_label == INSUFFICIENT_QUALITY_LABEL:
        reasons.append("data_quality_insufficient")

    reasons = _dedupe(reasons)
    freshness_status = _freshness_status(reasons)
    recommended_action = _recommended_action(reasons, freshness_status)

    return MarketFreshnessRead(
        freshness_status=freshness_status,
        reasons=reasons,
        latest_snapshot_at=latest_snapshot_at,
        close_time=market_close_time,
        age_hours=age_hours,
        recommended_action=recommended_action,
    )


def _freshness_status(reasons: list[str]) -> str:
    if not reasons:
        return "fresh"
    if any(reason in reasons for reason in {"market_closed", "close_time_past", "snapshot_too_old"}):
        return "stale"
    if any(
        reason in reasons
        for reason in {
            "missing_snapshot",
            "missing_prices",
            "close_time_missing",
            "data_quality_insufficient",
        }
    ):
        return "incomplete"
    return "unknown"


def _recommended_action(reasons: list[str], freshness_status: str) -> str:
    if any(reason in reasons for reason in {"market_closed", "close_time_past"}):
        return "review_market"
    if "close_time_missing" in reasons:
        return "exclude_from_scoring"
    if any(reason in reasons for reason in {"missing_snapshot", "missing_prices", "snapshot_too_old"}):
        return "needs_snapshot"
    if freshness_status == "fresh":
        return "ok"
    return "review_market"


def _hours_between(current_time: datetime, previous_time: datetime) -> Decimal:
    seconds = max(0, (current_time - previous_time).total_seconds())
    return (Decimal(str(seconds)) / Decimal("3600")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _get_attr(obj: object | None, name: str) -> Any:
    if obj is None:
        return None
    return getattr(obj, name, None)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
