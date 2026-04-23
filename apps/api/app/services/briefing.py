from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT
from app.schemas.briefing import (
    BriefingFilters,
    BriefingFreshness,
    BriefingMarketItem,
    BriefingOperationalCounts,
    BriefingReviewItem,
    OperationalBriefingResponse,
)
from app.schemas.overview import MarketOverviewItem
from app.services.market_overview import build_markets_overview

BRIEFING_OVERVIEW_LIMIT = 10_000


def build_operational_briefing(
    db: Session,
    *,
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool | None = True,
    top_limit: int = 5,
    watchlist_limit: int = 5,
    review_limit: int = 5,
    repo_root: Path | None = None,
) -> OperationalBriefingResponse:
    overview = build_markets_overview(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        opportunity_only=False,
        evidence_eligible_only=False,
        evidence_only=False,
        fallback_only=False,
        bucket=None,
        edge_class=None,
        sort_by="priority",
        limit=BRIEFING_OVERVIEW_LIMIT,
        offset=0,
    )
    items = [item for item in overview.items if not item.market.closed]
    review_candidates = [
        item
        for item in items
        if item.latest_prediction is not None
        and (item.latest_prediction.review_edge or item.latest_prediction.review_confidence)
    ]
    review_candidates.sort(key=_review_sort_key)

    operational_counts = _build_operational_counts(items)
    generated_at = datetime.now(tz=UTC)

    return OperationalBriefingResponse(
        generated_at=generated_at,
        summary=_build_summary_line(operational_counts),
        filters=BriefingFilters(
            sport_type=sport_type,
            market_type=market_type,
            active=active,
            top_limit=top_limit,
            watchlist_limit=watchlist_limit,
            review_limit=review_limit,
        ),
        top_opportunities=[
            _to_briefing_item(item)
            for item in items
            if item.latest_prediction is not None and item.latest_prediction.opportunity
        ][:top_limit],
        watchlist=[
            _to_briefing_item(item) for item in items if item.priority_bucket == "watchlist"
        ][:watchlist_limit],
        review_flags=[_to_review_item(item) for item in review_candidates[:review_limit]],
        operational_counts=operational_counts,
        freshness=_build_freshness(
            items,
            repo_root=repo_root or REPO_ROOT,
        ),
    )


def render_operational_briefing_text(briefing: OperationalBriefingResponse) -> str:
    lines = [
        "PolySignal operational briefing",
        f"Generated at: {briefing.generated_at.isoformat()}",
        f"Summary: {briefing.summary}",
        (
            "Filters: "
            f"sport_type={_format_filter_value(briefing.filters.sport_type)} "
            f"market_type={_format_filter_value(briefing.filters.market_type)} "
            f"active={_format_filter_value(briefing.filters.active)}"
        ),
        "",
        "Top opportunities",
    ]
    lines.extend(
        _render_market_lines(briefing.top_opportunities, empty_message="No top opportunities right now.")
    )
    lines.extend(["", "Watchlist"])
    lines.extend(_render_market_lines(briefing.watchlist, empty_message="No watchlist items right now."))
    lines.extend(["", "Review flags"])
    lines.extend(_render_review_lines(briefing.review_flags, empty_message="No review flags right now."))

    counts = briefing.operational_counts
    lines.extend(
        [
            "",
            "Operational counts",
            (
                "  total={0} opportunities={1} watchlist={2} review_flags={3}".format(
                    counts.total_markets,
                    counts.opportunity_count,
                    counts.watchlist_count,
                    counts.review_flag_count,
                )
            ),
            (
                "  evidence_backed={0} fallback_only={1} no_prediction={2}".format(
                    counts.evidence_backed_count,
                    counts.fallback_only_count,
                    counts.no_prediction_count,
                )
            ),
            (
                "  evidence_eligible={0} evidence_non_eligible={1}".format(
                    counts.evidence_eligible_count,
                    counts.evidence_non_eligible_count,
                )
            ),
        ]
    )

    freshness = briefing.freshness
    lines.extend(
        [
            "",
            "Freshness",
            (
                "  pipeline={0} started_at={1} finished_at={2}".format(
                    _format_filter_value(freshness.pipeline_status),
                    _format_datetime(freshness.pipeline_started_at),
                    _format_datetime(freshness.pipeline_finished_at),
                )
            ),
            (
                "  reports={0} started_at={1} finished_at={2}".format(
                    _format_filter_value(freshness.reports_status),
                    _format_datetime(freshness.reports_started_at),
                    _format_datetime(freshness.reports_finished_at),
                )
            ),
            f"  latest_snapshot_at={_format_datetime(freshness.latest_snapshot_at)}",
            f"  latest_prediction_at={_format_datetime(freshness.latest_prediction_at)}",
            f"  latest_evidence_at={_format_datetime(freshness.latest_evidence_at)}",
        ]
    )
    return "\n".join(lines)


def _build_operational_counts(items: list[MarketOverviewItem]) -> BriefingOperationalCounts:
    total_markets = len(items)
    opportunity_count = sum(
        1 for item in items if item.latest_prediction is not None and item.latest_prediction.opportunity
    )
    watchlist_count = sum(1 for item in items if item.priority_bucket == "watchlist")
    review_flag_count = sum(
        1
        for item in items
        if item.latest_prediction is not None
        and (item.latest_prediction.review_edge or item.latest_prediction.review_confidence)
    )
    review_edge_count = sum(
        1 for item in items if item.latest_prediction is not None and item.latest_prediction.review_edge
    )
    review_confidence_count = sum(
        1
        for item in items
        if item.latest_prediction is not None and item.latest_prediction.review_confidence
    )
    evidence_backed_count = sum(1 for item in items if item.scoring_mode == "evidence_backed")
    fallback_only_count = sum(1 for item in items if item.scoring_mode == "fallback_only")
    no_prediction_count = sum(1 for item in items if item.scoring_mode == "no_prediction")
    evidence_eligible_count = sum(1 for item in items if item.market.evidence_eligible)

    return BriefingOperationalCounts(
        total_markets=total_markets,
        opportunity_count=opportunity_count,
        watchlist_count=watchlist_count,
        review_flag_count=review_flag_count,
        review_edge_count=review_edge_count,
        review_confidence_count=review_confidence_count,
        evidence_backed_count=evidence_backed_count,
        fallback_only_count=fallback_only_count,
        no_prediction_count=no_prediction_count,
        evidence_eligible_count=evidence_eligible_count,
        evidence_non_eligible_count=total_markets - evidence_eligible_count,
    )


def _build_summary_line(counts: BriefingOperationalCounts) -> str:
    return (
        f"{counts.opportunity_count} top opportunities, "
        f"{counts.watchlist_count} watchlist, "
        f"{counts.review_flag_count} review flags, "
        f"{counts.evidence_backed_count} evidence-backed, "
        f"{counts.fallback_only_count} fallback-only."
    )


def _build_freshness(
    items: list[MarketOverviewItem],
    *,
    repo_root: Path,
) -> BriefingFreshness:
    pipeline_summary = _read_json_payload(repo_root / "logs" / "market_pipeline" / "latest-summary.json")
    reports_summary = _read_json_payload(repo_root / "logs" / "reports" / "latest-summary.json")
    latest_snapshot_at = max(
        (item.latest_snapshot.captured_at for item in items if item.latest_snapshot is not None),
        default=None,
    )
    latest_prediction_at = max(
        (item.latest_prediction.run_at for item in items if item.latest_prediction is not None),
        default=None,
    )
    latest_evidence_at = max(
        (
            item.evidence_summary.latest_evidence_at
            for item in items
            if item.evidence_summary.latest_evidence_at is not None
        ),
        default=None,
    )
    return BriefingFreshness(
        pipeline_status=_string_value(pipeline_summary, "status"),
        pipeline_started_at=_parse_datetime(_value(pipeline_summary, "started_at")),
        pipeline_finished_at=_parse_datetime(_value(pipeline_summary, "finished_at")),
        reports_status=_string_value(reports_summary, "status"),
        reports_started_at=_parse_datetime(_value(reports_summary, "started_at")),
        reports_finished_at=_parse_datetime(_value(reports_summary, "finished_at")),
        latest_snapshot_at=latest_snapshot_at,
        latest_prediction_at=latest_prediction_at,
        latest_evidence_at=latest_evidence_at,
    )


def _to_briefing_item(item: MarketOverviewItem) -> BriefingMarketItem:
    prediction = item.latest_prediction
    return BriefingMarketItem(
        market_id=item.market.id,
        question=item.market.question,
        priority_rank=item.priority_rank,
        priority_bucket=item.priority_bucket,
        scoring_mode=item.scoring_mode,
        run_at=prediction.run_at if prediction is not None else None,
        snapshot_captured_at=(
            item.latest_snapshot.captured_at if item.latest_snapshot is not None else None
        ),
        yes_probability=prediction.yes_probability if prediction is not None else None,
        confidence_score=prediction.confidence_score if prediction is not None else None,
        action_score=prediction.action_score if prediction is not None else None,
        edge_magnitude=prediction.edge_magnitude if prediction is not None else None,
        edge_class=prediction.edge_class if prediction is not None else None,
        opportunity=prediction.opportunity if prediction is not None else None,
        evidence_eligible=item.market.evidence_eligible,
        evidence_shape=item.market.evidence_shape,
        evidence_skip_reason=item.market.evidence_skip_reason,
        evidence_count=item.evidence_summary.evidence_count,
        odds_evidence_count=item.evidence_summary.odds_evidence_count,
        news_evidence_count=item.evidence_summary.news_evidence_count,
    )


def _to_review_item(item: MarketOverviewItem) -> BriefingReviewItem:
    briefing_item = _to_briefing_item(item)
    prediction = item.latest_prediction
    assert prediction is not None
    return BriefingReviewItem(
        **briefing_item.model_dump(),
        review_edge=prediction.review_edge,
        review_confidence=prediction.review_confidence,
        review_reasons=_build_review_reasons(item),
    )


def _build_review_reasons(item: MarketOverviewItem) -> list[str]:
    prediction = item.latest_prediction
    if prediction is None:
        return []
    reasons: list[str] = []
    if prediction.review_edge:
        reasons.append("review_edge")
    if prediction.review_confidence:
        reasons.append("review_confidence")
    if item.scoring_mode == "fallback_only":
        reasons.append("fallback_only")
    if not item.market.evidence_eligible:
        reasons.append("non_evidence_eligible")
    return reasons


def _review_sort_key(item: MarketOverviewItem) -> tuple[int, int, Any, Any, float, int]:
    prediction = item.latest_prediction
    assert prediction is not None
    return (
        0 if prediction.review_edge else 1,
        0 if prediction.review_confidence else 1,
        -prediction.edge_magnitude,
        -prediction.confidence_score,
        -prediction.run_at.timestamp(),
        item.market.id,
    )


def _render_market_lines(
    items: list[BriefingMarketItem],
    *,
    empty_message: str,
) -> list[str]:
    if not items:
        return [f"  {empty_message}"]
    return [
        (
            "  #{0} | rank={1} bucket={2} mode={3} yes={4} conf={5} action={6} edge={7} | {8}".format(
                item.market_id,
                item.priority_rank,
                item.priority_bucket,
                item.scoring_mode,
                _format_decimal(item.yes_probability),
                _format_decimal(item.confidence_score),
                _format_decimal(item.action_score),
                _format_decimal(item.edge_magnitude),
                item.question,
            )
        )
        for item in items
    ]


def _render_review_lines(
    items: list[BriefingReviewItem],
    *,
    empty_message: str,
) -> list[str]:
    if not items:
        return [f"  {empty_message}"]
    return [
        (
            "  #{0} | reasons={1} mode={2} edge={3} conf={4} | {5}".format(
                item.market_id,
                ",".join(item.review_reasons),
                item.scoring_mode,
                _format_decimal(item.edge_magnitude),
                _format_decimal(item.confidence_score),
                item.question,
            )
        )
        for item in items
    ]


def _read_json_payload(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return None
    if isinstance(payload, dict):
        return payload
    return None


def _value(payload: dict[str, Any] | None, key: str) -> Any:
    if payload is None:
        return None
    return payload.get(key)


def _string_value(payload: dict[str, Any] | None, key: str) -> str | None:
    value = _value(payload, key)
    return value if isinstance(value, str) else None


def _parse_datetime(value: object | None) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _format_filter_value(value: object | None) -> str:
    if value is None:
        return "any"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _format_datetime(value: datetime | None) -> str:
    return value.isoformat() if value is not None else "n/a"


def _format_decimal(value: object | None) -> str:
    if value is None:
        return "n/a"
    return str(value)
