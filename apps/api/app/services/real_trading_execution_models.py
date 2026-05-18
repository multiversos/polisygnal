from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.schemas.copy_trading import CopyTradingStatusResponse
from app.schemas.real_trading import (
    ExecutionAction,
    ExecutionDataQuality,
    ExecutionIntent,
    ExecutionLatencyMetrics,
    ExecutionMode,
    ExecutionSimulationResult,
    ExecutionSimulationStatus,
)


def is_live_execution_enabled(*, real_trading_available: bool = False) -> bool:
    return bool(real_trading_available)


def mode_requires_signature(mode: ExecutionMode) -> bool:
    return mode in {ExecutionMode.SIGNED_DRY_RUN, ExecutionMode.LIVE}


def mode_requires_order_submission(mode: ExecutionMode) -> bool:
    return mode == ExecutionMode.LIVE and is_live_execution_enabled(real_trading_available=False)


def build_execution_intent(
    *,
    mode: ExecutionMode,
    source_wallet_address: str,
    action: ExecutionAction,
    copied_wallet_id: str | None = None,
    market: str | None = None,
    condition_id: str | None = None,
    token_id: str | None = None,
    outcome: str | None = None,
    source_trade_id: str | None = None,
    source_trade_price: Decimal | None = None,
    source_trade_size: Decimal | None = None,
    source_trade_timestamp: datetime | None = None,
    detected_at: datetime | None = None,
    intended_amount_usd: Decimal | None = None,
    max_slippage_bps: int | None = None,
    max_latency_seconds: int | None = None,
    reason: str | None = None,
) -> ExecutionIntent:
    return ExecutionIntent(
        mode=mode,
        source_wallet_address=source_wallet_address,
        copied_wallet_id=copied_wallet_id,
        market=market,
        condition_id=condition_id,
        token_id=token_id,
        outcome=outcome,
        action=action,
        source_trade_id=source_trade_id,
        source_trade_price=source_trade_price,
        source_trade_size=source_trade_size,
        source_trade_timestamp=source_trade_timestamp,
        detected_at=detected_at,
        intended_amount_usd=intended_amount_usd,
        max_slippage_bps=max_slippage_bps,
        max_latency_seconds=max_latency_seconds,
        reason=reason,
    )


def build_execution_simulation_result(
    *,
    intent: ExecutionIntent,
    source_price: Decimal | None,
    polysignal_quote_price: Decimal | None,
    source_size: Decimal | None = None,
    intended_size: Decimal | None = None,
    estimated_shares: Decimal | None = None,
    estimated_gross_pnl: Decimal | None = None,
    estimated_fees: Decimal | None = None,
    estimated_spread: Decimal | None = None,
    estimated_slippage: Decimal | None = None,
    data_quality: ExecutionDataQuality = ExecutionDataQuality.UNAVAILABLE,
    warnings: list[str] | None = None,
) -> ExecutionSimulationResult:
    if source_price is None or polysignal_quote_price is None:
        return ExecutionSimulationResult(
            execution_intent_id=intent.id,
            mode=intent.mode,
            status=ExecutionSimulationStatus.UNAVAILABLE,
            source_price=source_price,
            polysignal_quote_price=polysignal_quote_price,
            source_size=source_size,
            intended_size=intended_size,
            estimated_shares=estimated_shares,
            estimated_fees=estimated_fees,
            estimated_spread=estimated_spread,
            estimated_slippage=estimated_slippage,
            estimated_gross_pnl=None,
            estimated_net_pnl=None,
            estimated_net_roi=None,
            worth_copying=False,
            rejection_reason="missing_quote_data",
            data_quality=ExecutionDataQuality.UNAVAILABLE,
            warnings=(warnings or []) + ["quote_data_unavailable"],
        )

    price_delta = polysignal_quote_price - source_price
    price_delta_percent = None
    if source_price != 0:
        price_delta_percent = (price_delta / source_price) * Decimal("100")

    estimated_net_pnl = None
    estimated_net_roi = None
    worth_copying = False
    rejection_reason = None
    status = ExecutionSimulationStatus.SIMULATED

    if data_quality == ExecutionDataQuality.UNAVAILABLE:
        status = ExecutionSimulationStatus.UNAVAILABLE
        rejection_reason = "insufficient_pricing_quality"
    elif estimated_gross_pnl is not None and estimated_fees is not None and estimated_slippage is not None:
        estimated_net_pnl = estimated_gross_pnl - estimated_fees - estimated_slippage
        if intent.intended_amount_usd and intent.intended_amount_usd > 0:
            estimated_net_roi = (estimated_net_pnl / intent.intended_amount_usd) * Decimal("100")
        worth_copying = estimated_net_pnl > 0
        if not worth_copying:
            rejection_reason = "edge_below_costs"
            status = ExecutionSimulationStatus.REJECTED
    else:
        status = ExecutionSimulationStatus.UNAVAILABLE
        rejection_reason = "missing_cost_inputs"

    return ExecutionSimulationResult(
        execution_intent_id=intent.id,
        mode=intent.mode,
        status=status,
        source_price=source_price,
        polysignal_quote_price=polysignal_quote_price,
        price_delta=price_delta,
        price_delta_percent=price_delta_percent,
        source_size=source_size,
        intended_size=intended_size,
        estimated_shares=estimated_shares,
        estimated_gross_pnl=estimated_gross_pnl,
        estimated_fees=estimated_fees,
        estimated_spread=estimated_spread,
        estimated_slippage=estimated_slippage,
        estimated_net_pnl=estimated_net_pnl,
        estimated_net_roi=estimated_net_roi,
        worth_copying=worth_copying,
        rejection_reason=rejection_reason,
        data_quality=data_quality,
        warnings=warnings or [],
    )


def build_latency_metrics(
    *,
    source_wallet_trade_at: datetime | None,
    detected_at: datetime | None,
    quote_started_at: datetime | None = None,
    quote_finished_at: datetime | None = None,
    decision_started_at: datetime | None = None,
    decision_finished_at: datetime | None = None,
    order_build_started_at: datetime | None = None,
    order_build_finished_at: datetime | None = None,
    signature_started_at: datetime | None = None,
    signature_finished_at: datetime | None = None,
    ready_to_send_at: datetime | None = None,
) -> ExecutionLatencyMetrics:
    return ExecutionLatencyMetrics(
        source_wallet_trade_at=_utc_or_none(source_wallet_trade_at),
        detected_at=_utc_or_none(detected_at),
        quote_started_at=_utc_or_none(quote_started_at),
        quote_finished_at=_utc_or_none(quote_finished_at),
        decision_started_at=_utc_or_none(decision_started_at),
        decision_finished_at=_utc_or_none(decision_finished_at),
        order_build_started_at=_utc_or_none(order_build_started_at),
        order_build_finished_at=_utc_or_none(order_build_finished_at),
        signature_started_at=_utc_or_none(signature_started_at),
        signature_finished_at=_utc_or_none(signature_finished_at),
        ready_to_send_at=_utc_or_none(ready_to_send_at),
    )


def current_real_trading_guard() -> CopyTradingStatusResponse:
    return CopyTradingStatusResponse(
        wallets_total=0,
        wallets_enabled=0,
        trades_detected=0,
        orders_simulated=0,
        orders_skipped=0,
        orders_blocked=0,
    )


def _utc_or_none(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
