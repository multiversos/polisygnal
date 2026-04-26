from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal

from app.clients.kalshi import KalshiClientError, KalshiReadOnlyClient
from app.core.config import get_settings
from app.schemas.kalshi import KalshiNormalizedMarket, KalshiOrderbookPreview
from app.services.kalshi_market_signals import normalize_kalshi_market, normalize_kalshi_orderbook


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    settings = get_settings()
    client = KalshiReadOnlyClient.from_settings(settings)
    try:
        payload = _run(args, client)
    except KalshiClientError as exc:
        error_payload = {
            "status": "error",
            "dry_run": True,
            "read_only": True,
            "error": str(exc),
        }
        print(json.dumps(error_payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc
    finally:
        client.close()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspecciona mercados Kalshi en modo dry-run/read-only."
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
    parser.add_argument("--json", action="store_true", help="Imprime JSON normalizado.")
    return parser


def _run(args: argparse.Namespace, client: KalshiReadOnlyClient) -> dict[str, object]:
    if args.ticker:
        market = client.get_market(args.ticker)
        normalized_market = normalize_kalshi_market(market)
        result: dict[str, object] = {
            "status": "ok",
            "dry_run": True,
            "read_only": True,
            "mode": "ticker",
            "market": _dump_model(normalized_market),
            "saved_to_db": False,
            "trading_executed": False,
        }
        if args.orderbook:
            orderbook = client.get_orderbook(args.ticker, depth=args.depth)
            normalized_orderbook = normalize_kalshi_orderbook(orderbook)
            result["orderbook"] = _dump_model(normalized_orderbook)
        return result

    page = client.list_markets(limit=args.limit, status=args.status, query=args.query)
    markets = [normalize_kalshi_market(market) for market in page.markets]
    return {
        "status": "ok",
        "dry_run": True,
        "read_only": True,
        "mode": "list",
        "limit": args.limit,
        "status_filter": args.status,
        "query_filter": args.query,
        "count": len(markets),
        "cursor_present": bool(page.cursor),
        "parse_errors": page.errors,
        "markets": [_dump_model(market) for market in markets],
        "saved_to_db": False,
        "trading_executed": False,
    }


def _dump_model(model: KalshiNormalizedMarket | KalshiOrderbookPreview) -> dict[str, object]:
    return model.model_dump(mode="json")


def _print_human(payload: dict[str, object]) -> None:
    print("DRY RUN / READ ONLY - no se guardan datos y no se ejecuta trading.")
    print(f"Status: {payload.get('status')}")
    print(f"Mode: {payload.get('mode')}")
    if payload.get("mode") == "ticker":
        market = payload.get("market")
        if isinstance(market, dict):
            _print_market(market)
        orderbook = payload.get("orderbook")
        if isinstance(orderbook, dict):
            print("\nOrderbook:")
            for key in [
                "source_ticker",
                "best_yes_bid",
                "best_yes_ask",
                "best_no_bid",
                "best_no_ask",
                "yes_probability",
                "spread",
                "source_confidence",
                "warnings",
            ]:
                print(f"  {key}: {orderbook.get(key)}")
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


def _print_market(market: dict[str, object]) -> None:
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
        "open_interest",
        "source_confidence",
        "warnings",
    ]:
        value = market.get(key)
        if isinstance(value, Decimal):
            value = str(value)
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
