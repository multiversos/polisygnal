from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import PolymarketClientError, PolymarketGammaClient, PolymarketMarketDetailsPayload
from app.models.copy_trading import CopyDemoPosition
from app.models.market import Market
from app.repositories.market_outcomes import get_market_outcome
from app.schemas.copy_trading import (
    CopyTradingDemoSettlementPositionResult,
    CopyTradingDemoSettlementResponse,
    CopyTradingDemoSettlementSummary,
)
from app.services.copy_trading_service import add_copy_event

USD_QUANT = Decimal("0.01")
OPEN_DEMO_STATUSES = ("open", "waiting_resolution", "unknown_resolution")
CANCELLED_OUTCOMES = {"cancelled", "invalid"}


def settle_open_demo_positions(
    db: Session,
    *,
    gamma_client: PolymarketGammaClient | None = None,
    now: datetime | None = None,
    limit: int | None = 25,
) -> CopyTradingDemoSettlementResponse:
    current_time = now or datetime.now(tz=UTC)
    positions = _list_settleable_demo_positions(db, limit=limit)
    market_cache: dict[tuple[str, str], Market | None] = {}
    remote_cache: dict[tuple[str, str], PolymarketMarketDetailsPayload | None] = {}
    summary = CopyTradingDemoSettlementSummary()
    results: list[CopyTradingDemoSettlementPositionResult] = []

    for position in positions:
        summary.checked_positions += 1
        previous_status = position.status
        try:
            with db.begin_nested():
                result_bucket, result_reason = _settle_single_position(
                    db,
                    position=position,
                    gamma_client=gamma_client,
                    market_cache=market_cache,
                    remote_cache=remote_cache,
                    current_time=current_time,
                )
        except Exception:
            db.refresh(position)
            summary.errors += 1
            results.append(
                CopyTradingDemoSettlementPositionResult(
                    position_id=position.id,
                    wallet_alias=position.wallet.label if position.wallet is not None else None,
                    market_title=position.market_title,
                    outcome=position.outcome,
                    previous_status=previous_status,  # type: ignore[arg-type]
                    new_status=position.status,  # type: ignore[arg-type]
                    close_reason=position.close_reason,
                    realized_pnl_usd=position.realized_pnl_usd,
                    resolution_source=position.resolution_source,
                    reason="No pudimos revisar esta posicion ahora.",
                )
            )
            continue
        _increment_summary(summary, result_bucket)
        results.append(
            _build_result(
                position,
                previous_status=previous_status,
                reason=result_reason,
            )
        )
    return CopyTradingDemoSettlementResponse(summary=summary, positions=results, ran_at=current_time)


def _settle_single_position(
    db: Session,
    *,
    position: CopyDemoPosition,
    gamma_client: PolymarketGammaClient | None,
    market_cache: dict[tuple[str, str], Market | None],
    remote_cache: dict[tuple[str, str], PolymarketMarketDetailsPayload | None],
    current_time: datetime,
) -> tuple[str, str]:
    market = _find_local_market(db, position=position, cache=market_cache)
    remote_market = _find_remote_market(
        position=position,
        gamma_client=gamma_client,
        cache=remote_cache,
    )
    outcome = get_market_outcome(db, market.id) if market is not None else None
    resolution_source = outcome.resolution_source if outcome is not None else None

    if outcome is not None and outcome.resolved_outcome in {"yes", "no"}:
        settlement_side = _resolve_position_side(position=position, market=market, remote_market=remote_market)
        if settlement_side is None:
            _mark_unknown_resolution(
                db,
                position=position,
                resolution_source=resolution_source,
                current_time=current_time,
            )
            return (
                "unknown_resolution",
                "Resultado no confiable: no pudimos mapear el outcome de la posicion.",
            )

        _close_for_market_resolution(
            db,
            position=position,
            resolved_outcome=outcome.resolved_outcome,
            position_side=settlement_side,
            resolution_source=resolution_source,
            current_time=current_time,
        )
        return ("closed_by_market_resolution", "Mercado resuelto con resultado confiable.")

    if outcome is not None and outcome.resolved_outcome in CANCELLED_OUTCOMES:
        _cancel_position(
            db,
            position=position,
            resolution_source=resolution_source,
            current_time=current_time,
        )
        return (
            "cancelled",
            "Mercado cancelado o invalido. En demo devolvemos el capital sin inventar PnL.",
        )

    if outcome is not None and outcome.resolved_outcome == "unknown":
        _mark_unknown_resolution(
            db,
            position=position,
            resolution_source=resolution_source,
            current_time=current_time,
        )
        return ("unknown_resolution", "La fuente de resolucion devolvio un resultado no confiable.")

    if _market_is_expired_or_closed(
        market=market,
        remote_market=remote_market,
        current_time=current_time,
    ):
        _mark_waiting_resolution(
            db,
            position=position,
            resolution_source=resolution_source or _source_label_for_remote(remote_market),
            current_time=current_time,
        )
        return (
            "waiting_resolution",
            "Mercado vencido o cerrado sin resultado confiable todavia.",
        )

    if market is None and remote_market is None and not position.condition_id and not position.market_slug:
        _mark_still_open(
            db,
            position=position,
            resolution_source=resolution_source,
            current_time=current_time,
        )
        return (
            "still_open",
            "Faltan identificadores suficientes para revisar la resolucion. La posicion demo sigue abierta por seguridad.",
        )

    _mark_still_open(
        db,
        position=position,
        resolution_source=resolution_source or _source_label_for_remote(remote_market),
        current_time=current_time,
    )
    return ("still_open", "Mercado todavia activo. La posicion demo sigue abierta.")


def _increment_summary(summary: CopyTradingDemoSettlementSummary, bucket: str) -> None:
    if bucket == "closed_by_market_resolution":
        summary.closed_by_market_resolution += 1
    elif bucket == "waiting_resolution":
        summary.waiting_resolution += 1
    elif bucket == "still_open":
        summary.still_open += 1
    elif bucket == "cancelled":
        summary.cancelled += 1
    elif bucket == "unknown_resolution":
        summary.unknown_resolution += 1


def _list_settleable_demo_positions(db: Session, *, limit: int | None) -> list[CopyDemoPosition]:
    stmt = (
        select(CopyDemoPosition)
        .options(joinedload(CopyDemoPosition.wallet))
        .where(CopyDemoPosition.status.in_(OPEN_DEMO_STATUSES))
        .order_by(CopyDemoPosition.opened_at.asc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())


def _find_local_market(
    db: Session,
    *,
    position: CopyDemoPosition,
    cache: dict[tuple[str, str], Market | None],
) -> Market | None:
    if position.condition_id:
        cache_key = ("condition_id", position.condition_id)
        if cache_key in cache:
            return cache[cache_key]
        market = db.scalar(
            select(Market)
            .options(joinedload(Market.outcome))
            .where(Market.condition_id == position.condition_id)
            .limit(1)
        )
        cache[cache_key] = market
        if market is not None:
            return market
    if position.market_slug:
        cache_key = ("slug", position.market_slug)
        if cache_key in cache:
            return cache[cache_key]
        market = db.scalar(
            select(Market)
            .options(joinedload(Market.outcome))
            .where(Market.slug == position.market_slug)
            .limit(1)
        )
        cache[cache_key] = market
        return market
    return None


def _find_remote_market(
    *,
    position: CopyDemoPosition,
    gamma_client: PolymarketGammaClient | None,
    cache: dict[tuple[str, str], PolymarketMarketDetailsPayload | None],
) -> PolymarketMarketDetailsPayload | None:
    if gamma_client is None:
        return None
    if position.condition_id:
        key = ("condition_id", position.condition_id)
        if key not in cache:
            try:
                cache[key] = gamma_client.fetch_market_by_condition_id(position.condition_id)
            except PolymarketClientError:
                cache[key] = None
        if cache[key] is not None:
            return cache[key]
    if position.market_slug:
        key = ("slug", position.market_slug)
        if key not in cache:
            try:
                cache[key] = gamma_client.fetch_market_by_slug(position.market_slug)
            except PolymarketClientError:
                cache[key] = None
        return cache[key]
    return None


def _market_is_expired_or_closed(
    *,
    market: Market | None,
    remote_market: PolymarketMarketDetailsPayload | None,
    current_time: datetime,
) -> bool:
    end_date = None
    if remote_market is not None and remote_market.end_date is not None:
        end_date = _ensure_utc(remote_market.end_date)
    elif market is not None and market.end_date is not None:
        end_date = _ensure_utc(market.end_date)

    closed = None
    if remote_market is not None and remote_market.closed is not None:
        closed = remote_market.closed
    elif market is not None:
        closed = market.closed

    active = None
    if remote_market is not None and remote_market.active is not None:
        active = remote_market.active
    elif market is not None:
        active = market.active

    if closed is True or active is False:
        return True
    return end_date is not None and end_date <= current_time


def _resolve_position_side(
    *,
    position: CopyDemoPosition,
    market: Market | None,
    remote_market: PolymarketMarketDetailsPayload | None,
) -> str | None:
    normalized_outcome = _normalize_binary_outcome(position.outcome)
    if normalized_outcome is not None:
        return normalized_outcome

    if market is not None:
        side = _resolve_token_side(
            asset=position.asset,
            yes_token_id=market.yes_token_id,
            no_token_id=market.no_token_id,
            outcome_tokens=market.outcome_tokens or [],
        )
        if side is not None:
            return side

    if remote_market is not None:
        outcome_tokens = remote_market.outcome_tokens or []
        yes_token_id = remote_market.clob_token_ids[0] if len(remote_market.clob_token_ids) > 0 else None
        no_token_id = remote_market.clob_token_ids[1] if len(remote_market.clob_token_ids) > 1 else None
        side = _resolve_token_side(
            asset=position.asset,
            yes_token_id=yes_token_id,
            no_token_id=no_token_id,
            outcome_tokens=outcome_tokens,
        )
        if side is not None:
            return side
    return None


def _resolve_token_side(
    *,
    asset: str | None,
    yes_token_id: str | None,
    no_token_id: str | None,
    outcome_tokens: Iterable[dict[str, object]],
) -> str | None:
    if asset is None:
        return None
    if yes_token_id is not None and asset == yes_token_id:
        return "yes"
    if no_token_id is not None and asset == no_token_id:
        return "no"
    for token in outcome_tokens:
        token_id = _safe_text(token.get("token_id") or token.get("tokenId") or token.get("id"))
        if token_id != asset:
            continue
        return _normalize_binary_outcome(token.get("outcome") or token.get("name"))
    return None


def _close_for_market_resolution(
    db: Session,
    *,
    position: CopyDemoPosition,
    resolved_outcome: str,
    position_side: str,
    resolution_source: str | None,
    current_time: datetime,
) -> None:
    won = position_side == resolved_outcome
    exit_price = Decimal("1.00") if won else Decimal("0.00")
    exit_value_usd = _quantize_usd(position.entry_size * exit_price)
    realized_pnl_usd = _quantize_usd(exit_value_usd - position.entry_amount_usd)
    previous_status = position.status
    position.exit_price = exit_price
    position.exit_value_usd = exit_value_usd
    position.realized_pnl_usd = realized_pnl_usd
    position.close_reason = "market_resolved"
    position.status = "closed"
    position.closed_at = current_time
    position.resolution_source = resolution_source or "local_market_outcome"
    db.add(position)
    db.flush()
    if previous_status != "closed":
        add_copy_event(
            db,
            wallet_id=position.wallet_id,
            level="info",
            event_type="demo_position_closed_market_resolution",
            message="Copia demo cerrada por resolucion del mercado.",
            metadata={
                "position_id": position.id,
                "resolution_source": position.resolution_source,
                "realized_pnl_usd": str(position.realized_pnl_usd),
            },
        )


def _cancel_position(
    db: Session,
    *,
    position: CopyDemoPosition,
    resolution_source: str | None,
    current_time: datetime,
) -> None:
    previous_status = position.status
    position.exit_price = position.entry_price
    position.exit_value_usd = position.entry_amount_usd
    position.realized_pnl_usd = Decimal("0.00")
    position.close_reason = "market_cancelled"
    position.status = "cancelled"
    position.closed_at = current_time
    position.resolution_source = resolution_source or "local_market_outcome"
    db.add(position)
    db.flush()
    if previous_status != "cancelled":
        add_copy_event(
            db,
            wallet_id=position.wallet_id,
            level="warning",
            event_type="demo_position_cancelled_market_resolution",
            message="Mercado cancelado o invalido. La posicion demo se devolvio sin PnL inventado.",
            metadata={"position_id": position.id, "resolution_source": position.resolution_source},
        )


def _mark_waiting_resolution(
    db: Session,
    *,
    position: CopyDemoPosition,
    resolution_source: str | None,
    current_time: datetime,
) -> None:
    previous_status = position.status
    position.status = "waiting_resolution"
    position.close_reason = "market_expired_waiting_resolution"
    position.resolution_source = resolution_source
    position.closed_at = None
    db.add(position)
    db.flush()
    if previous_status != "waiting_resolution":
        add_copy_event(
            db,
            wallet_id=position.wallet_id,
            level="warning",
            event_type="demo_position_waiting_resolution",
            message="La posicion demo quedo esperando resolucion del mercado.",
            metadata={"position_id": position.id, "resolution_source": position.resolution_source},
        )


def _mark_unknown_resolution(
    db: Session,
    *,
    position: CopyDemoPosition,
    resolution_source: str | None,
    current_time: datetime,
) -> None:
    previous_status = position.status
    position.status = "unknown_resolution"
    position.close_reason = "no_reliable_resolution"
    position.resolution_source = resolution_source
    position.closed_at = None
    db.add(position)
    db.flush()
    if previous_status != "unknown_resolution":
        add_copy_event(
            db,
            wallet_id=position.wallet_id,
            level="warning",
            event_type="demo_position_unknown_resolution",
            message="No pudimos confirmar un resultado confiable para esta posicion demo.",
            metadata={"position_id": position.id, "resolution_source": position.resolution_source},
        )


def _mark_still_open(
    db: Session,
    *,
    position: CopyDemoPosition,
    resolution_source: str | None,
    current_time: datetime,
) -> None:
    if position.status != "open" or position.close_reason is not None or position.resolution_source != resolution_source:
        position.status = "open"
        position.close_reason = None
        position.resolution_source = resolution_source
        position.closed_at = None
        db.add(position)
        db.flush()


def _build_result(
    position: CopyDemoPosition,
    *,
    previous_status: str,
    reason: str,
) -> CopyTradingDemoSettlementPositionResult:
    return CopyTradingDemoSettlementPositionResult(
        position_id=position.id,
        wallet_alias=position.wallet.label if position.wallet is not None else None,
        market_title=position.market_title,
        outcome=position.outcome,
        previous_status=previous_status,  # type: ignore[arg-type]
        new_status=position.status,  # type: ignore[arg-type]
        close_reason=position.close_reason,
        realized_pnl_usd=position.realized_pnl_usd,
        resolution_source=position.resolution_source,
        reason=reason,
    )


def _normalize_binary_outcome(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in {"yes", "y", "true", "up"}:
        return "yes"
    if normalized in {"no", "n", "false", "down"}:
        return "no"
    return None


def _source_label_for_remote(remote_market: PolymarketMarketDetailsPayload | None) -> str | None:
    if remote_market is None:
        return None
    return "polymarket_gamma_read_only"


def _safe_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _quantize_usd(value: Decimal) -> Decimal:
    return value.quantize(USD_QUANT, rounding=ROUND_HALF_UP)
