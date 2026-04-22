from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from time import perf_counter

from app.clients.espn_rss import EspnRssClient
from app.clients.the_odds_api import TheOddsApiClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.evidence_pipeline import capture_nba_winner_evidence


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Corre el evidence pipeline MVP para un subconjunto de mercados NBA winner."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limita la cantidad de mercados activos NBA winner a procesar.",
    )
    args = parser.parse_args()

    settings = get_settings()
    odds_client = TheOddsApiClient.from_settings(settings)
    news_client = EspnRssClient.from_settings(settings)
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            summary = capture_nba_winner_evidence(
                db,
                settings=settings,
                odds_client=odds_client,
                news_client=news_client,
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
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc
    finally:
        odds_client.close()
        news_client.close()

    finished_at = datetime.now(tz=UTC)
    payload = {
        "status": "warning" if summary.partial_errors else "ok",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
        "limit": args.limit,
        "partial_error_count": len(summary.partial_errors),
        **asdict(summary),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
