from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import httpx

from app.clients.kalshi import KalshiReadOnlyClient
from app.commands.inspect_kalshi_markets import build_parser
from app.core.config import Settings
from app.services.kalshi_market_signals import (
    calculate_kalshi_implied_probability,
    normalize_kalshi_market,
    normalize_kalshi_orderbook,
    normalize_probability_value,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "kalshi"


def _fixture(name: str) -> dict[str, object]:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def _client_with_payloads(payloads: dict[str, dict[str, object]]) -> tuple[KalshiReadOnlyClient, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert "KALSHI-ACCESS-KEY" not in request.headers
        assert "KALSHI-ACCESS-SIGNATURE" not in request.headers
        assert "KALSHI-ACCESS-TIMESTAMP" not in request.headers
        assert "/orders" not in request.url.path
        assert "/portfolio" not in request.url.path
        payload = payloads.get(request.url.path)
        if payload is None:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)
    client = KalshiReadOnlyClient(
        base_url="https://kalshi.test/trade-api/v2",
        timeout_seconds=5,
        user_agent="PolySignal-Test/0.1",
        transport=transport,
    )
    return client, requests


def test_settings_read_kalshi_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("POLYSIGNAL_KALSHI_BASE_URL", "https://kalshi.example/api")
    monkeypatch.setenv("POLYSIGNAL_KALSHI_TIMEOUT_SECONDS", "7.5")

    settings = Settings()

    assert settings.kalshi_base_url == "https://kalshi.example/api"
    assert settings.kalshi_timeout_seconds == 7.5


def test_kalshi_client_list_markets_parse_response_and_uses_read_only_request() -> None:
    client, requests = _client_with_payloads(
        {"/trade-api/v2/markets": _fixture("markets_list.json")}
    )
    try:
        page = client.list_markets(limit=2, status="open", query="Boston")
    finally:
        client.close()

    assert len(page.markets) == 1
    assert page.cursor == "next-cursor"
    assert page.markets[0].ticker == "KXNBAFINAL-26CELTICS-CELTICS"
    assert page.markets[0].yes_bid_dollars == Decimal("0.4500")
    assert requests[0].method == "GET"
    assert requests[0].url.params["limit"] == "2"
    assert requests[0].url.params["status"] == "open"


def test_kalshi_client_get_market_parse_response() -> None:
    client, _ = _client_with_payloads(
        {
            "/trade-api/v2/markets/KXNBAFINAL-26CELTICS-CELTICS": _fixture(
                "market_open_with_bid_ask.json"
            )
        }
    )
    try:
        market = client.get_market("KXNBAFINAL-26CELTICS-CELTICS")
    finally:
        client.close()

    assert market.ticker == "KXNBAFINAL-26CELTICS-CELTICS"
    assert market.title == "Will the Boston Celtics win the 2026 NBA Finals?"
    assert market.volume_fp == Decimal("10000.00")
    assert market.liquidity_dollars == Decimal("25000.00")


def test_kalshi_client_get_orderbook_parse_response() -> None:
    client, requests = _client_with_payloads(
        {
            "/trade-api/v2/markets/KXNBAFINAL-26CELTICS-CELTICS/orderbook": _fixture(
                "orderbook_basic.json"
            )
        }
    )
    try:
        orderbook = client.get_orderbook("KXNBAFINAL-26CELTICS-CELTICS", depth=3)
    finally:
        client.close()

    assert orderbook.ticker == "KXNBAFINAL-26CELTICS-CELTICS"
    assert orderbook.orderbook_fp is not None
    assert requests[0].method == "GET"
    assert requests[0].url.params["depth"] == "3"


def test_normalize_probability_value_converts_cents_and_preserves_decimals() -> None:
    assert normalize_probability_value("45") == Decimal("0.4500")
    assert normalize_probability_value("0.4500") == Decimal("0.4500")
    assert normalize_probability_value(55) == Decimal("0.5500")
    assert normalize_probability_value(Decimal("0.55")) == Decimal("0.5500")


def test_calculate_implied_probability_uses_mid_price() -> None:
    result = calculate_kalshi_implied_probability(
        best_yes_bid=Decimal("0.4500"),
        best_yes_ask=Decimal("0.5500"),
        last_price=Decimal("0.9900"),
        volume=Decimal("100"),
        open_interest=Decimal("100"),
        status="open",
    )

    assert result.mid_price == Decimal("0.5000")
    assert result.yes_probability == Decimal("0.5000")
    assert result.no_probability == Decimal("0.5000")
    assert result.spread == Decimal("0.1000")


def test_calculate_implied_probability_uses_last_price_fallback() -> None:
    result = calculate_kalshi_implied_probability(
        best_yes_bid=None,
        best_yes_ask=None,
        last_price="0.6200",
        volume=Decimal("0"),
        open_interest=Decimal("0"),
        status="closed",
    )

    assert result.yes_probability == Decimal("0.6200")
    assert "using_last_price_fallback" in result.warnings
    assert "market_not_open" in result.warnings
    assert result.source_confidence == Decimal("0.0000")


def test_normalize_kalshi_market_generates_warnings_for_incomplete_data() -> None:
    raw = _fixture("market_missing_bid_ask.json")["market"]

    normalized = normalize_kalshi_market(raw)

    assert normalized.yes_probability == Decimal("0.6200")
    assert normalized.source_confidence == Decimal("0.0000")
    assert "missing_complete_bid_ask" in normalized.warnings
    assert "zero_volume" in normalized.warnings


def test_normalize_kalshi_market_preserves_liquidity() -> None:
    raw = _fixture("market_open_with_bid_ask.json")["market"]

    normalized = normalize_kalshi_market(raw)

    assert normalized.liquidity == Decimal("25000.00")


def test_normalize_orderbook_calculates_reciprocal_ask_and_spread() -> None:
    raw = {"ticker": "KXTEST", **_fixture("orderbook_basic.json")}

    normalized = normalize_kalshi_orderbook(raw)

    assert normalized.best_yes_bid == Decimal("0.4500")
    assert normalized.best_yes_ask == Decimal("0.5600")
    assert normalized.best_no_bid == Decimal("0.4400")
    assert normalized.best_no_ask == Decimal("0.5500")
    assert normalized.mid_price == Decimal("0.5050")
    assert normalized.spread == Decimal("0.1100")
    assert "wide_spread" in normalized.warnings


def test_command_parser_imports_and_defaults_to_dry_run_shape() -> None:
    parser = build_parser()

    args = parser.parse_args(["--limit", "3", "--status", "open", "--json"])

    assert args.limit == 3
    assert args.status == "open"
    assert args.json is True
