from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api import routes_copy_trading
from app.clients.polymarket_data import PolymarketDataClientError
from app.models.copy_trading import CopyWallet
from app.schemas.copy_trading import CopyWalletCreate, CopyWalletUpdate
from app.services.copy_trading_demo_engine import normalize_public_trade, run_demo_tick, scan_copy_wallet
from app.services.copy_trading_demo_positions import (
    build_closed_demo_positions_read,
    build_demo_pnl_summary,
    build_open_demo_positions_read,
    list_closed_demo_positions,
    list_open_demo_positions,
)
from app.services.copy_trading_risk_rules import CopyTradeForRules, evaluate_demo_trade
from app.services.copy_trading_service import (
    DuplicateCopyWalletError,
    InvalidCopyWalletInputError,
    build_copy_trade_read,
    build_copy_wallet_read,
    create_copy_wallet,
    list_copy_events,
    list_copy_orders,
    list_copy_trades,
    resolve_copy_wallet_input,
    update_copy_wallet,
)
from app.services.copy_trading_watcher import CopyTradingDemoWatcher

WALLET = "0x1111111111111111111111111111111111111111"
WALLET_B = "0x2222222222222222222222222222222222222222"


class FakeTradeReader:
    def __init__(self, trades: list[dict[str, object]]) -> None:
        self.trades = trades

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        return self.trades[:limit]


class TrackingTradeReader:
    def __init__(self, trades_by_wallet: dict[str, list[dict[str, object]]]) -> None:
        self.trades_by_wallet = trades_by_wallet
        self.wallets_seen: list[str] = []

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        self.wallets_seen.append(wallet)
        return self.trades_by_wallet.get(wallet, [])[:limit]


class FailingForOneWalletReader:
    def __init__(self, failing_wallet: str) -> None:
        self.failing_wallet = failing_wallet
        self.wallets_seen: list[str] = []

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        self.wallets_seen.append(wallet)
        if wallet == self.failing_wallet:
            raise RuntimeError("upstream unavailable")
        return []


class SlowTradeReader:
    def __init__(self, delay_seconds: float, trades: list[dict[str, object]] | None = None) -> None:
        self.delay_seconds = delay_seconds
        self.trades = trades or []

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        import time

        time.sleep(self.delay_seconds)
        return self.trades[:limit]


class TimeoutForOneWalletReader:
    def __init__(self, failing_wallet: str, successful_trades: list[dict[str, object]] | None = None) -> None:
        self.failing_wallet = failing_wallet
        self.successful_trades = successful_trades or []
        self.wallets_seen: list[str] = []

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        self.wallets_seen.append(wallet)
        if wallet == self.failing_wallet:
            raise PolymarketDataClientError("No se pudo conectar con Polymarket Data API: timed out")
        return self.successful_trades[:limit]


class FakeMarketPosition:
    def __init__(self, *, asset: str | None, outcome: str | None, curr_price: Decimal | None) -> None:
        self.asset = asset
        self.outcome = outcome
        self.curr_price = curr_price


class PriceAwareDataClient:
    def __init__(
        self,
        *,
        positions_by_condition: dict[str, list[FakeMarketPosition]] | None = None,
        trades_by_condition: dict[str, list[dict[str, object]]] | None = None,
    ) -> None:
        self.positions_by_condition = positions_by_condition or {}
        self.trades_by_condition = trades_by_condition or {}

    def get_positions_for_market(self, condition_id: str, *, limit: int = 100) -> list[FakeMarketPosition]:
        return self.positions_by_condition.get(condition_id, [])[:limit]

    def get_trades_for_market(self, condition_id: str, *, limit: int = 25, offset: int = 0) -> list[dict[str, object]]:
        return self.trades_by_condition.get(condition_id, [])[offset : offset + limit]


class DummySession:
    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        return None


class DummyDataClient:
    def close(self) -> None:
        return None


def test_valid_wallet_normalizes_direct_0x() -> None:
    resolved = resolve_copy_wallet_input(WALLET.upper())

    assert resolved.proxy_wallet == WALLET
    assert resolved.profile_url is None


def test_invalid_wallet_input_fails_cleanly() -> None:
    with pytest.raises(InvalidCopyWalletInputError):
        resolve_copy_wallet_input("not-a-wallet")


def test_invalid_wallet_length_has_specific_error() -> None:
    with pytest.raises(InvalidCopyWalletInputError, match="formato 0x"):
        resolve_copy_wallet_input("0x123")


def test_invalid_wallet_hex_has_specific_error() -> None:
    with pytest.raises(InvalidCopyWalletInputError, match="caracteres no validos"):
        resolve_copy_wallet_input("0x111111111111111111111111111111111111111z")


def test_post_wallet_with_valid_0x_creates_wallet(client: TestClient) -> None:
    response = client.post(
        "/copy-trading/wallets",
        json={
            "wallet_input": WALLET,
            "label": "qa-delete-me",
            "mode": "demo",
            "copy_amount_mode": "preset",
            "copy_amount_usd": "5",
            "copy_buys": True,
            "copy_sells": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["proxy_wallet"] == WALLET


def test_post_wallet_allows_multiple_different_wallets(client: TestClient) -> None:
    base_payload = {
        "mode": "demo",
        "copy_amount_mode": "preset",
        "copy_amount_usd": "5",
        "copy_buys": True,
        "copy_sells": True,
    }

    first = client.post(
        "/copy-trading/wallets",
        json={**base_payload, "label": "qa-a", "wallet_input": WALLET},
    )
    second = client.post(
        "/copy-trading/wallets",
        json={**base_payload, "label": "qa-b", "wallet_input": WALLET_B},
    )
    wallets = client.get("/copy-trading/wallets")

    assert first.status_code == 201
    assert second.status_code == 201
    assert wallets.status_code == 200
    assert {wallet["proxy_wallet"] for wallet in wallets.json()["wallets"]} == {WALLET, WALLET_B}


def test_post_wallet_invalid_returns_clear_error(client: TestClient) -> None:
    response = client.post(
        "/copy-trading/wallets",
        json={
            "wallet_input": "0x123",
            "mode": "demo",
            "copy_amount_mode": "preset",
            "copy_amount_usd": "5",
        },
    )

    assert response.status_code == 400
    assert "formato 0x" in response.json()["detail"]


def test_duplicate_wallet_is_rejected_cleanly(db_session: Session) -> None:
    create_copy_wallet(db_session, CopyWalletCreate(wallet_input=WALLET))

    with pytest.raises(DuplicateCopyWalletError, match="ya esta en seguimiento"):
        create_copy_wallet(db_session, CopyWalletCreate(wallet_input=WALLET))


def test_duplicate_wallet_is_case_and_space_insensitive(db_session: Session) -> None:
    create_copy_wallet(db_session, CopyWalletCreate(wallet_input=WALLET))

    with pytest.raises(DuplicateCopyWalletError, match="ya esta en seguimiento"):
        create_copy_wallet(db_session, CopyWalletCreate(wallet_input=f"  {WALLET.upper()}  "))


def test_duplicate_wallet_request_does_not_block_next_different_wallet(client: TestClient) -> None:
    base_payload = {
        "mode": "demo",
        "copy_amount_mode": "preset",
        "copy_amount_usd": "5",
        "copy_buys": True,
        "copy_sells": True,
    }

    first = client.post("/copy-trading/wallets", json={**base_payload, "wallet_input": WALLET})
    duplicate = client.post("/copy-trading/wallets", json={**base_payload, "wallet_input": WALLET.upper()})
    second = client.post("/copy-trading/wallets", json={**base_payload, "wallet_input": WALLET_B})

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Esta wallet ya esta en seguimiento."
    assert second.status_code == 201
    assert second.json()["proxy_wallet"] == WALLET_B


@pytest.mark.parametrize("next_window", [30, 60, 120, 300])
def test_patch_wallet_updates_copy_window(client: TestClient, next_window: int) -> None:
    created = client.post(
        "/copy-trading/wallets",
        json={
            "wallet_input": WALLET,
            "label": "qa-edit-window",
            "mode": "demo",
            "copy_amount_mode": "preset",
            "copy_amount_usd": "5",
            "copy_buys": True,
            "copy_sells": True,
        },
    )

    response = client.patch(
        f"/copy-trading/wallets/{created.json()['id']}",
        json={"max_delay_seconds": next_window},
    )

    assert created.status_code == 201
    assert response.status_code == 200
    assert response.json()["max_delay_seconds"] == next_window
    assert response.json()["copy_window_seconds"] == next_window


def test_patch_wallet_rejects_invalid_copy_window(client: TestClient) -> None:
    created = client.post(
        "/copy-trading/wallets",
        json={
            "wallet_input": WALLET,
            "label": "qa-invalid-window",
            "mode": "demo",
            "copy_amount_mode": "preset",
            "copy_amount_usd": "5",
            "copy_buys": True,
            "copy_sells": True,
        },
    )

    response = client.patch(
        f"/copy-trading/wallets/{created.json()['id']}",
        json={"max_delay_seconds": 45},
    )

    assert created.status_code == 201
    assert response.status_code == 422
    assert "max_delay_seconds" in response.text


def test_patch_wallet_updates_copy_rules_and_amount(db_session: Session) -> None:
    wallet = _create_wallet(db_session)

    updated = update_copy_wallet(
        db_session,
        wallet.id,
        CopyWalletUpdate(
            copy_amount_mode="custom",
            copy_amount_usd=Decimal("25"),
            copy_buys=False,
            copy_sells=True,
            max_delay_seconds=120,
        ),
    )

    assert updated.copy_amount_mode == "custom"
    assert updated.copy_amount_usd == Decimal("25")
    assert updated.copy_buys is False
    assert updated.copy_sells is True
    assert updated.max_delay_seconds == 120
    assert updated.real_trading_enabled is False


def test_demo_tick_uses_updated_copy_window(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    update_copy_wallet(
        db_session,
        wallet.id,
        CopyWalletUpdate(max_delay_seconds=300),
    )
    db_session.commit()

    recent_trade = _trade("0xupdated-window") | {"timestamp": (_now() - timedelta(seconds=240)).isoformat()}
    response = run_demo_tick(db_session, data_client=FakeTradeReader([recent_trade]), now=_now())

    assert response.live_candidates == 1
    assert response.orders_simulated == 1
    assert response.historical_trades == 0


def test_wallet_demo_summary_defaults_without_orders(db_session: Session) -> None:
    wallet = _create_wallet(db_session)

    summary = build_copy_wallet_read(wallet, now=_now())

    assert summary.demo_copied_count == 0
    assert summary.demo_buy_count == 0
    assert summary.demo_sell_count == 0
    assert summary.demo_skipped_count == 0
    assert summary.last_demo_copy_at is None


def test_wallet_demo_summary_counts_simulated_buy_and_sell(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    reader = FakeTradeReader([_trade("0xbuy"), _trade("0xsell", side="SELL")])

    run_demo_tick(db_session, data_client=reader, now=_now())
    db_session.refresh(wallet)
    summary = build_copy_wallet_read(wallet, now=_now())

    assert summary.demo_copied_count == 2
    assert summary.demo_buy_count == 1
    assert summary.demo_sell_count == 1
    assert summary.demo_skipped_count == 0
    assert summary.last_demo_copy_at is not None
    assert summary.last_demo_copy_action == "sell"
    assert summary.last_demo_copy_amount_usd == Decimal("5.00")


def test_wallet_demo_summary_counts_skipped_orders(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    old_trade = _trade("0xhistorical-summary") | {"timestamp": (_now() - timedelta(seconds=90)).isoformat()}

    run_demo_tick(db_session, data_client=FakeTradeReader([old_trade]), now=_now())
    db_session.refresh(wallet)
    summary = build_copy_wallet_read(wallet, now=_now())

    assert summary.demo_copied_count == 0
    assert summary.demo_buy_count == 0
    assert summary.demo_sell_count == 0
    assert summary.demo_skipped_count == 1
    assert summary.last_demo_copy_at is None


def test_buy_trade_normalizes() -> None:
    trade = normalize_public_trade(
        {
            "proxyWallet": WALLET,
            "side": "BUY",
            "price": "0.25",
            "size": "20",
            "transactionHash": "0xabc",
        },
        WALLET,
    )

    assert trade.side == "buy"
    assert trade.amount_usd == Decimal("5.00")
    assert trade.dedupe_key == "0xabc"


def test_sell_trade_normalizes() -> None:
    trade = normalize_public_trade({"side": "SELL", "price": "0.50", "size": "4"}, WALLET)

    assert trade.side == "sell"
    assert trade.price == Decimal("0.50")
    assert trade.size == Decimal("4")


def test_dedupe_by_dedupe_key(db_session: Session) -> None:
    _create_wallet(db_session)
    reader = FakeTradeReader([_trade("0xdupe")])

    first = run_demo_tick(db_session, data_client=reader, now=_now())
    second = run_demo_tick(db_session, data_client=reader, now=_now())

    assert first.new_trades == 1
    assert second.new_trades == 0
    assert len(list_copy_trades(db_session)) == 1


@pytest.mark.parametrize("amount", [Decimal("1"), Decimal("5"), Decimal("10"), Decimal("20")])
def test_preset_amounts_are_valid(db_session: Session, amount: Decimal) -> None:
    wallet = _create_wallet(db_session, amount=amount, suffix=str(int(amount)))

    assert wallet.copy_amount_mode == "preset"
    assert wallet.copy_amount_usd == amount


def test_custom_amount_is_valid(db_session: Session) -> None:
    wallet = _create_wallet(
        db_session,
        amount=Decimal("25.50"),
        amount_mode="custom",
        suffix="55",
    )

    assert wallet.copy_amount_mode == "custom"
    assert wallet.copy_amount_usd == Decimal("25.50")


def test_invalid_custom_amount_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CopyWalletCreate(
            wallet_input=WALLET,
            copy_amount_mode="custom",
            copy_amount_usd=Decimal("0"),
        )


def test_buy_with_copy_buys_disabled_is_skipped(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    wallet.copy_buys = False

    intent = evaluate_demo_trade(wallet, CopyTradeForRules(side="buy", price=Decimal("0.5"), timestamp=_now()), now=_now())

    assert intent.status == "skipped"
    assert intent.reason == "copy_buys_disabled"


def test_sell_with_copy_sells_disabled_is_skipped(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    wallet.copy_sells = False

    intent = evaluate_demo_trade(wallet, CopyTradeForRules(side="sell", price=Decimal("0.5"), timestamp=_now()), now=_now())

    assert intent.status == "skipped"
    assert intent.reason == "copy_sells_disabled"


def test_old_trade_is_skipped(db_session: Session) -> None:
    wallet = _create_wallet(db_session)

    intent = evaluate_demo_trade(
        wallet,
        CopyTradeForRules(side="buy", price=Decimal("0.5"), timestamp=_now() - timedelta(seconds=90)),
        now=_now(),
    )

    assert intent.status == "skipped"
    assert intent.reason == "trade_too_old"


def test_missing_price_is_skipped(db_session: Session) -> None:
    wallet = _create_wallet(db_session)

    intent = evaluate_demo_trade(wallet, CopyTradeForRules(side="buy", price=None, timestamp=_now()), now=_now())

    assert intent.status == "skipped"
    assert intent.reason == "missing_price"


def test_demo_tick_creates_simulated_order_for_valid_trade(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("5"))
    reader = FakeTradeReader([_trade("0xsimulated")])

    response = run_demo_tick(db_session, data_client=reader, now=_now())
    orders = list_copy_orders(db_session)

    assert response.orders_simulated == 1
    assert response.buy_simulated == 1
    assert response.sell_simulated == 0
    assert response.live_candidates == 1
    assert response.recent_outside_window == 0
    assert orders[0].status == "simulated"
    assert orders[0].intended_amount_usd == Decimal("5.00")
    assert orders[0].intended_size == Decimal("10.00000000")


def test_demo_tick_creates_simulated_sell_order_for_valid_trade(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("5"))
    reader = FakeTradeReader([_trade("0xsell", side="SELL")])

    response = run_demo_tick(db_session, data_client=reader, now=_now())
    orders = list_copy_orders(db_session)

    assert response.orders_simulated == 1
    assert response.buy_simulated == 0
    assert response.sell_simulated == 1
    assert orders[0].action == "sell"
    assert orders[0].status == "simulated"


def test_demo_tick_does_not_duplicate_processed_trade(db_session: Session) -> None:
    _create_wallet(db_session)
    reader = FakeTradeReader([_trade("0xprocessed")])

    run_demo_tick(db_session, data_client=reader, now=_now())
    response = run_demo_tick(db_session, data_client=reader, now=_now())

    assert response.new_trades == 0
    assert len(list_copy_orders(db_session)) == 1


def test_demo_tick_without_wallets_returns_empty_summary(db_session: Session) -> None:
    response = run_demo_tick(db_session, data_client=FakeTradeReader([]), now=_now())

    assert response.wallets_scanned == 0
    assert response.new_trades == 0
    assert response.orders_simulated == 0
    assert response.errors == []


def test_demo_tick_with_wallet_without_trades_returns_clean_summary(db_session: Session) -> None:
    _create_wallet(db_session)

    response = run_demo_tick(db_session, data_client=FakeTradeReader([]), now=_now())

    assert response.wallets_scanned == 1
    assert response.trades_detected == 0
    assert response.new_trades == 0
    assert response.errors == []


def test_demo_tick_counts_historical_skips(db_session: Session) -> None:
    _create_wallet(db_session)
    old_trade = _trade("0xhistorical") | {"timestamp": (_now() - timedelta(seconds=90)).isoformat()}

    response = run_demo_tick(db_session, data_client=FakeTradeReader([old_trade]), now=_now())
    orders = list_copy_orders(db_session)

    assert response.new_trades == 1
    assert response.orders_simulated == 0
    assert response.orders_skipped == 1
    assert response.live_candidates == 0
    assert response.recent_outside_window == 0
    assert response.historical_trades == 1
    assert response.skipped_reasons == {"trade_too_old": 1}
    assert orders[0].status == "skipped"
    assert orders[0].reason == "trade_too_old"


def test_demo_tick_counts_recent_trades_outside_window(db_session: Session) -> None:
    _create_wallet(db_session)
    recent_trade = _trade("0xrecent") | {"timestamp": (_now() - timedelta(seconds=45)).isoformat()}

    response = run_demo_tick(db_session, data_client=FakeTradeReader([recent_trade]), now=_now())
    orders = list_copy_orders(db_session)

    assert response.new_trades == 1
    assert response.live_candidates == 0
    assert response.recent_outside_window == 1
    assert response.historical_trades == 0
    assert response.skipped_reasons == {"trade_too_old": 1}
    assert orders[0].status == "skipped"
    assert orders[0].reason == "trade_too_old"


def test_demo_tick_buy_opens_demo_position(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("10"))

    response = run_demo_tick(db_session, data_client=FakeTradeReader([_trade("0xposition-open", price="0.40")]), now=_now())
    positions = list_open_demo_positions(db_session)

    assert response.orders_simulated == 1
    assert len(positions) == 1
    assert positions[0].status == "open"
    assert positions[0].entry_price == Decimal("0.40000000")
    assert positions[0].entry_amount_usd == Decimal("10.00")
    assert positions[0].entry_size == Decimal("25.00000000")


def test_demo_tick_skipped_buy_does_not_open_demo_position(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("10"))
    old_trade = _trade("0xposition-skipped", price="0.40") | {"timestamp": (_now() - timedelta(minutes=10)).isoformat()}

    response = run_demo_tick(db_session, data_client=FakeTradeReader([old_trade]), now=_now())

    assert response.orders_skipped == 1
    assert list_open_demo_positions(db_session) == []


def test_demo_tick_sell_closes_open_demo_position(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("5"))

    run_demo_tick(db_session, data_client=FakeTradeReader([_trade("0xposition-buy", price="0.50")]), now=_now())
    response = run_demo_tick(
        db_session,
        data_client=FakeTradeReader([_trade("0xposition-sell", side="SELL", price="0.60")]),
        now=_now(),
    )
    open_positions = list_open_demo_positions(db_session)
    closed_positions = list_closed_demo_positions(db_session)

    assert response.orders_simulated == 1
    assert open_positions == []
    assert len(closed_positions) == 1
    assert closed_positions[0].status == "closed"
    assert closed_positions[0].exit_price == Decimal("0.60000000")
    assert closed_positions[0].exit_value_usd == Decimal("6.00")
    assert closed_positions[0].realized_pnl_usd == Decimal("1.00")
    assert closed_positions[0].close_reason == "wallet_sell"


def test_demo_tick_sell_without_open_position_does_not_break(db_session: Session) -> None:
    wallet = _create_wallet(db_session, amount=Decimal("5"))

    response = run_demo_tick(
        db_session,
        data_client=FakeTradeReader([_trade("0xunmatched-sell", side="SELL", price="0.60")]),
        now=_now(),
    )
    events = list_copy_events(db_session, limit=10)

    assert response.orders_simulated == 1
    assert list_open_demo_positions(db_session) == []
    assert list_closed_demo_positions(db_session) == []
    assert any(
        event.wallet_id == wallet.id and event.event_type == "demo_position_unmatched_sell"
        for event in events
    )


def test_open_demo_positions_read_calculates_unrealized_pnl(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("10"))
    trade = _trade("0xposition-pnl", price="0.40") | {"conditionId": "cond-pnl", "asset": "asset-yes"}

    run_demo_tick(db_session, data_client=FakeTradeReader([trade]), now=_now())
    positions = list_open_demo_positions(db_session)
    reads = build_open_demo_positions_read(
        positions,
        data_client=PriceAwareDataClient(
            positions_by_condition={
                "cond-pnl": [FakeMarketPosition(asset="asset-yes", outcome="YES", curr_price=Decimal("0.55"))]
            }
        ),
        now=_now(),
    )

    assert len(reads) == 1
    assert reads[0].status == "open"
    assert reads[0].current_price == Decimal("0.55")
    assert reads[0].current_value_usd == Decimal("13.75")
    assert reads[0].unrealized_pnl_usd == Decimal("3.75")
    assert reads[0].unrealized_pnl_percent == Decimal("37.50")


def test_open_demo_positions_read_marks_price_pending_when_market_price_missing(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("10"))
    trade = _trade("0xposition-pending", price="0.40") | {"conditionId": "cond-pending", "asset": "asset-yes"}

    run_demo_tick(db_session, data_client=FakeTradeReader([trade]), now=_now())
    positions = list_open_demo_positions(db_session)
    reads = build_open_demo_positions_read(positions, data_client=PriceAwareDataClient(), now=_now())

    assert len(reads) == 1
    assert reads[0].status == "price_pending"
    assert reads[0].current_price is None
    assert reads[0].unrealized_pnl_usd is None
    assert reads[0].unrealized_pnl_percent is None


def test_demo_pnl_summary_counts_open_and_closed_positions(db_session: Session) -> None:
    first = _create_wallet(db_session, amount=Decimal("10"), suffix="11")
    second = _create_wallet(db_session, amount=Decimal("5"), suffix="22")

    scan_copy_wallet(
        db_session,
        wallet_id=first.id,
        data_client=FakeTradeReader([_trade("0xwallet1-buy", price="0.40", wallet=first.proxy_wallet) | {"conditionId": "cond-open", "asset": "asset-open"}]),
        now=_now(),
    )
    scan_copy_wallet(
        db_session,
        wallet_id=second.id,
        data_client=FakeTradeReader([_trade("0xwallet2-buy", price="0.50", wallet=second.proxy_wallet) | {"conditionId": "cond-closed", "asset": "asset-closed"}]),
        now=_now(),
    )
    scan_copy_wallet(
        db_session,
        wallet_id=second.id,
        data_client=FakeTradeReader([_trade("0xwallet2-sell", side="SELL", price="0.65", wallet=second.proxy_wallet) | {"conditionId": "cond-closed", "asset": "asset-closed"}]),
        now=_now(),
    )

    open_reads = build_open_demo_positions_read(
        list_open_demo_positions(db_session),
        data_client=PriceAwareDataClient(
            positions_by_condition={
                "cond-open": [FakeMarketPosition(asset="asset-open", outcome="YES", curr_price=Decimal("0.55"))]
            }
        ),
        now=_now(),
    )
    closed_reads = build_closed_demo_positions_read(list_closed_demo_positions(db_session))
    summary = build_demo_pnl_summary(open_reads, closed_reads)

    assert summary.open_positions_count == 1
    assert summary.closed_positions_count == 1
    assert summary.capital_demo_used_usd == Decimal("15.00")
    assert summary.open_capital_usd == Decimal("10.00")
    assert summary.closed_capital_usd == Decimal("5.00")
    assert summary.open_current_value_usd == Decimal("13.75")
    assert summary.open_pnl_usd == Decimal("3.75")
    assert summary.realized_pnl_usd == Decimal("1.50")
    assert summary.total_demo_pnl_usd == Decimal("5.25")
    assert summary.demo_roi_percent == Decimal("35.00")
    assert summary.win_rate_percent == Decimal("100.00")
    assert summary.average_closed_pnl_usd == Decimal("1.50")
    assert summary.best_closed_pnl_usd == Decimal("1.50")
    assert summary.worst_closed_pnl_usd == Decimal("1.50")
    assert summary.winning_closed_count == 1
    assert summary.losing_closed_count == 0
    assert summary.price_pending_count == 0


def test_demo_pnl_summary_keeps_pending_prices_out_of_current_value(db_session: Session) -> None:
    _create_wallet(db_session, amount=Decimal("10"), suffix="11")
    trade = _trade("0xpending-summary", price="0.40") | {"conditionId": "cond-pending-summary", "asset": "asset-pending"}

    run_demo_tick(db_session, data_client=FakeTradeReader([trade]), now=_now())

    open_reads = build_open_demo_positions_read(
        list_open_demo_positions(db_session),
        data_client=PriceAwareDataClient(),
        now=_now(),
    )
    summary = build_demo_pnl_summary(open_reads, [])

    assert summary.capital_demo_used_usd == Decimal("10.00")
    assert summary.open_capital_usd == Decimal("10.00")
    assert summary.open_current_value_usd is None
    assert summary.open_pnl_usd is None
    assert summary.total_demo_pnl_usd is None
    assert summary.demo_roi_percent is None
    assert summary.price_pending_count == 1


def test_demo_positions_do_not_mix_wallets(db_session: Session) -> None:
    first = _create_wallet(db_session, amount=Decimal("5"), suffix="11")
    second = _create_wallet(db_session, amount=Decimal("5"), suffix="22")

    scan_copy_wallet(
        db_session,
        wallet_id=first.id,
        data_client=FakeTradeReader([_trade("0xfirst-buy", price="0.50", wallet=first.proxy_wallet) | {"conditionId": "cond-shared", "asset": "asset-first"}]),
        now=_now(),
    )
    scan_copy_wallet(
        db_session,
        wallet_id=second.id,
        data_client=FakeTradeReader([_trade("0xsecond-buy", price="0.50", wallet=second.proxy_wallet) | {"conditionId": "cond-shared", "asset": "asset-second"}]),
        now=_now(),
    )
    scan_copy_wallet(
        db_session,
        wallet_id=first.id,
        data_client=FakeTradeReader([_trade("0xfirst-sell", side="SELL", price="0.60", wallet=first.proxy_wallet) | {"conditionId": "cond-shared", "asset": "asset-first"}]),
        now=_now(),
    )

    open_positions = list_open_demo_positions(db_session)
    closed_positions = list_closed_demo_positions(db_session)

    assert len(open_positions) == 1
    assert open_positions[0].wallet_id == second.id
    assert open_positions[0].asset == "asset-second"
    assert len(closed_positions) == 1
    assert closed_positions[0].wallet_id == first.id
    assert closed_positions[0].asset == "asset-first"


def test_demo_tick_scans_multiple_wallets_without_trades(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    second = _create_wallet(db_session, suffix="22")
    reader = TrackingTradeReader({})

    response = run_demo_tick(db_session, data_client=reader, now=_now())

    assert response.wallets_scanned == 2
    assert response.trades_detected == 0
    assert response.new_trades == 0
    assert response.errors == []
    assert set(reader.wallets_seen) == {first.proxy_wallet, second.proxy_wallet}


def test_demo_tick_continues_when_one_wallet_scan_fails(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    second = _create_wallet(db_session, suffix="22")
    reader = FailingForOneWalletReader(failing_wallet=first.proxy_wallet)

    response = run_demo_tick(db_session, data_client=reader, now=_now())

    assert response.wallets_scanned == 2
    assert response.errors == ["No se pudo leer actividad publica."]
    assert set(reader.wallets_seen) == {first.proxy_wallet, second.proxy_wallet}


def test_copy_trade_read_includes_freshness_fields(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    run_demo_tick(db_session, data_client=FakeTradeReader([_trade("0xfreshness")]), now=_now())

    trade = list_copy_trades(db_session)[0]
    trade_read = build_copy_trade_read(trade, copy_window_seconds=wallet.max_delay_seconds, now=_now())

    assert trade_read.freshness_status == "live_candidate"
    assert trade_read.freshness_label == "Copiable ahora"
    assert trade_read.is_live_candidate is True


def test_real_mode_returns_blocked_not_configured(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    wallet.mode = "real"

    intent = evaluate_demo_trade(wallet, CopyTradeForRules(side="buy", price=Decimal("0.5"), timestamp=_now()), now=_now())

    assert intent.status == "blocked"
    assert intent.reason == "real_trading_not_configured"


def test_watcher_status_initial() -> None:
    watcher = _build_test_watcher()

    status = watcher.get_status()

    assert status.enabled is False
    assert status.running is False
    assert status.interval_seconds == 5
    assert status.cycle_budget_seconds == 8
    assert status.current_run_started_at is None
    assert status.last_run_started_at is None
    assert status.last_result is None
    assert status.last_run_duration_ms is None
    assert status.average_run_duration_ms is None
    assert status.error_count == 0
    assert status.scanned_wallet_count == 0
    assert status.slow_wallet_count == 0
    assert status.timeout_count == 0
    assert status.errored_wallet_count == 0
    assert status.skipped_due_to_budget_count == 0
    assert status.skipped_due_to_priority_count == 0
    assert status.pending_wallet_count == 0
    assert status.is_over_interval is False
    assert status.behind_by_seconds == 0


def test_watcher_start_changes_state() -> None:
    watcher = _build_test_watcher()

    status = watcher.start()
    watcher.stop()

    assert status.enabled is True
    assert status.message == "Watcher demo iniciado."


def test_watcher_start_twice_does_not_duplicate() -> None:
    watcher = _build_test_watcher()

    watcher.start()
    status = watcher.start()
    watcher.stop()

    assert status.enabled is True
    assert status.message == "Watcher demo ya activo."


def test_watcher_stop_changes_state() -> None:
    watcher = _build_test_watcher()
    watcher.start()

    status = watcher.stop()

    assert status.enabled is False
    assert status.message == "Watcher demo pausado."


def test_watcher_run_once_executes_demo_tick_once(db_session: Session) -> None:
    _create_wallet(db_session)
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=FakeTradeReader([_trade("0xwatcher")]), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.last_result.new_trades == 1
    assert result.status.last_result.orders_simulated == 1
    assert result.status.last_result.buy_simulated == 1
    assert result.status.last_result.sell_simulated == 0
    assert len(result.status.last_result.wallet_scan_results) == 1
    assert result.status.last_result.wallet_scan_results[0].status == "scanned_ok"
    assert result.status.last_result.wallet_scan_results[0].reason == "Escaneada correctamente."


def test_watcher_marks_wallet_as_slow(db_session: Session) -> None:
    _create_wallet(db_session)
    watcher = CopyTradingDemoWatcher(interval_seconds=1, cycle_timeout_seconds=3, live_limit=5)

    result = watcher.run_once(db=db_session, data_client=SlowTradeReader(1.05, [_trade("0xslow")]), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.slow_wallet_count == 1
    assert result.status.last_result.wallet_scan_results[0].status == "slow"


def test_watcher_marks_wallet_timeout_and_continues(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    second = _create_wallet(db_session, suffix="22")
    watcher = _build_test_watcher()

    result = watcher.run_once(
        db=db_session,
        data_client=TimeoutForOneWalletReader(first.proxy_wallet, successful_trades=[_trade("0xok", wallet=second.proxy_wallet)]),
        now=_now(),
    )

    assert result.executed is True
    assert result.status.timeout_count >= 1
    assert result.status.last_result is not None
    assert result.status.last_result.wallets_scanned == 2
    assert any(entry.wallet_id == first.id and entry.status == "timeout" for entry in result.status.last_result.wallet_scan_results)
    assert any(
        entry.wallet_id == second.id and entry.status in {"scanned_ok", "slow"}
        for entry in result.status.last_result.wallet_scan_results
    )


def test_watcher_live_scan_limit_caps_trades_per_wallet(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    watcher = CopyTradingDemoWatcher(interval_seconds=5, live_limit=5)
    trades = [_trade(f"0xlive-{index}", wallet=wallet.proxy_wallet) for index in range(12)]

    result = watcher.run_once(db=db_session, data_client=FakeTradeReader(trades), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.last_result.trades_detected == 5
    assert result.status.last_result.wallet_scan_results[0].trades_detected == 5
    assert result.status.last_result.wallet_scan_results[0].next_scan_hint == "Se priorizaron trades recientes para mantener el escaneo live."


def test_watcher_prioritizes_recent_wallets_first(db_session: Session) -> None:
    older = _create_wallet(db_session, suffix="11")
    recent = _create_wallet(db_session, suffix="22")
    older.last_trade_at = _now() - timedelta(hours=3)
    recent.last_trade_at = _now() - timedelta(minutes=2)
    db_session.add_all([older, recent])
    db_session.commit()
    reader = TrackingTradeReader({recent.proxy_wallet: [], older.proxy_wallet: []})
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=reader, now=_now())

    assert result.executed is True
    assert reader.wallets_seen[0] == recent.proxy_wallet


def test_watcher_skips_paused_wallets(db_session: Session) -> None:
    active = _create_wallet(db_session, suffix="11")
    paused = _create_wallet(db_session, suffix="22")
    paused.enabled = False
    db_session.add(paused)
    db_session.commit()
    reader = TrackingTradeReader({active.proxy_wallet: [], paused.proxy_wallet: []})
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=reader, now=_now())

    assert result.executed is True
    assert reader.wallets_seen == [active.proxy_wallet]


def test_watcher_run_once_auto_copies_sell_trade(db_session: Session) -> None:
    _create_wallet(db_session)
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=FakeTradeReader([_trade("0xwatcher-sell", side="SELL")]), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.last_result.orders_simulated == 1
    assert result.status.last_result.buy_simulated == 0
    assert result.status.last_result.sell_simulated == 1


def test_watcher_run_once_without_wallets_returns_safe_result(db_session: Session) -> None:
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=FakeTradeReader([]), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.last_result.wallets_scanned == 0
    assert result.status.last_result.new_trades == 0


def test_watcher_respects_demo_mode(db_session: Session) -> None:
    demo_wallet = _create_wallet(db_session, suffix="11")
    real_wallet = _create_wallet(db_session, suffix="22")
    real_wallet.mode = "real"
    db_session.add(real_wallet)
    db_session.commit()
    reader = TrackingTradeReader({demo_wallet.proxy_wallet: [], real_wallet.proxy_wallet: []})
    watcher = _build_test_watcher()

    result = watcher.run_once(db=db_session, data_client=reader, now=_now())

    assert result.executed is True
    assert reader.wallets_seen == [demo_wallet.proxy_wallet]


def test_watcher_continues_when_one_wallet_fails(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    _create_wallet(db_session, suffix="22")
    watcher = _build_test_watcher()

    result = watcher.run_once(
        db=db_session,
        data_client=FailingForOneWalletReader(failing_wallet=first.proxy_wallet),
        now=_now(),
    )

    assert result.executed is True
    assert result.status.last_result is not None
    assert result.status.last_result.wallets_scanned == 2
    assert result.status.last_result.errors == ["No se pudo leer actividad publica."]


def test_watcher_saves_last_result(db_session: Session) -> None:
    _create_wallet(db_session)
    watcher = _build_test_watcher()

    watcher.run_once(db=db_session, data_client=FakeTradeReader([_trade("0xresult")]), now=_now())
    status = watcher.get_status()

    assert status.last_result is not None
    assert status.last_result.orders_simulated == 1
    assert status.last_result.buy_simulated == 1
    assert status.last_run_started_at == _now()
    assert status.last_run_finished_at == _now()
    assert status.last_run_duration_ms is not None
    assert status.last_run_duration_ms >= 0
    assert status.average_run_duration_ms is not None
    assert status.average_run_duration_ms >= 0


def test_watcher_groups_repeated_historical_skip_events(db_session: Session) -> None:
    _create_wallet(db_session)
    watcher = _build_test_watcher()
    old_trade = {
        **_trade("0xold-1"),
        "timestamp": (_now() - timedelta(minutes=20)).isoformat(),
    }

    watcher.run_once(
        db=db_session,
        data_client=FakeTradeReader([old_trade, {**old_trade, "transactionHash": "0xold-2"}, {**old_trade, "transactionHash": "0xold-3"}]),
        now=_now(),
    )
    events = list_copy_events(db_session, limit=10)

    grouped = [event for event in events if event.event_type == "demo_order_skipped_grouped"]
    assert len(grouped) == 1
    assert grouped[0].message == "Trades historicos detectados fuera de la ventana de copia."
    assert grouped[0].event_metadata["count"] == 3


def test_watcher_marks_over_interval_and_counts_timeout(db_session: Session) -> None:
    _create_wallet(db_session, suffix="11")
    _create_wallet(db_session, suffix="22")
    watcher = CopyTradingDemoWatcher(interval_seconds=1, cycle_timeout_seconds=1)

    result = watcher.run_once(db=db_session, data_client=SlowTradeReader(1.05), now=None)

    assert result.executed is True
    assert result.status.last_run_duration_ms is not None
    assert result.status.last_run_duration_ms >= 1000
    assert result.status.is_over_interval is True
    assert result.status.timeout_count == 0
    assert result.status.slow_wallet_count == 1
    assert result.status.skipped_due_to_budget_count == 1
    assert result.status.pending_wallet_count == 1
    assert result.status.last_result is not None
    assert result.status.last_result.errors == ["Watcher demo recorto el ciclo para no acumular retraso."]
    assert result.status.last_result.cycle_budget_exceeded is True
    assert result.status.last_result.pending_wallets == 1
    assert any(entry.status == "skipped_budget" for entry in result.status.last_result.wallet_scan_results)


def test_watcher_timeout_count_only_tracks_real_timeout(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    _create_wallet(db_session, suffix="22")
    watcher = _build_test_watcher()

    result = watcher.run_once(
        db=db_session,
        data_client=TimeoutForOneWalletReader(first.proxy_wallet),
        now=_now(),
    )

    assert result.executed is True
    assert result.status.timeout_count == 1
    assert result.status.last_result is not None
    timeout_entries = [entry for entry in result.status.last_result.wallet_scan_results if entry.status == "timeout"]
    assert len(timeout_entries) == 1
    assert timeout_entries[0].wallet_id == first.id


def test_watcher_pending_wallets_are_promoted_next_cycle(db_session: Session) -> None:
    first = _create_wallet(db_session, suffix="11")
    second = _create_wallet(db_session, suffix="22")
    watcher = CopyTradingDemoWatcher(interval_seconds=1, cycle_timeout_seconds=1, live_limit=5)

    first_run = watcher.run_once(db=db_session, data_client=SlowTradeReader(1.05), now=_now())

    assert first_run.executed is True
    assert first_run.status.last_result is not None
    assert any(
        entry.wallet_id == second.id and entry.status == "skipped_budget"
        for entry in first_run.status.last_result.wallet_scan_results
    )

    reader = TrackingTradeReader({first.proxy_wallet: [], second.proxy_wallet: []})
    second_run = watcher.run_once(db=db_session, data_client=reader, now=_now() + timedelta(minutes=1))

    assert second_run.executed is True
    assert reader.wallets_seen[0] == second.proxy_wallet


def test_watcher_pending_results_include_reason_and_hint(db_session: Session) -> None:
    _create_wallet(db_session, suffix="11")
    _create_wallet(db_session, suffix="22")
    watcher = CopyTradingDemoWatcher(interval_seconds=1, cycle_timeout_seconds=1, live_limit=5)

    result = watcher.run_once(db=db_session, data_client=SlowTradeReader(1.05), now=_now())

    assert result.executed is True
    assert result.status.last_result is not None
    pending_entries = [entry for entry in result.status.last_result.wallet_scan_results if entry.status == "skipped_budget"]
    assert len(pending_entries) == 1
    assert pending_entries[0].reason == "Pendiente: ciclo recortado por carga."
    assert pending_entries[0].next_scan_hint == "Pendiente por carga. Volvera en el proximo ciclo."


def test_watcher_run_once_route(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    watcher = _build_test_watcher()
    monkeypatch.setattr(routes_copy_trading, "demo_watcher", watcher)

    response = client.post("/copy-trading/watcher/run-once")

    assert response.status_code == 200
    assert response.json()["last_result"]["wallets_scanned"] == 0


def test_watcher_start_stop_routes(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    watcher = _build_test_watcher()
    monkeypatch.setattr(routes_copy_trading, "demo_watcher", watcher)

    start_response = client.post("/copy-trading/watcher/start")
    stop_response = client.post("/copy-trading/watcher/stop")

    assert start_response.status_code == 200
    assert start_response.json()["enabled"] is True
    assert stop_response.status_code == 200
    assert stop_response.json()["enabled"] is False


def _create_wallet(
    db_session: Session,
    *,
    amount: Decimal = Decimal("5"),
    amount_mode: str = "preset",
    suffix: str = "11",
) -> CopyWallet:
    wallet_input = f"0x{suffix.zfill(40)}"
    wallet = create_copy_wallet(
        db_session,
        CopyWalletCreate(
            wallet_input=wallet_input,
            copy_amount_mode=amount_mode,  # type: ignore[arg-type]
            copy_amount_usd=amount,
        ),
    )
    db_session.commit()
    return wallet


def _trade(
    transaction_hash: str,
    *,
    side: str = "BUY",
    price: str = "0.50",
    size: str = "100",
    wallet: str = WALLET,
) -> dict[str, object]:
    return {
        "proxyWallet": wallet,
        "side": side,
        "price": price,
        "size": size,
        "timestamp": _now().isoformat(),
        "title": "Will test market resolve yes?",
        "slug": "test-market",
        "outcome": "YES",
        "transactionHash": transaction_hash,
    }


def _build_test_watcher() -> CopyTradingDemoWatcher:
    return CopyTradingDemoWatcher(
        interval_seconds=5,
        session_factory=DummySession,
        data_client_factory=DummyDataClient,
    )


def _now() -> datetime:
    return datetime(2026, 5, 15, 12, 0, tzinfo=UTC)
