from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction

SPORT = "soccer"
DEFAULT_STALE_HOURS = 48
DEFAULT_SAMPLE_LIMIT = 10


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.stale_hours <= 0:
        parser.error("--stale-hours debe ser mayor que 0.")
    if args.sample_limit <= 0:
        parser.error("--sample-limit debe ser mayor que 0.")

    with SessionLocal() as db:
        try:
            payload = inspect_soccer_market_health(
                db,
                sport=args.sport,
                stale_hours=args.stale_hours,
                sample_limit=args.sample_limit,
            )
        finally:
            db.rollback()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True, default=str))
    else:
        print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Inspecciona salud basica de mercados soccer guardados. "
            "Es solo lectura: no importa, no crea snapshots, no scorea y no borra."
        )
    )
    parser.add_argument("--sport", default=SPORT, help="Deporte a inspeccionar. Default soccer.")
    parser.add_argument(
        "--stale-hours",
        type=int,
        default=DEFAULT_STALE_HOURS,
        help="Horas para considerar un mercado sin actualizacion reciente.",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=DEFAULT_SAMPLE_LIMIT,
        help="Maximo de ejemplos de mercados que necesitan revision.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime salida JSON.")
    return parser


def inspect_soccer_market_health(
    db: Session,
    *,
    sport: str = SPORT,
    stale_hours: int = DEFAULT_STALE_HOURS,
    sample_limit: int = DEFAULT_SAMPLE_LIMIT,
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
            .where(Market.sport_type.ilike(sport))
            .order_by(Market.end_date.asc().nulls_last(), Market.id.asc())
        )
    )

    with_snapshot = 0
    with_prediction = 0
    active = 0
    closed = 0
    recently_updated = 0
    stale = 0
    missing_price = 0
    missing_liquidity = 0
    missing_snapshot = 0
    missing_prediction = 0
    samples: list[dict[str, Any]] = []
    latest_seen_update: datetime | None = None

    for market in markets:
        snapshot = _latest_snapshot(market)
        prediction = _latest_prediction(market)
        latest_update = _latest_update(market, snapshot, prediction)
        if latest_update and (latest_seen_update is None or latest_update > latest_seen_update):
            latest_seen_update = latest_update

        reasons: list[str] = []
        if snapshot:
            with_snapshot += 1
        else:
            missing_snapshot += 1
            reasons.append("missing_snapshot")
        if prediction:
            with_prediction += 1
        else:
            missing_prediction += 1
            reasons.append("missing_prediction")
        if market.active and not market.closed:
            active += 1
        if market.closed or not market.active:
            closed += 1
            reasons.append("closed_or_inactive")

        has_recent_update = bool(latest_update and latest_update >= stale_before)
        if has_recent_update:
            recently_updated += 1
        else:
            stale += 1
            reasons.append("stale")

        if not snapshot or (snapshot.yes_price is None and snapshot.no_price is None):
            missing_price += 1
            reasons.append("missing_price")
        if not snapshot or _is_empty_decimal(snapshot.liquidity):
            missing_liquidity += 1
            reasons.append("missing_liquidity")

        if reasons and len(samples) < sample_limit:
            samples.append(
                {
                    "market_id": market.id,
                    "title": market.question,
                    "event_title": market.event.title if market.event else None,
                    "event_slug": market.event.slug if market.event else None,
                    "active": bool(market.active),
                    "closed": bool(market.closed),
                    "end_date": market.end_date.isoformat() if market.end_date else None,
                    "latest_update": latest_update.isoformat() if latest_update else None,
                    "reasons": sorted(set(reasons)),
                }
            )

    return {
        "status": "ok",
        "read_only": True,
        "sport": sport,
        "stale_hours": stale_hours,
        "total_soccer_markets": len(markets),
        "with_snapshot": with_snapshot,
        "with_prediction": with_prediction,
        "active": active,
        "closed": closed,
        "recently_updated": recently_updated,
        "stale": stale,
        "missing_price": missing_price,
        "missing_liquidity": missing_liquidity,
        "missing_snapshot": missing_snapshot,
        "missing_prediction": missing_prediction,
        "latest_seen_update": latest_seen_update.isoformat() if latest_seen_update else None,
        "sample_markets_needing_refresh": samples,
    }


def print_human(payload: dict[str, Any]) -> None:
    print("Soccer market health inspection")
    print(
        "read_only={read_only} sport={sport} total={total_soccer_markets} "
        "with_snapshot={with_snapshot} with_prediction={with_prediction} "
        "active={active} closed={closed} recently_updated={recently_updated} stale={stale}".format(
            **payload
        )
    )
    print(
        "missing_price={missing_price} missing_liquidity={missing_liquidity} "
        "missing_snapshot={missing_snapshot} missing_prediction={missing_prediction}".format(
            **payload
        )
    )
    if payload["sample_markets_needing_refresh"]:
        print("sample_markets_needing_refresh:")
        for item in payload["sample_markets_needing_refresh"]:
            print(
                "  #{market_id} {title} | reasons={reasons} | latest={latest_update}".format(
                    market_id=item["market_id"],
                    title=item["title"],
                    reasons=",".join(item["reasons"]),
                    latest_update=item.get("latest_update") or "none",
                )
            )


def _latest_snapshot(market: Market) -> MarketSnapshot | None:
    return market.snapshots[0] if market.snapshots else None


def _latest_prediction(market: Market) -> Prediction | None:
    return market.predictions[0] if market.predictions else None


def _latest_update(
    market: Market,
    snapshot: MarketSnapshot | None,
    prediction: Prediction | None,
) -> datetime | None:
    values = [
        _ensure_aware(value)
        for value in (
            snapshot.captured_at if snapshot else None,
            prediction.run_at if prediction else None,
        )
        if value is not None
    ]
    return max(values) if values else None


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _is_empty_decimal(value: Decimal | None) -> bool:
    return value is None or value <= 0


if __name__ == "__main__":
    main()
