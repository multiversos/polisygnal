from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.clients.clob import (
    ClobClientError,
    ClobNotFoundError,
    ClobOrderBook,
    PolymarketClobClient,
)
from app.clients.polymarket import PolymarketClientError, PolymarketGammaClient
from app.models.market import Market
from app.repositories.market_snapshots import create_market_snapshot
from app.repositories.markets import list_snapshot_candidates

PROBABILITY_SCALE = Decimal("0.0001")
SIZE_SCALE = Decimal("0.0001")
ONE = Decimal("1")
ZERO = Decimal("0")


@dataclass(slots=True)
class SnapshotCaptureSummary:
    markets_considered: int = 0
    snapshots_created: int = 0
    snapshots_skipped: int = 0
    partial_errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SnapshotCandidate:
    market: Market
    token_id: str
    token_side: str


@dataclass(slots=True)
class SnapshotValues:
    captured_at: datetime
    yes_price: Decimal | None
    no_price: Decimal | None
    midpoint: Decimal | None
    last_trade_price: Decimal | None
    spread: Decimal | None
    volume: Decimal | None
    liquidity: Decimal | None


def capture_market_snapshots(
    db: Session,
    *,
    gamma_client: PolymarketGammaClient,
    clob_client: PolymarketClobClient,
    discovery_scope: str,
    gamma_batch_size: int,
    market_type: str | None = None,
    limit: int | None = None,
) -> SnapshotCaptureSummary:
    candidates = list_snapshot_candidates(
        db,
        discovery_scope=discovery_scope,
        market_type=market_type,
        limit=limit,
    )
    summary = SnapshotCaptureSummary(markets_considered=len(candidates))
    if not candidates:
        return summary

    candidate_tokens: list[SnapshotCandidate] = []
    for market in candidates:
        token_info = _resolve_pricing_token(market)
        if token_info is None:
            summary.snapshots_skipped += 1
            summary.partial_errors.append(
                f"Mercado {market.id} omitido: no tiene yes_token_id ni no_token_id."
            )
            continue
        candidate_tokens.append(
            SnapshotCandidate(
                market=market,
                token_id=token_info[0],
                token_side=token_info[1],
            )
        )

    gamma_market_details = _fetch_gamma_market_details(
        gamma_client,
        [candidate.market.polymarket_market_id for candidate in candidate_tokens],
        batch_size=gamma_batch_size,
        partial_errors=summary.partial_errors,
    )
    last_trade_prices = _fetch_last_trade_prices(
        clob_client,
        [candidate.token_id for candidate in candidate_tokens],
        batch_size=gamma_batch_size,
        partial_errors=summary.partial_errors,
    )

    for candidate in candidate_tokens:
        try:
            with db.begin_nested():
                snapshot_values = _build_snapshot_values(
                    candidate=candidate,
                    gamma_market_details=gamma_market_details,
                    clob_client=clob_client,
                    last_trade_prices=last_trade_prices,
                    partial_errors=summary.partial_errors,
                )
                if snapshot_values is None:
                    summary.snapshots_skipped += 1
                    continue

                create_market_snapshot(
                    db,
                    market_id=candidate.market.id,
                    captured_at=snapshot_values.captured_at,
                    yes_price=snapshot_values.yes_price,
                    no_price=snapshot_values.no_price,
                    midpoint=snapshot_values.midpoint,
                    last_trade_price=snapshot_values.last_trade_price,
                    spread=snapshot_values.spread,
                    volume=snapshot_values.volume,
                    liquidity=snapshot_values.liquidity,
                )
                summary.snapshots_created += 1
        except Exception as exc:
            summary.snapshots_skipped += 1
            summary.partial_errors.append(
                f"Error capturando snapshot para market_id={candidate.market.id}: {exc}"
            )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        summary.partial_errors.append(f"Error confirmando snapshots: {exc}")

    return summary


def _build_snapshot_values(
    *,
    candidate: SnapshotCandidate,
    gamma_market_details: dict[str, object],
    clob_client: PolymarketClobClient,
    last_trade_prices: dict[str, Decimal | None],
    partial_errors: list[str],
) -> SnapshotValues | None:
    midpoint = _safe_fetch_decimal(
        lambda: clob_client.fetch_midpoint(candidate.token_id),
        market_id=candidate.market.id,
        label="midpoint",
        partial_errors=partial_errors,
    )
    spread = _safe_fetch_decimal(
        lambda: clob_client.fetch_spread(candidate.token_id),
        market_id=candidate.market.id,
        label="spread",
        partial_errors=partial_errors,
    )

    book: ClobOrderBook | None = None
    if candidate.token_side == "yes" and (midpoint is None or spread is None):
        book = _safe_fetch_order_book(
            clob_client,
            token_id=candidate.token_id,
            market_id=candidate.market.id,
            partial_errors=partial_errors,
        )

    midpoint_yes = _normalize_probability(_convert_to_yes_price(midpoint, candidate.token_side))
    if midpoint_yes is None and candidate.token_side == "yes":
        midpoint_yes = _derive_midpoint_from_book(book)

    spread_value = _normalize_size(spread)
    if spread_value is None and candidate.token_side == "yes":
        spread_value = _derive_spread_from_book(book)

    last_trade_price = _normalize_probability(
        _convert_to_yes_price(last_trade_prices.get(candidate.token_id), candidate.token_side)
    )
    yes_price = midpoint_yes or last_trade_price
    if yes_price is None and candidate.token_side == "yes":
        yes_price = _derive_single_side_price_from_book(book)
    no_price = _normalize_probability(ONE - yes_price) if yes_price is not None else None

    gamma_market_detail = gamma_market_details.get(candidate.market.polymarket_market_id)
    volume = _normalize_size(getattr(gamma_market_detail, "volume", None))
    liquidity = _normalize_size(getattr(gamma_market_detail, "liquidity", None))

    if all(
        value is None
        for value in [yes_price, midpoint_yes, last_trade_price, spread_value, volume, liquidity]
    ):
        partial_errors.append(
            f"Mercado {candidate.market.id} omitido: no se obtuvo pricing ni metricas de liquidez."
        )
        return None

    return SnapshotValues(
        captured_at=datetime.now(tz=UTC),
        yes_price=yes_price,
        no_price=no_price,
        midpoint=midpoint_yes,
        last_trade_price=last_trade_price,
        spread=spread_value,
        volume=volume,
        liquidity=liquidity,
    )


def _fetch_gamma_market_details(
    gamma_client: PolymarketGammaClient,
    market_ids: list[str],
    *,
    batch_size: int,
    partial_errors: list[str],
) -> dict[str, object]:
    details_by_id: dict[str, object] = {}
    for batch in _chunked(market_ids, batch_size):
        try:
            details_by_id.update(gamma_client.fetch_markets_by_ids(list(batch)))
        except PolymarketClientError as exc:
            partial_errors.append(f"No se pudo consultar /markets en Gamma: {exc}")
    return details_by_id


def _fetch_last_trade_prices(
    clob_client: PolymarketClobClient,
    token_ids: list[str],
    *,
    batch_size: int,
    partial_errors: list[str],
) -> dict[str, Decimal | None]:
    last_trade_by_token: dict[str, Decimal | None] = {}
    for batch in _chunked(token_ids, batch_size):
        try:
            last_trade_by_token.update(clob_client.fetch_last_trade_prices(list(batch)))
        except ClobClientError as exc:
            partial_errors.append(f"No se pudo consultar last-trades-prices en CLOB: {exc}")
    return last_trade_by_token


def _resolve_pricing_token(market: Market) -> tuple[str, str] | None:
    if market.yes_token_id:
        return market.yes_token_id, "yes"
    if market.no_token_id:
        return market.no_token_id, "no"
    return None


def _safe_fetch_decimal(
    callback: Callable[[], Decimal | None],
    *,
    market_id: int,
    label: str,
    partial_errors: list[str],
) -> Decimal | None:
    try:
        return callback()
    except ClobNotFoundError:
        return None
    except ClobClientError as exc:
        partial_errors.append(f"Market {market_id}: error leyendo {label} desde CLOB: {exc}")
        return None


def _safe_fetch_order_book(
    clob_client: PolymarketClobClient,
    *,
    token_id: str,
    market_id: int,
    partial_errors: list[str],
) -> ClobOrderBook | None:
    try:
        return clob_client.fetch_order_book(token_id)
    except ClobNotFoundError:
        return None
    except ClobClientError as exc:
        partial_errors.append(f"Market {market_id}: error leyendo order book desde CLOB: {exc}")
        return None


def _derive_midpoint_from_book(book: ClobOrderBook | None) -> Decimal | None:
    if book is None:
        return None
    if book.best_bid is not None and book.best_ask is not None:
        return _normalize_probability((book.best_bid + book.best_ask) / Decimal("2"))
    if book.best_ask is not None:
        return _normalize_probability(book.best_ask)
    if book.best_bid is not None:
        return _normalize_probability(book.best_bid)
    return None


def _derive_spread_from_book(book: ClobOrderBook | None) -> Decimal | None:
    if book is None or book.best_bid is None or book.best_ask is None:
        return None
    return _normalize_size(book.best_ask - book.best_bid)


def _derive_single_side_price_from_book(book: ClobOrderBook | None) -> Decimal | None:
    if book is None:
        return None
    if book.best_ask is not None:
        return _normalize_probability(book.best_ask)
    if book.best_bid is not None:
        return _normalize_probability(book.best_bid)
    return None


def _convert_to_yes_price(value: Decimal | None, token_side: str) -> Decimal | None:
    if value is None:
        return None
    if token_side == "no":
        return ONE - value
    return value


def _normalize_probability(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    clamped = min(max(value, ZERO), ONE)
    return clamped.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _normalize_size(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(SIZE_SCALE, rounding=ROUND_HALF_UP)


def _chunked(values: list[str], batch_size: int) -> Iterable[list[str]]:
    step = max(batch_size, 1)
    for start in range(0, len(values), step):
        yield values[start : start + step]
