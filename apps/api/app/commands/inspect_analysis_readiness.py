from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.research.analysis_readiness import list_analysis_readiness


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            payload = _run(
                db,
                sport=args.sport,
                days=args.days,
                limit=args.limit,
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
        print(json.dumps(payload, indent=2, ensure_ascii=True, default=str))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Inspecciona readiness para primeros analisis. Solo lectura: no refresca "
            "snapshots, no crea research_runs, no crea predicciones y no ejecuta trading."
        )
    )
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de mercados.")
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db: Session,
    *,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
) -> dict[str, Any]:
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    readiness = list_analysis_readiness(db, sport=sport, days=days, limit=limit)
    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    return {
        "status": "ok",
        "read_only": True,
        "sync_executed": False,
        "predictions_created": after_predictions - before_predictions,
        "research_runs_created": after_research_runs - before_research_runs,
        "sport": readiness.sport,
        "days": readiness.days,
        "limit": readiness.limit,
        "summary": readiness.summary.model_dump(),
        "ready": [
            item.model_dump()
            for item in readiness.items
            if item.readiness_status == "ready"
        ],
        "needs_refresh": [
            item.model_dump()
            for item in readiness.items
            if item.readiness_status == "needs_refresh"
        ],
        "blocked": [
            item.model_dump()
            for item in readiness.items
            if item.readiness_status == "blocked"
        ],
        "items": [item.model_dump() for item in readiness.items],
    }


def _print_human(payload: dict[str, Any]) -> None:
    summary = payload["summary"]
    print("Analysis readiness (read-only)")
    print(f"days={payload['days']} limit={payload['limit']} sport={payload['sport'] or 'all'}")
    print(
        "checked={total_checked} ready={ready_count} needs_refresh={refresh_needed_count} "
        "blocked={blocked_count} missing_snapshot={missing_snapshot_count} "
        "missing_price={missing_price_count} score_pending={score_pending_count}".format(
            **summary
        )
    )
    if not payload["items"]:
        print("No upcoming markets found for the current filters.")
        return
    print("market_id\tstatus\tscore\tsport\tquality\tfreshness\taction\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    str(item["market_id"]),
                    item["readiness_status"],
                    str(item["readiness_score"]),
                    item["sport"],
                    item["data_quality_label"],
                    item["freshness_status"],
                    item["suggested_next_action"],
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
