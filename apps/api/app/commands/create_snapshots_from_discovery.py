from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.discovery_snapshots import create_snapshots_from_discovery_pricing


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply no puede combinarse con --dry-run.")
    dry_run = not args.apply
    settings = get_settings()
    gamma_client = PolymarketGammaClient.from_settings(settings)
    try:
        with SessionLocal() as db:
            try:
                payload = _run(
                    db,
                    client=gamma_client,
                    market_id=args.market_id,
                    sport=args.sport,
                    days=args.days,
                    limit=args.limit,
                    dry_run=dry_run,
                    max_snapshots=args.max_snapshots,
                    min_hours_to_close=args.min_hours_to_close,
                    source_tag_id=settings.polymarket_sports_tag_id,
                )
                if dry_run:
                    db.rollback()
                else:
                    db.commit()
            except Exception as exc:
                db.rollback()
                print(
                    json.dumps(
                        {
                            "status": "error",
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                            "dry_run": dry_run,
                            "read_only": dry_run,
                        },
                        indent=2,
                        ensure_ascii=True,
                    ),
                    file=sys.stderr,
                )
                raise SystemExit(1) from exc
    finally:
        gamma_client.close()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True, default=str))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Crea snapshots locales desde precios remotos del discovery live. "
            "Dry-run es el default; no crea research_runs, no crea predicciones "
            "y no ejecuta trading."
        )
    )
    parser.add_argument("--market-id", type=int, default=None, help="Mercado local especifico.")
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Limite remoto revisado.")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra cambios. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Crea snapshots validos.")
    parser.add_argument("--max-snapshots", type=int, default=5, help="Maximo de snapshots a crear.")
    parser.add_argument(
        "--min-hours-to-close",
        type=float,
        default=None,
        help="Ventana minima antes del cierre para pedir mercados remotos.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db,
    *,
    client: PolymarketGammaClient,
    market_id: int | None = None,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    dry_run: bool = True,
    max_snapshots: int = 5,
    min_hours_to_close: float | None = None,
    source_tag_id: str | None = None,
) -> dict[str, Any]:
    summary = create_snapshots_from_discovery_pricing(
        db,
        client=client,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        dry_run=dry_run,
        max_snapshots=max_snapshots,
        min_hours_to_close=min_hours_to_close,
        source_tag_id=source_tag_id,
    )
    payload = summary.to_payload()
    return {
        "status": "ok",
        "read_only": dry_run,
        "sync_executed": False,
        **payload,
    }


def _print_human(payload: dict[str, Any]) -> None:
    print("Create snapshots from live discovery pricing")
    print(
        "dry_run={dry_run} remote_checked={total_remote_checked} local_candidates={local_candidates} "
        "would_create={would_create} snapshots_created={snapshots_created} "
        "skipped={snapshots_skipped} predictions_created={predictions_created} "
        "research_runs_created={research_runs_created}".format(**payload)
    )
    if not payload["items"]:
        print("No discovery snapshot candidates found.")
        return
    print("action\tmarket_id\tremote_id\tsport\tyes\tno\tmapping\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    item["action"],
                    str(item.get("market_id") or ""),
                    str(item.get("remote_id") or ""),
                    item["sport"],
                    str(item.get("yes_price") or ""),
                    str(item.get("no_price") or ""),
                    str(item.get("mapping") or ""),
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
