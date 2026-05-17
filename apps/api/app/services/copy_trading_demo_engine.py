from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.polymarket_data import PolymarketDataClient, PolymarketDataClientError
from app.models.copy_trading import CopyWallet
from app.schemas.copy_trading import CopyTradingTickResponse
from app.services.copy_trading_risk_rules import CopyTradeForRules, evaluate_demo_trade
from app.services.copy_trading_demo_positions import close_demo_position_for_sell, open_demo_position
from app.services.copy_trading_service import (
    add_copy_event,
    classify_trade_freshness,
    create_copy_order,
    create_detected_trade,
    get_copy_wallet,
    touch_wallet_scan,
)


class PublicWalletTradeReader(Protocol):
    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0) -> list[object]:
        ...


@dataclass(slots=True)
class NormalizedCopyTrade:
    transaction_hash: str | None
    dedupe_key: str
    proxy_wallet: str
    condition_id: str | None
    asset: str | None
    outcome: str | None
    market_title: str | None
    market_slug: str | None
    side: str | None
    price: Decimal | None
    size: Decimal | None
    amount_usd: Decimal | None
    timestamp: datetime | None
    raw_payload: dict[str, object]


def scan_copy_wallet(
    db: Session,
    *,
    wallet_id: str,
    data_client: PublicWalletTradeReader,
    limit: int = 50,
    now: datetime | None = None,
    emit_individual_skip_events: bool = True,
    live_scan: bool = False,
) -> CopyTradingTickResponse:
    wallet = get_copy_wallet(db, wallet_id)
    response = CopyTradingTickResponse(wallets_scanned=1)
    _scan_wallet(
        db,
        wallet=wallet,
        data_client=data_client,
        limit=limit,
        now=now,
        response=response,
        emit_individual_skip_events=emit_individual_skip_events,
        live_scan=live_scan,
    )
    return response


def run_demo_tick(
    db: Session,
    *,
    data_client: PolymarketDataClient,
    limit: int = 50,
    now: datetime | None = None,
    emit_individual_skip_events: bool = True,
    live_scan: bool = False,
) -> CopyTradingTickResponse:
    wallets = list(
        db.scalars(
            select(CopyWallet)
            .where(CopyWallet.enabled.is_(True))
            .where(CopyWallet.mode == "demo")
            .order_by(CopyWallet.updated_at.desc())
        ).all()
    )
    response = CopyTradingTickResponse()
    for wallet in wallets:
        response.wallets_scanned += 1
        _scan_wallet(
            db,
            wallet=wallet,
            data_client=data_client,
            limit=limit,
            now=now,
            response=response,
            emit_individual_skip_events=emit_individual_skip_events,
            live_scan=live_scan,
        )
    return response


def normalize_public_trade(raw_trade: object, fallback_wallet: str) -> NormalizedCopyTrade:
    payload = _trade_payload(raw_trade)
    proxy_wallet = _optional_text(payload.get("proxy_wallet") or payload.get("proxyWallet")) or fallback_wallet
    side = _normalize_side(payload.get("side"))
    price = _parse_decimal(payload.get("price"))
    size = _parse_decimal(payload.get("size"))
    amount_usd = price * size if price is not None and size is not None else None
    transaction_hash = _optional_text(payload.get("transaction_hash") or payload.get("transactionHash"))
    condition_id = _optional_text(payload.get("condition_id") or payload.get("conditionId"))
    asset = _optional_text(payload.get("asset"))
    outcome = _optional_text(payload.get("outcome"))
    timestamp = _parse_timestamp(payload.get("timestamp"))
    market_slug = _optional_text(payload.get("slug") or payload.get("market_slug") or payload.get("marketSlug"))
    market_title = _optional_text(payload.get("title") or payload.get("market_title") or payload.get("marketTitle"))
    dedupe_key = _build_dedupe_key(
        transaction_hash=transaction_hash,
        proxy_wallet=proxy_wallet,
        condition_id=condition_id,
        asset=asset,
        side=side,
        timestamp=timestamp,
        price=price,
        size=size,
    )
    return NormalizedCopyTrade(
        transaction_hash=transaction_hash,
        dedupe_key=dedupe_key,
        proxy_wallet=proxy_wallet.lower(),
        condition_id=condition_id,
        asset=asset,
        outcome=outcome,
        market_title=market_title,
        market_slug=market_slug,
        side=side,
        price=price,
        size=size,
        amount_usd=amount_usd,
        timestamp=timestamp,
        raw_payload=_sanitize_payload(payload),
    )


def _scan_wallet(
    db: Session,
    *,
    wallet: CopyWallet,
    data_client: PublicWalletTradeReader,
    limit: int,
    now: datetime | None,
    response: CopyTradingTickResponse,
    emit_individual_skip_events: bool,
    live_scan: bool,
) -> None:
    current_time = now or datetime.now(tz=UTC)
    grouped_skips: dict[tuple[str, str], int] = {}
    grouped_ignored_before_tracking = 0
    try:
        raw_trades = data_client.get_trades_for_user(wallet.proxy_wallet, limit=limit, offset=0)
    except PolymarketDataClientError as exc:
        _record_scan_error(db, wallet=wallet, response=response, message=str(exc))
        touch_wallet_scan(db, wallet, now=current_time)
        return
    except Exception:
        _record_scan_error(db, wallet=wallet, response=response, message="No se pudo leer actividad publica.")
        touch_wallet_scan(db, wallet, now=current_time)
        return

    response.trades_detected += len(raw_trades)
    for raw_trade in raw_trades:
        normalized = normalize_public_trade(raw_trade, wallet.proxy_wallet)
        if _is_trade_before_tracking_started(wallet, normalized.timestamp):
            grouped_ignored_before_tracking += 1
            continue
        freshness = classify_trade_freshness(
            source_timestamp=normalized.timestamp,
            copy_window_seconds=wallet.max_delay_seconds,
            reference_time=current_time,
        )
        if normalized.side not in {"buy", "sell"}:
            intent = evaluate_demo_trade(
                wallet,
                CopyTradeForRules(side=normalized.side, price=normalized.price, timestamp=normalized.timestamp),
                now=current_time,
            )
            create_copy_order(
                db,
                wallet=wallet,
                trade=None,
                action="buy",
                status=intent.status,
                reason=intent.reason,
            )
            response.orders_skipped += 1
            _record_skipped_reason(response, intent.reason)
            continue

        trade = create_detected_trade(
            db,
            wallet=wallet,
            source_transaction_hash=normalized.transaction_hash,
            dedupe_key=normalized.dedupe_key,
            source_proxy_wallet=normalized.proxy_wallet,
            condition_id=normalized.condition_id,
            asset=normalized.asset,
            outcome=normalized.outcome,
            market_title=normalized.market_title,
            market_slug=normalized.market_slug,
            side=normalized.side,
            source_price=normalized.price,
            source_size=normalized.size,
            source_amount_usd=normalized.amount_usd,
            source_timestamp=normalized.timestamp,
            raw_payload=normalized.raw_payload,
            detected_at=current_time,
        )
        if trade is None:
            continue
        response.new_trades += 1
        _record_trade_freshness(response, freshness.status)

        if freshness.status in {"recent_outside_window", "historical"}:
            response.orders_skipped += 1
            _record_skipped_reason(response, "trade_too_old")
            grouped_skips[("trade_too_old", freshness.status)] = (
                grouped_skips.get(("trade_too_old", freshness.status), 0) + 1
            )
            continue

        intent = evaluate_demo_trade(
            wallet,
            CopyTradeForRules(side=normalized.side, price=normalized.price, timestamp=normalized.timestamp),
            now=current_time,
        )
        order = create_copy_order(
            db,
            wallet=wallet,
            trade=trade,
            action=normalized.side,
            status=intent.status,
            reason=intent.reason,
            intended_amount_usd=intent.intended_amount_usd,
            intended_size=intent.intended_size,
            simulated_price=intent.simulated_price,
        )
        if order.status == "simulated":
            response.orders_simulated += 1
            if order.action == "buy":
                response.buy_simulated += 1
                open_demo_position(
                    db,
                    wallet=wallet,
                    order=order,
                    trade=trade,
                    opened_at=current_time,
                )
            elif order.action == "sell":
                response.sell_simulated += 1
                close_demo_position_for_sell(
                    db,
                    wallet=wallet,
                    order=order,
                    trade=trade,
                    closed_at=current_time,
                )
            add_copy_event(
                db,
                wallet_id=wallet.id,
                level="info",
                event_type="demo_order_simulated",
                message="Orden demo simulada con monto fijo configurado.",
                metadata={"order_id": order.id, "amount_usd": str(order.intended_amount_usd)},
            )
        elif order.status == "blocked":
            response.orders_blocked += 1
            add_copy_event(
                db,
                wallet_id=wallet.id,
                level="warning",
                event_type="real_trading_blocked",
                message="Modo real bloqueado hasta configurar credenciales.",
            )
        else:
            response.orders_skipped += 1
            _record_skipped_reason(response, order.reason)
            if emit_individual_skip_events:
                add_copy_event(
                    db,
                    wallet_id=wallet.id,
                    level="warning",
                    event_type="demo_order_skipped",
                    message="Trade detectado pero no copiado por reglas de seguridad.",
                    metadata={
                        "reason": order.reason or "unknown",
                        "freshness_status": freshness.status,
                    },
                )
            else:
                grouped_skips[(order.reason or "unknown", freshness.status)] = (
                grouped_skips.get((order.reason or "unknown", freshness.status), 0) + 1
                )
    if grouped_ignored_before_tracking > 0:
        _emit_grouped_ignored_before_tracking_event(
            db,
            wallet=wallet,
            count=grouped_ignored_before_tracking,
        )
    if not emit_individual_skip_events:
        _emit_grouped_skip_events(db, wallet=wallet, grouped_skips=grouped_skips)
    touch_wallet_scan(db, wallet, now=current_time)


def _record_trade_freshness(response: CopyTradingTickResponse, status: str) -> None:
    if status == "live_candidate":
        response.live_candidates += 1
    elif status == "recent_outside_window":
        response.recent_outside_window += 1
    elif status == "historical":
        response.historical_trades += 1


def _record_skipped_reason(response: CopyTradingTickResponse, reason: str | None) -> None:
    safe_reason = reason or "unknown"
    response.skipped_reasons[safe_reason] = response.skipped_reasons.get(safe_reason, 0) + 1


def _record_scan_error(
    db: Session,
    *,
    wallet: CopyWallet,
    response: CopyTradingTickResponse,
    message: str,
) -> None:
    safe_message = message.lower()
    if "timeout" in safe_message or "timed out" in safe_message or "readtimeout" in safe_message:
        response.errors.append("Timeout al leer actividad publica.")
    else:
        response.errors.append("No se pudo leer actividad publica.")
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="error",
        event_type="wallet_scan_failed",
        message="No se pudo leer actividad publica de la wallet.",
        metadata={"diagnostic": message[:180]},
    )


def _emit_grouped_skip_events(
    db: Session,
    *,
    wallet: CopyWallet,
    grouped_skips: dict[tuple[str, str], int],
) -> None:
    for (reason, freshness_status), count in grouped_skips.items():
        if count <= 0:
            continue
        message = "Trades detectados pero no copiados por reglas de seguridad."
        if reason == "trade_too_old" and freshness_status == "historical":
            message = "Trades historicos detectados fuera de la ventana de copia."
        elif reason == "trade_too_old" and freshness_status == "recent_outside_window":
            message = "Trades recientes detectados fuera de la ventana de copia."
        add_copy_event(
            db,
            wallet_id=wallet.id,
            level="warning",
            event_type="demo_order_skipped_grouped",
            message=message,
            metadata={
                "count": count,
                "freshness_status": freshness_status,
                "reason": reason,
            },
        )


def _emit_grouped_ignored_before_tracking_event(
    db: Session,
    *,
    wallet: CopyWallet,
    count: int,
) -> None:
    if count <= 0:
        return
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="copy_trade_ignored_before_tracking",
        message="Trades anteriores al inicio de seguimiento fueron ignorados.",
        metadata={"count": count, "reason": "before_tracking_started"},
    )


def _trade_payload(raw_trade: object) -> dict[str, object]:
    if isinstance(raw_trade, dict):
        return dict(raw_trade)
    if hasattr(raw_trade, "model_dump"):
        return raw_trade.model_dump(by_alias=True, mode="json")
    payload: dict[str, object] = {}
    for key in (
        "proxy_wallet",
        "proxyWallet",
        "side",
        "asset",
        "condition_id",
        "conditionId",
        "size",
        "price",
        "timestamp",
        "title",
        "slug",
        "outcome",
        "transaction_hash",
        "transactionHash",
    ):
        if hasattr(raw_trade, key):
            payload[key] = getattr(raw_trade, key)
    return payload


def _normalize_side(value: object) -> str | None:
    if value is None:
        return None
    side = str(value).strip().lower()
    if side in {"buy", "bought", "yes_buy"}:
        return "buy"
    if side in {"sell", "sold", "yes_sell"}:
        return "sell"
    return None


def _build_dedupe_key(
    *,
    transaction_hash: str | None,
    proxy_wallet: str,
    condition_id: str | None,
    asset: str | None,
    side: str | None,
    timestamp: datetime | None,
    price: Decimal | None,
    size: Decimal | None,
) -> str:
    if transaction_hash:
        return transaction_hash.lower()
    parts = [
        proxy_wallet.lower(),
        condition_id or "",
        asset or "",
        side or "unknown",
        timestamp.isoformat() if timestamp else "",
        str(price or ""),
        str(size or ""),
    ]
    return ":".join(parts)


def _sanitize_payload(payload: dict[str, object]) -> dict[str, object]:
    allowed_keys = {
        "proxy_wallet",
        "proxyWallet",
        "side",
        "asset",
        "condition_id",
        "conditionId",
        "size",
        "price",
        "timestamp",
        "title",
        "slug",
        "outcome",
        "transaction_hash",
        "transactionHash",
    }
    return {key: value for key, value in payload.items() if key in allowed_keys}


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        parsed = Decimal(str(value))
    except Exception:
        return None
    return parsed if parsed.is_finite() else None


def _parse_timestamp(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, tz=UTC)
    if isinstance(value, str):
        raw_value = value.strip()
        if not raw_value:
            return None
        try:
            return datetime.fromtimestamp(float(raw_value), tz=UTC)
        except Exception:
            try:
                parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
            except ValueError:
                return None
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
    return None


def _is_trade_before_tracking_started(wallet: CopyWallet, timestamp: datetime | None) -> bool:
    if timestamp is None or wallet.created_at is None:
        return False
    trade_time = timestamp if timestamp.tzinfo is not None else timestamp.replace(tzinfo=UTC)
    tracking_started_at = (
        wallet.created_at if wallet.created_at.tzinfo is not None else wallet.created_at.replace(tzinfo=UTC)
    )
    return trade_time < tracking_started_at
