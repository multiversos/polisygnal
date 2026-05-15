from __future__ import annotations

from dataclasses import dataclass

from app.models.copy_trading import CopyDetectedTrade, CopyWallet


class RealTradingBlockedError(Exception):
    """Raised while real copy trading is intentionally unavailable."""


@dataclass(slots=True)
class PreparedRealOrder:
    wallet_id: str
    detected_trade_id: str
    action: str


def validate_real_trading_config(wallet: CopyWallet) -> None:
    if wallet.mode == "real" or wallet.real_trading_enabled:
        raise RealTradingBlockedError("real_trading_not_configured")


def prepare_order(wallet: CopyWallet, trade: CopyDetectedTrade) -> PreparedRealOrder:
    validate_real_trading_config(wallet)
    return PreparedRealOrder(
        wallet_id=wallet.id,
        detected_trade_id=trade.id,
        action=trade.side,
    )


def submit_order(order: PreparedRealOrder) -> None:
    raise RealTradingBlockedError("real_trading_not_configured")
