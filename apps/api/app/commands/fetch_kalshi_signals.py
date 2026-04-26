from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from sqlalchemy.orm import Session

from app.clients.kalshi import KalshiClientError, KalshiReadOnlyClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.external_market_signal import ExternalMarketSignal
from app.schemas.kalshi import KalshiNormalizedMarket, KalshiOrderbookPreview
from app.services.external_market_signals import (
    create_external_market_signal,
    external_signal_create_from_kalshi_market,
)
from app.services.kalshi_market_signals import normalize_kalshi_market, normalize_kalshi_orderbook


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.source != "kalshi":
        parser.error("Fase B solo soporta --source kalshi.")
    if args.persist and args.dry_run:
        parser.error("--persist no puede combinarse con --dry-run.")

    settings = get_settings()
    client = KalshiReadOnlyClient.from_settings(settings)
    db: Session | None = SessionLocal() if args.persist else None
    try:
        payload = _run(args, client, db)
        if db is not None:
            db.commit()
    except KalshiClientError as exc:
        if db is not None:
            db.rollback()
        error_payload = {
            "status": "error",
            "dry_run": not args.persist,
            "read_only": True,
            "saved_to_db": False,
            "trading_executed": False,
            "error": str(exc),
        }
        print(json.dumps(error_payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc
    except Exception:
        if db is not None:
            db.rollback()
        raise
    finally:
        if db is not None:
            db.close()
        client.close()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch controlado de se\u00f1ales Kalshi en modo dry-run por defecto."
    )
    parser.add_argument("--limit", type=int, default=5, help="Cantidad de mercados a listar.")
    parser.add_argument("--status", type=str, default="open", help="Filtro de status Kalshi.")
    parser.add_argument("--query", type=str, default=None, help="Filtro local por texto/ticker.")
    parser.add_argument("--ticker", type=str, default=None, help="Ticker especifico de Kalshi.")
    parser.add_argument(
        "--orderbook",
        action="store_true",
        help="Consulta orderbook del ticker indicado en modo read-only.",
    )
    parser.add_argument("--depth", type=int, default=3, help="Profundidad de orderbook.")
    parser.add_argument("--source", type=str, default="kalshi", help="Fuente externa.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fuerza modo dry-run. Es el comportamiento por defecto si no se usa --persist.",
    )
    parser.add_argument(
        "--persist",
        action="store_true",
        help="Guarda se\u00f1ales normalizadas en external_market_signals. Debe pedirse explicitamente.",
    )
    parser.add_argument("--json", action="store_true", help="Imprime JSON normalizado.")
    return parser


def _run(
    args: argparse.Namespace,
    client: KalshiReadOnlyClient,
    db: Session | None = None,
) -> dict[str, Any]:
    dry_run = not args.persist
    if args.persist and db is None:
        raise ValueError("--persist requiere una sesion de base de datos.")

    if args.ticker:
        market = normalize_kalshi_market(client.get_market(args.ticker))
        orderbook: KalshiOrderbookPreview | None = None
        if args.orderbook:
            orderbook = normalize_kalshi_orderbook(
                client.get_orderbook(args.ticker, depth=args.depth)
            )
        saved_signals = _persist_markets([market], db) if args.persist else []
        return {
            "status": "ok",
            "dry_run": dry_run,
            "read_only": True,
            "persist_enabled": args.persist,
            "mode": "ticker",
            "source": args.source,
            "market": _dump_model(market),
            "orderbook": _dump_model(orderbook) if orderbook is not None else None,
            "saved_to_db": bool(saved_signals),
            "signals_saved": len(saved_signals),
            "signal_ids": [signal.id for signal in saved_signals],
            "trading_executed": False,
            "predictions_created": 0,
            "research_runs_created": 0,
        }

    page = client.list_markets(limit=args.limit, status=args.status, query=args.query)
    markets = [normalize_kalshi_market(market) for market in page.markets]
    saved_signals = _persist_markets(markets, db) if args.persist else []
    return {
        "status": "ok",
        "dry_run": dry_run,
        "read_only": True,
        "persist_enabled": args.persist,
        "mode": "list",
        "source": args.source,
        "limit": args.limit,
        "status_filter": args.status,
        "query_filter": args.query,
        "count": len(markets),
        "cursor_present": bool(page.cursor),
        "parse_errors": page.errors,
        "markets": [_dump_model(market) for market in markets],
        "saved_to_db": bool(saved_signals),
        "signals_saved": len(saved_signals),
        "signal_ids": [signal.id for signal in saved_signals],
        "trading_executed": False,
        "predictions_created": 0,
        "research_runs_created": 0,
    }


def _persist_markets(
    markets: list[KalshiNormalizedMarket],
    db: Session | None,
) -> list[ExternalMarketSignal]:
    if db is None:
        return []
    saved: list[ExternalMarketSignal] = []
    for market in markets:
        payload = external_signal_create_from_kalshi_market(market)
        saved.append(create_external_market_signal(db, payload))
    return saved


def _dump_model(
    model: KalshiNormalizedMarket | KalshiOrderbookPreview | None,
) -> dict[str, Any] | None:
    if model is None:
        return None
    return model.model_dump(mode="json")


def _print_human(payload: dict[str, Any]) -> None:
    if payload.get("persist_enabled"):
        print("PERSIST ENABLED - guarda senales normalizadas; no ejecuta trading.")
    else:
        print("DRY RUN / READ ONLY - no se guardan datos y no se ejecuta trading.")
    print(f"Status: {payload.get('status')}")
    print(f"Mode: {payload.get('mode')}")
    print(f"Saved to DB: {payload.get('saved_to_db')}")
    print(f"Trading executed: {payload.get('trading_executed')}")
    print(f"Signals saved: {payload.get('signals_saved')}")
    if payload.get("mode") == "ticker":
        market = payload.get("market")
        if isinstance(market, dict):
            _print_market(market)
        return

    print(f"Count: {payload.get('count')}")
    parse_errors = payload.get("parse_errors")
    if parse_errors:
        print(f"Parse errors: {parse_errors}")
    markets = payload.get("markets")
    if not isinstance(markets, list) or not markets:
        print("No markets matched the current filters.")
        return
    for index, market in enumerate(markets, start=1):
        print(f"\n#{index}")
        if isinstance(market, dict):
            _print_market(market)


def _print_market(market: dict[str, Any]) -> None:
    for key in [
        "source_ticker",
        "event_ticker",
        "title",
        "status",
        "yes_probability",
        "no_probability",
        "mid_price",
        "spread",
        "volume",
        "liquidity",
        "open_interest",
        "source_confidence",
        "warnings",
    ]:
        print(f"  {key}: {market.get(key)}")


if __name__ == "__main__":
    main()
