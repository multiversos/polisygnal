from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import perf_counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.models.market import Market
from app.models.prediction import DEFAULT_PREDICTION_FAMILY, Prediction
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.repositories.markets import _sport_filter_values
from app.services.scoring import score_market


@dataclass(slots=True)
class MissingMarketScoringSummary:
    status: str = "ok"
    dry_run: bool = True
    apply: bool = False
    sport_type: str | None = None
    market_type: str | None = None
    limit: int | None = None
    candidates_checked: int = 0
    candidates_without_prediction: int = 0
    candidates_with_snapshot: int = 0
    scored: int = 0
    skipped: int = 0
    skipped_reasons: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    prediction_ids_created: list[int] = field(default_factory=list)
    market_ids_scored: list[int] = field(default_factory=list)

    @property
    def partial_errors(self) -> list[str]:
        return self.errors

    def add_skip(self, reason: str) -> None:
        self.skipped += 1
        self.skipped_reasons[reason] = self.skipped_reasons.get(reason, 0) + 1

    def to_payload(self) -> dict[str, object]:
        predictions_created = len(self.prediction_ids_created)
        return {
            "status": self.status,
            "dry_run": self.dry_run,
            "apply": self.apply,
            "sport_type": self.sport_type,
            "market_type": self.market_type,
            "limit": self.limit,
            "candidates_checked": self.candidates_checked,
            "candidates_without_prediction": self.candidates_without_prediction,
            "candidates_with_snapshot": self.candidates_with_snapshot,
            "scored": self.scored,
            "skipped": self.skipped,
            "skipped_reasons": self.skipped_reasons,
            "errors": self.errors,
            "prediction_ids_created": self.prediction_ids_created,
            "market_ids_scored": self.market_ids_scored,
            "partial_error_count": len(self.errors),
            "predictions_created": predictions_created,
            "predictions_updated": 0,
            "markets_considered": self.candidates_checked,
            "markets_scored": self.scored,
        }


def score_missing_markets(
    db: Session,
    *,
    settings: Settings,
    limit: int,
    apply: bool = False,
    sport_type: str | None = None,
    market_type: str | None = None,
    run_at: datetime | None = None,
) -> MissingMarketScoringSummary:
    if limit <= 0:
        raise ValueError("--limit debe ser mayor que 0 para evitar scoring masivo accidental.")

    dry_run = not apply
    current_run_at = run_at or datetime.now(tz=UTC)
    markets = _list_missing_prediction_candidates(
        db,
        sport_type=sport_type,
        market_type=market_type,
        limit=limit,
    )
    market_ids = [market.id for market in markets]
    latest_snapshots = list_latest_market_snapshots_for_markets(db, market_ids)
    summary = MissingMarketScoringSummary(
        dry_run=dry_run,
        apply=apply,
        sport_type=sport_type,
        market_type=market_type,
        limit=limit,
        candidates_checked=len(markets),
        candidates_without_prediction=len(markets),
        candidates_with_snapshot=sum(1 for market_id in market_ids if market_id in latest_snapshots),
    )

    for market in markets:
        if market.id not in latest_snapshots:
            summary.add_skip("no_snapshot")
            continue

        if dry_run:
            summary.add_skip("dry_run")
            continue

        try:
            with db.begin_nested():
                result = score_market(
                    db,
                    market=market,
                    settings=settings,
                    run_at=current_run_at,
                )
            if result.prediction is None:
                summary.add_skip("scoring_returned_no_prediction")
            else:
                summary.scored += 1
                summary.prediction_ids_created.append(result.prediction.id)
                summary.market_ids_scored.append(market.id)
            summary.errors.extend(result.partial_errors)
        except Exception as exc:
            summary.add_skip("scoring_error")
            summary.errors.append(f"Market {market.id}: error ejecutando scoring: {exc}")

    if apply:
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            summary.status = "error"
            summary.errors.append(f"Error confirmando predictions en base: {exc}")
    else:
        db.rollback()

    if summary.status != "error" and summary.errors:
        summary.status = "warning"
    return summary


def _list_missing_prediction_candidates(
    db: Session,
    *,
    sport_type: str | None,
    market_type: str | None,
    limit: int,
) -> list[Market]:
    predicted_market_ids = select(Prediction.market_id).where(
        Prediction.prediction_family == DEFAULT_PREDICTION_FAMILY
    )
    stmt = (
        select(Market)
        .options(joinedload(Market.event))
        .where(
            Market.active.is_(True),
            Market.closed.is_(False),
            Market.id.not_in(predicted_market_ids),
        )
        .order_by(Market.id.asc())
    )
    if sport_type is not None:
        stmt = stmt.where(func.lower(Market.sport_type).in_(_sport_filter_values(sport_type)))
    if market_type is not None:
        stmt = stmt.where(Market.market_type == market_type)
    stmt = stmt.limit(limit)
    return list(db.scalars(stmt).unique().all())


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Detecta mercados activos sin prediction scoring_v1 y, solo con --apply, "
            "crea predictions usando el snapshot mas reciente."
        )
    )
    parser.add_argument("--sport-type", default=None, help="Filtro opcional por sport_type.")
    parser.add_argument("--market-type", default=None, help="Filtro opcional por market_type.")
    parser.add_argument(
        "--limit",
        type=int,
        required=True,
        help="Cantidad maxima de mercados faltantes a revisar. Obligatorio por seguridad.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Modo explicito de solo lectura. Es el comportamiento por defecto.",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Persiste predictions para candidatos sin prediction y con snapshot.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def _print_payload(payload: dict[str, object], *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
        return
    print(f"Status: {payload['status']}")
    print(f"Dry run: {payload['dry_run']}")
    print(f"Apply: {payload['apply']}")
    print(f"Candidates checked: {payload['candidates_checked']}")
    print(f"Candidates without prediction: {payload['candidates_without_prediction']}")
    print(f"Candidates with snapshot: {payload['candidates_with_snapshot']}")
    print(f"Scored: {payload['scored']}")
    print(f"Skipped: {payload['skipped']}")
    print(f"Errors: {payload['partial_error_count']}")


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    settings = get_settings()
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            summary = score_missing_markets(
                db,
                settings=settings,
                limit=args.limit,
                apply=args.apply,
                sport_type=args.sport_type,
                market_type=args.market_type,
                run_at=started_at,
            )
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "dry_run": not args.apply,
            "apply": args.apply,
            "sport_type": args.sport_type,
            "market_type": args.market_type,
            "limit": args.limit,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    finished_at = datetime.now(tz=UTC)
    payload = {
        **summary.to_payload(),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
    }
    _print_payload(payload, as_json=args.json)


if __name__ == "__main__":
    main()
