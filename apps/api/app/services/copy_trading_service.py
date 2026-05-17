from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.copy_trading import CopyBotEvent, CopyDemoPosition, CopyDetectedTrade, CopyOrder, CopyWallet
from app.services.copy_worker_state import build_worker_runtime_read, load_worker_state
from app.schemas.copy_trading import (
    COPY_AMOUNT_PRESETS,
    CopyTradingStatusResponse,
    CopyWalletCreate,
    CopyWalletRead,
    CopyWalletUpdate,
    CopyDetectedTradeRead,
    CopyOrderRead,
)

DIRECT_WALLET_PATTERN = re.compile(r"0[xX][a-fA-F0-9]{40}")
EMBEDDED_WALLET_PATTERN = re.compile(r"0[xX][a-fA-F0-9]{40}(?![a-fA-F0-9])")


class CopyTradingError(Exception):
    pass


class InvalidCopyWalletInputError(CopyTradingError):
    pass


class CopyWalletNotFoundError(CopyTradingError):
    def __init__(self, wallet_id: str) -> None:
        super().__init__(f"Copy wallet {wallet_id} no encontrada.")
        self.wallet_id = wallet_id


class DuplicateCopyWalletError(CopyTradingError):
    pass


@dataclass(slots=True)
class ResolvedCopyWalletInput:
    proxy_wallet: str
    profile_url: str | None


@dataclass(slots=True)
class CopyTradeFreshness:
    status: str
    label: str
    age_seconds: int | None
    copy_window_seconds: int | None
    is_live_candidate: bool


def resolve_copy_wallet_input(value: str) -> ResolvedCopyWalletInput:
    raw_value = value.strip()
    if not raw_value:
        raise InvalidCopyWalletInputError("Ingresa una wallet o perfil publico de Polymarket.")

    if raw_value.lower().startswith("0x"):
        if len(raw_value) != 42:
            raise InvalidCopyWalletInputError("La wallet debe tener formato 0x y 40 caracteres hexadecimales.")
        if DIRECT_WALLET_PATTERN.fullmatch(raw_value) is None:
            raise InvalidCopyWalletInputError("La wallet contiene caracteres no validos.")
        return ResolvedCopyWalletInput(proxy_wallet=raw_value.lower(), profile_url=None)

    profile_url = None
    if raw_value.lower().startswith(("https://polymarket.com/", "https://www.polymarket.com/")):
        profile_url = _safe_profile_url(raw_value)
        match = EMBEDDED_WALLET_PATTERN.search(raw_value)
        if profile_url is None or match is None:
            raise InvalidCopyWalletInputError(
                "No pudimos reconocer ese perfil. Pega una wallet 0x publica o un perfil valido."
            )
        wallet = match.group(0).lower()
        return ResolvedCopyWalletInput(proxy_wallet=wallet, profile_url=profile_url)

    if raw_value.lower().startswith(("http://", "https://")):
        raise InvalidCopyWalletInputError(
            "No pudimos reconocer ese perfil. Pega una wallet 0x publica o un perfil valido."
        )

    match = EMBEDDED_WALLET_PATTERN.search(raw_value)
    if match is None:
        raise InvalidCopyWalletInputError(
            "No pudimos reconocer ese perfil. Pega una wallet 0x publica o un perfil valido."
        )
    wallet = match.group(0).lower()
    return ResolvedCopyWalletInput(proxy_wallet=wallet, profile_url=profile_url)


def create_copy_wallet(db: Session, payload: CopyWalletCreate) -> CopyWallet:
    _validate_copy_amount(payload.copy_amount_mode, payload.copy_amount_usd)
    resolved = resolve_copy_wallet_input(payload.wallet_input)
    existing_wallet = db.scalar(
        select(CopyWallet)
        .where(CopyWallet.proxy_wallet == resolved.proxy_wallet)
        .limit(1)
    )
    if existing_wallet is not None:
        raise DuplicateCopyWalletError("Esta wallet ya esta en seguimiento.")

    wallet = CopyWallet(
        id=str(uuid4()),
        label=payload.label,
        profile_url=resolved.profile_url,
        proxy_wallet=resolved.proxy_wallet,
        enabled=True,
        mode=payload.mode,
        real_trading_enabled=False,
        copy_buys=payload.copy_buys,
        copy_sells=payload.copy_sells,
        copy_amount_mode=payload.copy_amount_mode,
        copy_amount_usd=payload.copy_amount_usd,
        max_trade_usd=payload.max_trade_usd,
        max_daily_usd=payload.max_daily_usd,
        max_slippage_bps=payload.max_slippage_bps,
        max_delay_seconds=payload.max_delay_seconds,
        sports_only=payload.sports_only,
    )
    db.add(wallet)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise DuplicateCopyWalletError("Esta wallet ya esta en seguimiento.") from exc
    db.refresh(wallet)
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="wallet_added",
        message="Wallet agregada en modo demo.",
    )
    return wallet


def list_copy_wallets(db: Session) -> list[CopyWallet]:
    stmt = (
        select(CopyWallet)
        .options(
            selectinload(CopyWallet.detected_trades),
            selectinload(CopyWallet.orders),
        )
        .order_by(CopyWallet.updated_at.desc(), CopyWallet.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def get_copy_wallet(db: Session, wallet_id: str) -> CopyWallet:
    wallet = db.get(CopyWallet, wallet_id)
    if wallet is None:
        raise CopyWalletNotFoundError(wallet_id)
    return wallet


def update_copy_wallet(db: Session, wallet_id: str, payload: CopyWalletUpdate) -> CopyWallet:
    wallet = get_copy_wallet(db, wallet_id)
    next_amount_mode = payload.copy_amount_mode if payload.copy_amount_mode is not None else wallet.copy_amount_mode
    next_amount = payload.copy_amount_usd if payload.copy_amount_usd is not None else wallet.copy_amount_usd
    _validate_copy_amount(next_amount_mode, Decimal(next_amount))

    for field_name in (
        "label",
        "enabled",
        "mode",
        "copy_buys",
        "copy_sells",
        "copy_amount_mode",
        "copy_amount_usd",
        "max_trade_usd",
        "max_daily_usd",
        "max_slippage_bps",
        "max_delay_seconds",
        "sports_only",
    ):
        if field_name in payload.model_fields_set:
            setattr(wallet, field_name, getattr(payload, field_name))
    wallet.real_trading_enabled = False
    db.add(wallet)
    db.flush()
    db.refresh(wallet)
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="wallet_updated",
        message="Configuracion de wallet actualizada.",
    )
    return wallet


def delete_copy_wallet(db: Session, wallet_id: str) -> None:
    wallet = get_copy_wallet(db, wallet_id)
    db.delete(wallet)
    db.flush()


def list_copy_trades(db: Session, *, limit: int = 50) -> list[CopyDetectedTrade]:
    stmt = (
        select(CopyDetectedTrade)
        .options(joinedload(CopyDetectedTrade.wallet))
        .order_by(CopyDetectedTrade.detected_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def list_copy_orders(db: Session, *, limit: int = 50) -> list[CopyOrder]:
    stmt = (
        select(CopyOrder)
        .options(joinedload(CopyOrder.wallet), joinedload(CopyOrder.detected_trade))
        .order_by(CopyOrder.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def list_copy_events(db: Session, *, limit: int = 50) -> list[CopyBotEvent]:
    stmt = select(CopyBotEvent).order_by(CopyBotEvent.created_at.desc()).limit(limit)
    return list(db.scalars(stmt).all())


def add_copy_event(
    db: Session,
    *,
    wallet_id: str | None,
    level: str,
    event_type: str,
    message: str,
    metadata: dict[str, object] | None = None,
) -> CopyBotEvent:
    event = CopyBotEvent(
        id=str(uuid4()),
        wallet_id=wallet_id,
        level=level,
        event_type=event_type,
        message=message[:1000],
        event_metadata=metadata,
    )
    db.add(event)
    db.flush()
    return event


def create_detected_trade(
    db: Session,
    *,
    wallet: CopyWallet,
    dedupe_key: str,
    source_proxy_wallet: str,
    side: str,
    source_transaction_hash: str | None = None,
    condition_id: str | None = None,
    asset: str | None = None,
    outcome: str | None = None,
    market_title: str | None = None,
    market_slug: str | None = None,
    source_price: Decimal | None = None,
    source_size: Decimal | None = None,
    source_amount_usd: Decimal | None = None,
    source_timestamp: datetime | None = None,
    raw_payload: dict[str, object] | None = None,
    detected_at: datetime | None = None,
) -> CopyDetectedTrade | None:
    existing = db.scalar(
        select(CopyDetectedTrade)
        .where(CopyDetectedTrade.wallet_id == wallet.id)
        .where(CopyDetectedTrade.dedupe_key == dedupe_key)
        .limit(1)
    )
    if existing is not None:
        return None
    trade = CopyDetectedTrade(
        id=str(uuid4()),
        wallet_id=wallet.id,
        source_transaction_hash=source_transaction_hash,
        dedupe_key=dedupe_key,
        source_proxy_wallet=source_proxy_wallet.lower(),
        condition_id=condition_id,
        asset=asset,
        outcome=outcome,
        market_title=market_title,
        market_slug=market_slug,
        side=side,
        source_price=source_price,
        source_size=source_size,
        source_amount_usd=source_amount_usd,
        source_timestamp=source_timestamp,
        detected_at=detected_at or datetime.now(tz=UTC),
        raw_payload=raw_payload,
    )
    db.add(trade)
    db.flush()
    db.refresh(trade)
    wallet.last_trade_at = trade.source_timestamp or trade.detected_at
    db.add(wallet)
    return trade


def create_copy_order(
    db: Session,
    *,
    wallet: CopyWallet,
    trade: CopyDetectedTrade | None,
    action: str,
    status: str,
    reason: str | None = None,
    intended_amount_usd: Decimal | None = None,
    intended_size: Decimal | None = None,
    simulated_price: Decimal | None = None,
) -> CopyOrder:
    order = CopyOrder(
        id=str(uuid4()),
        wallet_id=wallet.id,
        detected_trade_id=trade.id if trade is not None else None,
        mode=wallet.mode,
        action=action,
        status=status,
        reason=reason,
        intended_amount_usd=intended_amount_usd,
        intended_size=intended_size,
        simulated_price=simulated_price,
    )
    db.add(order)
    db.flush()
    db.refresh(order)
    return order


def touch_wallet_scan(db: Session, wallet: CopyWallet, now: datetime | None = None) -> None:
    wallet.last_scan_at = now or datetime.now(tz=UTC)
    db.add(wallet)
    db.flush()


def build_copy_trading_status(db: Session) -> CopyTradingStatusResponse:
    wallets_total = db.scalar(select(func.count()).select_from(CopyWallet)) or 0
    wallets_enabled = db.scalar(select(func.count()).select_from(CopyWallet).where(CopyWallet.enabled.is_(True))) or 0
    trades_detected = db.scalar(select(func.count()).select_from(CopyDetectedTrade)) or 0
    orders_simulated = db.scalar(select(func.count()).select_from(CopyOrder).where(CopyOrder.status == "simulated")) or 0
    orders_skipped = db.scalar(select(func.count()).select_from(CopyOrder).where(CopyOrder.status == "skipped")) or 0
    orders_blocked = db.scalar(select(func.count()).select_from(CopyOrder).where(CopyOrder.status == "blocked")) or 0
    open_demo_positions_count = (
        db.scalar(
            select(func.count())
            .select_from(CopyDemoPosition)
            .where(CopyDemoPosition.status.in_(("open", "waiting_resolution", "unknown_resolution")))
        )
        or 0
    )
    last_scan_at = db.scalar(select(func.max(CopyWallet.last_scan_at)))
    worker_runtime = build_worker_runtime_read(load_worker_state(db))
    return CopyTradingStatusResponse(
        wallets_total=wallets_total,
        wallets_enabled=wallets_enabled,
        trades_detected=trades_detected,
        orders_simulated=orders_simulated,
        orders_skipped=orders_skipped,
        orders_blocked=orders_blocked,
        open_demo_positions_count=open_demo_positions_count,
        last_scan_at=last_scan_at,
        **worker_runtime,
    )


def classify_trade_freshness(
    *,
    source_timestamp: datetime | None,
    copy_window_seconds: int | None,
    reference_time: datetime | None = None,
) -> CopyTradeFreshness:
    if source_timestamp is None:
        return CopyTradeFreshness(
            status="unknown_time",
            label="Sin hora confiable",
            age_seconds=None,
            copy_window_seconds=copy_window_seconds,
            is_live_candidate=False,
        )

    current_time = _normalize_datetime(reference_time or datetime.now(tz=UTC))
    source_time = _normalize_datetime(source_timestamp)
    age_seconds = max(0, int((current_time - source_time).total_seconds()))
    if copy_window_seconds is None:
        return CopyTradeFreshness(
            status="unknown_time",
            label="Sin hora confiable",
            age_seconds=age_seconds,
            copy_window_seconds=None,
            is_live_candidate=False,
        )
    if age_seconds <= copy_window_seconds:
        return CopyTradeFreshness(
            status="live_candidate",
            label="Copiable ahora",
            age_seconds=age_seconds,
            copy_window_seconds=copy_window_seconds,
            is_live_candidate=True,
        )
    if age_seconds <= _historical_cutoff_seconds(copy_window_seconds):
        return CopyTradeFreshness(
            status="recent_outside_window",
            label="Fuera de ventana",
            age_seconds=age_seconds,
            copy_window_seconds=copy_window_seconds,
            is_live_candidate=False,
        )
    return CopyTradeFreshness(
        status="historical",
        label="Historico",
        age_seconds=age_seconds,
        copy_window_seconds=copy_window_seconds,
        is_live_candidate=False,
    )


def build_copy_wallet_read(
    wallet: CopyWallet,
    *,
    now: datetime | None = None,
    detected_trades: list[CopyDetectedTrade] | None = None,
) -> CopyWalletRead:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    trades = list(detected_trades or wallet.detected_trades)
    orders = list(wallet.orders)
    recent_trades = 0
    historical_trades = 0
    live_candidates = 0
    demo_copied_count = 0
    demo_buy_count = 0
    demo_sell_count = 0
    demo_skipped_count = 0
    last_demo_copy_at = None
    last_demo_copy_action = None
    last_demo_copy_amount_usd = None
    last_trade_freshness_status = None
    last_trade_freshness_label = None

    for trade in trades:
        freshness = classify_trade_freshness(
            source_timestamp=trade.source_timestamp,
            copy_window_seconds=wallet.max_delay_seconds,
            reference_time=current_time,
        )
        if freshness.status == "historical":
            historical_trades += 1
        elif freshness.status in {"live_candidate", "recent_outside_window"}:
            recent_trades += 1
        if freshness.status == "live_candidate":
            live_candidates += 1

    if trades:
        latest_trade = max(trades, key=lambda trade: _trade_sort_time(trade))
        latest_freshness = classify_trade_freshness(
            source_timestamp=latest_trade.source_timestamp,
            copy_window_seconds=wallet.max_delay_seconds,
            reference_time=current_time,
        )
        last_trade_freshness_status = latest_freshness.status
        last_trade_freshness_label = latest_freshness.label

    for order in orders:
        if order.mode != "demo":
            continue
        if order.status == "simulated":
            demo_copied_count += 1
            if order.action == "buy":
                demo_buy_count += 1
            elif order.action == "sell":
                demo_sell_count += 1
            order_created_at = _normalize_datetime(order.created_at)
            if last_demo_copy_at is None or order_created_at >= _normalize_datetime(last_demo_copy_at):
                last_demo_copy_at = order.created_at
                last_demo_copy_action = order.action
                last_demo_copy_amount_usd = order.intended_amount_usd
        elif order.status == "skipped":
            demo_skipped_count += 1

    return CopyWalletRead(
        id=wallet.id,
        label=wallet.label,
        profile_url=wallet.profile_url,
        proxy_wallet=wallet.proxy_wallet,
        enabled=wallet.enabled,
        mode=wallet.mode,
        real_trading_enabled=wallet.real_trading_enabled,
        copy_buys=wallet.copy_buys,
        copy_sells=wallet.copy_sells,
        copy_amount_mode=wallet.copy_amount_mode,
        copy_amount_usd=wallet.copy_amount_usd,
        max_trade_usd=wallet.max_trade_usd,
        max_daily_usd=wallet.max_daily_usd,
        max_slippage_bps=wallet.max_slippage_bps,
        max_delay_seconds=wallet.max_delay_seconds,
        copy_window_seconds=wallet.max_delay_seconds,
        sports_only=wallet.sports_only,
        last_scan_at=wallet.last_scan_at,
        last_trade_at=wallet.last_trade_at,
        recent_trades=recent_trades,
        historical_trades=historical_trades,
        live_candidates=live_candidates,
        demo_copied_count=demo_copied_count,
        demo_buy_count=demo_buy_count,
        demo_sell_count=demo_sell_count,
        demo_skipped_count=demo_skipped_count,
        last_demo_copy_at=last_demo_copy_at,
        last_demo_copy_action=last_demo_copy_action,
        last_demo_copy_amount_usd=last_demo_copy_amount_usd,
        last_trade_freshness_status=last_trade_freshness_status,
        last_trade_freshness_label=last_trade_freshness_label,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


def build_copy_trade_read(
    trade: CopyDetectedTrade,
    *,
    copy_window_seconds: int | None,
    now: datetime | None = None,
) -> CopyDetectedTradeRead:
    freshness = classify_trade_freshness(
        source_timestamp=trade.source_timestamp,
        copy_window_seconds=copy_window_seconds,
        reference_time=now,
    )
    return CopyDetectedTradeRead(
        id=trade.id,
        wallet_id=trade.wallet_id,
        source_transaction_hash=trade.source_transaction_hash,
        dedupe_key=trade.dedupe_key,
        source_proxy_wallet=trade.source_proxy_wallet,
        condition_id=trade.condition_id,
        asset=trade.asset,
        outcome=trade.outcome,
        market_title=trade.market_title,
        market_slug=trade.market_slug,
        side=trade.side,
        source_price=trade.source_price,
        source_size=trade.source_size,
        source_amount_usd=trade.source_amount_usd,
        source_timestamp=trade.source_timestamp,
        detected_at=trade.detected_at,
        age_seconds=freshness.age_seconds,
        freshness_status=freshness.status,
        freshness_label=freshness.label,
        copy_window_seconds=freshness.copy_window_seconds,
        is_live_candidate=freshness.is_live_candidate,
    )


def build_copy_order_read(
    order: CopyOrder,
    *,
    copy_window_seconds: int | None,
    source_timestamp: datetime | None,
    now: datetime | None = None,
) -> CopyOrderRead:
    freshness = classify_trade_freshness(
        source_timestamp=source_timestamp,
        copy_window_seconds=copy_window_seconds,
        reference_time=now,
    ) if source_timestamp is not None or copy_window_seconds is not None else None

    return CopyOrderRead(
        id=order.id,
        wallet_id=order.wallet_id,
        detected_trade_id=order.detected_trade_id,
        mode=order.mode,
        action=order.action,
        status=order.status,
        reason=order.reason,
        intended_amount_usd=order.intended_amount_usd,
        intended_size=order.intended_size,
        limit_price=order.limit_price,
        simulated_price=order.simulated_price,
        filled_price=order.filled_price,
        filled_size=order.filled_size,
        polymarket_order_id=order.polymarket_order_id,
        freshness_status=freshness.status if freshness else None,
        freshness_label=freshness.label if freshness else None,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _validate_copy_amount(copy_amount_mode: str, amount: Decimal) -> None:
    if amount <= 0:
        raise InvalidCopyWalletInputError("El monto por trade debe ser positivo.")
    if copy_amount_mode == "preset" and amount not in COPY_AMOUNT_PRESETS:
        raise InvalidCopyWalletInputError("Los presets validos son 1, 5, 10 o 20 USD.")


def _safe_profile_url(raw_value: str) -> str | None:
    try:
        from urllib.parse import urlparse

        parsed = urlparse(raw_value)
    except Exception:
        return None
    if parsed.scheme != "https":
        return None
    if parsed.netloc.lower() not in {"polymarket.com", "www.polymarket.com"}:
        return None
    return raw_value[:1024]


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _historical_cutoff_seconds(copy_window_seconds: int) -> int:
    return max(copy_window_seconds * 3, 60)


def _trade_sort_time(trade: CopyDetectedTrade) -> datetime:
    return _normalize_datetime(trade.source_timestamp or trade.detected_at)
