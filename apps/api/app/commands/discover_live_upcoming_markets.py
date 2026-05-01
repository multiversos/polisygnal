from __future__ import annotations

import argparse
import json
import sys
from typing import Any
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.live_upcoming_discovery import discover_live_upcoming_markets


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
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
                    include_futures=args.include_futures,
                    focus=args.focus,
                    min_hours_to_close=args.min_hours_to_close,
                    source_tag_id=settings.polymarket_sports_tag_id,
                )
            except Exception as exc:
                print(
                    json.dumps(
                        {
                            "status": "error",
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                            "read_only": True,
                        },
                        indent=2,
                        ensure_ascii=True,
                    ),
                    file=sys.stderr,
                )
                raise SystemExit(1) from exc
            finally:
                db.rollback()
    finally:
        gamma_client.close()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True, default=str))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Descubre mercados deportivos proximos desde Polymarket en modo lectura. "
            "No guarda mercados, no crea snapshots, no crea research_runs, no crea "
            "predicciones y no ejecuta trading."
        )
    )
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de items devueltos.")
    parser.add_argument(
        "--include-futures",
        action="store_true",
        help="Incluye futures/championships. Por defecto se excluyen.",
    )
    parser.add_argument(
        "--focus",
        type=str,
        default="match_winner",
        help="Foco operativo: match_winner o all.",
    )
    parser.add_argument(
        "--min-hours-to-close",
        type=float,
        default=None,
        help="Ventana minima antes del cierre para pedir mercados remotos.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db: Session,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    include_futures: bool = False,
    focus: str | None = "match_winner",
    min_hours_to_close: float | None = None,
    source_tag_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    before_markets = db.scalar(select(func.count()).select_from(Market)) or 0
    before_snapshots = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    discovery = discover_live_upcoming_markets(
        db,
        client=client,
        sport=sport,
        days=days,
        limit=limit,
        include_futures=include_futures,
        focus=focus,
        min_hours_to_close=min_hours_to_close,
        source_tag_id=source_tag_id,
        now=now,
    )
    after_markets = db.scalar(select(func.count()).select_from(Market)) or 0
    after_snapshots = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    return {
        "status": "ok",
        "read_only": True,
        "sync_executed": False,
        "markets_created": after_markets - before_markets,
        "snapshots_created": after_snapshots - before_snapshots,
        "predictions_created": after_predictions - before_predictions,
        "research_runs_created": after_research_runs - before_research_runs,
        **discovery.model_dump(),
    }


def _print_human(payload: dict[str, Any]) -> None:
    summary = payload["summary"]
    print("Live upcoming markets discovery (read-only)")
    print(
        "remote_checked={total_remote_checked} already_local={already_local_count} "
        "missing_local={missing_local_count} local_missing_snapshot={local_missing_snapshot_count} "
        "remote_with_price={remote_with_price_count} remote_missing_price={remote_missing_price_count} "
        "remote_with_condition_id={remote_with_condition_id_count} "
        "remote_with_clob_token_ids={remote_with_clob_token_ids_count}".format(**summary)
    )
    if payload.get("warnings"):
        print("warnings: " + ", ".join(payload["warnings"]))
    if not payload["items"]:
        print("No upcoming remote markets matched the current filters.")
        return
    print("status\tremote_id\tlocal_id\tsport\tshape\tclose_time\tremote_price\tcondition_id\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    item["discovery_status"],
                    str(item.get("remote_id") or ""),
                    str(item.get("local_market_id") or ""),
                    item["sport"],
                    item["market_shape"],
                    str(item.get("close_time") or ""),
                    str(item["has_remote_price"]),
                    str(bool(item.get("condition_id"))),
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
