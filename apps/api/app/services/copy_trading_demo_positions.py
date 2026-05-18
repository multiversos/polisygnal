from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP
from time import monotonic
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket_data import PolymarketDataClient, PolymarketDataClientError
from app.models.copy_trading import CopyDemoPosition, CopyDetectedTrade, CopyOrder, CopyWallet
from app.schemas.copy_trading import (
    CopyDemoPositionRead,
    CopyTradingDemoPnlHighlight,
    CopyTradingDemoPnlSummary,
)
from app.services.copy_trading_service import add_copy_event

ZERO = Decimal("0")
USD_QUANT = Decimal("0.01")
PERCENT_QUANT = Decimal("0.01")


def open_demo_position(
    db: Session,
    *,
    wallet: CopyWallet,
    order: CopyOrder,
    trade: CopyDetectedTrade,
    opened_at: datetime | None = None,
) -> CopyDemoPosition | None:
    if order.status != "simulated" or order.action != "buy":
        return None
    if order.simulated_price is None or order.intended_amount_usd is None or order.intended_size is None:
        return None

    position = CopyDemoPosition(
        id=str(uuid4()),
        wallet_id=wallet.id,
        opening_order_id=order.id,
        condition_id=trade.condition_id,
        asset=trade.asset,
        outcome=trade.outcome,
        market_title=trade.market_title,
        market_slug=trade.market_slug,
        entry_action=order.action,
        entry_price=order.simulated_price,
        entry_amount_usd=_quantize_usd(order.intended_amount_usd),
        entry_size=order.intended_size,
        status="open",
        opened_at=opened_at or datetime.now(tz=UTC),
    )
    db.add(position)
    db.flush()
    db.refresh(position)
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="demo_position_opened",
        message="Copia demo abierta.",
        metadata={
            "position_id": position.id,
            "amount_usd": str(position.entry_amount_usd),
            "asset": position.asset,
            "outcome": position.outcome,
        },
    )
    return position


def find_matching_open_demo_position(
    db: Session,
    *,
    wallet: CopyWallet,
    trade: CopyDetectedTrade,
) -> CopyDemoPosition | None:
    position = db.scalar(
        select(CopyDemoPosition)
        .where(CopyDemoPosition.wallet_id == wallet.id)
        .where(CopyDemoPosition.status == "open")
        .where(CopyDemoPosition.condition_id == trade.condition_id)
        .where(CopyDemoPosition.asset == trade.asset)
        .order_by(CopyDemoPosition.opened_at.desc())
        .limit(1)
    )
    if position is None and trade.outcome is not None:
        position = db.scalar(
            select(CopyDemoPosition)
            .where(CopyDemoPosition.wallet_id == wallet.id)
            .where(CopyDemoPosition.status == "open")
            .where(CopyDemoPosition.condition_id == trade.condition_id)
            .where(CopyDemoPosition.outcome == trade.outcome)
            .order_by(CopyDemoPosition.opened_at.desc())
            .limit(1)
        )
    return position


def close_demo_position_for_sell(
    db: Session,
    *,
    wallet: CopyWallet,
    order: CopyOrder,
    trade: CopyDetectedTrade,
    position: CopyDemoPosition | None = None,
    closed_at: datetime | None = None,
    close_reason: str = "wallet_sell",
) -> CopyDemoPosition | None:
    if order.status != "simulated" or order.action != "sell":
        return None
    position = position or find_matching_open_demo_position(db, wallet=wallet, trade=trade)
    if position is None:
        add_copy_event(
            db,
            wallet_id=wallet.id,
            level="warning",
            event_type="demo_position_unmatched_sell",
            message="Venta demo detectada sin posicion abierta.",
            metadata={"asset": trade.asset, "outcome": trade.outcome},
        )
        return None

    exit_price = order.simulated_price
    exit_value = _quantize_usd(position.entry_size * exit_price) if exit_price is not None else None
    realized_pnl = (
        _quantize_usd(exit_value - position.entry_amount_usd)
        if exit_value is not None
        else None
    )
    position.closing_order_id = order.id
    position.exit_price = exit_price
    position.exit_value_usd = exit_value
    position.realized_pnl_usd = realized_pnl
    position.close_reason = close_reason
    position.status = "closed"
    position.closed_at = closed_at or datetime.now(tz=UTC)
    db.add(position)
    db.flush()
    db.refresh(position)
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="demo_position_closed",
        message="Copia demo cerrada.",
        metadata={
            "position_id": position.id,
            "realized_pnl_usd": str(position.realized_pnl_usd) if position.realized_pnl_usd is not None else None,
            "asset": position.asset,
            "outcome": position.outcome,
        },
    )
    return position


def list_open_demo_positions(db: Session) -> list[CopyDemoPosition]:
    return list(
        db.scalars(
            select(CopyDemoPosition)
            .options(joinedload(CopyDemoPosition.wallet))
            .where(CopyDemoPosition.status.in_(("open", "waiting_resolution", "unknown_resolution")))
            .order_by(CopyDemoPosition.opened_at.desc())
        ).all()
    )


def list_closed_demo_positions(db: Session, *, limit: int = 100) -> list[CopyDemoPosition]:
    return list(
        db.scalars(
            select(CopyDemoPosition)
            .options(joinedload(CopyDemoPosition.wallet))
            .where(CopyDemoPosition.status.in_(("closed", "cancelled")))
            .order_by(CopyDemoPosition.closed_at.desc(), CopyDemoPosition.opened_at.desc())
            .limit(limit)
        ).all()
    )


def build_open_demo_positions_read(
    positions: Iterable[CopyDemoPosition],
    *,
    data_client: PolymarketDataClient,
    now: datetime | None = None,
) -> list[CopyDemoPositionRead]:
    price_cache: dict[str, dict[tuple[str | None, str | None], Decimal | None]] = {}
    reads: list[CopyDemoPositionRead] = []
    for position in positions:
        current_price = _resolve_current_price(
            data_client=data_client,
            position=position,
            price_cache=price_cache,
        )
        current_value = None
        unrealized_pnl = None
        unrealized_pnl_percent = None
        status = position.status
        if current_price is None:
            if position.status == "open":
                status = "price_pending"
        else:
            current_value = _quantize_usd(position.entry_size * current_price)
            unrealized_pnl = _quantize_usd(current_value - position.entry_amount_usd)
            if position.entry_amount_usd > 0:
                unrealized_pnl_percent = _quantize_percent((unrealized_pnl / position.entry_amount_usd) * Decimal("100"))
        if position.status == "open" and current_price is None:
            status = "price_pending"
        reads.append(
            CopyDemoPositionRead(
                id=position.id,
                wallet_id=position.wallet_id,
                wallet_label=position.wallet.label if position.wallet is not None else None,
                proxy_wallet=position.wallet.proxy_wallet if position.wallet is not None else None,
                opening_order_id=position.opening_order_id,
                closing_order_id=position.closing_order_id,
                condition_id=position.condition_id,
                asset=position.asset,
                outcome=position.outcome,
                market_title=position.market_title,
                market_slug=position.market_slug,
                entry_action=position.entry_action,
                entry_price=position.entry_price,
                entry_amount_usd=position.entry_amount_usd,
                entry_size=position.entry_size,
                current_price=current_price,
                current_value_usd=current_value,
                unrealized_pnl_usd=unrealized_pnl,
                unrealized_pnl_percent=unrealized_pnl_percent,
                realized_pnl_usd=position.realized_pnl_usd,
                realized_pnl_percent=_build_realized_pnl_percent(
                    position.realized_pnl_usd, position.entry_amount_usd
                ),
                exit_price=position.exit_price,
                exit_value_usd=position.exit_value_usd,
                close_reason=position.close_reason,
                resolution_source=position.resolution_source,
                result="pending",
                status=status,  # type: ignore[arg-type]
                opened_at=_normalize_datetime(position.opened_at),
                closed_at=position.closed_at,
                updated_at=_normalize_datetime(position.updated_at),
            )
        )
    return reads


def build_closed_demo_positions_read(
    positions: Iterable[CopyDemoPosition],
) -> list[CopyDemoPositionRead]:
    reads: list[CopyDemoPositionRead] = []
    for position in positions:
        realized_pnl_percent = _build_realized_pnl_percent(
            position.realized_pnl_usd, position.entry_amount_usd
        )
        reads.append(
            CopyDemoPositionRead(
                id=position.id,
                wallet_id=position.wallet_id,
                wallet_label=position.wallet.label if position.wallet is not None else None,
                proxy_wallet=position.wallet.proxy_wallet if position.wallet is not None else None,
                opening_order_id=position.opening_order_id,
                closing_order_id=position.closing_order_id,
                condition_id=position.condition_id,
                asset=position.asset,
                outcome=position.outcome,
                market_title=position.market_title,
                market_slug=position.market_slug,
                entry_action=position.entry_action,
                entry_price=position.entry_price,
                entry_amount_usd=position.entry_amount_usd,
                entry_size=position.entry_size,
                current_price=None,
                current_value_usd=None,
                unrealized_pnl_usd=None,
                unrealized_pnl_percent=None,
                realized_pnl_usd=position.realized_pnl_usd,
                realized_pnl_percent=realized_pnl_percent,
                exit_price=position.exit_price,
                exit_value_usd=position.exit_value_usd,
                close_reason=position.close_reason,
                resolution_source=position.resolution_source,
                result=_resolve_position_result(position.status, position.close_reason, position.realized_pnl_usd),
                status=position.status,  # type: ignore[arg-type]
                opened_at=_normalize_datetime(position.opened_at),
                closed_at=position.closed_at,
                updated_at=_normalize_datetime(position.updated_at),
            )
        )
    return reads


def build_demo_pnl_summary(
    open_positions: Iterable[CopyDemoPositionRead],
    closed_positions: Iterable[CopyDemoPositionRead],
    *,
    built_at: datetime | None = None,
    warnings: Iterable[str] | None = None,
) -> CopyTradingDemoPnlSummary:
    open_items = list(open_positions)
    closed_items = list(closed_positions)
    capital_demo_used = ZERO
    open_capital = ZERO
    closed_capital = ZERO
    open_current_value = ZERO
    open_pnl = ZERO
    realized_pnl = ZERO
    price_pending_count = 0
    open_priced_count = 0
    winning_closed_count = 0
    losing_closed_count = 0
    break_even_closed_count = 0
    cancelled_closed_count = 0
    unknown_closed_count = 0
    best_closed_pnl: Decimal | None = None
    worst_closed_pnl: Decimal | None = None
    best_closed_position: CopyDemoPositionRead | None = None
    worst_closed_position: CopyDemoPositionRead | None = None

    for position in open_items:
        open_capital += position.entry_amount_usd
        capital_demo_used += position.entry_amount_usd
        if position.unrealized_pnl_usd is None:
            price_pending_count += 1
        else:
            open_pnl += position.unrealized_pnl_usd
            open_priced_count += 1
        if position.current_value_usd is not None:
            open_current_value += position.current_value_usd

    for position in closed_items:
        closed_capital += position.entry_amount_usd
        capital_demo_used += position.entry_amount_usd
        pnl = position.realized_pnl_usd or ZERO
        realized_pnl += pnl
        if position.result == "cancelled" or position.status == "cancelled" or position.close_reason == "market_cancelled":
            cancelled_closed_count += 1
        elif position.result == "unknown" or position.realized_pnl_usd is None:
            unknown_closed_count += 1
        elif pnl > 0:
            winning_closed_count += 1
        elif pnl < 0:
            losing_closed_count += 1
        else:
            break_even_closed_count += 1
        if best_closed_pnl is None or pnl > best_closed_pnl:
            best_closed_pnl = pnl
            best_closed_position = position
        if worst_closed_pnl is None or pnl < worst_closed_pnl:
            worst_closed_pnl = pnl
            worst_closed_position = position

    open_pnl_value = _quantize_usd(open_pnl) if open_priced_count > 0 else None
    open_current_value_value = _quantize_usd(open_current_value) if open_priced_count > 0 else None
    realized_pnl_value = _quantize_usd(realized_pnl)
    total_demo_pnl_value: Decimal | None = realized_pnl_value
    if open_pnl_value is not None:
        total_demo_pnl_value = _quantize_usd(open_pnl_value + realized_pnl_value)
    elif len(closed_items) == 0 and len(open_items) > 0:
        total_demo_pnl_value = None

    demo_roi_percent = None
    if capital_demo_used > 0 and total_demo_pnl_value is not None:
        demo_roi_percent = _quantize_percent((total_demo_pnl_value / capital_demo_used) * Decimal("100"))

    win_rate_percent = None
    average_closed_pnl = None
    resolved_closed_count = winning_closed_count + losing_closed_count
    if closed_items:
        average_closed_pnl = _quantize_usd(realized_pnl / Decimal(len(closed_items)))
    if resolved_closed_count > 0:
        win_rate_percent = _quantize_percent(
            (Decimal(winning_closed_count) / Decimal(resolved_closed_count)) * Decimal("100")
        )

    warning_items = [item for item in (warnings or []) if item]
    status = "ok"
    message = "Datos demo actualizados."
    if len(open_items) == 0 and len(closed_items) == 0:
        status = "no_data"
        message = "Aun no hay copias demo abiertas ni cerradas."
    elif price_pending_count > 0:
        status = "partial"
        message = "Hay posiciones abiertas, pero algunas no tienen precio actual disponible."
    elif len(closed_items) == 0:
        message = "El win rate aparecera cuando existan copias cerradas con resultado confiable."

    if len(closed_items) == 0 and len(open_items) > 0:
        if status == "partial":
            message = (
                "Hay posiciones abiertas, pero algunas no tienen precio actual disponible. "
                "El win rate aparecera cuando existan copias cerradas con resultado confiable."
            )
        elif status == "ok":
            message = "Hay actividad demo abierta. El win rate aparecera cuando existan copias cerradas con resultado confiable."

    if warning_items and status == "ok":
        status = "partial"
        if not message:
            message = "Hay datos demo parciales en esta pasada."

    return CopyTradingDemoPnlSummary(
        status=status,  # type: ignore[arg-type]
        message=message,
        warnings=warning_items,
        open_positions_count=len(open_items),
        closed_positions_count=len(closed_items),
        demo_capital_used_usd=_quantize_usd(capital_demo_used),
        capital_demo_used_usd=_quantize_usd(capital_demo_used),
        open_capital_usd=_quantize_usd(open_capital),
        closed_capital_usd=_quantize_usd(closed_capital),
        current_open_value_usd=open_current_value_value,
        open_current_value_usd=open_current_value_value,
        open_pnl_usd=open_pnl_value,
        realized_pnl_usd=realized_pnl_value,
        total_pnl_usd=total_demo_pnl_value,
        total_demo_pnl_usd=total_demo_pnl_value,
        demo_roi_percent=demo_roi_percent,
        win_count=winning_closed_count,
        loss_count=losing_closed_count,
        win_rate_percent=win_rate_percent,
        average_closed_pnl_usd=average_closed_pnl,
        best_closed_pnl_usd=_quantize_usd(best_closed_pnl) if best_closed_pnl is not None else None,
        worst_closed_pnl_usd=_quantize_usd(worst_closed_pnl) if worst_closed_pnl is not None else None,
        winning_closed_count=winning_closed_count,
        losing_closed_count=losing_closed_count,
        break_even_closed_count=break_even_closed_count,
        cancelled_closed_count=cancelled_closed_count,
        unknown_closed_count=unknown_closed_count,
        pending_price_count=price_pending_count,
        price_pending_count=price_pending_count,
        best_closed_copy=_build_pnl_highlight(best_closed_position),
        worst_closed_copy=_build_pnl_highlight(worst_closed_position),
        last_updated_at=built_at or datetime.now(tz=UTC),
    )


def build_demo_pnl_summary_snapshot(
    open_positions: Iterable[CopyDemoPosition],
    closed_positions: Iterable[CopyDemoPosition],
    *,
    data_client: PolymarketDataClient,
    now: datetime | None = None,
    max_market_price_lookups: int = 80,
    max_runtime_seconds: float = 8.0,
) -> CopyTradingDemoPnlSummary:
    open_items = list(open_positions)
    closed_items = list(closed_positions)
    built_at = _normalize_datetime(now or datetime.now(tz=UTC))
    warnings: list[str] = []
    price_cache: dict[str, dict[tuple[str | None, str | None], Decimal | None]] = {}
    price_lookup_count = 0
    skipped_price_lookups = False
    deadline = monotonic() + max_runtime_seconds
    open_reads: list[CopyDemoPositionRead] = []

    for position in open_items:
        current_price = None
        if position.condition_id:
            if position.condition_id not in price_cache:
                if price_lookup_count >= max_market_price_lookups or monotonic() >= deadline:
                    skipped_price_lookups = True
                    price_cache[position.condition_id] = {}
                else:
                    price_cache[position.condition_id] = _fetch_market_price_map(
                        data_client, position.condition_id
                    )
                    price_lookup_count += 1
            market_prices = price_cache[position.condition_id]
            current_price = market_prices.get((position.asset, None))
            if current_price is None:
                current_price = market_prices.get((None, position.outcome))

        current_value = None
        unrealized_pnl = None
        unrealized_pnl_percent = None
        status = position.status
        if current_price is None and position.status == "open":
            status = "price_pending"
        elif current_price is not None:
            current_value = _quantize_usd(position.entry_size * current_price)
            unrealized_pnl = _quantize_usd(current_value - position.entry_amount_usd)
            if position.entry_amount_usd > 0:
                unrealized_pnl_percent = _quantize_percent(
                    (unrealized_pnl / position.entry_amount_usd) * Decimal("100")
                )

        open_reads.append(
            CopyDemoPositionRead(
                id=position.id,
                wallet_id=position.wallet_id,
                wallet_label=position.wallet.label if position.wallet is not None else None,
                proxy_wallet=position.wallet.proxy_wallet if position.wallet is not None else None,
                opening_order_id=position.opening_order_id,
                closing_order_id=position.closing_order_id,
                condition_id=position.condition_id,
                asset=position.asset,
                outcome=position.outcome,
                market_title=position.market_title,
                market_slug=position.market_slug,
                entry_action=position.entry_action,
                entry_price=position.entry_price,
                entry_amount_usd=position.entry_amount_usd,
                entry_size=position.entry_size,
                current_price=current_price,
                current_value_usd=current_value,
                unrealized_pnl_usd=unrealized_pnl,
                unrealized_pnl_percent=unrealized_pnl_percent,
                realized_pnl_usd=position.realized_pnl_usd,
                realized_pnl_percent=_build_realized_pnl_percent(
                    position.realized_pnl_usd, position.entry_amount_usd
                ),
                exit_price=position.exit_price,
                exit_value_usd=position.exit_value_usd,
                close_reason=position.close_reason,
                resolution_source=position.resolution_source,
                result="pending",
                status=status,  # type: ignore[arg-type]
                opened_at=_normalize_datetime(position.opened_at),
                closed_at=position.closed_at,
                updated_at=_normalize_datetime(position.updated_at),
            )
        )

    if skipped_price_lookups:
        warnings.append(
            "Hay posiciones abiertas, pero algunas no tienen precio actual disponible."
        )

    return build_demo_pnl_summary(
        open_reads,
        build_closed_demo_positions_read(closed_items),
        built_at=built_at,
        warnings=warnings,
    )


def _resolve_current_price(
    *,
    data_client: PolymarketDataClient,
    position: CopyDemoPosition,
    price_cache: dict[str, dict[tuple[str | None, str | None], Decimal | None]],
) -> Decimal | None:
    if not position.condition_id:
        return None
    if position.condition_id not in price_cache:
        price_cache[position.condition_id] = _fetch_market_price_map(data_client, position.condition_id)
    market_prices = price_cache[position.condition_id]
    by_asset = market_prices.get((position.asset, None))
    if by_asset is not None:
        return by_asset
    return market_prices.get((None, position.outcome))


def _fetch_market_price_map(
    data_client: PolymarketDataClient,
    condition_id: str,
) -> dict[tuple[str | None, str | None], Decimal | None]:
    prices: dict[tuple[str | None, str | None], Decimal | None] = {}
    try:
        positions = data_client.get_positions_for_market(condition_id, limit=100)
        for item in positions:
            if item.curr_price is not None:
                prices[(item.asset, None)] = item.curr_price
                prices[(None, item.outcome)] = item.curr_price
    except PolymarketDataClientError:
        return prices

    if prices:
        return prices

    try:
        trades = data_client.get_trades_for_market(condition_id, limit=25, offset=0)
    except PolymarketDataClientError:
        return prices

    for trade in trades:
        if trade.price is None:
            continue
        prices.setdefault((trade.asset, None), trade.price)
        prices.setdefault((None, trade.outcome), trade.price)
    return prices


def _quantize_usd(value: Decimal) -> Decimal:
    return value.quantize(USD_QUANT, rounding=ROUND_HALF_UP)


def _quantize_percent(value: Decimal) -> Decimal:
    return value.quantize(PERCENT_QUANT, rounding=ROUND_HALF_UP)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _build_realized_pnl_percent(
    realized_pnl: Decimal | None,
    capital: Decimal,
) -> Decimal | None:
    if realized_pnl is None or capital <= 0:
        return None
    return _quantize_percent((realized_pnl / capital) * Decimal("100"))


def _resolve_position_result(
    status: str,
    close_reason: str | None,
    realized_pnl: Decimal | None,
) -> str:
    if status == "cancelled" or close_reason == "market_cancelled":
        return "cancelled"
    if realized_pnl is None:
        return "unknown"
    if realized_pnl > 0:
        return "win"
    if realized_pnl < 0:
        return "loss"
    return "break_even"


def _build_pnl_highlight(position: CopyDemoPositionRead | None) -> CopyTradingDemoPnlHighlight | None:
    if position is None:
        return None
    return CopyTradingDemoPnlHighlight(
        position_id=position.id,
        wallet_label=position.wallet_label,
        market_title=position.market_title,
        outcome=position.outcome,
        realized_pnl_usd=position.realized_pnl_usd,
        realized_pnl_percent=position.realized_pnl_percent,
        close_reason=position.close_reason,
        closed_at=position.closed_at,
    )
