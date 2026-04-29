from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

from app.clients.polymarket import PolymarketGammaClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.controlled_metadata_refresh import refresh_market_metadata_controlled
from app.services.refresh_runs import build_refresh_audit_summary, record_refresh_run


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply no puede combinarse con --dry-run.")
    dry_run = not args.apply

    settings = get_settings()
    gamma_client = PolymarketGammaClient.from_settings(settings)
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            payload = _run(
                db,
                gamma_client=gamma_client,
                market_id=args.market_id,
                limit=args.limit,
                sport=args.sport,
                days=args.days,
                dry_run=dry_run,
            )
            finished_at = datetime.now(tz=UTC)
            payload = _with_command_metadata(
                payload,
                started_at=started_at,
                finished_at=finished_at,
                started_perf=started_perf,
                market_id=args.market_id,
                sport=args.sport,
                days=args.days,
                limit=args.limit,
            )
            _record_success_audit(
                db,
                payload,
                market_id=args.market_id,
                sport=args.sport,
                days=args.days,
                limit=args.limit,
                dry_run=dry_run,
                started_at=started_at,
                finished_at=finished_at,
            )
            db.commit()
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        _try_record_failed_audit(
            market_id=args.market_id,
            sport=args.sport,
            days=args.days,
            limit=args.limit,
            dry_run=dry_run,
            started_at=started_at,
            finished_at=finished_at,
            error=exc,
        )
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

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Refresca metadata de mercados seleccionados de forma controlada. "
            "Por defecto corre en dry-run y no guarda cambios."
        )
    )
    parser.add_argument("--market-id", type=int, default=None, help="Refresca solo un mercado local.")
    parser.add_argument("--limit", type=int, default=5, help="Maximo de mercados a evaluar.")
    parser.add_argument("--sport", type=str, default=None, help="Filtro opcional de deporte.")
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument("--dry-run", action="store_true", help="Modo solo lectura. Es el default.")
    parser.add_argument("--apply", action="store_true", help="Actualiza metadata segura de forma explicita.")
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _run(
    db,
    *,
    gamma_client: PolymarketGammaClient,
    market_id: int | None = None,
    limit: int = 5,
    sport: str | None = None,
    days: int = 7,
    dry_run: bool = True,
) -> dict[str, Any]:
    summary = refresh_market_metadata_controlled(
        db,
        gamma_client=gamma_client,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        dry_run=dry_run,
    )
    return summary.to_payload()


def _status_from_payload(payload: dict[str, Any]) -> str:
    if payload.get("partial_error_count", 0):
        return "warning"
    return "ok"


def _audit_status_from_payload(payload: dict[str, Any]) -> str:
    if payload.get("partial_error_count", 0):
        return "partial"
    return "success"


def _with_command_metadata(
    payload: dict[str, Any],
    *,
    started_at: datetime,
    finished_at: datetime,
    started_perf: float,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
) -> dict[str, Any]:
    return {
        "status": _status_from_payload(payload),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
        "market_id": market_id,
        "sport": sport,
        "days": days,
        "limit": limit,
        **payload,
    }


def _record_success_audit(
    db,
    payload: dict[str, Any],
    *,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
    dry_run: bool,
    started_at: datetime,
    finished_at: datetime,
) -> None:
    record_refresh_run(
        db,
        refresh_type="metadata",
        mode="dry_run" if dry_run else "apply",
        status=_audit_status_from_payload(payload),
        markets_checked=int(payload.get("markets_checked") or 0),
        markets_updated=int(payload.get("markets_updated") or 0),
        errors_count=int(payload.get("partial_error_count") or 0),
        summary_json=build_refresh_audit_summary(
            payload,
            refresh_type="metadata",
            market_id=market_id,
            sport=sport,
            days=days,
            limit=limit,
        ),
        started_at=started_at,
        finished_at=finished_at,
    )


def _try_record_failed_audit(
    *,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
    dry_run: bool,
    started_at: datetime,
    finished_at: datetime,
    error: Exception,
) -> None:
    try:
        with SessionLocal() as db:
            record_refresh_run(
                db,
                refresh_type="metadata",
                mode="dry_run" if dry_run else "apply",
                status="failed",
                markets_checked=0,
                markets_updated=0,
                errors_count=1,
                summary_json={
                    "market_id": market_id,
                    "sport": sport,
                    "days": days,
                    "limit": limit,
                    "error_type": type(error).__name__,
                    "error": str(error)[:300],
                },
                started_at=started_at,
                finished_at=finished_at,
            )
            db.commit()
    except Exception:
        return


def _print_human(payload: dict[str, Any]) -> None:
    mode = "dry-run" if payload["dry_run"] else "apply"
    print(f"Controlled metadata refresh ({mode})")
    print(
        "checked={markets_checked} updated={markets_updated} unchanged={markets_unchanged} "
        "errors={partial_error_count}".format(**payload)
    )
    if not payload["items"]:
        print("No markets selected for metadata refresh.")
        return
    print("market_id\taction\tchanges\tsport\ttitle")
    for item in payload["items"]:
        print(
            "\t".join(
                [
                    str(item["market_id"]),
                    item["action"],
                    str(len(item["changes"])),
                    item["sport"],
                    item["title"],
                ]
            )
        )


if __name__ == "__main__":
    main()
