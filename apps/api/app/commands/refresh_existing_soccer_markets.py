from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.repositories.markets import _sport_filter_values

DEFAULT_SPORT = "soccer"
DEFAULT_LIMIT = 25
DEFAULT_STALE_HOURS = 48
MAX_LIMIT = 200


def main(argv: Sequence[str] | None = None) -> None:
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()
    try:
        args = parse_args(argv)
    except SystemExit:
        raise

    try:
        with SessionLocal() as db:
            try:
                payload = build_existing_soccer_refresh_plan(
                    db,
                    sport=args.sport,
                    limit=args.limit,
                    stale_hours=args.stale_hours,
                    missing_snapshot_only=args.missing_snapshot_only,
                    missing_prediction_only=args.missing_prediction_only,
                    stale_only=args.stale_only,
                    now=started_at,
                )
            finally:
                db.rollback()
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "read_only": True,
            "dry_run": True,
            "apply": False,
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    finished_at = datetime.now(tz=UTC)
    payload = {
        **payload,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
    }

    if args.report_json:
        write_report_json(payload, Path(args.report_json))

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True, default=str))
    else:
        print_human(payload)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)
    return args


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Planifica un refresh seguro de mercados soccer existentes. "
            "Dry-run es el default. No importa mercados nuevos, no borra y no hace trading."
        )
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Modo solo lectura. Es el default.")
    mode.add_argument("--apply", action="store_true", help="Reservado para un futuro apply supervisado.")
    parser.add_argument(
        "--yes-i-understand-this-writes-data",
        action="store_true",
        help="Confirmacion adicional obligatoria para cualquier apply futuro.",
    )
    parser.add_argument("--sport", default=DEFAULT_SPORT, help="Deporte a evaluar. Solo soccer.")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Maximo de mercados candidatos.")
    parser.add_argument(
        "--stale-hours",
        type=int,
        default=DEFAULT_STALE_HOURS,
        help="Horas para considerar viejo el ultimo snapshot.",
    )
    parser.add_argument(
        "--missing-snapshot-only",
        action="store_true",
        help="Selecciona solo mercados sin snapshot.",
    )
    parser.add_argument(
        "--missing-prediction-only",
        action="store_true",
        help="Selecciona solo mercados sin analisis/prediction.",
    )
    parser.add_argument(
        "--stale-only",
        action="store_true",
        help="Selecciona solo mercados con snapshot viejo.",
    )
    parser.add_argument(
        "--report-json",
        default=None,
        help="Guarda un reporte JSON local del dry-run. No contiene secretos.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def validate_args(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    if args.limit <= 0:
        parser.error("--limit debe ser mayor que 0.")
    if args.limit > MAX_LIMIT:
        parser.error(f"--limit no puede ser mayor que {MAX_LIMIT}.")
    if args.stale_hours <= 0:
        parser.error("--stale-hours debe ser mayor que 0.")
    if args.sport.strip().lower() != DEFAULT_SPORT:
        parser.error("Este comando solo permite --sport soccer.")
    if args.apply and not args.yes_i_understand_this_writes_data:
        parser.error("--apply requiere --yes-i-understand-this-writes-data.")
    if args.apply and args.report_json:
        parser.error("--report-json solo esta permitido en dry-run.")
    if args.apply:
        parser.error(
            "--apply esta bloqueado por ahora. Use el dry-run y el runbook antes de "
            "habilitar escritura supervisada."
        )


def build_existing_soccer_refresh_plan(
    db: Session,
    *,
    sport: str = DEFAULT_SPORT,
    limit: int = DEFAULT_LIMIT,
    stale_hours: int = DEFAULT_STALE_HOURS,
    missing_snapshot_only: bool = False,
    missing_prediction_only: bool = False,
    stale_only: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = _ensure_aware(now or datetime.now(tz=UTC))
    stale_before = current_time - timedelta(hours=stale_hours)
    markets = list(
        db.scalars(
            select(Market)
            .options(
                selectinload(Market.event),
                selectinload(Market.snapshots),
                selectinload(Market.predictions),
            )
            .where(func.lower(Market.sport_type).in_(_sport_filter_values(sport)))
            .order_by(Market.end_date.asc().nulls_last(), Market.id.asc())
        )
    )

    selected: list[dict[str, Any]] = []
    skipped_reasons: Counter[str] = Counter()
    refresh_skip_reasons: Counter[str] = Counter()
    stale_candidates = 0
    missing_snapshot_candidates = 0
    missing_prediction_candidates = 0
    would_refresh_snapshots = 0
    would_score_predictions = 0
    would_score_predictions_ready_now = 0
    active = 0
    closed = 0

    focus_filters = {
        "missing_snapshot_only": missing_snapshot_only,
        "missing_prediction_only": missing_prediction_only,
        "stale_only": stale_only,
    }
    has_focus_filter = any(focus_filters.values())

    for market in markets:
        snapshot = _latest_snapshot(market)
        prediction = _latest_prediction(market)
        latest_snapshot_at = _ensure_aware(snapshot.captured_at) if snapshot else None
        is_active = bool(market.active and not market.closed)
        if is_active:
            active += 1
        else:
            closed += 1

        missing_snapshot = snapshot is None
        missing_prediction = prediction is None
        stale_snapshot = bool(latest_snapshot_at and latest_snapshot_at < stale_before)
        stale_or_missing_snapshot = missing_snapshot or stale_snapshot
        has_token = bool(market.yes_token_id or market.no_token_id)

        if missing_snapshot:
            missing_snapshot_candidates += 1
        if missing_prediction:
            missing_prediction_candidates += 1
        if stale_snapshot:
            stale_candidates += 1

        reasons = _candidate_reasons(
            missing_snapshot=missing_snapshot,
            missing_prediction=missing_prediction,
            stale_snapshot=stale_snapshot,
            is_active=is_active,
        )
        matches_focus = _matches_focus(
            has_focus_filter=has_focus_filter,
            missing_snapshot_only=missing_snapshot_only,
            missing_prediction_only=missing_prediction_only,
            stale_only=stale_only,
            missing_snapshot=missing_snapshot,
            missing_prediction=missing_prediction,
            stale_snapshot=stale_snapshot,
        )
        needs_attention = stale_or_missing_snapshot or missing_prediction

        if not is_active:
            skipped_reasons["closed_or_inactive"] += 1
            continue
        if not needs_attention:
            skipped_reasons["no_refresh_needed"] += 1
            continue
        if not matches_focus:
            skipped_reasons["outside_focus_filters"] += 1
            continue

        would_refresh_snapshot = stale_or_missing_snapshot and has_token
        if stale_or_missing_snapshot and not has_token:
            refresh_skip_reasons["missing_token_id"] += 1
        would_score_prediction = missing_prediction and (snapshot is not None or would_refresh_snapshot)
        if missing_prediction and snapshot is None and not would_refresh_snapshot:
            refresh_skip_reasons["missing_snapshot_for_scoring"] += 1

        item = _market_item(
            market=market,
            snapshot=snapshot,
            prediction=prediction,
            latest_snapshot_at=latest_snapshot_at,
            stale_before=stale_before,
            reasons=reasons,
            would_refresh_snapshot=would_refresh_snapshot,
            would_score_prediction=would_score_prediction,
        )
        selected.append(item)
        if would_refresh_snapshot:
            would_refresh_snapshots += 1
        if would_score_prediction:
            would_score_predictions += 1
            if snapshot is not None:
                would_score_predictions_ready_now += 1
        if len(selected) >= limit:
            break

    return {
        "status": "ok",
        "read_only": True,
        "dry_run": True,
        "apply": False,
        "apply_enabled": False,
        "apply_blocked_reason": "apply_not_implemented_until_supervised_write_flow_is_approved",
        "writes_planned": False,
        "trading_executed": False,
        "sport": sport,
        "limit": limit,
        "stale_hours": stale_hours,
        "filters": focus_filters,
        "total_existing_markets": len(markets),
        "active": active,
        "closed": closed,
        "total_candidates": len(selected),
        "stale_candidates": stale_candidates,
        "missing_snapshot_candidates": missing_snapshot_candidates,
        "missing_prediction_candidates": missing_prediction_candidates,
        "would_refresh_snapshots": would_refresh_snapshots,
        "would_score_predictions": would_score_predictions,
        "would_score_predictions_ready_now": would_score_predictions_ready_now,
        "skipped": max(len(markets) - len(selected), 0),
        "skipped_reasons_count": dict(sorted(skipped_reasons.items())),
        "refresh_skip_reasons_count": dict(sorted(refresh_skip_reasons.items())),
        "top_reasons": _top_reasons(selected),
        "items": selected,
        "next_steps": [
            "Rerun this dry-run in an environment with the Neon production database confirmed.",
            "Review candidates before enabling any supervised apply implementation.",
            "Do not import new markets and do not use delete-existing.",
        ],
    }


def write_report_json(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True, default=str), encoding="utf-8")


def print_human(payload: dict[str, Any]) -> None:
    print("Existing soccer refresh plan (dry-run)")
    print(
        "read_only={read_only} apply={apply} total={total_existing_markets} candidates={total_candidates} "
        "would_refresh_snapshots={would_refresh_snapshots} would_score_predictions={would_score_predictions}".format(
            **payload
        )
    )
    print(
        "missing_snapshot={missing_snapshot_candidates} missing_prediction={missing_prediction_candidates} "
        "stale={stale_candidates} skipped={skipped}".format(**payload)
    )
    if payload["items"]:
        print("market_id\tactions\treasons\ttitle")
        for item in payload["items"]:
            actions = []
            if item["would_refresh_snapshot"]:
                actions.append("refresh_snapshot")
            if item["would_score_prediction"]:
                actions.append("score_prediction")
            print(
                "\t".join(
                    [
                        str(item["market_id"]),
                        ",".join(actions) or "none",
                        ",".join(item["reasons"]),
                        item["title"],
                    ]
                )
            )


def _candidate_reasons(
    *,
    missing_snapshot: bool,
    missing_prediction: bool,
    stale_snapshot: bool,
    is_active: bool,
) -> list[str]:
    reasons: list[str] = []
    if missing_snapshot:
        reasons.append("missing_snapshot")
    if missing_prediction:
        reasons.append("missing_prediction")
    if stale_snapshot:
        reasons.append("stale_snapshot")
    if not is_active:
        reasons.append("closed_or_inactive")
    return reasons


def _matches_focus(
    *,
    has_focus_filter: bool,
    missing_snapshot_only: bool,
    missing_prediction_only: bool,
    stale_only: bool,
    missing_snapshot: bool,
    missing_prediction: bool,
    stale_snapshot: bool,
) -> bool:
    if not has_focus_filter:
        return True
    return (
        (missing_snapshot_only and missing_snapshot)
        or (missing_prediction_only and missing_prediction)
        or (stale_only and stale_snapshot)
    )


def _market_item(
    *,
    market: Market,
    snapshot: MarketSnapshot | None,
    prediction: Prediction | None,
    latest_snapshot_at: datetime | None,
    stale_before: datetime,
    reasons: list[str],
    would_refresh_snapshot: bool,
    would_score_prediction: bool,
) -> dict[str, Any]:
    return {
        "market_id": market.id,
        "remote_id": market.polymarket_market_id,
        "title": market.question,
        "event_title": market.event.title if market.event else None,
        "event_slug": market.event.slug if market.event else None,
        "active": bool(market.active),
        "closed": bool(market.closed),
        "end_date": market.end_date.isoformat() if market.end_date else None,
        "latest_snapshot_at": latest_snapshot_at.isoformat() if latest_snapshot_at else None,
        "has_snapshot": snapshot is not None,
        "has_prediction": prediction is not None,
        "has_token": bool(market.yes_token_id or market.no_token_id),
        "has_price": bool(
            snapshot and (snapshot.yes_price is not None or snapshot.no_price is not None)
        ),
        "has_liquidity": bool(snapshot and snapshot.liquidity is not None and snapshot.liquidity > 0),
        "has_volume": bool(snapshot and snapshot.volume is not None and snapshot.volume > 0),
        "stale_before": stale_before.isoformat(),
        "reasons": reasons,
        "would_refresh_snapshot": would_refresh_snapshot,
        "would_score_prediction": would_score_prediction,
    }


def _top_reasons(items: list[dict[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for item in items:
        counter.update(item["reasons"])
    return dict(counter.most_common(10))


def _latest_snapshot(market: Market) -> MarketSnapshot | None:
    return market.snapshots[0] if market.snapshots else None


def _latest_prediction(market: Market) -> Prediction | None:
    return market.predictions[0] if market.predictions else None


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


if __name__ == "__main__":
    main()
