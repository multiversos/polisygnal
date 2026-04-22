from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from time import perf_counter

from app.db.session import SessionLocal
from app.services.evidence_reconciliation import reconcile_legacy_evidence


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reconciliacion simple de evidencia legacy para mercados NBA winner no elegibles."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limita la cantidad de mercados activos NBA winner a revisar.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica borrado fisico de evidence_items/sources legacy del MVP. Sin este flag es dry-run.",
    )
    args = parser.parse_args()

    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            summary = reconcile_legacy_evidence(
                db,
                apply=args.apply,
                limit=args.limit,
            )
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "limit": args.limit,
            "apply": args.apply,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    finished_at = datetime.now(tz=UTC)
    payload = {
        "status": "warning" if summary.partial_errors else "ok",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
        "limit": args.limit,
        "apply": args.apply,
        "partial_error_count": len(summary.partial_errors),
        **asdict(summary),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
