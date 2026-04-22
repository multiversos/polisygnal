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
from app.repositories.markets import get_market_by_id
from app.services.evidence_pipeline import capture_market_evidence, fetch_evidence_context


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Corre el evidence pipeline MVP para un market_id especifico."
    )
    parser.add_argument("--market-id", type=int, required=True, help="ID interno del mercado.")
    args = parser.parse_args()

    settings = get_settings()
    odds_client = TheOddsApiClient.from_settings(settings)
    news_client = EspnRssClient.from_settings(settings)
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            market = get_market_by_id(db, args.market_id)
            if market is None:
                raise ValueError(f"Market {args.market_id} no encontrado.")

            context = fetch_evidence_context(
                settings=settings,
                odds_client=odds_client,
                news_client=news_client,
            )
            summary = capture_market_evidence(
                db,
                market=market,
                settings=settings,
                context=context,
            )
            summary.partial_errors = list(context.partial_errors) + summary.partial_errors
            db.commit()
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "market_id": args.market_id,
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
        "market_id": args.market_id,
        **asdict(summary),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
