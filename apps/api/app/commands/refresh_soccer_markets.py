from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient
from app.commands.create_snapshots_from_discovery import _run as run_discovery_snapshots
from app.commands.import_live_discovered_markets import _run as run_live_import
from app.commands.score_missing_markets import score_missing_markets
from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction

SPORT = "soccer"
DEFAULT_LIMIT = 100


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        validate_args(args)
    except ValueError as exc:
        parser.error(str(exc))

    settings = get_settings()
    gamma_client = PolymarketGammaClient.from_settings(settings)
    try:
        with SessionLocal() as db:
            try:
                payload = run_refresh_soccer_markets(
                    db,
                    client=gamma_client,
                    settings=settings,
                    apply=args.apply,
                    delete_existing=args.delete_existing,
                    days=args.days,
                    pages=args.pages,
                    limit=args.limit,
                    max_events=args.max_events,
                    max_import=args.max_import,
                    max_snapshots=args.max_snapshots,
                    score_limit=args.score_limit,
                    debug_skips=args.debug_skips,
                )
                if not args.apply:
                    db.rollback()
            except Exception as exc:
                db.rollback()
                print(
                    json.dumps(
                        {
                            "status": "error",
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                            "dry_run": not args.apply,
                            "apply": args.apply,
                            "read_only": not args.apply,
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
        print_human(payload)
    if args.report_json:
        write_report_json(payload, args.report_json)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Orquesta un refresh seguro de la cartelera soccer desde Polymarket. "
            "Dry-run es el default; --apply es obligatorio para cualquier escritura. "
            "No borra datos existentes."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Modo solo lectura. Es el default.")
    mode.add_argument("--apply", action="store_true", help="Ejecuta import, snapshots y scoring.")
    parser.add_argument(
        "--yes-i-understand-this-writes-data",
        action="store_true",
        help="Confirmacion adicional obligatoria para usar --apply.",
    )
    parser.add_argument("--days", type=int, default=7, help="Ventana de proximos dias.")
    parser.add_argument(
        "--pages",
        "--max-pages",
        type=int,
        default=5,
        help="Paginas remotas de Polymarket /events a leer.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help="Limite base de eventos remotos por pagina. No limita mercados aplanados.",
    )
    parser.add_argument(
        "--max-events",
        "--max-games",
        type=int,
        default=10,
        help="Maximo de eventos/partidos soccer elegibles.",
    )
    parser.add_argument("--max-import", type=int, default=30, help="Maximo de mercados a importar.")
    parser.add_argument(
        "--max-snapshots",
        type=int,
        default=30,
        help="Maximo de snapshots a crear.",
    )
    parser.add_argument(
        "--score-limit",
        type=int,
        default=30,
        help="Maximo de mercados faltantes a revisar para scoring.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    parser.add_argument(
        "--report-json",
        help="Guarda un reporte local JSON seguro del dry-run. No funciona con --apply.",
    )
    parser.add_argument(
        "--debug-skips",
        action="store_true",
        help="Incluye razones de descarte del import dry-run.",
    )
    parser.add_argument(
        "--delete-existing",
        action="store_true",
        help=(
            "Reservado para refresh completo futuro. Requerira --apply, backup y "
            "confirmacion explicita; este comando no borra datos hoy."
        ),
    )
    return parser


def validate_args(args: argparse.Namespace) -> None:
    if args.apply and not args.yes_i_understand_this_writes_data:
        raise ValueError(
            "--apply requiere --yes-i-understand-this-writes-data para confirmar escrituras."
        )
    if args.apply and args.report_json:
        raise ValueError("--report-json solo esta permitido en dry-run.")
    if args.delete_existing and not args.apply:
        raise ValueError("--delete-existing requiere --apply y backup verificado.")
    if args.delete_existing:
        raise ValueError(
            "--delete-existing todavia no esta implementado; prepara backup y "
            "confirmacion explicita antes de habilitar borrados."
        )
    positive_fields = [
        "days",
        "pages",
        "limit",
        "max_events",
        "max_import",
        "max_snapshots",
        "score_limit",
    ]
    for field in positive_fields:
        if getattr(args, field) <= 0:
            raise ValueError(f"--{field.replace('_', '-')} debe ser mayor que 0.")


def run_refresh_soccer_markets(
    db: Session,
    *,
    client: PolymarketGammaClient,
    settings: Settings,
    apply: bool = False,
    delete_existing: bool = False,
    days: int = 7,
    pages: int = 5,
    limit: int = DEFAULT_LIMIT,
    max_events: int = 10,
    max_import: int = 30,
    max_snapshots: int = 30,
    score_limit: int = 30,
    debug_skips: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    if delete_existing:
        raise ValueError(
            "--delete-existing no esta habilitado en este orquestador seguro. "
            "Haz backup soccer-only y usa un sprint supervisado antes de borrar."
        )

    dry_run = not apply
    started_at = now or datetime.now(tz=UTC)
    counts_before = collect_refresh_counts(db)
    warnings: list[str] = []
    if dry_run:
        warnings.append("dry_run_default_no_writes")
        warnings.append("snapshot_dry_run_uses_current_local_markets")
    warnings.append("delete_existing_disabled")

    import_payload = run_live_import(
        db,
        client=client,
        sport=SPORT,
        days=days,
        limit=limit,
        pages=pages,
        dry_run=dry_run,
        max_import=max_import,
        max_events=max_events,
        min_hours_to_close=6,
        source_tag_id=settings.polymarket_sports_tag_id,
        include_skip_reasons=debug_skips,
        now=started_at,
    )
    if apply:
        db.commit()
    else:
        db.rollback()

    snapshot_payload = run_discovery_snapshots(
        db,
        client=client,
        sport=SPORT,
        days=days,
        limit=limit,
        pages=pages,
        dry_run=dry_run,
        max_snapshots=max_snapshots,
        source_tag_id=settings.polymarket_sports_tag_id,
        now=started_at,
    )
    if apply:
        db.commit()
    else:
        db.rollback()

    scoring_summary = score_missing_markets(
        db,
        settings=settings,
        limit=score_limit,
        apply=apply,
        sport_type=SPORT,
        run_at=started_at,
    )
    scoring_payload = scoring_summary.to_payload()
    counts_after = collect_refresh_counts(db)
    candidate_events = _candidate_events(import_payload)

    return {
        "status": _combine_status(import_payload, snapshot_payload, scoring_payload),
        "sport": SPORT,
        "dry_run": dry_run,
        "apply": apply,
        "read_only": dry_run,
        "delete_existing_requested": delete_existing,
        "delete_existing_executed": False,
        "requested_days": days,
        "requested_pages": pages,
        "requested_limit": limit,
        "max_events": max_events,
        "max_import": max_import,
        "max_snapshots": max_snapshots,
        "score_limit": score_limit,
        "counts_before": counts_before,
        "counts_after": counts_after,
        "backup_plan": {
            "required_before_delete": True,
            "delete_supported": False,
            "recommended_root": r"N:\projects\_polysignal_backups",
            "note": "No se borra soccer viejo desde este comando en esta version.",
        },
        "import": import_payload,
        "snapshots": snapshot_payload,
        "scoring": scoring_payload,
        "import_would_import": import_payload.get("would_import", 0),
        "candidate_events": candidate_events,
        "candidate_markets": _candidate_market_count(import_payload),
        "snapshot_would_create": snapshot_payload.get("would_create", 0),
        "scoring_candidates": scoring_payload.get("candidates_without_prediction", 0),
        "dry_run_report": _build_dry_run_report(
            import_payload=import_payload,
            snapshot_payload=snapshot_payload,
            scoring_payload=scoring_payload,
        ),
        "apply_readiness": _build_apply_readiness(
            import_payload=import_payload,
            snapshot_payload=snapshot_payload,
            scoring_payload=scoring_payload,
            days=days,
            pages=pages,
            limit=limit,
            max_events=max_events,
            max_import=max_import,
            max_snapshots=max_snapshots,
            score_limit=score_limit,
            debug_skips=debug_skips,
        ),
        "warnings": warnings,
        "next_command_to_apply": _build_next_apply_command(
            days=days,
            pages=pages,
            limit=limit,
            max_events=max_events,
            max_import=max_import,
            max_snapshots=max_snapshots,
            score_limit=score_limit,
            debug_skips=debug_skips,
        ),
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(tz=UTC).isoformat(),
    }


def collect_refresh_counts(db: Session) -> dict[str, Any]:
    soccer_market_ids = select(Market.id).where(func.lower(Market.sport_type) == SPORT)
    return {
        "events_total": _count(db, Event),
        "markets_total": _count(db, Market),
        "snapshots_total": _count(db, MarketSnapshot),
        "predictions_total": _count(db, Prediction),
        "soccer_events": db.scalar(
            select(func.count(func.distinct(Market.event_id))).where(
                func.lower(Market.sport_type) == SPORT
            )
        )
        or 0,
        "soccer_markets": db.scalar(
            select(func.count()).select_from(Market).where(func.lower(Market.sport_type) == SPORT)
        )
        or 0,
        "soccer_snapshots": db.scalar(
            select(func.count())
            .select_from(MarketSnapshot)
            .where(MarketSnapshot.market_id.in_(soccer_market_ids))
        )
        or 0,
        "soccer_predictions": db.scalar(
            select(func.count())
            .select_from(Prediction)
            .where(Prediction.market_id.in_(soccer_market_ids))
        )
        or 0,
    }


def print_human(payload: dict[str, Any]) -> None:
    print("Soccer market refresh orchestrator")
    print(
        "dry_run={dry_run} apply={apply} days={requested_days} pages={requested_pages} "
        "max_events={max_events} max_import={max_import} max_snapshots={max_snapshots} "
        "score_limit={score_limit}".format(**payload)
    )
    print(
        "import_would_import={import_would_import} candidate_events={events} "
        "candidate_markets={candidate_markets} snapshot_would_create={snapshot_would_create} "
        "scoring_candidates={scoring_candidates}".format(
            events=len(payload["candidate_events"]),
            **payload,
        )
    )
    if payload["warnings"]:
        print("warnings=" + json.dumps(payload["warnings"], ensure_ascii=True))
    print("next_command_to_apply:")
    print(payload["next_command_to_apply"])


def write_report_json(payload: dict[str, Any], path: str) -> Path:
    report_path = Path(path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(_redact_report_payload(payload), indent=2, ensure_ascii=True, default=str),
        encoding="utf-8",
    )
    return report_path


def _redact_report_payload(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).lower()
            if any(token in normalized_key for token in ("database_url", "password", "secret", "token")):
                redacted[key] = "<redacted>"
            else:
                redacted[key] = _redact_report_payload(item)
        return redacted
    if isinstance(value, list):
        return [_redact_report_payload(item) for item in value]
    if isinstance(value, str) and (
        value.startswith("postgres://") or value.startswith("postgresql://")
    ):
        return "<redacted-url>"
    return value


def _count(db: Session, model: type[object]) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def _candidate_events(import_payload: dict[str, Any]) -> list[dict[str, Any]]:
    groups = import_payload.get("event_groups") or []
    return [
        {
            "event_slug": group.get("event_slug"),
            "title": group.get("title"),
            "teams": group.get("teams") or [],
            "close_time": group.get("close_time"),
            "has_draw_market": group.get("has_draw_market"),
            "would_import_markets_count": group.get("would_import_markets_count"),
            "primary_markets": group.get("primary_markets") or [],
        }
        for group in groups
    ]


def _candidate_market_count(import_payload: dict[str, Any]) -> int:
    if "would_import" in import_payload:
        return int(import_payload["would_import"] or 0)
    return sum(1 for item in import_payload.get("items", []) if item.get("action") == "would_import")


def _build_dry_run_report(
    *,
    import_payload: dict[str, Any],
    snapshot_payload: dict[str, Any],
    scoring_payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "candidate_events_count": len(import_payload.get("event_groups") or []),
        "candidate_markets": _candidate_market_count(import_payload),
        "would_import": import_payload.get("would_import", 0),
        "imported": import_payload.get("imported", 0),
        "skipped": import_payload.get("skipped", 0),
        "skip_reasons_count": import_payload.get("skip_reasons_count", {}),
        "skip_reason_examples": import_payload.get("skip_reason_examples", {}),
        "snapshot_would_create": snapshot_payload.get("would_create", 0),
        "snapshot_skipped": snapshot_payload.get("skipped", 0),
        "scoring_candidates": scoring_payload.get("candidates_without_prediction", 0),
        "scoring_candidates_with_snapshot": scoring_payload.get("candidates_with_snapshot", 0),
    }


def _top_counts(counts: dict[str, Any], *, limit: int = 8) -> list[dict[str, Any]]:
    normalized: list[tuple[str, int]] = []
    for reason, count in counts.items():
        try:
            normalized.append((str(reason), int(count)))
        except (TypeError, ValueError):
            continue
    normalized.sort(key=lambda item: (-item[1], item[0]))
    return [{"reason": reason, "count": count} for reason, count in normalized[:limit]]


def _build_next_dry_run_command(
    *,
    days: int,
    pages: int,
    limit: int,
    max_events: int,
    max_import: int,
    max_snapshots: int,
    score_limit: int,
    debug_skips: bool,
) -> str:
    parts = [
        "python -m app.commands.refresh_soccer_markets",
        f"--days {days}",
        f"--pages {pages}",
        f"--limit {limit}",
        f"--max-events {max_events}",
        f"--max-import {max_import}",
        f"--max-snapshots {max_snapshots}",
        f"--score-limit {score_limit}",
        "--json",
    ]
    if debug_skips:
        parts.append("--debug-skips")
    return " ".join(parts)


def _build_apply_readiness(
    *,
    import_payload: dict[str, Any],
    snapshot_payload: dict[str, Any],
    scoring_payload: dict[str, Any],
    days: int,
    pages: int,
    limit: int,
    max_events: int,
    max_import: int,
    max_snapshots: int,
    score_limit: int,
    debug_skips: bool,
) -> dict[str, Any]:
    skip_reasons = import_payload.get("skip_reasons_count") or {}
    if not isinstance(skip_reasons, dict):
        skip_reasons = {}

    duplicate_count = int(skip_reasons.get("already_exists_locally") or 0)
    risky_reason_fragments = (
        "closed",
        "esport",
        "missing_price",
        "missing_prices",
        "outside_window",
        "sport_mismatch",
        "too_close",
        "unsupported",
    )
    risky_candidate_count = 0
    top_risks: list[dict[str, Any]] = []
    for reason, count in skip_reasons.items():
        reason_text = str(reason)
        try:
            reason_count = int(count)
        except (TypeError, ValueError):
            continue
        if any(fragment in reason_text for fragment in risky_reason_fragments):
            risky_candidate_count += reason_count
            top_risks.append({"reason": reason_text, "count": reason_count})
    top_risks.sort(key=lambda item: (-int(item["count"]), str(item["reason"])))

    safe_candidate_count = int(import_payload.get("would_import") or 0)
    candidate_events_count = len(import_payload.get("event_groups") or [])
    status_ok = str(import_payload.get("status", "ok")) == "ok"
    ready = status_ok and safe_candidate_count > 0 and candidate_events_count > 0
    recommended = ready and safe_candidate_count <= max_import

    if not status_ok:
        reason = "El dry-run de import no terminó correctamente."
    elif safe_candidate_count <= 0:
        reason = "No hay mercados nuevos claros para aplicar."
    elif candidate_events_count <= 0:
        reason = "Hay candidatos, pero no quedaron agrupados en eventos revisables."
    elif safe_candidate_count > max_import:
        reason = "Hay más candidatos que el límite de importación; revisa y ajusta límites."
    else:
        reason = "Hay candidatos soccer agrupados y el límite actual evita un import masivo."

    return {
        "ready": ready,
        "recommended": recommended,
        "reason": reason,
        "safe_candidate_count": safe_candidate_count,
        "duplicate_count": duplicate_count,
        "risky_candidate_count": risky_candidate_count,
        "top_risks": top_risks[:8],
        "top_skip_reasons": _top_counts(skip_reasons),
        "snapshot_would_create": snapshot_payload.get("would_create", 0),
        "scoring_candidates": scoring_payload.get("candidates_without_prediction", 0),
        "recommended_limits": {
            "days": days,
            "pages": pages,
            "limit": limit,
            "max_events": max_events,
            "max_import": max_import,
            "max_snapshots": max_snapshots,
            "score_limit": score_limit,
        },
        "recommended_next_command_dry_run": _build_next_dry_run_command(
            days=days,
            pages=pages,
            limit=limit,
            max_events=max_events,
            max_import=max_import,
            max_snapshots=max_snapshots,
            score_limit=score_limit,
            debug_skips=debug_skips,
        ),
        "recommended_apply_command_marked_do_not_run": (
            "NO EJECUTAR SIN SUPERVISION: "
            + _build_next_apply_command(
                days=days,
                pages=pages,
                limit=limit,
                max_events=max_events,
                max_import=max_import,
                max_snapshots=max_snapshots,
                score_limit=score_limit,
                debug_skips=debug_skips,
            )
        ),
    }


def _combine_status(*payloads: dict[str, Any]) -> str:
    statuses = {str(payload.get("status", "ok")) for payload in payloads}
    if "error" in statuses:
        return "error"
    if "warning" in statuses:
        return "warning"
    return "ok"


def _build_next_apply_command(
    *,
    days: int,
    pages: int,
    limit: int,
    max_events: int,
    max_import: int,
    max_snapshots: int,
    score_limit: int,
    debug_skips: bool,
) -> str:
    parts = [
        "python -m app.commands.refresh_soccer_markets",
        "--apply",
        "--yes-i-understand-this-writes-data",
        f"--days {days}",
        f"--pages {pages}",
        f"--limit {limit}",
        f"--max-events {max_events}",
        f"--max-import {max_import}",
        f"--max-snapshots {max_snapshots}",
        f"--score-limit {score_limit}",
        "--json",
    ]
    if debug_skips:
        parts.append("--debug-skips")
    return " ".join(parts)


if __name__ == "__main__":
    main()
