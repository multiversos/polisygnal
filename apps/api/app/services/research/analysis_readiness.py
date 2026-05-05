from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.market import Market
from app.schemas.analysis_readiness import (
    AnalysisReadinessItem,
    AnalysisReadinessResponse,
    AnalysisReadinessSummary,
)
from app.services.research.upcoming_data_quality import list_upcoming_data_quality
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets
from app.services.time_windows import describe_time_window


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
    min_hours_to_close: float | None = None,
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
        focus="all",
        now=current_time,
    )
    quality_selection = list_upcoming_data_quality(
        db,
        sport=sport,
        days=safe_days,
        limit=safe_limit,
        focus="all",
        now=current_time,
    )
    quality_by_market_id = {item.market_id: item for item in quality_selection.items}
    source_by_market_id = _load_readiness_sources(db, quality_by_market_id.keys())
    items = [
        _build_item(
            upcoming_item,
            quality_by_market_id[upcoming_item.market_id],
            source=source_by_market_id.get(upcoming_item.market_id, "local_existing"),
            now=current_time,
        )
        for upcoming_item in upcoming_selection.items
        if upcoming_item.market_id in quality_by_market_id
    ]
    if min_hours_to_close is not None:
        items = [
            item
            for item in items
            if item.close_time is not None
            and (
                (_normalize_datetime(item.close_time) - current_time).total_seconds() / 3600
            )
            >= min_hours_to_close
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
            "focus": "all",
            "min_hours_to_close": min_hours_to_close,
            "window_start": upcoming_selection.filters_applied.get("window_start"),
            "window_end": upcoming_selection.filters_applied.get("window_end"),
        },
    )


def _build_item(upcoming_item, quality_item, *, source: str, now: datetime) -> AnalysisReadinessItem:
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
    time_window = describe_time_window(quality_item.close_time, now=now)

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
    elif quality_item.market_shape != "other":
        reasons.append("non_primary_market")
    else:
        reasons.append("market_shape_uncertain")
    if score_status == "calculated":
        reasons.append("polysignal_score_available")
    else:
        reasons.append("polysignal_score_pending")
    if freshness_status != "fresh":
        reasons.append(f"freshness_{freshness_status}")
    reasons.append(time_window.reason)
    if time_window.is_good_refresh_window:
        reasons.append("preferred_refresh_window")
    if time_window.is_too_soon:
        reasons.append("closes_too_soon")

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
        suggested_next_action = _refresh_action_for_time_window(time_window)
    else:
        readiness_status = BLOCKED_STATUS
        suggested_next_action = "revisar_o_descartar_por_ahora"

    return AnalysisReadinessItem(
        market_id=quality_item.market_id,
        title=quality_item.question,
        sport=quality_item.sport,
        market_shape=quality_item.market_shape,
        source=source,
        ready_reason=_ready_reason(
            has_snapshot=has_snapshot,
            has_price=has_price,
            has_score=score_status == "calculated",
            source=source,
            readiness_status=readiness_status,
        ),
        close_time=quality_item.close_time,
        time_window_label=time_window.label,
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
            hours_until_close=time_window.hours_until_close,
        ),
        reasons=_dedupe(reasons),
        missing_fields=_missing_fields(quality_item.missing_fields, has_clear_shape),
        suggested_next_action=suggested_next_action,
        suggested_research_packet_command=(
            "python -m app.commands.prepare_codex_research "
            f"--market-id {quality_item.market_id}"
        ),
        suggested_refresh_snapshot_command=(
            "python -m app.commands.refresh_market_snapshots "
            f"--market-id {quality_item.market_id} --dry-run --json"
        ),
        suggested_refresh_metadata_command=(
            "python -m app.commands.refresh_market_metadata "
            f"--market-id {quality_item.market_id} --dry-run --json"
        ),
    )


def _load_readiness_sources(db: Session, market_ids) -> dict[int, str]:
    ids = list(market_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(
            Market.id,
            Market.condition_id,
            Market.clob_token_ids,
            Market.polymarket_url,
        ).where(Market.id.in_(ids))
    ).all()
    sources: dict[int, str] = {}
    for market_id, condition_id, clob_token_ids, polymarket_url in rows:
        has_identifiers = bool(condition_id or clob_token_ids or polymarket_url)
        sources[int(market_id)] = (
            "snapshot_from_discovery" if has_identifiers else "local_existing"
        )
    return sources


def _ready_reason(
    *,
    has_snapshot: bool,
    has_price: bool,
    has_score: bool,
    source: str,
    readiness_status: str,
) -> str:
    if readiness_status == READY_STATUS:
        if source == "snapshot_from_discovery":
            return "Snapshot/precios disponibles desde identifiers publicos de discovery."
        return "Snapshot, precios SI/NO y score disponibles."
    if not has_snapshot or not has_price:
        return "Falta snapshot o precio SI/NO para completar el analisis."
    if not has_score:
        return "Falta score calculado antes de generar el primer analisis."
    return "Requiere revision antes de usarlo en un trial."


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
    hours_until_close: float | None,
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
    if hours_until_close is None:
        score -= 10
    elif hours_until_close < 1:
        score -= 35
    elif hours_until_close < 6:
        score -= 15
    elif 24 <= hours_until_close <= 24 * 7:
        score += 10
    return max(0, min(100, score))


def _refresh_action_for_time_window(time_window) -> str:
    if time_window.hours_until_close is None:
        return "revisar_o_descartar_por_ahora"
    if time_window.hours_until_close < 1:
        return "demasiado_cerca_del_cierre_revisar_solo_si_ya_tiene_datos"
    if time_window.hours_until_close < 6:
        return "refresh_posible_pero_ventana_corta"
    if time_window.hours_until_close >= 24:
        return "buen_candidato_para_refresh_controlado"
    return "ejecutar_refresh_snapshot_dry_run"


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
