from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.market_decision_log import MarketDecisionLog
from app.models.market_investigation_status import MarketInvestigationStatus
from app.models.watchlist_item import WatchlistItem
from app.schemas.data_health import RefreshPrioritiesRead, RefreshPriorityItemRead
from app.services.research.upcoming_data_quality import (
    COMPLETE_LABEL,
    INSUFFICIENT_LABEL,
    PARTIAL_LABEL,
    build_market_data_quality,
)
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets


MAX_SCORE = 200
ACTIVE_INVESTIGATION_STATUSES = {
    "pending_review",
    "investigating",
    "has_evidence",
    "review_required",
}
PRIORITY_DECISIONS = {"waiting_for_data", "investigate_more", "monitor"}
LOW_PRIORITY_DECISIONS = {"ignore", "dismissed"}


def build_refresh_priorities(
    db: Session,
    *,
    sport: str | None = None,
    days: int = 7,
    limit: int = 25,
    now: datetime | None = None,
) -> RefreshPrioritiesRead:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    safe_limit = max(min(limit, 100), 0)
    candidate_limit = min(max(safe_limit * 4, 25), 200)
    selection = list_upcoming_sports_markets(
        db,
        sport=sport,
        days=safe_days,
        limit=candidate_limit,
        include_futures=False,
        focus="match_winner",
        now=current_time,
    )
    market_ids = [item.market_id for item in selection.items]
    watchlist_market_ids = _watchlist_market_ids(db, market_ids)
    investigation_by_market = _investigation_statuses(db, market_ids)
    decision_by_market = _latest_decisions(db, market_ids)

    items: list[RefreshPriorityItemRead] = []
    for item in selection.items:
        data_quality = build_market_data_quality(
            market_id=item.market_id,
            question=item.question,
            sport=item.sport,
            market_shape=item.market_shape,
            close_time=item.close_time,
            market_yes_price=item.market_yes_price,
            market_no_price=item.market_no_price,
            liquidity=item.liquidity,
            volume=item.volume,
            polysignal_score=item.polysignal_score,
            has_snapshot=item.freshness is not None
            and "missing_snapshot" not in item.freshness.reasons,
            has_external_signal=False,
            has_prediction=False,
            has_research=False,
            latest_snapshot=None,
            now=current_time,
        )
        score, reasons = _score_item(
            item=item,
            quality_label=data_quality.quality_label,
            has_watchlist=item.market_id in watchlist_market_ids,
            investigation_status=investigation_by_market.get(item.market_id),
            latest_decision=decision_by_market.get(item.market_id),
            now=current_time,
        )
        missing_snapshot = bool(
            item.freshness is not None and "missing_snapshot" in item.freshness.reasons
        )
        missing_price = item.market_yes_price is None or item.market_no_price is None
        freshness_status = item.freshness.freshness_status if item.freshness else "unknown"
        items.append(
            RefreshPriorityItemRead(
                market_id=item.market_id,
                title=item.question,
                sport=item.sport,
                close_time=item.close_time,
                missing_snapshot=missing_snapshot,
                missing_price=missing_price,
                freshness_status=freshness_status,
                data_quality_label=data_quality.quality_label,
                refresh_priority_score=score,
                reasons=reasons,
                suggested_command_snapshot=(
                    "python -m app.commands.refresh_market_snapshots "
                    f"--market-id {item.market_id} --dry-run --json"
                ),
                suggested_command_metadata=(
                    "python -m app.commands.refresh_market_metadata "
                    f"--market-id {item.market_id} --dry-run --json"
                ),
            )
        )

    items.sort(
        key=lambda priority: (
            priority.refresh_priority_score,
            priority.close_time is not None,
            -_timestamp(priority.close_time),
        ),
        reverse=True,
    )
    selected = items[:safe_limit]
    return RefreshPrioritiesRead(
        generated_at=current_time,
        sport=selection.filters_applied.get("sport"),
        days=safe_days,
        total_considered=len(selection.items),
        returned=len(selected),
        missing_snapshot_count=sum(1 for item in selected if item.missing_snapshot),
        missing_price_count=sum(1 for item in selected if item.missing_price),
        items=selected,
    )


def _score_item(
    *,
    item,
    quality_label: str,
    has_watchlist: bool,
    investigation_status: str | None,
    latest_decision: str | None,
    now: datetime,
) -> tuple[int, list[str]]:
    score = Decimal("0")
    reasons: list[str] = []

    close_time = _normalize_datetime(item.close_time) if item.close_time is not None else None
    if close_time is None:
        score -= Decimal("20")
        reasons.append("close_time_missing:-20")
    else:
        hours_until_close = (close_time - now).total_seconds() / 3600
        if hours_until_close < 0:
            score -= Decimal("40")
            reasons.append("close_time_past:-40")
        elif hours_until_close <= 24:
            score += Decimal("30")
            reasons.append("closes_within_24h:+30")
        elif hours_until_close <= 72:
            score += Decimal("22")
            reasons.append("closes_within_72h:+22")
        else:
            score += Decimal("14")
            reasons.append("closes_within_7d:+14")

    if item.market_shape == "match_winner":
        score += Decimal("20")
        reasons.append("match_winner:+20")
    elif item.market_shape in {"championship", "futures"}:
        score -= Decimal("30")
        reasons.append("future_or_championship:-30")
    else:
        score -= Decimal("15")
        reasons.append("ambiguous_market_shape:-15")

    if item.sport != "other":
        score += Decimal("10")
        reasons.append("known_sport:+10")
    else:
        score -= Decimal("6")
        reasons.append("sport_uncertain:-6")

    freshness_reasons = set(item.freshness.reasons if item.freshness else [])
    if "missing_snapshot" in freshness_reasons:
        score += Decimal("25")
        reasons.append("missing_snapshot:+25")
    if item.market_yes_price is None or item.market_no_price is None:
        score += Decimal("20")
        reasons.append("missing_price:+20")
    if item.polysignal_score is None or item.polysignal_score.score_probability is None:
        score += Decimal("10")
        reasons.append("polysignal_score_pending:+10")
    if quality_label == INSUFFICIENT_LABEL:
        score += Decimal("12")
        reasons.append("data_quality_insufficient:+12")
    elif quality_label == PARTIAL_LABEL:
        score += Decimal("5")
        reasons.append("data_quality_partial:+5")
    elif quality_label == COMPLETE_LABEL:
        score -= Decimal("10")
        reasons.append("data_quality_complete:-10")

    if item.liquidity is not None or item.volume is not None:
        score += Decimal("5")
        reasons.append("has_some_depth_data:+5")

    if has_watchlist:
        score += Decimal("15")
        reasons.append("watchlist:+15")
    if investigation_status in ACTIVE_INVESTIGATION_STATUSES:
        score += Decimal("12")
        reasons.append(f"investigation_status_{investigation_status}:+12")
    elif investigation_status in {"dismissed", "paused"}:
        score -= Decimal("20")
        reasons.append(f"investigation_status_{investigation_status}:-20")

    if latest_decision in PRIORITY_DECISIONS:
        score += Decimal("12" if latest_decision != "monitor" else "6")
        reasons.append(f"decision_{latest_decision}:+{12 if latest_decision != 'monitor' else 6}")
    elif latest_decision in LOW_PRIORITY_DECISIONS:
        score -= Decimal("25")
        reasons.append(f"decision_{latest_decision}:-25")

    if item.freshness is not None:
        if item.freshness.freshness_status == "stale":
            score -= Decimal("30")
            reasons.append("freshness_stale:-30")
        elif item.freshness.freshness_status == "fresh":
            score -= Decimal("8")
            reasons.append("freshness_fresh:-8")

    return int(max(0, min(MAX_SCORE, score))), _dedupe(reasons)


def _watchlist_market_ids(db: Session, market_ids: list[int]) -> set[int]:
    if not market_ids:
        return set()
    return set(
        db.scalars(
            select(WatchlistItem.market_id).where(WatchlistItem.market_id.in_(market_ids))
        ).all()
    )


def _investigation_statuses(db: Session, market_ids: list[int]) -> dict[int, str]:
    if not market_ids:
        return {}
    rows = db.execute(
        select(MarketInvestigationStatus.market_id, MarketInvestigationStatus.status).where(
            MarketInvestigationStatus.market_id.in_(market_ids)
        )
    ).all()
    return {row.market_id: row.status for row in rows}


def _latest_decisions(db: Session, market_ids: list[int]) -> dict[int, str]:
    if not market_ids:
        return {}
    ranked = (
        select(
            MarketDecisionLog.market_id.label("market_id"),
            MarketDecisionLog.decision.label("decision"),
            func.row_number()
            .over(
                partition_by=MarketDecisionLog.market_id,
                order_by=(MarketDecisionLog.created_at.desc(), MarketDecisionLog.id.desc()),
            )
            .label("row_number"),
        )
        .where(MarketDecisionLog.market_id.in_(market_ids))
        .subquery()
    )
    rows = db.execute(
        select(ranked.c.market_id, ranked.c.decision).where(ranked.c.row_number == 1)
    ).all()
    return {row.market_id: row.decision for row in rows}


def _timestamp(value: datetime | None) -> float:
    return _normalize_datetime(value).timestamp() if value is not None else 0


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
