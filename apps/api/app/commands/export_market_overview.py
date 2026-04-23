from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

from app.db.session import SessionLocal
from app.schemas.overview import PriorityBucket, OverviewSortBy
from app.services.market_overview import build_markets_overview

ExportPreset = Literal["all", "top_opportunities", "watchlist", "evidence_backed", "fallback_only"]
ActiveFilter = Literal["true", "false", "any"]
ExportFormat = Literal["json", "csv"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exporta una vista operativa del overview de mercados del MVP."
    )
    parser.add_argument(
        "--preset",
        choices=["all", "top_opportunities", "watchlist", "evidence_backed", "fallback_only"],
        default="all",
        help="Preset operativo para exportar una vista lista para revisar.",
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Formato de exportacion.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Ruta de salida. Si se omite, imprime a stdout.",
    )
    parser.add_argument("--sport-type", type=str, default="nba")
    parser.add_argument("--market-type", type=str, default="winner")
    parser.add_argument(
        "--active",
        choices=["true", "false", "any"],
        default="any",
        help="Filtro opcional por estado activo.",
    )
    parser.add_argument("--opportunity-only", action="store_true")
    parser.add_argument("--evidence-eligible-only", action="store_true")
    parser.add_argument("--evidence-only", action="store_true")
    parser.add_argument("--fallback-only", action="store_true")
    parser.add_argument(
        "--bucket",
        choices=["priority", "watchlist", "review_fallback", "fallback_only", "no_prediction"],
        default=None,
    )
    parser.add_argument(
        "--sort-by",
        choices=["priority", "edge_magnitude", "confidence_score", "run_at"],
        default="priority",
    )
    parser.add_argument("--limit", type=int, default=100, help="Limite de items a exportar.")
    parser.add_argument("--offset", type=int, default=0, help="Offset simple.")
    args = parser.parse_args()

    filters = _resolve_filters(args)
    exported_at = datetime.now(tz=UTC)

    try:
        with SessionLocal() as db:
            response = build_markets_overview(
                db,
                sport_type=filters["sport_type"],
                market_type=filters["market_type"],
                active=filters["active"],
                opportunity_only=filters["opportunity_only"],
                evidence_eligible_only=filters["evidence_eligible_only"],
                evidence_only=filters["evidence_only"],
                fallback_only=filters["fallback_only"],
                bucket=filters["bucket"],
                edge_class=None,
                sort_by=filters["sort_by"],
                limit=filters["limit"],
                offset=filters["offset"],
            )
    except Exception as exc:
        payload = {
            "status": "error",
            "preset": args.preset,
            "format": args.format,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    rows = [_flatten_item(item.model_dump(mode="json")) for item in response.items]
    payload = {
        "exported_at": exported_at.isoformat(),
        "preset": args.preset,
        "filters": response.filters.model_dump(mode="json"),
        "total_count": response.total_count,
        "limit": response.limit,
        "offset": response.offset,
        "items": rows,
    }

    if args.format == "json":
        content = json.dumps(payload, indent=2, ensure_ascii=True)
    else:
        content = _to_csv(rows)

    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(content, encoding="utf-8", newline="" if args.format == "csv" else None)
        print(
            json.dumps(
                {
                    "status": "ok",
                    "preset": args.preset,
                    "format": args.format,
                    "output_path": str(output_path),
                    "total_count": response.total_count,
                    "items_exported": len(rows),
                },
                indent=2,
                ensure_ascii=True,
            )
        )
        return

    print(content)


def _resolve_filters(args: argparse.Namespace) -> dict[str, object]:
    preset = args.preset
    opportunity_only = args.opportunity_only
    evidence_eligible_only = args.evidence_eligible_only
    evidence_only = args.evidence_only
    fallback_only = args.fallback_only
    bucket = args.bucket
    sort_by: OverviewSortBy = args.sort_by

    if preset == "top_opportunities":
        opportunity_only = True
        sort_by = "priority"
    elif preset == "watchlist":
        bucket = "watchlist"
        sort_by = "priority"
    elif preset == "evidence_backed":
        evidence_only = True
        sort_by = "priority"
    elif preset == "fallback_only":
        fallback_only = True
        sort_by = "priority"

    return {
        "sport_type": args.sport_type,
        "market_type": args.market_type,
        "active": _parse_active_filter(args.active),
        "opportunity_only": opportunity_only,
        "evidence_eligible_only": evidence_eligible_only,
        "evidence_only": evidence_only,
        "fallback_only": fallback_only,
        "bucket": bucket,
        "sort_by": sort_by,
        "limit": args.limit,
        "offset": args.offset,
    }


def _parse_active_filter(value: ActiveFilter) -> bool | None:
    if value == "true":
        return True
    if value == "false":
        return False
    return None


def _flatten_item(item: dict[str, object]) -> dict[str, object]:
    market = item["market"]
    prediction = item.get("latest_prediction") or {}
    evidence_summary = item["evidence_summary"]
    return {
        "market_id": market["id"],
        "question": market["question"],
        "sport_type": market["sport_type"],
        "market_type": market["market_type"],
        "active": market["active"],
        "closed": market["closed"],
        "priority_rank": item["priority_rank"],
        "priority_bucket": item["priority_bucket"],
        "scoring_mode": item["scoring_mode"],
        "run_at": prediction.get("run_at"),
        "yes_probability": prediction.get("yes_probability"),
        "confidence_score": prediction.get("confidence_score"),
        "action_score": prediction.get("action_score"),
        "edge_magnitude": prediction.get("edge_magnitude"),
        "edge_class": prediction.get("edge_class"),
        "opportunity": prediction.get("opportunity"),
        "evidence_eligible": market["evidence_eligible"],
        "evidence_shape": market["evidence_shape"],
        "evidence_skip_reason": market["evidence_skip_reason"],
        "evidence_count": evidence_summary["evidence_count"],
        "odds_evidence_count": evidence_summary["odds_evidence_count"],
        "news_evidence_count": evidence_summary["news_evidence_count"],
        "used_odds_count": prediction.get("used_odds_count", 0),
        "used_news_count": prediction.get("used_news_count", 0),
    }


def _to_csv(rows: list[dict[str, object]]) -> str:
    fieldnames = [
        "market_id",
        "question",
        "sport_type",
        "market_type",
        "active",
        "closed",
        "priority_rank",
        "priority_bucket",
        "scoring_mode",
        "run_at",
        "yes_probability",
        "confidence_score",
        "action_score",
        "edge_magnitude",
        "edge_class",
        "opportunity",
        "evidence_eligible",
        "evidence_shape",
        "evidence_skip_reason",
        "evidence_count",
        "odds_evidence_count",
        "news_evidence_count",
        "used_odds_count",
        "used_news_count",
    ]
    from io import StringIO

    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(_normalize_row(row))
    return buffer.getvalue()


def _normalize_row(row: dict[str, object]) -> dict[str, object]:
    normalized: dict[str, object] = {}
    for key, value in row.items():
        if isinstance(value, Decimal):
            normalized[key] = str(value)
        else:
            normalized[key] = value
    return normalized


if __name__ == "__main__":
    main()
