from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.copy_trading import CopyWallet
from app.schemas.copy_trading import CopyWalletCreate
from app.services.copy_trading_demo_engine import normalize_public_trade, run_demo_tick
from app.services.copy_trading_risk_rules import CopyTradeForRules, evaluate_demo_trade
from app.services.copy_trading_service import (
    InvalidCopyWalletInputError,
    create_copy_wallet,
    list_copy_orders,
    list_copy_trades,
    resolve_copy_wallet_input,
)

WALLET = "0x1111111111111111111111111111111111111111"


class FakeTradeReader:
    def __init__(self, trades: list[dict[str, object]]) -> None:
        self.trades = trades

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
        return self.trades[:limit]


def test_valid_wallet_normalizes_direct_0x() -> None:
    resolved = resolve_copy_wallet_input(WALLET.upper())

    assert resolved.proxy_wallet == WALLET
    assert resolved.profile_url is None


def test_invalid_wallet_input_fails_cleanly() -> None:
    with pytest.raises(InvalidCopyWalletInputError):
        resolve_copy_wallet_input("not-a-wallet")


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
    assert orders[0].status == "simulated"
    assert orders[0].intended_amount_usd == Decimal("5.00")
    assert orders[0].intended_size == Decimal("10.00000000")


def test_demo_tick_does_not_duplicate_processed_trade(db_session: Session) -> None:
    _create_wallet(db_session)
    reader = FakeTradeReader([_trade("0xprocessed")])

    run_demo_tick(db_session, data_client=reader, now=_now())
    response = run_demo_tick(db_session, data_client=reader, now=_now())

    assert response.new_trades == 0
    assert len(list_copy_orders(db_session)) == 1


def test_real_mode_returns_blocked_not_configured(db_session: Session) -> None:
    wallet = _create_wallet(db_session)
    wallet.mode = "real"

    intent = evaluate_demo_trade(wallet, CopyTradeForRules(side="buy", price=Decimal("0.5"), timestamp=_now()), now=_now())

    assert intent.status == "blocked"
    assert intent.reason == "real_trading_not_configured"


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


def _trade(transaction_hash: str) -> dict[str, object]:
    return {
        "proxyWallet": WALLET,
        "side": "BUY",
        "price": "0.50",
        "size": "100",
        "timestamp": _now().isoformat(),
        "title": "Will test market resolve yes?",
        "slug": "test-market",
        "outcome": "YES",
        "transactionHash": transaction_hash,
    }


def _now() -> datetime:
    return datetime(2026, 5, 15, 12, 0, tzinfo=UTC)
