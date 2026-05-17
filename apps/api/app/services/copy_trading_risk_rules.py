from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from app.models.copy_trading import CopyWallet


@dataclass(slots=True)
class CopyTradeIntent:
    status: str
    reason: str | None
    intended_amount_usd: Decimal | None
    intended_size: Decimal | None
    simulated_price: Decimal | None


@dataclass(slots=True)
class CopyTradeForRules:
    side: str | None
    price: Decimal | None
    timestamp: datetime | None


def evaluate_demo_trade(
    wallet: CopyWallet,
    trade: CopyTradeForRules,
    *,
    now: datetime | None = None,
    enforce_copy_window: bool = True,
) -> CopyTradeIntent:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    side = (trade.side or "").strip().lower() or None
    price = trade.price

    if wallet.mode == "real" or wallet.real_trading_enabled:
        return CopyTradeIntent(
            status="blocked",
            reason="real_trading_not_configured",
            intended_amount_usd=None,
            intended_size=None,
            simulated_price=None,
        )
    if side is None:
        return _skipped("missing_side")
    if side == "buy" and not wallet.copy_buys:
        return _skipped("copy_buys_disabled")
    if side == "sell" and not wallet.copy_sells:
        return _skipped("copy_sells_disabled")
    if side not in {"buy", "sell"}:
        return _skipped("missing_side")
    if price is None or price <= 0:
        return _skipped("missing_price")
    if enforce_copy_window and trade.timestamp is not None and wallet.max_delay_seconds is not None:
        source_time = _normalize_datetime(trade.timestamp)
        if (current_time - source_time).total_seconds() > wallet.max_delay_seconds:
            return _skipped("trade_too_old")
    if wallet.copy_amount_usd is None or wallet.copy_amount_usd <= 0:
        return _skipped("invalid_copy_amount")

    intended_amount = Decimal(wallet.copy_amount_usd)
    reason = None
    if wallet.max_trade_usd is not None and intended_amount > wallet.max_trade_usd:
        intended_amount = Decimal(wallet.max_trade_usd)
        reason = "capped_by_max_trade_usd"

    intended_size = intended_amount / price
    return CopyTradeIntent(
        status="simulated",
        reason=reason,
        intended_amount_usd=intended_amount,
        intended_size=intended_size,
        simulated_price=price,
    )


def _skipped(reason: str) -> CopyTradeIntent:
    return CopyTradeIntent(
        status="skipped",
        reason=reason,
        intended_amount_usd=None,
        intended_size=None,
        simulated_price=None,
    )


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
