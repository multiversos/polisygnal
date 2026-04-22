from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from time import perf_counter

from app.clients.clob import PolymarketClobClient
from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.market_snapshots import capture_market_snapshots


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Captura snapshots de mercados relevantes para el MVP de PolySignal."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limita la cantidad de mercados a procesar en esta corrida.",
    )
    parser.add_argument(
        "--discovery-scope",
        type=str,
        default=None,
        choices=["nba", "sports", "all"],
        help="Override opcional del discovery scope del comando.",
    )
    parser.add_argument(
        "--market-type",
        type=str,
        default=None,
        help="Filtro opcional por market_type para snapshots.",
    )
    args = parser.parse_args()

    settings = get_settings()
    gamma_client = PolymarketGammaClient.from_settings(settings)
    clob_client = PolymarketClobClient.from_settings(settings)
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            summary = capture_market_snapshots(
                db,
                gamma_client=gamma_client,
                clob_client=clob_client,
                discovery_scope=args.discovery_scope or settings.mvp_discovery_scope,
                gamma_batch_size=settings.snapshot_batch_size,
                market_type=args.market_type,
                limit=args.limit,
            )
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "discovery_scope": args.discovery_scope or settings.mvp_discovery_scope,
            "market_type": args.market_type,
            "limit": args.limit,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc
    finally:
        gamma_client.close()
        clob_client.close()

    finished_at = datetime.now(tz=UTC)
    summary_payload = asdict(summary)
    partial_error_count = len(summary_payload["partial_errors"])
    payload = {
        "status": "warning" if partial_error_count > 0 else "ok",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
        "discovery_scope": args.discovery_scope or settings.mvp_discovery_scope,
        "market_type": args.market_type,
        "limit": args.limit,
        **summary_payload,
        "partial_error_count": partial_error_count,
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
