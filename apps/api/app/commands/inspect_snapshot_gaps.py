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
from app.services.data_health import build_snapshot_gaps


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            payload = _run(db, days=args.days, limit=args.limit, sport=args.sport)
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
            "Inspecciona gaps de snapshots/precios para mercados proximos. "
            "Solo lectura: no ejecuta sync ni crea datos."
        )
    )
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de mercados.")
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db: Session,
    *,
    days: int = 7,
    limit: int = 50,
    sport: str | None = None,
) -> dict[str, Any]:
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    gaps = build_snapshot_gaps(db, days=days, limit=limit, sport=sport)
    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0

    return {
        "status": "ok",
        "read_only": True,
        "sync_executed": False,
        "predictions_created": after_predictions - before_predictions,
        "research_runs_created": after_research_runs - before_research_runs,
        "sport": gaps.sport,
        "days": gaps.days,
        "limit": limit,
        "total_checked": gaps.total_checked,
        "missing_snapshot_count": gaps.missing_snapshot_count,
        "missing_price_count": gaps.missing_price_count,
        "stale_snapshot_count": gaps.stale_snapshot_count,
        "items": [item.model_dump(mode="json") for item in gaps.items],
    }


def _print_human(payload: dict[str, Any]) -> None:
    print("Snapshot gaps diagnostic (read-only)")
    print(f"days={payload['days']} limit={payload['limit']} sport={payload['sport'] or 'all'}")
    print(
        "checked={total_checked} missing_snapshot={missing_snapshot_count} "
        "missing_price={missing_price_count} stale_snapshot={stale_snapshot_count}".format(
            **payload
        )
    )
    if not payload["items"]:
        print("No upcoming markets found for the current filters.")
        return
    print("market_id\tsport\tstatus\taction\tclose_time\tlatest_snapshot\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    str(item["market_id"]),
                    item["sport"],
                    item["freshness_status"],
                    item["recommended_action"],
                    str(item["close_time"]),
                    str(item["latest_snapshot_at"]),
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
