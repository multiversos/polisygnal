from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.live_market_import import import_live_discovered_markets


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
                    sport=args.sport,
                    days=args.days,
                    limit=args.limit,
                    dry_run=dry_run,
                    max_import=args.max_import,
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
            "Importa metadata de mercados remotos descubiertos en vivo de forma "
            "controlada. Dry-run es el default; no crea snapshots, no crea "
            "research_runs, no crea predicciones y no ejecuta trading."
        )
    )
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Limite remoto revisado.")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra import. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Aplica import limitado.")
    parser.add_argument("--max-import", type=int, default=10, help="Maximo de mercados a importar.")
    parser.add_argument(
        "--min-hours-to-close",
        type=float,
        default=6,
        help="Ventana minima antes del cierre para importar.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    dry_run: bool = True,
    max_import: int = 10,
    min_hours_to_close: float = 6,
    source_tag_id: str | None = None,
) -> dict[str, Any]:
    summary = import_live_discovered_markets(
        db,
        client=client,
        sport=sport,
        days=days,
        limit=limit,
        dry_run=dry_run,
        max_import=max_import,
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
    print("Live discovered markets import")
    print(
        "dry_run={dry_run} remote_checked={total_remote_checked} missing_local={missing_local} "
        "would_import={would_import} imported={imported} skipped={skipped} "
        "snapshots_created={snapshots_created} predictions_created={predictions_created} "
        "research_runs_created={research_runs_created}".format(**payload)
    )
    if not payload["items"]:
        print("No import candidates found.")
        return
    print("action\tremote_id\tlocal_id\tsport\tshape\tclose_time\tcondition_id\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    item["action"],
                    str(item.get("remote_id") or ""),
                    str(item.get("local_market_id") or ""),
                    str(item.get("sport") or ""),
                    str(item.get("market_shape") or ""),
                    str(item.get("close_time") or ""),
                    str(bool(item.get("condition_id"))),
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
