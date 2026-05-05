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
                    pages=args.pages,
                    dry_run=dry_run,
                    max_import=args.max_import,
                    max_events=args.max_events,
                    min_hours_to_close=args.min_hours_to_close,
                    source_tag_id=settings.polymarket_sports_tag_id,
                    include_skip_reasons=args.debug_skips,
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
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help=(
            "Limite base de eventos remotos solicitados. No limita directamente "
            "los mercados aplanados; usa --max-import para limitar escrituras."
        ),
    )
    parser.add_argument(
        "--pages",
        "--max-pages",
        type=int,
        default=1,
        help=(
            "Cantidad maxima de paginas remotas /events a leer. Default 1 conserva "
            "el comportamiento historico; usa 3-5 para dry-run de carteleras mas profundas."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra import. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Aplica import limitado.")
    parser.add_argument("--max-import", type=int, default=10, help="Maximo de mercados a importar.")
    parser.add_argument(
        "--max-events",
        "--max-games",
        type=int,
        default=None,
        help=(
            "Maximo de eventos/partidos elegibles. Para soccer agrupa home/draw/away "
            "antes de aplicar --max-import."
        ),
    )
    parser.add_argument(
        "--min-hours-to-close",
        type=float,
        default=6,
        help="Ventana minima antes del cierre para importar.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    parser.add_argument(
        "--debug-skips",
        "--include-skip-reasons",
        action="store_true",
        dest="debug_skips",
        help=(
            "Incluye razones de descarte y hasta 3 ejemplos truncados por razon. "
            "Seguro para dry-run; no imprime secretos ni payloads completos."
        ),
    )
    return parser


def _run(
    db,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    pages: int = 1,
    dry_run: bool = True,
    max_import: int = 10,
    max_events: int | None = None,
    min_hours_to_close: float = 6,
    source_tag_id: str | None = None,
    include_skip_reasons: bool = False,
    now=None,
) -> dict[str, Any]:
    summary = import_live_discovered_markets(
        db,
        client=client,
        sport=sport,
        days=days,
        limit=limit,
        pages=pages,
        dry_run=dry_run,
        max_import=max_import,
        max_events=max_events,
        min_hours_to_close=min_hours_to_close,
        source_tag_id=source_tag_id,
        include_skip_reasons=include_skip_reasons,
        now=now,
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
    print(
        "requested_sport={requested_sport} normalized_sport={normalized_sport} "
        "requested_days={requested_days} requested_limit={requested_limit} "
        "requested_pages={requested_pages} remote_pages_fetched={remote_pages_fetched} "
        "remote_page_limit={remote_page_limit} max_events={max_events}".format(**payload)
    )
    if payload.get("skip_reasons_count"):
        print("skip_reasons_count=" + json.dumps(payload["skip_reasons_count"], sort_keys=True))
    if payload.get("detected_sports_count"):
        print("detected_sports_count=" + json.dumps(payload["detected_sports_count"], sort_keys=True))
    if payload.get("detected_market_types_count"):
        print(
            "detected_market_types_count="
            + json.dumps(payload["detected_market_types_count"], sort_keys=True)
        )
    if payload.get("event_groups"):
        print("event_groups:")
        for group in payload["event_groups"]:
            teams = " vs ".join(group.get("teams") or []) or "teams_unknown"
            print(
                "  {slug} | {teams} | would_import={count} draw={draw} close={close}".format(
                    slug=group.get("event_slug"),
                    teams=teams,
                    count=group.get("would_import_markets_count"),
                    draw=group.get("has_draw_market"),
                    close=group.get("close_time"),
                )
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
