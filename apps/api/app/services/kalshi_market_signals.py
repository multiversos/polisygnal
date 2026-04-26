from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from app.clients.kalshi import KalshiMarketPayload, KalshiOrderbookPayload
from app.schemas.kalshi import (
    KalshiImpliedProbabilityResult,
    KalshiNormalizedMarket,
    KalshiOrderbookPreview,
)

ONE = Decimal("1.0000")
ZERO = Decimal("0.0000")


def normalize_kalshi_market(raw_market: KalshiMarketPayload | dict[str, object]) -> KalshiNormalizedMarket:
    market = (
        raw_market
        if isinstance(raw_market, KalshiMarketPayload)
        else KalshiMarketPayload.model_validate(raw_market)
    )
    yes_bid = normalize_probability_value(market.yes_bid_dollars)
    yes_ask = normalize_probability_value(market.yes_ask_dollars)
    no_bid = normalize_probability_value(market.no_bid_dollars)
    no_ask = normalize_probability_value(market.no_ask_dollars)
    last_price = normalize_probability_value(market.last_price_dollars)
    result = calculate_kalshi_implied_probability(
        best_yes_bid=yes_bid,
        best_yes_ask=yes_ask,
        best_no_bid=no_bid,
        best_no_ask=no_ask,
        last_price=last_price,
        volume=market.volume_fp,
        open_interest=market.open_interest_fp,
        status=market.status,
    )
    return KalshiNormalizedMarket(
        source_ticker=market.ticker,
        event_ticker=market.event_ticker,
        title=market.title,
        subtitle=market.subtitle,
        rules=_combine_rules(market.rules_primary, market.rules_secondary),
        status=market.status,
        yes_bid=yes_bid,
        yes_ask=yes_ask,
        no_bid=no_bid,
        no_ask=no_ask,
        last_price=last_price,
        volume=market.volume_fp,
        open_interest=market.open_interest_fp,
        close_time=market.close_time or market.expiration_time or market.expected_expiration_time,
        yes_probability=result.yes_probability,
        no_probability=result.no_probability,
        mid_price=result.mid_price,
        spread=result.spread,
        source_confidence=result.source_confidence,
        warnings=result.warnings,
        raw_summary={
            "market_type": market.market_type,
            "response_price_units": market.response_price_units,
            "primary_participant_key": market.primary_participant_key,
        },
    )


def normalize_kalshi_orderbook(
    raw_orderbook: KalshiOrderbookPayload | dict[str, object],
) -> KalshiOrderbookPreview:
    orderbook = (
        raw_orderbook
        if isinstance(raw_orderbook, KalshiOrderbookPayload)
        else KalshiOrderbookPayload.model_validate(raw_orderbook)
    )
    yes_levels = _extract_orderbook_levels(orderbook, side="yes")
    no_levels = _extract_orderbook_levels(orderbook, side="no")
    best_yes_bid = max((level[0] for level in yes_levels), default=None)
    best_no_bid = max((level[0] for level in no_levels), default=None)
    best_yes_ask = _subtract_from_one(best_no_bid)
    best_no_ask = _subtract_from_one(best_yes_bid)
    result = calculate_kalshi_implied_probability(
        best_yes_bid=best_yes_bid,
        best_yes_ask=best_yes_ask,
        best_no_bid=best_no_bid,
        best_no_ask=best_no_ask,
        last_price=None,
        volume=None,
        open_interest=None,
        status="open",
    )
    warnings = list(result.warnings)
    if not yes_levels:
        warnings.append("orderbook_missing_yes_levels")
    if not no_levels:
        warnings.append("orderbook_missing_no_levels")
    source_confidence = calculate_source_confidence(
        probability=result.yes_probability,
        spread=result.spread,
        has_bid_ask=best_yes_bid is not None and best_yes_ask is not None,
        used_last_price_fallback=False,
        volume=None,
        open_interest=None,
        status="open",
        warnings=warnings,
    )
    return KalshiOrderbookPreview(
        source_ticker=orderbook.ticker or "",
        best_yes_bid=_quantize_probability(best_yes_bid),
        best_yes_ask=_quantize_probability(best_yes_ask),
        best_no_bid=_quantize_probability(best_no_bid),
        best_no_ask=_quantize_probability(best_no_ask),
        yes_levels_count=len(yes_levels),
        no_levels_count=len(no_levels),
        yes_probability=result.yes_probability,
        no_probability=result.no_probability,
        mid_price=result.mid_price,
        spread=result.spread,
        source_confidence=source_confidence,
        warnings=_unique_warnings(warnings),
    )


def calculate_kalshi_implied_probability(
    *,
    best_yes_bid: Decimal | int | float | str | None,
    best_yes_ask: Decimal | int | float | str | None,
    best_no_bid: Decimal | int | float | str | None = None,
    best_no_ask: Decimal | int | float | str | None = None,
    last_price: Decimal | int | float | str | None = None,
    volume: Decimal | int | float | str | None = None,
    open_interest: Decimal | int | float | str | None = None,
    status: str | None = None,
) -> KalshiImpliedProbabilityResult:
    yes_bid = normalize_probability_value(best_yes_bid)
    yes_ask = normalize_probability_value(best_yes_ask)
    normalized_last = normalize_probability_value(last_price)
    normalized_volume = _parse_decimal(volume)
    normalized_open_interest = _parse_decimal(open_interest)

    warnings: list[str] = []
    mid_price: Decimal | None = None
    spread: Decimal | None = None
    used_last_price_fallback = False
    has_bid_ask = yes_bid is not None and yes_ask is not None

    if has_bid_ask:
        spread = yes_ask - yes_bid
        if spread < ZERO:
            warnings.append("negative_spread_detected")
            spread = None
        else:
            mid_price = (yes_bid + yes_ask) / Decimal("2")
    elif normalized_last is not None:
        warnings.append("using_last_price_fallback")
        used_last_price_fallback = True
        mid_price = normalized_last
    else:
        warnings.append("missing_bid_ask_and_last_price")

    yes_probability = clamp_probability(mid_price)
    no_probability = _subtract_from_one(yes_probability)
    source_confidence = calculate_source_confidence(
        probability=yes_probability,
        spread=spread,
        has_bid_ask=has_bid_ask,
        used_last_price_fallback=used_last_price_fallback,
        volume=normalized_volume,
        open_interest=normalized_open_interest,
        status=status,
        warnings=warnings,
    )
    return KalshiImpliedProbabilityResult(
        yes_probability=_quantize_probability(yes_probability),
        no_probability=_quantize_probability(no_probability),
        mid_price=_quantize_probability(mid_price),
        spread=_quantize_probability(spread),
        source_confidence=source_confidence,
        warnings=_unique_warnings(warnings),
    )


def calculate_source_confidence(
    *,
    probability: Decimal | None,
    spread: Decimal | None,
    has_bid_ask: bool,
    used_last_price_fallback: bool,
    volume: Decimal | None,
    open_interest: Decimal | None,
    status: str | None,
    warnings: list[str] | None = None,
) -> Decimal:
    score = Decimal("1.0000")
    notes = warnings if warnings is not None else []
    if probability is None:
        notes.append("missing_implied_probability")
        return ZERO
    normalized_status = (status or "").strip().lower()
    if normalized_status and normalized_status not in {"open", "active"}:
        score -= Decimal("0.2500")
        notes.append("market_not_open")
    if not has_bid_ask:
        score -= Decimal("0.2500")
        notes.append("missing_complete_bid_ask")
    if used_last_price_fallback:
        score -= Decimal("0.1000")
    if spread is None:
        score -= Decimal("0.1500")
        notes.append("spread_unknown")
    elif spread > Decimal("0.2000"):
        score -= Decimal("0.3000")
        notes.append("high_spread")
    elif spread > Decimal("0.1000"):
        score -= Decimal("0.1500")
        notes.append("wide_spread")
    elif spread > Decimal("0.0500"):
        score -= Decimal("0.0500")
        notes.append("moderate_spread")
    if volume is None:
        score -= Decimal("0.1000")
        notes.append("volume_unknown")
    elif volume <= ZERO:
        score -= Decimal("0.2000")
        notes.append("zero_volume")
    if open_interest is None:
        score -= Decimal("0.0500")
        notes.append("open_interest_unknown")
    elif open_interest <= ZERO:
        score -= Decimal("0.1000")
        notes.append("zero_open_interest")
    return _quantize_probability(max(ZERO, min(score, ONE))) or ZERO


def normalize_probability_value(value: Decimal | int | float | str | None) -> Decimal | None:
    parsed = _parse_decimal(value)
    if parsed is None:
        return None
    if parsed < ZERO:
        return None
    if parsed <= ONE:
        return _quantize_probability(parsed)
    if parsed <= Decimal("100"):
        return _quantize_probability(parsed / Decimal("100"))
    return None


def clamp_probability(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return max(ZERO, min(value, ONE))


def _extract_orderbook_levels(
    orderbook: KalshiOrderbookPayload,
    *,
    side: str,
) -> list[tuple[Decimal, Decimal | None]]:
    raw_levels: object = None
    if isinstance(orderbook.orderbook_fp, dict):
        raw_levels = orderbook.orderbook_fp.get(f"{side}_dollars")
    if raw_levels is None and isinstance(orderbook.orderbook, dict):
        raw_levels = orderbook.orderbook.get(side)
    if not isinstance(raw_levels, list):
        return []
    levels: list[tuple[Decimal, Decimal | None]] = []
    for raw_level in raw_levels:
        if not isinstance(raw_level, list | tuple) or not raw_level:
            continue
        price = normalize_probability_value(raw_level[0])
        quantity = _parse_decimal(raw_level[1]) if len(raw_level) > 1 else None
        if price is not None:
            levels.append((price, quantity))
    return levels


def _combine_rules(*values: str | None) -> str | None:
    parts = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    return "\n\n".join(parts) if parts else None


def _subtract_from_one(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return clamp_probability(ONE - value)


def _parse_decimal(value: Decimal | int | float | str | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return Decimal(stripped)
        except Exception:
            return None
    return None


def _quantize_probability(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _unique_warnings(warnings: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for warning in warnings:
        if warning not in seen:
            seen.add(warning)
            unique.append(warning)
    return unique
