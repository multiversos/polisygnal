from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import get_polymarket_client
from app.clients.polymarket_data import (
    PolymarketDataClient,
    PolymarketDataClientError,
    PolymarketDataMarketPosition,
    PolymarketDataTrade,
    get_polymarket_data_client,
)
from app.main import app
from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.wallet_intelligence import abbreviate_wallet, build_wallet_intelligence


class FakeGammaClient:
    def __init__(self, condition_id: str | None = "0xcondition") -> None:
        self.condition_id = condition_id
        self.calls = 0

    def fetch_markets_by_ids(self, market_ids: list[str]) -> dict[str, object]:
        self.calls += 1
        return {
            market_id: type("GammaMarket", (), {"condition_id": self.condition_id})()
            for market_id in market_ids
        }


class FakeDataClient:
    def __init__(
        self,
        *,
        trades: list[PolymarketDataTrade] | None = None,
        positions: list[PolymarketDataMarketPosition] | None = None,
        explode: bool = False,
        trades_explode: bool = False,
        positions_explode: bool = False,
    ) -> None:
        self.trades = trades or []
        self.positions = positions or []
        self.explode = explode
        self.trades_explode = trades_explode
        self.positions_explode = positions_explode

    def get_trades_for_market(
        self,
        condition_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
        taker_only: bool = True,
    ) -> list[PolymarketDataTrade]:
        _ = condition_id, offset, taker_only
        if self.explode or self.trades_explode:
            raise PolymarketDataClientError("data unavailable")
        return self.trades[:limit]

    def get_positions_for_market(
        self,
        condition_id: str,
        *,
        status: str = "OPEN",
        limit: int = 50,
    ) -> list[PolymarketDataMarketPosition]:
        _ = condition_id, status
        if self.explode or self.positions_explode:
            raise PolymarketDataClientError("data unavailable")
        return self.positions[:limit]


def test_polymarket_data_client_parses_public_wallet_payloads() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/trades":
            return httpx.Response(
                200,
                json=[
                    {
                        "proxyWallet": "0x1111111111111111111111111111111111111111",
                        "side": "BUY",
                        "conditionId": "0xcondition",
                        "size": "50000",
                        "price": "0.25",
                        "timestamp": "1767225600",
                        "outcome": "Yes",
                        "pseudonym": "Public wallet",
                    }
                ],
            )
        if request.url.path == "/v1/market-positions":
            assert request.url.params.get("sortBy") == "TOKENS"
            return httpx.Response(
                200,
                json=[
                    {
                        "token": "yes-token",
                        "positions": [
                            {
                                "proxyWallet": "0x2222222222222222222222222222222222222222",
                                "conditionId": "0xcondition",
                                "avgPrice": "0.40",
                                "currPrice": "0.50",
                                "currentValue": "12500",
                                "outcome": "Yes",
                            }
                        ],
                    }
                ],
            )
        if request.url.path == "/public-profile":
            return httpx.Response(
                200,
                json={
                    "proxyWallet": "0x2222222222222222222222222222222222222222",
                    "pseudonym": "Profile pseudonym",
                },
            )
        return httpx.Response(404, json={"error": "not found"})

    client = PolymarketDataClient(
        base_url="https://data-api.polymarket.test",
        gamma_base_url="https://gamma-api.polymarket.test",
        timeout_seconds=5,
        user_agent="PolySignalTest/1.0",
        transport=httpx.MockTransport(handler),
    )
    try:
        trades = client.get_trades_for_market("0xcondition", limit=5)
        positions = client.get_positions_for_market("0xcondition", limit=5)
        profile = client.get_user_profile("0x2222222222222222222222222222222222222222")
    finally:
        client.close()

    assert trades[0].proxy_wallet == "0x1111111111111111111111111111111111111111"
    assert trades[0].size == Decimal("50000")
    assert positions[0].current_value == Decimal("12500")
    assert profile is not None
    assert profile.pseudonym == "Profile pseudonym"


def test_wallet_intelligence_detects_large_trade_and_abbreviates_wallet(
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="large-trade")

    response = build_wallet_intelligence(
        db_session,
        market,
        data_client=FakeDataClient(trades=[_trade(size="50000", price="0.25")]),
        gamma_client=FakeGammaClient(),
        min_usd=Decimal("10000"),
        limit=20,
    )

    assert response.data_available is True
    assert len(response.large_trades) == 1
    assert response.large_trades[0].trade_size_usd == Decimal("12500.00")
    assert response.large_trades[0].wallet_short == "0xabcd...7890"
    assert abbreviate_wallet("0xabcdef1234567890") == "0xabcd...7890"
    assert response.notable_wallets[0].signal_types == ["large_trade"]


def test_wallet_intelligence_uses_stored_condition_id_before_gamma(
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="stored-condition")
    market.condition_id = "0xstoredcondition"
    gamma_client = FakeGammaClient(condition_id=None)
    data_client = FakeDataClient(trades=[_trade(size="50000", price="0.25")])

    response = build_wallet_intelligence(
        db_session,
        market,
        data_client=data_client,
        gamma_client=gamma_client,
        min_usd=Decimal("10000"),
        limit=20,
    )

    assert gamma_client.calls == 0
    assert response.condition_id == "0xstoredcondition"
    assert response.data_available is True
    assert len(response.large_trades) == 1


def test_wallet_intelligence_keeps_trades_when_positions_are_unavailable(
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="partial-position-failure")
    market.condition_id = "0xstoredcondition"

    response = build_wallet_intelligence(
        db_session,
        market,
        data_client=FakeDataClient(
            trades=[_trade(size="50000", price="0.25")],
            positions_explode=True,
        ),
        gamma_client=FakeGammaClient(condition_id=None),
        min_usd=Decimal("10000"),
        limit=20,
    )

    assert response.data_available is True
    assert len(response.large_trades) == 1
    assert response.large_positions == []
    assert "wallet_positions_unavailable" in response.warnings


def test_wallet_intelligence_ignores_trade_below_threshold(db_session: Session) -> None:
    market = _create_market(db_session, suffix="small-trade")

    response = build_wallet_intelligence(
        db_session,
        market,
        data_client=FakeDataClient(trades=[_trade(size="1000", price="0.25")]),
        gamma_client=FakeGammaClient(),
        min_usd=Decimal("10000"),
        limit=20,
    )

    assert response.data_available is True
    assert response.large_trades == []
    assert "no_large_wallet_activity_at_threshold" in response.warnings


def test_wallet_intelligence_handles_public_api_failure_without_db_mutation(
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="api-failure")
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = build_wallet_intelligence(
        db_session,
        market,
        data_client=FakeDataClient(explode=True),
        gamma_client=FakeGammaClient(),
    )

    assert response.data_available is False
    assert response.warnings == ["wallet_data_unavailable"]
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_wallet_intelligence_endpoint_returns_empty_state_without_condition_id(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="no-condition")
    app.dependency_overrides[get_polymarket_client] = lambda: FakeGammaClient(condition_id=None)
    app.dependency_overrides[get_polymarket_data_client] = lambda: FakeDataClient()

    response = client.get(f"/markets/{market.id}/wallet-intelligence?min_usd=10000&limit=20")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data_available"] is False
    assert payload["warnings"] == ["condition_id_unavailable"]


def test_wallet_intelligence_endpoint_respects_min_usd_and_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="endpoint")
    app.dependency_overrides[get_polymarket_client] = lambda: FakeGammaClient()
    app.dependency_overrides[get_polymarket_data_client] = lambda: FakeDataClient(
        trades=[
            _trade(size="50000", price="0.50", wallet="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
            _trade(size="20000", price="0.25", wallet="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        ],
    )

    response = client.get(f"/markets/{market.id}/wallet-intelligence?min_usd=20000&limit=1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 1
    assert len(payload["large_trades"]) == 1
    assert payload["large_trades"][0]["wallet_short"] == "0xbbbb...bbbb"


def test_openapi_includes_wallet_intelligence_endpoint(client: TestClient) -> None:
    payload = client.get("/openapi.json").json()

    assert "/markets/{market_id}/wallet-intelligence" in payload["paths"]


def _trade(
    *,
    size: str,
    price: str,
    wallet: str = "0xabcdef1234567890",
) -> PolymarketDataTrade:
    return PolymarketDataTrade.model_validate(
        {
            "proxyWallet": wallet,
            "side": "BUY",
            "conditionId": "0xcondition",
            "size": size,
            "price": price,
            "timestamp": datetime(2026, 4, 29, 18, 0, tzinfo=UTC),
            "outcome": "Yes",
            "pseudonym": "Public pseudonym",
        }
    )


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"wallet-intelligence-event-{suffix}",
        title=f"Wallet Intelligence Event {suffix}",
        category="sports",
        slug=f"wallet-intelligence-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"wallet-intelligence-market-{suffix}",
        event_id=event.id,
        question=f"Wallet intelligence market {suffix}",
        slug=f"wallet-intelligence-market-{suffix}",
        yes_token_id="yes-token",
        no_token_id="no-token",
        sport_type="mlb",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market
