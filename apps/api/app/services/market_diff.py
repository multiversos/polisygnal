from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.services.market_overview import build_markets_overview

DIFF_OVERVIEW_LIMIT = 10_000


@dataclass(frozen=True)
class MaterialChangeThresholds:
    yes_probability: Decimal = Decimal("0.05")
    confidence_score: Decimal = Decimal("0.10")
    edge_magnitude: Decimal = Decimal("0.05")


def build_market_diff_snapshot(
    db: Session,
    *,
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool | None = True,
    generated_at: datetime | None = None,
    run_id: str | None = None,
    pipeline_summary_path: str | None = None,
) -> dict[str, Any]:
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
        limit=DIFF_OVERVIEW_LIMIT,
        offset=0,
    )
    items = [item for item in overview.items if not item.market.closed]
    snapshot_items = [_build_snapshot_item(item) for item in items]
    return {
        "generated_at": (generated_at or datetime.now(tz=UTC)).isoformat(),
        "source": "markets_overview",
        "filters": {
            "sport_type": sport_type,
            "market_type": market_type,
            "active": active,
            "closed": False,
        },
        "run": {
            "run_id": run_id,
            "pipeline_summary_path": pipeline_summary_path,
        },
        "total_markets": len(snapshot_items),
        "top_opportunities_count": sum(1 for item in snapshot_items if item["opportunity"]),
        "watchlist_count": sum(1 for item in snapshot_items if item["priority_bucket"] == "watchlist"),
        "items": snapshot_items,
    }


def build_market_diff_payload(
    *,
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
    thresholds: MaterialChangeThresholds,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    current_items = _items_by_market_id(current_snapshot)
    previous_items = _items_by_market_id(previous_snapshot) if previous_snapshot is not None else {}
    current_top_ids = {
        market_id for market_id, item in current_items.items() if bool(item.get("opportunity"))
    }
    previous_top_ids = {
        market_id for market_id, item in previous_items.items() if bool(item.get("opportunity"))
    }
    comparison_ready = previous_snapshot is not None

    entered_ids = []
    exited_ids = []
    if comparison_ready:
        entered_ids = sorted(
            current_top_ids - previous_top_ids,
            key=lambda market_id: (
                current_items[market_id].get("priority_rank") or 999_999,
                market_id,
            ),
        )
        exited_ids = sorted(
            previous_top_ids - current_top_ids,
            key=lambda market_id: (
                previous_items[market_id].get("priority_rank") or 999_999,
                market_id,
            ),
        )
    shared_market_ids = sorted(set(current_items) & set(previous_items))

    bucket_changes = []
    material_score_changes = []
    for market_id in shared_market_ids:
        previous_item = previous_items[market_id]
        current_item = current_items[market_id]

        if previous_item.get("priority_bucket") != current_item.get("priority_bucket"):
            bucket_changes.append(
                {
                    "market_id": market_id,
                    "question": current_item.get("question") or previous_item.get("question"),
                    "previous_bucket": previous_item.get("priority_bucket"),
                    "current_bucket": current_item.get("priority_bucket"),
                    "previous_opportunity": bool(previous_item.get("opportunity")),
                    "current_opportunity": bool(current_item.get("opportunity")),
                }
            )

        score_change = _build_material_score_change(
            market_id=market_id,
            question=current_item.get("question") or previous_item.get("question"),
            previous_item=previous_item,
            current_item=current_item,
            thresholds=thresholds,
        )
        if score_change is not None:
            material_score_changes.append(score_change)

    material_score_changes.sort(
        key=lambda item: (
            -Decimal(item["max_delta"]),
            item["market_id"],
        )
    )

    generated_at_value = (generated_at or datetime.now(tz=UTC)).isoformat()
    comparison_ready = previous_snapshot is not None
    top_opportunities_entered = [
        _build_top_change_item(current_items[market_id], previous_item=previous_items.get(market_id))
        for market_id in entered_ids
    ]
    top_opportunities_exited = [
        _build_top_change_item(previous_items[market_id], previous_item=current_items.get(market_id))
        for market_id in exited_ids
    ]

    summary = {
        "comparison_ready": comparison_ready,
        "top_opportunities_entered_count": len(top_opportunities_entered),
        "top_opportunities_exited_count": len(top_opportunities_exited),
        "bucket_changes_count": len(bucket_changes),
        "material_score_changes_count": len(material_score_changes),
        "text": _build_summary_text(
            comparison_ready=comparison_ready,
            entered_count=len(top_opportunities_entered),
            exited_count=len(top_opportunities_exited),
            bucket_changes_count=len(bucket_changes),
            material_score_changes_count=len(material_score_changes),
        ),
    }

    return {
        "generated_at": generated_at_value,
        "thresholds": {
            "yes_probability": str(thresholds.yes_probability),
            "confidence_score": str(thresholds.confidence_score),
            "edge_magnitude": str(thresholds.edge_magnitude),
        },
        "current_run": _build_run_metadata(current_snapshot),
        "previous_run": _build_run_metadata(previous_snapshot) if previous_snapshot is not None else None,
        "top_opportunities_entered": top_opportunities_entered,
        "top_opportunities_exited": top_opportunities_exited,
        "bucket_changes": bucket_changes,
        "material_score_changes": material_score_changes,
        "summary": summary,
    }


def render_market_diff_text(diff_payload: dict[str, Any]) -> str:
    current_run = diff_payload.get("current_run") or {}
    previous_run = diff_payload.get("previous_run") or {}
    summary = diff_payload.get("summary") or {}

    lines = [
        "PolySignal market diff",
        f"Generated at: {diff_payload.get('generated_at', 'n/a')}",
        f"Summary: {summary.get('text', 'n/a')}",
        (
            "Thresholds: "
            f"yes_probability={diff_payload['thresholds']['yes_probability']} "
            f"confidence_score={diff_payload['thresholds']['confidence_score']} "
            f"edge_magnitude={diff_payload['thresholds']['edge_magnitude']}"
        ),
        (
            "Current run: "
            f"generated_at={current_run.get('generated_at', 'n/a')} "
            f"run_id={current_run.get('run_id', 'n/a')} "
            f"total_markets={current_run.get('total_markets', 'n/a')}"
        ),
        (
            "Previous run: "
            f"generated_at={previous_run.get('generated_at', 'n/a')} "
            f"run_id={previous_run.get('run_id', 'n/a')} "
            f"total_markets={previous_run.get('total_markets', 'n/a')}"
        ),
        "",
        "Top opportunities entered",
    ]
    lines.extend(
        _render_change_lines(
            diff_payload.get("top_opportunities_entered") or [],
            empty_message="No markets entered top opportunities.",
            formatter=_format_top_change_line,
        )
    )
    lines.extend(["", "Top opportunities exited"])
    lines.extend(
        _render_change_lines(
            diff_payload.get("top_opportunities_exited") or [],
            empty_message="No markets exited top opportunities.",
            formatter=_format_top_change_line,
        )
    )
    lines.extend(["", "Bucket changes"])
    lines.extend(
        _render_change_lines(
            diff_payload.get("bucket_changes") or [],
            empty_message="No bucket changes.",
            formatter=lambda item: (
                "  #{0} | {1} -> {2} | {3}".format(
                    item["market_id"],
                    item["previous_bucket"],
                    item["current_bucket"],
                    item["question"],
                )
            ),
        )
    )
    lines.extend(["", "Material score changes"])
    lines.extend(
        _render_change_lines(
            diff_payload.get("material_score_changes") or [],
            empty_message="No material score changes.",
            formatter=_format_material_change_line,
        )
    )
    return "\n".join(lines)


def _build_snapshot_item(item: Any) -> dict[str, Any]:
    prediction = item.latest_prediction
    return {
        "market_id": item.market.id,
        "question": item.market.question,
        "priority_rank": item.priority_rank,
        "priority_bucket": item.priority_bucket,
        "opportunity": bool(prediction.opportunity) if prediction is not None else False,
        "scoring_mode": item.scoring_mode,
        "evidence_eligible": item.market.evidence_eligible,
        "run_at": prediction.run_at.isoformat() if prediction is not None else None,
        "yes_probability": _serialize_decimal(
            prediction.yes_probability if prediction is not None else None
        ),
        "confidence_score": _serialize_decimal(
            prediction.confidence_score if prediction is not None else None
        ),
        "edge_magnitude": _serialize_decimal(
            prediction.edge_magnitude if prediction is not None else None
        ),
    }


def _items_by_market_id(snapshot: dict[str, Any] | None) -> dict[int, dict[str, Any]]:
    if snapshot is None:
        return {}
    items = snapshot.get("items")
    if not isinstance(items, list):
        return {}
    return {
        int(item["market_id"]): item
        for item in items
        if isinstance(item, dict) and item.get("market_id") is not None
    }


def _build_material_score_change(
    *,
    market_id: int,
    question: str | None,
    previous_item: dict[str, Any],
    current_item: dict[str, Any],
    thresholds: MaterialChangeThresholds,
) -> dict[str, Any] | None:
    previous_yes_probability = _parse_decimal(previous_item.get("yes_probability"))
    current_yes_probability = _parse_decimal(current_item.get("yes_probability"))
    previous_confidence = _parse_decimal(previous_item.get("confidence_score"))
    current_confidence = _parse_decimal(current_item.get("confidence_score"))
    previous_edge = _parse_decimal(previous_item.get("edge_magnitude"))
    current_edge = _parse_decimal(current_item.get("edge_magnitude"))

    yes_delta = _decimal_delta(previous_yes_probability, current_yes_probability)
    confidence_delta = _decimal_delta(previous_confidence, current_confidence)
    edge_delta = _decimal_delta(previous_edge, current_edge)
    max_delta = max(yes_delta, confidence_delta, edge_delta)

    if (
        yes_delta < thresholds.yes_probability
        and confidence_delta < thresholds.confidence_score
        and edge_delta < thresholds.edge_magnitude
    ):
        return None

    return {
        "market_id": market_id,
        "question": question,
        "previous_bucket": previous_item.get("priority_bucket"),
        "current_bucket": current_item.get("priority_bucket"),
        "previous_yes_probability": _serialize_decimal(previous_yes_probability),
        "current_yes_probability": _serialize_decimal(current_yes_probability),
        "delta_yes_probability": str(yes_delta),
        "previous_confidence_score": _serialize_decimal(previous_confidence),
        "current_confidence_score": _serialize_decimal(current_confidence),
        "delta_confidence_score": str(confidence_delta),
        "previous_edge_magnitude": _serialize_decimal(previous_edge),
        "current_edge_magnitude": _serialize_decimal(current_edge),
        "delta_edge_magnitude": str(edge_delta),
        "max_delta": str(max_delta),
    }


def _build_run_metadata(snapshot: dict[str, Any]) -> dict[str, Any]:
    run = snapshot.get("run") or {}
    return {
        "generated_at": snapshot.get("generated_at"),
        "run_id": run.get("run_id"),
        "pipeline_summary_path": run.get("pipeline_summary_path"),
        "total_markets": snapshot.get("total_markets"),
        "top_opportunities_count": snapshot.get("top_opportunities_count"),
        "watchlist_count": snapshot.get("watchlist_count"),
    }


def _build_top_change_item(
    item: dict[str, Any],
    *,
    previous_item: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "market_id": item.get("market_id"),
        "question": item.get("question"),
        "priority_bucket": item.get("priority_bucket"),
        "opportunity": bool(item.get("opportunity")),
        "yes_probability": item.get("yes_probability"),
        "confidence_score": item.get("confidence_score"),
        "edge_magnitude": item.get("edge_magnitude"),
        "previous_bucket": previous_item.get("priority_bucket") if previous_item is not None else None,
    }


def _build_summary_text(
    *,
    comparison_ready: bool,
    entered_count: int,
    exited_count: int,
    bucket_changes_count: int,
    material_score_changes_count: int,
) -> str:
    if not comparison_ready:
        return "No previous diff snapshot available. Baseline snapshot created."
    return (
        f"{entered_count} markets entered top opportunities, "
        f"{exited_count} exited, "
        f"{bucket_changes_count} changed bucket, "
        f"{material_score_changes_count} had material score changes."
    )


def _render_change_lines(
    items: list[dict[str, Any]],
    *,
    empty_message: str,
    formatter,
) -> list[str]:
    if not items:
        return [f"  {empty_message}"]
    return [formatter(item) for item in items]


def _format_top_change_line(item: dict[str, Any]) -> str:
    return (
        "  #{0} | bucket={1} yes={2} conf={3} edge={4} | {5}".format(
            item["market_id"],
            item["priority_bucket"],
            item.get("yes_probability") or "n/a",
            item.get("confidence_score") or "n/a",
            item.get("edge_magnitude") or "n/a",
            item["question"],
        )
    )


def _format_material_change_line(item: dict[str, Any]) -> str:
    return (
        "  #{0} | d_yes={1} d_conf={2} d_edge={3} | {4}".format(
            item["market_id"],
            item["delta_yes_probability"],
            item["delta_confidence_score"],
            item["delta_edge_magnitude"],
            item["question"],
        )
    )


def _parse_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value)
        except ArithmeticError:
            return None
    return None


def _decimal_delta(previous: Decimal | None, current: Decimal | None) -> Decimal:
    if previous is None or current is None:
        return Decimal("0")
    return abs(current - previous)


def _serialize_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value)
