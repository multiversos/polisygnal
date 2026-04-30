from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True, slots=True)
class TimeWindow:
    label: str
    reason: str
    hours_until_close: float | None
    is_too_soon: bool = False
    is_good_refresh_window: bool = False
    is_past: bool = False


def describe_time_window(close_time: datetime | None, *, now: datetime) -> TimeWindow:
    if close_time is None:
        return TimeWindow(
            label="Sin cierre",
            reason="no_close_time",
            hours_until_close=None,
        )
    normalized_close = _normalize_datetime(close_time)
    normalized_now = _normalize_datetime(now)
    hours_until_close = (normalized_close - normalized_now).total_seconds() / 3600
    if hours_until_close < 0:
        return TimeWindow(
            label="Cerrado/pasado",
            reason="close_time_past",
            hours_until_close=hours_until_close,
            is_too_soon=True,
            is_past=True,
        )
    if hours_until_close < 1:
        return TimeWindow(
            label="Menos de 1h",
            reason="closes_within_1h",
            hours_until_close=hours_until_close,
            is_too_soon=True,
        )
    if hours_until_close < 6:
        return TimeWindow(
            label="1-6h",
            reason="closes_within_6h",
            hours_until_close=hours_until_close,
            is_too_soon=True,
        )
    if hours_until_close < 24:
        return TimeWindow(
            label="6-24h",
            reason="closes_within_24h",
            hours_until_close=hours_until_close,
        )
    if hours_until_close < 72:
        return TimeWindow(
            label="1-3 dias",
            reason="good_refresh_window",
            hours_until_close=hours_until_close,
            is_good_refresh_window=True,
        )
    return TimeWindow(
        label="3-7 dias",
        reason="good_refresh_window",
        hours_until_close=hours_until_close,
        is_good_refresh_window=True,
    )


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
