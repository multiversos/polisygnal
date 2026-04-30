from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from typing import Any

from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.identifier_backfill import backfill_market_identifiers_from_discovery


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
                    market_id=args.market_id,
                    days=args.days,
                    limit=args.limit,
                    dry_run=dry_run,
                    min_confidence=Decimal(str(args.min_confidence)),
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
            "Propone o aplica backfill controlado de identifiers publicos desde "
            "discovery live. Dry-run es el default; no crea snapshots, no crea "
            "research_runs, no crea predicciones y no ejecuta trading."
        )
    )
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--market-id", type=int, default=None, help="Mercado local especifico.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Limite de candidatos.")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra cambios. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Aplica cambios con match seguro.")
    parser.add_argument(
        "--min-confidence",
        type=str,
        default="0.90",
        help="Confianza minima para aplicar. Default 0.90.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    market_id: int | None = None,
    days: int = 7,
    limit: int = 50,
    dry_run: bool = True,
    min_confidence: Decimal = Decimal("0.90"),
    source_tag_id: str | None = None,
) -> dict[str, Any]:
    summary = backfill_market_identifiers_from_discovery(
        db,
        client=client,
        sport=sport,
        market_id=market_id,
        days=days,
        limit=limit,
        dry_run=dry_run,
        min_confidence=min_confidence,
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
    print("Identifier backfill from live discovery")
    print(
        "dry_run={dry_run} checked={candidates_checked} updated={candidates_updated} "
        "review_required={review_required_count} no_match={no_match_count} "
        "already_has_identifiers={already_has_identifiers_count}".format(**payload)
    )
    if not payload["items"]:
        print("No identifier candidates found.")
        return
    print("action\tconfidence\tlocal_id\tremote_id\treason\tchanges\tremote_title")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    item["action"],
                    item["match_confidence"],
                    str(item.get("local_market_id") or ""),
                    str(item.get("remote_id") or ""),
                    item["match_reason"],
                    ",".join(change["field"] for change in item["changes"]),
                    item["remote_title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
