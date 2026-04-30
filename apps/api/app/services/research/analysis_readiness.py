from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.schemas.analysis_readiness import (
    AnalysisReadinessItem,
    AnalysisReadinessResponse,
    AnalysisReadinessSummary,
)
from app.services.research.upcoming_data_quality import list_upcoming_data_quality
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets


READY_STATUS = "ready"
NEEDS_REFRESH_STATUS = "needs_refresh"
BLOCKED_STATUS = "blocked"
READY_QUALITY_LABELS = {"Completo", "Parcial"}
BLOCKED_FRESHNESS_ACTIONS = {"review_market", "exclude_from_scoring"}
NON_PRIMARY_MARKET_PATTERNS = (
    "exact score",
    "correct score",
    "final score",
    "both teams to score",
    "draw no bet",
    "spread",
    "handicap",
    "total goals",
    "total points",
    "over/under",
    "over ",
    "under ",
    "first half",
    "second half",
)


def list_analysis_readiness(
    db: Session,
    *,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    now: datetime | None = None,
) -> AnalysisReadinessResponse:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    safe_limit = max(min(limit, 200), 0)
    upcoming_selection = list_upcoming_sports_markets(
        db,
        sport=sport,
        days=safe_days,
        limit=safe_limit,
        include_futures=False,
        focus="match_winner",
        now=current_time,
    )
    quality_selection = list_upcoming_data_quality(
        db,
        sport=sport,
        days=safe_days,
        limit=safe_limit,
        now=current_time,
    )
    quality_by_market_id = {item.market_id: item for item in quality_selection.items}
    items = [
        _build_item(upcoming_item, quality_by_market_id[upcoming_item.market_id])
        for upcoming_item in upcoming_selection.items
        if upcoming_item.market_id in quality_by_market_id
    ]
    items.sort(
        key=lambda item: (
            _status_rank(item.readiness_status),
            item.readiness_score,
            item.close_time is not None,
            -_timestamp(item.close_time),
        ),
        reverse=True,
    )
    summary = AnalysisReadinessSummary(
        total_checked=len(items),
        ready_count=sum(1 for item in items if item.readiness_status == READY_STATUS),
        refresh_needed_count=sum(
            1 for item in items if item.readiness_status == NEEDS_REFRESH_STATUS
        ),
        blocked_count=sum(1 for item in items if item.readiness_status == BLOCKED_STATUS),
        missing_snapshot_count=sum(1 for item in items if "snapshot" in item.missing_fields),
        missing_price_count=sum(
            1
            for item in items
            if "yes_price" in item.missing_fields or "no_price" in item.missing_fields
        ),
        score_pending_count=sum(
            1 for item in items if item.polysignal_score_status == "pending"
        ),
    )
    return AnalysisReadinessResponse(
        generated_at=current_time,
        sport=upcoming_selection.filters_applied.get("sport"),  # type: ignore[arg-type]
        days=safe_days,
        limit=safe_limit,
        summary=summary,
        items=items,
        filters_applied={
            "sport": upcoming_selection.filters_applied.get("sport"),
            "days": safe_days,
            "limit": safe_limit,
            "include_futures": False,
            "focus": "match_winner",
            "window_start": upcoming_selection.filters_applied.get("window_start"),
            "window_end": upcoming_selection.filters_applied.get("window_end"),
        },
    )


def _build_item(upcoming_item, quality_item) -> AnalysisReadinessItem:
    has_snapshot = quality_item.has_snapshot
    has_price = quality_item.has_yes_price and quality_item.has_no_price
    has_clear_sport = quality_item.sport != "other"
    is_primary_match_winner = _is_primary_match_winner_title(quality_item.question)
    has_clear_shape = (
        quality_item.market_shape == "match_winner" and is_primary_match_winner
    )
    has_future_close = quality_item.close_time is not None
    freshness_status = (
        quality_item.freshness.freshness_status if quality_item.freshness else "unknown"
    )
    freshness_action = (
        quality_item.freshness.recommended_action if quality_item.freshness else "review_market"
    )
    score_status = "calculated" if quality_item.has_polysignal_score else "pending"

    reasons: list[str] = []
    if has_snapshot:
        reasons.append("snapshot_available")
    else:
        reasons.append("missing_snapshot")
    if has_price:
        reasons.append("yes_no_prices_available")
    else:
        reasons.append("missing_yes_no_prices")
    if has_clear_sport:
        reasons.append("sport_clear")
    else:
        reasons.append("sport_uncertain")
    if has_clear_shape:
        reasons.append("match_winner")
    elif quality_item.market_shape == "match_winner" and not is_primary_match_winner:
        reasons.append("non_primary_market")
    else:
        reasons.append("market_shape_uncertain")
    if score_status == "calculated":
        reasons.append("polysignal_score_available")
    else:
        reasons.append("polysignal_score_pending")
    if freshness_status != "fresh":
        reasons.append(f"freshness_{freshness_status}")

    blocked = (
        not has_future_close
        or not has_clear_sport
        or not has_clear_shape
        or freshness_action in BLOCKED_FRESHNESS_ACTIONS
        or freshness_status == "stale"
    )
    ready = (
        not blocked
        and has_snapshot
        and has_price
        and quality_item.quality_label in READY_QUALITY_LABELS
        and score_status == "calculated"
    )
    needs_refresh = not blocked and not ready and (not has_snapshot or not has_price)
    if ready:
        readiness_status = READY_STATUS
        suggested_next_action = "listo_para_research_packet"
    elif needs_refresh:
        readiness_status = NEEDS_REFRESH_STATUS
        suggested_next_action = "ejecutar_refresh_snapshot_dry_run"
    else:
        readiness_status = BLOCKED_STATUS
        suggested_next_action = "revisar_o_descartar_por_ahora"

    return AnalysisReadinessItem(
        market_id=quality_item.market_id,
        title=quality_item.question,
        sport=quality_item.sport,
        market_shape=quality_item.market_shape,
        close_time=quality_item.close_time,
        yes_price=upcoming_item.market_yes_price,
        no_price=upcoming_item.market_no_price,
        liquidity=upcoming_item.liquidity,
        volume=upcoming_item.volume,
        data_quality_label=quality_item.quality_label,
        freshness_status=freshness_status,
        polysignal_score_status=score_status,
        readiness_status=readiness_status,  # type: ignore[arg-type]
        readiness_score=_readiness_score(
            has_snapshot=has_snapshot,
            has_price=has_price,
            has_clear_sport=has_clear_sport,
            has_clear_shape=has_clear_shape,
            has_score=score_status == "calculated",
            data_quality_label=quality_item.quality_label,
            freshness_status=freshness_status,
            blocked=blocked,
        ),
        reasons=_dedupe(reasons),
        missing_fields=_missing_fields(quality_item.missing_fields, has_clear_shape),
        suggested_next_action=suggested_next_action,
        suggested_refresh_snapshot_command=(
            "python -m app.commands.refresh_market_snapshots "
            f"--market-id {quality_item.market_id} --dry-run --json"
        ),
        suggested_refresh_metadata_command=(
            "python -m app.commands.refresh_market_metadata "
            f"--market-id {quality_item.market_id} --dry-run --json"
        ),
    )


def _readiness_score(
    *,
    has_snapshot: bool,
    has_price: bool,
    has_clear_sport: bool,
    has_clear_shape: bool,
    has_score: bool,
    data_quality_label: str,
    freshness_status: str,
    blocked: bool,
) -> int:
    score = 0
    if has_snapshot:
        score += 25
    if has_price:
        score += 25
    if has_clear_sport:
        score += 15
    if has_clear_shape:
        score += 15
    if has_score:
        score += 10
    if data_quality_label == "Completo":
        score += 10
    elif data_quality_label == "Parcial":
        score += 5
    if freshness_status == "fresh":
        score += 10
    elif freshness_status == "stale":
        score -= 20
    if blocked:
        score = min(score, 40)
    return max(0, min(100, score))


def _is_primary_match_winner_title(title: str | None) -> bool:
    if not title:
        return True
    normalized = " ".join(title.lower().replace("-", " ").split())
    return not any(pattern in normalized for pattern in NON_PRIMARY_MARKET_PATTERNS)


def _missing_fields(values: list[str], has_clear_shape: bool) -> list[str]:
    missing = list(values)
    if not has_clear_shape and "market_shape" not in missing:
        missing.append("market_shape")
    return _dedupe(missing)


def _status_rank(status: str) -> int:
    if status == READY_STATUS:
        return 3
    if status == NEEDS_REFRESH_STATUS:
        return 2
    return 1


def _timestamp(value: datetime | None) -> float:
    if value is None:
        return 0
    return _normalize_datetime(value).timestamp()


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
