from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketClientError, PolymarketGammaClient
from app.clients.polymarket_data import (
    PolymarketDataClient,
    PolymarketDataClientError,
    PolymarketDataMarketPosition,
    PolymarketDataTrade,
)
from app.models.market import Market
from app.schemas.wallet_intelligence import (
    NotableWalletRead,
    WalletConcentrationSideRead,
    WalletConcentrationSummaryRead,
    WalletIntelligenceRead,
    WalletPositionSignalRead,
    WalletTradeSignalRead,
)

ZERO = Decimal("0")


def build_wallet_intelligence(
    db: Session,
    market: Market,
    *,
    data_client: PolymarketDataClient,
    gamma_client: PolymarketGammaClient,
    min_usd: Decimal = Decimal("10000"),
    limit: int = 50,
    now: datetime | None = None,
) -> WalletIntelligenceRead:
    """Build a read-only summary of public wallet activity for a market."""
    _ = db
    generated_at = now or datetime.now(tz=UTC)
    threshold = max(_safe_decimal(min_usd), ZERO)
    safe_limit = max(1, min(int(limit), 100))

    condition_id = _resolve_condition_id(market, gamma_client)
    if condition_id is None:
        return _empty_response(
            market=market,
            threshold=threshold,
            limit=safe_limit,
            generated_at=generated_at,
            warnings=["condition_id_unavailable"],
        )

    warnings: list[str] = []
    try:
        trades = data_client.get_trades_for_market(condition_id, limit=safe_limit)
    except PolymarketDataClientError:
        trades = []
        warnings.append("wallet_trades_unavailable")
    try:
        positions = data_client.get_positions_for_market(condition_id, limit=safe_limit)
    except PolymarketDataClientError:
        positions = []
        warnings.append("wallet_positions_unavailable")
    if "wallet_trades_unavailable" in warnings and "wallet_positions_unavailable" in warnings:
        return _empty_response(
            market=market,
            threshold=threshold,
            limit=safe_limit,
            generated_at=generated_at,
            condition_id=condition_id,
            warnings=["wallet_data_unavailable"],
        )

    large_trades = _build_large_trade_signals(trades, threshold=threshold)
    large_positions = _build_large_position_signals(positions, threshold=threshold)
    concentration_summary = _build_concentration_summary(positions, threshold=threshold)
    notable_wallets = _build_notable_wallets(
        large_trades=large_trades,
        large_positions=large_positions,
    )

    if not trades and not positions:
        warnings.append("wallet_data_empty")
    if trades or positions:
        if not large_trades and not large_positions:
            warnings.append("no_large_wallet_activity_at_threshold")
    warnings.extend(concentration_summary.warnings)

    return WalletIntelligenceRead(
        market_id=market.id,
        condition_id=condition_id,
        threshold_usd=threshold,
        limit=safe_limit,
        data_available=bool(trades or positions),
        large_trades=large_trades[:safe_limit],
        large_positions=large_positions[:safe_limit],
        notable_wallets=notable_wallets[:safe_limit],
        concentration_summary=concentration_summary,
        warnings=_dedupe(warnings),
        generated_at=generated_at,
    )


def abbreviate_wallet(wallet: str | None) -> str:
    if not wallet:
        return "wallet_desconocida"
    stripped = wallet.strip()
    if len(stripped) <= 12:
        return stripped
    return f"{stripped[:6]}...{stripped[-4:]}"


def _resolve_condition_id(market: Market, gamma_client: PolymarketGammaClient) -> str | None:
    stored_condition_id = _clean_text(market.condition_id)
    if stored_condition_id is not None:
        return stored_condition_id
    try:
        payloads = gamma_client.fetch_markets_by_ids([market.polymarket_market_id])
    except PolymarketClientError:
        return None
    payload = payloads.get(market.polymarket_market_id)
    condition_id = getattr(payload, "condition_id", None)
    if isinstance(condition_id, str) and condition_id.strip():
        return condition_id.strip()
    return None


def _build_large_trade_signals(
    trades: list[PolymarketDataTrade],
    *,
    threshold: Decimal,
) -> list[WalletTradeSignalRead]:
    signals: list[WalletTradeSignalRead] = []
    for trade in trades:
        wallet = _clean_wallet(trade.proxy_wallet)
        trade_size_usd = _trade_size_usd(trade)
        if wallet is None or trade_size_usd is None or trade_size_usd < threshold:
            continue
        signals.append(
            WalletTradeSignalRead(
                wallet_address=wallet,
                wallet_short=abbreviate_wallet(wallet),
                profile_name=_safe_profile_name(trade.pseudonym),
                side=_normalize_outcome_side(trade.outcome),
                trade_action=_clean_text(trade.side),
                outcome=_clean_text(trade.outcome),
                trade_size_usd=trade_size_usd,
                price=trade.price,
                token_size=trade.size,
                timestamp=trade.timestamp,
                signal_type="large_trade",
                signal_score=_signal_score(trade_size_usd, threshold),
                transaction_hash=_clean_text(trade.transaction_hash),
                warnings=[],
            )
        )
    return sorted(
        signals,
        key=lambda item: (item.trade_size_usd or ZERO, item.timestamp or datetime.min.replace(tzinfo=UTC)),
        reverse=True,
    )


def _build_large_position_signals(
    positions: list[PolymarketDataMarketPosition],
    *,
    threshold: Decimal,
) -> list[WalletPositionSignalRead]:
    signals: list[WalletPositionSignalRead] = []
    for position in positions:
        wallet = _clean_wallet(position.proxy_wallet)
        position_size_usd = _position_size_usd(position)
        if wallet is None or position_size_usd is None or position_size_usd < threshold:
            continue
        signals.append(
            WalletPositionSignalRead(
                wallet_address=wallet,
                wallet_short=abbreviate_wallet(wallet),
                profile_name=_safe_profile_name(position.pseudonym),
                side=_normalize_outcome_side(position.outcome),
                outcome=_clean_text(position.outcome),
                position_size_usd=position_size_usd,
                avg_price=position.avg_price,
                current_price=position.curr_price,
                token_size=position.size,
                realized_pnl=position.realized_pnl,
                total_pnl=position.total_pnl,
                signal_type="large_position",
                signal_score=_signal_score(position_size_usd, threshold),
                warnings=[],
            )
        )
    return sorted(signals, key=lambda item: item.position_size_usd or ZERO, reverse=True)


def _build_notable_wallets(
    *,
    large_trades: list[WalletTradeSignalRead],
    large_positions: list[WalletPositionSignalRead],
) -> list[NotableWalletRead]:
    stats: dict[str, dict[str, object]] = defaultdict(
        lambda: {
            "profile_name": None,
            "trade_count": 0,
            "max_trade_size_usd": None,
            "position_size_usd": None,
            "realized_pnl": None,
            "signal_types": set(),
            "signal_score": ZERO,
        }
    )
    for trade in large_trades:
        wallet_stats = stats[trade.wallet_address]
        wallet_stats["profile_name"] = wallet_stats["profile_name"] or trade.profile_name
        wallet_stats["trade_count"] = int(wallet_stats["trade_count"]) + 1
        wallet_stats["max_trade_size_usd"] = _max_decimal(
            wallet_stats["max_trade_size_usd"],
            trade.trade_size_usd,
        )
        cast_signal_types = wallet_stats["signal_types"]
        if isinstance(cast_signal_types, set):
            cast_signal_types.add("large_trade")
        wallet_stats["signal_score"] = _max_decimal(wallet_stats["signal_score"], trade.signal_score) or ZERO

    for position in large_positions:
        wallet_stats = stats[position.wallet_address]
        wallet_stats["profile_name"] = wallet_stats["profile_name"] or position.profile_name
        wallet_stats["position_size_usd"] = _max_decimal(
            wallet_stats["position_size_usd"],
            position.position_size_usd,
        )
        wallet_stats["realized_pnl"] = position.realized_pnl
        cast_signal_types = wallet_stats["signal_types"]
        if isinstance(cast_signal_types, set):
            cast_signal_types.add("large_position")
        wallet_stats["signal_score"] = _max_decimal(wallet_stats["signal_score"], position.signal_score) or ZERO

    wallets: list[NotableWalletRead] = []
    for wallet, wallet_stats in stats.items():
        signal_types = sorted(wallet_stats["signal_types"]) if isinstance(wallet_stats["signal_types"], set) else []
        trade_count = int(wallet_stats["trade_count"])
        if trade_count >= 3:
            signal_types.append("repeated_buyer")
        wallets.append(
            NotableWalletRead(
                wallet_address=wallet,
                wallet_short=abbreviate_wallet(wallet),
                profile_name=wallet_stats["profile_name"] if isinstance(wallet_stats["profile_name"], str) else None,
                trade_count=trade_count,
                max_trade_size_usd=wallet_stats["max_trade_size_usd"]
                if isinstance(wallet_stats["max_trade_size_usd"], Decimal)
                else None,
                position_size_usd=wallet_stats["position_size_usd"]
                if isinstance(wallet_stats["position_size_usd"], Decimal)
                else None,
                realized_pnl=wallet_stats["realized_pnl"]
                if isinstance(wallet_stats["realized_pnl"], Decimal)
                else None,
                signal_types=_dedupe(signal_types),
                signal_score=wallet_stats["signal_score"]
                if isinstance(wallet_stats["signal_score"], Decimal)
                else ZERO,
                warnings=[],
            )
        )
    return sorted(wallets, key=lambda item: item.signal_score, reverse=True)


def _build_concentration_summary(
    positions: list[PolymarketDataMarketPosition],
    *,
    threshold: Decimal,
) -> WalletConcentrationSummaryRead:
    side_totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    side_wallets: dict[str, set[str]] = defaultdict(set)
    side_largest: dict[str, Decimal] = defaultdict(lambda: ZERO)

    for position in positions:
        wallet = _clean_wallet(position.proxy_wallet)
        side = _normalize_outcome_side(position.outcome) or "unknown"
        value = _position_size_usd(position)
        if wallet is None or value is None or value <= ZERO:
            continue
        side_totals[side] += value
        side_wallets[side].add(wallet)
        side_largest[side] = max(side_largest[side], value)

    total = sum(side_totals.values(), ZERO)
    sides: list[WalletConcentrationSideRead] = []
    concentrated_side: str | None = None
    warnings: list[str] = []
    for side, side_total in sorted(side_totals.items(), key=lambda item: item[1], reverse=True):
        largest_share = (side_largest[side] / side_total) if side_total > ZERO else None
        sides.append(
            WalletConcentrationSideRead(
                side=side,
                wallet_count=len(side_wallets[side]),
                total_position_size_usd=side_total,
                largest_wallet_share=_quantize(largest_share) if largest_share is not None else None,
            )
        )
        if total >= threshold and side_total / total >= Decimal("0.70"):
            concentrated_side = side
            warnings.append("concentrated_side_activity")

    return WalletConcentrationSummaryRead(
        total_position_size_usd=total,
        sides=sides,
        concentrated_side=concentrated_side,
        warnings=_dedupe(warnings),
    )


def _empty_response(
    *,
    market: Market,
    threshold: Decimal,
    limit: int,
    generated_at: datetime,
    warnings: list[str],
    condition_id: str | None = None,
) -> WalletIntelligenceRead:
    return WalletIntelligenceRead(
        market_id=market.id,
        condition_id=condition_id,
        threshold_usd=threshold,
        limit=limit,
        data_available=False,
        large_trades=[],
        large_positions=[],
        notable_wallets=[],
        concentration_summary=WalletConcentrationSummaryRead(
            total_position_size_usd=ZERO,
            sides=[],
            concentrated_side=None,
            warnings=[],
        ),
        warnings=_dedupe(warnings),
        generated_at=generated_at,
    )


def _trade_size_usd(trade: PolymarketDataTrade) -> Decimal | None:
    if trade.size is None or trade.price is None:
        return None
    return abs(trade.size * trade.price)


def _position_size_usd(position: PolymarketDataMarketPosition) -> Decimal | None:
    for value in (position.current_value, position.total_bought):
        if value is not None:
            return abs(value)
    if position.size is not None and position.curr_price is not None:
        return abs(position.size * position.curr_price)
    return None


def _normalize_outcome_side(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    lowered = cleaned.lower()
    if lowered in {"yes", "si", "s\u00ed"} or lowered.startswith("yes "):
        return "yes"
    if lowered == "no" or lowered.startswith("no "):
        return "no"
    return lowered[:32]


def _clean_wallet(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    return cleaned


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _safe_profile_name(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    return cleaned[:80]


def _safe_decimal(value: Decimal | int | float | str | None) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return ZERO


def _signal_score(value: Decimal, threshold: Decimal) -> Decimal:
    if threshold <= ZERO:
        return Decimal("100.00")
    ratio = min(value / threshold, Decimal("5"))
    return _quantize(min(Decimal("100"), Decimal("45") + ratio * Decimal("11")))


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"))


def _max_decimal(left: object, right: Decimal | None) -> Decimal | None:
    values = [item for item in (left, right) if isinstance(item, Decimal)]
    if not values:
        return None
    return max(values)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
