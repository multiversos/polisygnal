from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Select, or_, select, text
from sqlalchemy.orm import Session, joinedload

from app.models.copy_trading import CopyDemoPosition, CopyDetectedTrade, CopyWallet
from app.services.copy_trading_demo_positions import close_demo_position_for_sell
from app.services.copy_trading_service import add_copy_event, create_copy_order


@dataclass(slots=True)
class DemoExitReconciliationSample:
    position_id: str
    wallet_id: str
    wallet_label: str | None
    market_title: str | None
    condition_id: str | None
    asset: str | None
    outcome: str | None
    opened_at: datetime
    matched_trade_id: str
    matched_trade_timestamp: datetime | None
    matched_trade_price: str | None
    close_reason: str


@dataclass(slots=True)
class DemoExitReconciliationSummary:
    dry_run: bool
    applied: bool
    total_open_positions: int
    positions_with_matching_sell: int
    positions_without_sell: int
    positions_missing_price: int
    would_close_count: int
    closed_count: int
    errors: int
    sample: list[dict[str, object]]


@dataclass(slots=True)
class OpenDemoPositionSnapshot:
    id: str
    wallet_id: str
    wallet: CopyWallet | None
    condition_id: str | None
    asset: str | None
    outcome: str | None
    market_title: str | None
    market_slug: str | None
    entry_amount_usd: Decimal
    entry_size: Decimal
    opened_at: datetime
    status: str


def reconcile_open_demo_positions(
    db: Session,
    *,
    dry_run: bool = True,
    apply: bool = False,
    confirmed: bool = False,
    limit: int = 250,
    sample_limit: int = 10,
    now: datetime | None = None,
) -> DemoExitReconciliationSummary:
    if apply and not confirmed:
        raise ValueError("apply requiere confirmacion explicita.")

    current_time = now or datetime.now(tz=UTC)
    open_positions = _load_open_positions_for_reconciliation(db, limit=limit, dry_run=dry_run or not apply)

    positions_with_matching_sell = 0
    positions_missing_price = 0
    positions_without_sell = 0
    would_close_count = 0
    closed_count = 0
    errors = 0
    sample: list[dict[str, object]] = []

    for position in open_positions:
        matched_trade = find_matching_sell_trade_for_position(db, position=position)
        if matched_trade is None:
            positions_without_sell += 1
            continue

        positions_with_matching_sell += 1
        if matched_trade.source_price is None or matched_trade.source_price <= 0:
            positions_missing_price += 1
            continue

        would_close_count += 1
        if len(sample) < sample_limit:
            sample.append(
                asdict(
                    DemoExitReconciliationSample(
                        position_id=position.id,
                        wallet_id=position.wallet_id,
                        wallet_label=position.wallet.label if position.wallet is not None else None,
                        market_title=position.market_title,
                        condition_id=position.condition_id,
                        asset=position.asset,
                        outcome=position.outcome,
                        opened_at=_normalize_datetime(position.opened_at),
                        matched_trade_id=matched_trade.id,
                        matched_trade_timestamp=matched_trade.source_timestamp,
                        matched_trade_price=str(matched_trade.source_price),
                        close_reason="reconciled_sell",
                    )
                )
            )

        if dry_run or not apply:
            continue

        try:
            wallet = position.wallet or db.get(CopyWallet, position.wallet_id)
            if wallet is None:
                errors += 1
                continue
            order = create_copy_order(
                db,
                wallet=wallet,
                trade=matched_trade,
                action="sell",
                status="simulated",
                reason="reconciled_sell",
                intended_amount_usd=_normalize_money(position.entry_amount_usd),
                intended_size=position.entry_size,
                simulated_price=matched_trade.source_price,
            )
            closed = close_demo_position_for_sell(
                db,
                wallet=wallet,
                order=order,
                trade=matched_trade,
                position=position,
                closed_at=matched_trade.source_timestamp or current_time,
                close_reason="reconciled_sell",
            )
            if closed is None:
                errors += 1
                continue
            add_copy_event(
                db,
                wallet_id=wallet.id,
                level="info",
                event_type="demo_position_reconciled_sell",
                message="Cierre reconciliado: detectamos una venta posterior de la wallet seguida.",
                metadata={
                    "position_id": position.id,
                    "matched_trade_id": matched_trade.id,
                },
            )
            closed_count += 1
        except Exception:
            errors += 1

    return DemoExitReconciliationSummary(
        dry_run=dry_run,
        applied=apply and confirmed and not dry_run,
        total_open_positions=len(open_positions),
        positions_with_matching_sell=positions_with_matching_sell,
        positions_without_sell=positions_without_sell,
        positions_missing_price=positions_missing_price,
        would_close_count=would_close_count,
        closed_count=closed_count,
        errors=errors,
        sample=sample,
    )


def find_matching_sell_trade_for_position(
    db: Session,
    *,
    position: CopyDemoPosition | OpenDemoPositionSnapshot,
) -> CopyDetectedTrade | None:
    if not position.condition_id:
        return None

    base_stmt: Select[tuple[CopyDetectedTrade]] = (
        select(CopyDetectedTrade)
        .where(CopyDetectedTrade.wallet_id == position.wallet_id)
        .where(CopyDetectedTrade.side == "sell")
        .where(CopyDetectedTrade.condition_id == position.condition_id)
        .where(CopyDetectedTrade.source_timestamp.is_not(None))
        .where(CopyDetectedTrade.source_timestamp >= position.opened_at)
        .order_by(CopyDetectedTrade.source_timestamp.asc(), CopyDetectedTrade.detected_at.asc())
        .limit(1)
    )

    exact_stmt = _apply_trade_match_filters(base_stmt, position=position, prefer_outcome_fallback=False)
    matched = db.scalar(exact_stmt)
    if matched is not None:
        return matched

    if position.outcome is not None:
        fallback_stmt = _apply_trade_match_filters(base_stmt, position=position, prefer_outcome_fallback=True)
        return db.scalar(fallback_stmt)
    return None


def _apply_trade_match_filters(
    stmt: Select[tuple[CopyDetectedTrade]],
    *,
    position: CopyDemoPosition,
    prefer_outcome_fallback: bool,
) -> Select[tuple[CopyDetectedTrade]]:
    if prefer_outcome_fallback:
        return stmt.where(CopyDetectedTrade.outcome == position.outcome)
    if position.asset is not None:
        return stmt.where(CopyDetectedTrade.asset == position.asset)
    if position.outcome is not None:
        return stmt.where(CopyDetectedTrade.outcome == position.outcome)
    return stmt.where(
        or_(
            CopyDetectedTrade.asset.is_(None),
            CopyDetectedTrade.outcome.is_(None),
        )
    )


def _normalize_datetime(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _normalize_money(value: Decimal | None) -> Decimal | None:
    return Decimal(value) if value is not None else None


def _load_open_positions_for_reconciliation(
    db: Session,
    *,
    limit: int,
    dry_run: bool,
) -> list[CopyDemoPosition | OpenDemoPositionSnapshot]:
    if not dry_run:
        return list(
            db.scalars(
                select(CopyDemoPosition)
                .options(joinedload(CopyDemoPosition.wallet))
                .where(CopyDemoPosition.status == "open")
                .order_by(CopyDemoPosition.opened_at.asc())
                .limit(limit)
            ).all()
        )

    rows = db.execute(
        text(
            """
            select
              p.id,
              p.wallet_id,
              p.condition_id,
              p.asset,
              p.outcome,
              p.market_title,
              p.market_slug,
              p.entry_amount_usd,
              p.entry_size,
              p.opened_at,
              p.status,
              w.label as wallet_label,
              w.proxy_wallet
            from copy_demo_positions p
            left join copy_wallets w on w.id = p.wallet_id
            where p.status = 'open'
            order by p.opened_at asc
            limit :limit
            """
        ),
        {"limit": limit},
    ).mappings()

    snapshots: list[OpenDemoPositionSnapshot] = []
    for row in rows:
        wallet = CopyWallet(
            id=row["wallet_id"],
            label=row["wallet_label"],
            proxy_wallet=row["proxy_wallet"],
            profile_url=None,
            enabled=True,
            mode="demo",
            real_trading_enabled=False,
            copy_buys=True,
            copy_sells=True,
            copy_amount_mode="preset",
            copy_amount_usd=Decimal("0.01"),
            max_trade_usd=None,
            max_daily_usd=None,
            max_slippage_bps=None,
            max_delay_seconds=None,
            sports_only=False,
            last_scan_at=None,
            last_trade_at=None,
            created_at=_normalize_datetime(row["opened_at"]),
            updated_at=_normalize_datetime(row["opened_at"]),
        )
        snapshots.append(
            OpenDemoPositionSnapshot(
                id=row["id"],
                wallet_id=row["wallet_id"],
                wallet=wallet,
                condition_id=row["condition_id"],
                asset=row["asset"],
                outcome=row["outcome"],
                market_title=row["market_title"],
                market_slug=row["market_slug"],
                entry_amount_usd=Decimal(row["entry_amount_usd"]),
                entry_size=Decimal(row["entry_size"]),
                opened_at=_normalize_datetime(row["opened_at"]),
                status=row["status"],
            )
        )
    return snapshots
