from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.prediction import Prediction
from app.models.refresh_run import RefreshRun
from app.models.research_run import ResearchRun
from app.services.research.upcoming_data_quality import list_upcoming_data_quality


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            payload = _run(
                db,
                market_id=args.market_id,
                sport=args.sport,
                days=args.days,
                limit=args.limit,
                refresh_run_id=args.refresh_run_id,
            )
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "status": "error",
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    },
                    indent=2,
                    ensure_ascii=True,
                ),
                file=sys.stderr,
            )
            raise SystemExit(1) from exc
        finally:
            db.rollback()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Revisa la calidad actual de datos para mercados proximos. "
            "Solo lectura: no refresca snapshots, no crea predicciones y no ejecuta research."
        )
    )
    parser.add_argument("--market-id", type=int, default=None, help="Filtra la salida a un mercado.")
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de mercados.")
    parser.add_argument("--refresh-run-id", type=int, default=None, help="Revisa IDs auditados en un refresh_run.")
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db: Session,
    *,
    market_id: int | None = None,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    refresh_run_id: int | None = None,
) -> dict[str, Any]:
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    selection = list_upcoming_data_quality(db, sport=sport, days=days, limit=limit)
    items = selection.items
    if market_id is not None:
        items = [item for item in items if item.market_id == market_id]

    freshness_status_counts = Counter(
        item.freshness.freshness_status if item.freshness else "unknown"
        for item in items
    )
    missing_snapshot_count = sum(1 for item in items if not item.has_snapshot)
    missing_price_count = sum(1 for item in items if not item.has_yes_price or not item.has_no_price)
    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0

    payload = {
        "status": "ok",
        "read_only": True,
        "sync_executed": False,
        "predictions_created": after_predictions - before_predictions,
        "research_runs_created": after_research_runs - before_research_runs,
        "market_id": market_id,
        "sport": sport,
        "days": days,
        "limit": limit,
        "total": len(items),
        "complete_count": sum(1 for item in items if item.quality_label == "Completo"),
        "partial_count": sum(1 for item in items if item.quality_label == "Parcial"),
        "insufficient_count": sum(1 for item in items if item.quality_label == "Insuficiente"),
        "missing_snapshot_count": missing_snapshot_count,
        "missing_price_count": missing_price_count,
        "freshness_status_counts": dict(freshness_status_counts),
        "items": [
            {
                "market_id": item.market_id,
                "sport": item.sport,
                "quality_label": item.quality_label,
                "quality_score": item.quality_score,
                "missing_fields": list(item.missing_fields),
                "warnings": list(item.warnings),
                "freshness_status": (
                    item.freshness.freshness_status if item.freshness else "unknown"
                ),
                "recommended_action": (
                    item.freshness.recommended_action if item.freshness else "review_market"
                ),
                "title": item.question,
            }
            for item in items
        ],
    }
    if refresh_run_id is not None:
        payload["refresh_run_recheck"] = _build_refresh_run_recheck(
            db,
            refresh_run_id=refresh_run_id,
            items=items,
        )
    return payload


def _build_refresh_run_recheck(
    db: Session,
    *,
    refresh_run_id: int,
    items,
) -> dict[str, Any]:
    refresh_run = db.get(RefreshRun, refresh_run_id)
    if refresh_run is None:
        return {
            "refresh_run_id": refresh_run_id,
            "found": False,
            "market_ids": [],
            "markets_rechecked": 0,
            "markets_improved": 0,
        }
    summary = refresh_run.summary_json or {}
    market_ids = [
        int(market_id)
        for market_id in summary.get("market_ids", [])
        if isinstance(market_id, int | str) and str(market_id).isdigit()
    ]
    tracked_items = [item for item in items if item.market_id in set(market_ids)]
    markets_improved = sum(
        1
        for item in tracked_items
        if item.has_snapshot and item.has_yes_price and item.has_no_price
    )
    return {
        "refresh_run_id": refresh_run_id,
        "found": True,
        "refresh_type": refresh_run.refresh_type,
        "mode": refresh_run.mode,
        "status": refresh_run.status,
        "market_ids": market_ids,
        "markets_rechecked": len(tracked_items),
        "markets_improved": markets_improved,
        "markets_now_with_snapshot": sum(1 for item in tracked_items if item.has_snapshot),
        "markets_now_with_prices": sum(
            1 for item in tracked_items if item.has_yes_price and item.has_no_price
        ),
    }


def _print_human(payload: dict[str, Any]) -> None:
    print("Data quality recheck (read-only)")
    print(f"days={payload['days']} limit={payload['limit']} sport={payload['sport'] or 'all'}")
    print(
        "total={total} complete={complete_count} partial={partial_count} "
        "insufficient={insufficient_count} missing_snapshot={missing_snapshot_count} "
        "missing_price={missing_price_count}".format(**payload)
    )
    print(f"freshness={payload['freshness_status_counts']}")
    if "refresh_run_recheck" in payload:
        recheck = payload["refresh_run_recheck"]
        print(
            "refresh_run={refresh_run_id} found={found} rechecked={markets_rechecked} "
            "improved={markets_improved}".format(**recheck)
        )
    if not payload["items"]:
        print("No upcoming markets found for the current filters.")
        return
    print("market_id\tsport\tquality\tfreshness\taction\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    str(item["market_id"]),
                    item["sport"],
                    item["quality_label"],
                    item["freshness_status"],
                    item["recommended_action"],
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
