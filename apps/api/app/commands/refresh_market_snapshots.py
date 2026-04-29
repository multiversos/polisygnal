from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

from app.clients.clob import PolymarketClobClient
from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.controlled_snapshot_refresh import refresh_market_snapshots_controlled


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply no puede combinarse con --dry-run.")
    dry_run = not args.apply

    settings = get_settings()
    gamma_client = PolymarketGammaClient.from_settings(settings)
    clob_client = PolymarketClobClient.from_settings(settings)
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            payload = _run(
                db,
                gamma_client=gamma_client,
                clob_client=clob_client,
                market_id=args.market_id,
                limit=args.limit,
                sport=args.sport,
                days=args.days,
                dry_run=dry_run,
                gamma_batch_size=settings.snapshot_batch_size,
            )
            if dry_run:
                db.rollback()
            else:
                db.commit()
    except Exception as exc:
        payload = {
            "status": "error",
            "dry_run": dry_run,
            "apply": args.apply,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc
    finally:
        gamma_client.close()
        clob_client.close()

    finished_at = datetime.now(tz=UTC)
    payload = {
        "status": _status_from_payload(payload),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
        "market_id": args.market_id,
        "sport": args.sport,
        "days": args.days,
        "limit": args.limit,
        **payload,
    }

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Refresca snapshots/precios de mercados seleccionados de forma controlada. "
            "Por defecto corre en dry-run y no guarda datos."
        )
    )
    parser.add_argument("--market-id", type=int, default=None, help="Refresca solo un mercado local.")
    parser.add_argument("--limit", type=int, default=5, help="Maximo de mercados a evaluar.")
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--dry-run", action="store_true", help="Modo solo lectura. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Guarda snapshots validos de forma explicita.")
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db,
    *,
    gamma_client: PolymarketGammaClient,
    clob_client: PolymarketClobClient,
    market_id: int | None = None,
    limit: int = 5,
    sport: str | None = None,
    days: int = 7,
    dry_run: bool = True,
    gamma_batch_size: int = 50,
) -> dict[str, Any]:
    summary = refresh_market_snapshots_controlled(
        db,
        gamma_client=gamma_client,
        clob_client=clob_client,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        dry_run=dry_run,
        gamma_batch_size=gamma_batch_size,
    )
    return summary.to_payload()


def _status_from_payload(payload: dict[str, Any]) -> str:
    if payload.get("partial_error_count", 0):
        return "warning"
    return "ok"


def _print_human(payload: dict[str, Any]) -> None:
    mode = "dry-run" if payload["dry_run"] else "apply"
    print(f"Controlled snapshot refresh ({mode})")
    print(
        "checked={markets_checked} created={snapshots_created} skipped={snapshots_skipped} "
        "errors={partial_error_count}".format(**payload)
    )
    if not payload["items"]:
        print("No markets selected for snapshot refresh.")
        return
    print("market_id\taction\treason\tsport\tyes\tno\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    str(item["market_id"]),
                    item["action"],
                    item["reason"],
                    item["sport"],
                    str(item["yes_price"]),
                    str(item["no_price"]),
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
