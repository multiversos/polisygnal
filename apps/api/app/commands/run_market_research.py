from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from time import perf_counter

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.repositories.markets import get_market_by_id, list_nba_winner_evidence_candidates
from app.services.research.pipeline import run_market_research, run_market_research_batch


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ejecuta el research pipeline base para un mercado o un batch NBA winner."
    )
    parser.add_argument("--market-id", type=int, default=None, help="ID interno del mercado.")
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Cantidad maxima de mercados NBA winner a procesar cuando no se usa --market-id.",
    )
    parser.add_argument(
        "--research-mode",
        choices=["local_only", "cheap_research"],
        default="local_only",
        help="Modo de research a ejecutar.",
    )
    args = parser.parse_args()

    settings = get_settings()
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            if args.market_id is not None:
                market = get_market_by_id(db, args.market_id)
                if market is None:
                    raise ValueError(f"Market {args.market_id} no encontrado.")
                result = run_market_research(
                    db,
                    market=market,
                    settings=settings,
                    research_mode=args.research_mode,
                )
                db.commit()
                payload = {
                    "status": "warning" if result.partial_errors else "ok",
                    "mode": "single_market",
                    "market_id": args.market_id,
                    "research_mode": args.research_mode,
                    "research_run_id": result.research_run.id,
                    "research_status": result.research_run.status,
                    "degraded_mode": result.research_run.degraded_mode,
                    "report_id": result.report.id if result.report is not None else None,
                    "prediction_id": result.prediction.id if result.prediction is not None else None,
                    "findings_created": len(result.findings),
                    "partial_errors": result.partial_errors,
                }
            else:
                markets = list_nba_winner_evidence_candidates(db, limit=args.limit)
                summary = run_market_research_batch(
                    db,
                    markets=markets,
                    settings=settings,
                    research_mode=args.research_mode,
                )
                payload = {
                    "status": "warning" if summary.partial_errors else "ok",
                    "mode": "batch",
                    "research_mode": args.research_mode,
                    **asdict(summary),
                }
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        error_payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "market_id": args.market_id,
            "limit": args.limit,
            "research_mode": args.research_mode,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(error_payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    finished_at = datetime.now(tz=UTC)
    output = {
        **payload,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
    }
    print(json.dumps(output, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
