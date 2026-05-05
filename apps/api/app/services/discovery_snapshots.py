from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import (
    PolymarketEventPayload,
    PolymarketGammaClient,
    PolymarketMarketPayload,
)
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.repositories.market_snapshots import (
    create_market_snapshot,
    list_latest_market_snapshots_for_markets,
)
from app.services.live_upcoming_discovery import (
    DEFAULT_FOCUS,
    _effective_close_time,
    _flatten_remote_markets,
    _remote_prices,
    _unsupported_reason,
)
from app.services.research.classification import (
    classify_market_research_context,
    normalize_sport,
)


PROBABILITY_SCALE = Decimal("0.0001")
SIZE_SCALE = Decimal("0.0001")
ZERO = Decimal("0")
ONE = Decimal("1")


@dataclass(slots=True)
class DiscoverySnapshotItem:
    market_id: int | None
    remote_id: str | None
    title: str
    sport: str
    market_shape: str
    close_time: datetime | None
    action: str
    reason: str
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    snapshot_id: int | None = None
    snapshot_created: bool = False
    mapping: str | None = None
    outcome_labels: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        return {
            "market_id": self.market_id,
            "remote_id": self.remote_id,
            "title": self.title,
            "sport": self.sport,
            "market_shape": self.market_shape,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "action": self.action,
            "reason": self.reason,
            "yes_price": _decimal_to_string(self.yes_price),
            "no_price": _decimal_to_string(self.no_price),
            "liquidity": _decimal_to_string(self.liquidity),
            "volume": _decimal_to_string(self.volume),
            "snapshot_id": self.snapshot_id,
            "snapshot_created": self.snapshot_created,
            "mapping": self.mapping,
            "outcome_labels": list(self.outcome_labels),
            "warnings": list(self.warnings),
        }


@dataclass(slots=True)
class DiscoverySnapshotSummary:
    dry_run: bool
    apply: bool
    max_snapshots: int
    requested_pages: int = 1
    remote_page_limit: int = 50
    remote_pages_fetched: int = 1
    total_remote_checked: int = 0
    local_candidates: int = 0
    would_create: int = 0
    snapshots_created: int = 0
    snapshots_skipped: int = 0
    partial_errors: list[str] = field(default_factory=list)
    items: list[DiscoverySnapshotItem] = field(default_factory=list)
    predictions_created: int = 0
    research_runs_created: int = 0
    trading_executed: bool = False

    def to_payload(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "apply": self.apply,
            "max_snapshots": self.max_snapshots,
            "requested_pages": self.requested_pages,
            "remote_page_limit": self.remote_page_limit,
            "remote_pages_fetched": self.remote_pages_fetched,
            "total_remote_checked": self.total_remote_checked,
            "local_candidates": self.local_candidates,
            "would_create": self.would_create,
            "snapshots_created": self.snapshots_created,
            "snapshots_skipped": self.snapshots_skipped,
            "partial_error_count": len(self.partial_errors),
            "partial_errors": list(self.partial_errors),
            "predictions_created": self.predictions_created,
            "research_runs_created": self.research_runs_created,
            "trading_executed": self.trading_executed,
            "items": [item.to_payload() for item in self.items],
        }


def create_snapshots_from_discovery_pricing(
    db: Session,
    *,
    client: PolymarketGammaClient,
    market_id: int | None = None,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    pages: int = 1,
    dry_run: bool = True,
    max_snapshots: int = 5,
    min_hours_to_close: float | None = None,
    source_tag_id: str | None = None,
    now: datetime | None = None,
) -> DiscoverySnapshotSummary:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    safe_limit = max(min(limit, 100), 0)
    safe_pages = max(min(pages, 10), 1)
    safe_max_snapshots = max(min(max_snapshots, 25), 0)
    normalized_sport = normalize_sport(sport) if sport else None
    min_close_time = current_time + timedelta(hours=max(min_hours_to_close or 0, 0))
    window_end = current_time + timedelta(days=safe_days)
    page_limit = min(max(safe_limit * 2, 10), 100)

    before_snapshots = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0

    remote_events: list[PolymarketEventPayload] = []
    partial_errors: list[str] = []
    next_offset: int | None = 0
    pages_fetched = 0
    while next_offset is not None and pages_fetched < safe_pages:
        page = client.fetch_active_events_page(
            limit=page_limit,
            offset=next_offset,
            tag_id=source_tag_id,
            order="endDate",
            ascending=True,
            end_date_min=min_close_time,
            end_date_max=window_end,
        )
        pages_fetched += 1
        partial_errors.extend(page.errors)
        remote_events.extend(page.events)
        next_offset = page.next_offset
    entries = _flatten_remote_markets(remote_events)
    local_markets = _load_matching_local_markets(db, entries, market_id=market_id)
    latest_snapshots = list_latest_market_snapshots_for_markets(
        db,
        [market.id for market in local_markets.values()],
    )
    summary = DiscoverySnapshotSummary(
        dry_run=dry_run,
        apply=not dry_run,
        max_snapshots=safe_max_snapshots,
        requested_pages=pages,
        remote_page_limit=page_limit,
        remote_pages_fetched=pages_fetched,
        total_remote_checked=len(entries),
        partial_errors=partial_errors,
    )

    snapshots_remaining = safe_max_snapshots
    seen_local_market_ids: set[int] = set()
    for event_payload, market_payload in entries:
        local_market = _find_local_market(local_markets, market_payload)
        if local_market is None or local_market.id in seen_local_market_ids:
            continue
        seen_local_market_ids.add(local_market.id)
        item = _build_snapshot_item(
            event_payload=event_payload,
            market_payload=market_payload,
            market=local_market,
            latest_snapshot=latest_snapshots.get(local_market.id),
            normalized_sport=normalized_sport,
            current_time=current_time,
            min_close_time=min_close_time,
            window_end=window_end,
        )
        if item.action == "skipped":
            summary.snapshots_skipped += 1
            if _include_skipped_item(item):
                summary.items.append(item)
            continue
        summary.local_candidates += 1
        if snapshots_remaining <= 0:
            item.action = "skipped"
            item.reason = "max_snapshots_reached"
            item.warnings.append("max_snapshots_reached")
            summary.snapshots_skipped += 1
            summary.items.append(item)
            continue
        if dry_run:
            summary.would_create += 1
            summary.items.append(item)
            snapshots_remaining -= 1
            continue
        snapshot = create_market_snapshot(
            db,
            market_id=local_market.id,
            captured_at=current_time,
            yes_price=item.yes_price,
            no_price=item.no_price,
            midpoint=item.yes_price,
            last_trade_price=None,
            spread=None,
            volume=item.volume,
            liquidity=item.liquidity,
        )
        item.action = "created"
        item.snapshot_created = True
        item.snapshot_id = snapshot.id
        summary.snapshots_created += 1
        summary.items.append(item)
        snapshots_remaining -= 1

    after_snapshots = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    if not dry_run:
        summary.snapshots_created = after_snapshots - before_snapshots
    summary.predictions_created = after_predictions - before_predictions
    summary.research_runs_created = after_research_runs - before_research_runs
    return summary


def _build_snapshot_item(
    *,
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
    market: Market,
    latest_snapshot: MarketSnapshot | None,
    normalized_sport: str | None,
    current_time: datetime,
    min_close_time: datetime,
    window_end: datetime,
) -> DiscoverySnapshotItem:
    question = _safe_text(market_payload.question) or market.question
    event_context = _combined_text(event_payload.title, event_payload.slug, market_payload.slug)
    classification = classify_market_research_context(
        question=question,
        event_title=event_context,
        event_category=event_payload.category,
    )
    close_time = _effective_close_time(event_payload, market_payload) or market.end_date
    close_time = _normalize_datetime(close_time) if close_time else None
    prices = _extract_binary_prices(market_payload)
    item = DiscoverySnapshotItem(
        market_id=market.id,
        remote_id=_safe_text(market_payload.id),
        title=market.question,
        sport=classification.sport,
        market_shape=classification.market_shape,
        close_time=close_time,
        action="would_create_snapshot",
        reason="remote_binary_prices_available",
        yes_price=prices.yes_price,
        no_price=prices.no_price,
        liquidity=_normalize_size(market_payload.liquidity),
        volume=_normalize_size(market_payload.volume),
        mapping=prices.mapping,
        outcome_labels=prices.outcome_labels,
        warnings=list(prices.warnings),
    )
    if normalized_sport is not None and classification.sport != normalized_sport:
        return _skip(item, "sport_filter_mismatch")
    if close_time is None:
        return _skip(item, "missing_close_time")
    if close_time < current_time:
        return _skip(item, "close_time_past")
    if close_time < min_close_time:
        return _skip(item, "close_time_before_min_window")
    if close_time > window_end:
        return _skip(item, "close_time_outside_window")
    unsupported_reason = _unsupported_reason(
        question=question,
        event_title=event_context,
        classification_sport=classification.sport,
        market_shape=classification.market_shape,
        include_futures=False,
        focus=DEFAULT_FOCUS,
    )
    if unsupported_reason is not None and not _is_allowed_soccer_draw_snapshot(item, question=question):
        return _skip(item, unsupported_reason)
    if latest_snapshot is not None and latest_snapshot.yes_price is not None and latest_snapshot.no_price is not None:
        return _skip(item, "already_has_local_prices")
    if prices.yes_price is None or prices.no_price is None:
        return _skip(item, "remote_payload_missing_binary_prices", prices.warnings)
    return item


@dataclass(slots=True)
class _ExtractedPrices:
    yes_price: Decimal | None
    no_price: Decimal | None
    mapping: str | None
    outcome_labels: list[str]
    warnings: list[str] = field(default_factory=list)


def _extract_binary_prices(market_payload: PolymarketMarketPayload) -> _ExtractedPrices:
    prices = [_normalize_probability(value) for value in _remote_prices(market_payload)]
    outcome_labels = _outcome_labels(market_payload)
    warnings: list[str] = []
    if len(prices) < 2 or prices[0] is None or prices[1] is None:
        return _ExtractedPrices(
            yes_price=None,
            no_price=None,
            mapping=None,
            outcome_labels=outcome_labels,
            warnings=["remote_prices_incomplete"],
        )
    if len(prices) > 2:
        warnings.append("remote_payload_more_than_two_prices")
        return _ExtractedPrices(
            yes_price=None,
            no_price=None,
            mapping=None,
            outcome_labels=outcome_labels,
            warnings=warnings,
        )
    if not outcome_labels:
        warnings.append("outcome_labels_missing")
    elif len(outcome_labels) != 2:
        warnings.append("outcome_label_count_not_binary")
        return _ExtractedPrices(
            yes_price=None,
            no_price=None,
            mapping=None,
            outcome_labels=outcome_labels,
            warnings=warnings,
        )

    return _ExtractedPrices(
        yes_price=prices[0],
        no_price=prices[1],
        mapping="remote_binary_outcome_order",
        outcome_labels=outcome_labels[:2],
        warnings=warnings,
    )


def _outcome_labels(market_payload: PolymarketMarketPayload) -> list[str]:
    labels = _clean_string_list(market_payload.outcomes)
    if labels:
        return labels
    token_labels: list[str] = []
    for token in market_payload.outcome_tokens:
        label = token.get("outcome") or token.get("name")
        if label is not None:
            token_labels.append(str(label))
    return _clean_string_list(token_labels)


def _load_matching_local_markets(
    db: Session,
    remote_entries: list[tuple[PolymarketEventPayload, PolymarketMarketPayload]],
    *,
    market_id: int | None,
) -> dict[str, Market]:
    if market_id is not None:
        market = db.scalar(
            select(Market).options(joinedload(Market.event)).where(Market.id == market_id)
        )
        if market is None:
            raise ValueError(f"market_id={market_id} no existe.")
        return _index_market(market)

    remote_ids = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.id)) is not None
    }
    slugs = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.slug)) is not None
    }
    condition_ids = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.condition_id)) is not None
    }
    if not remote_ids and not slugs and not condition_ids:
        return {}
    predicates = []
    if remote_ids:
        predicates.append(Market.polymarket_market_id.in_(remote_ids))
    if slugs:
        predicates.append(Market.slug.in_(slugs))
    if condition_ids:
        predicates.append(Market.condition_id.in_(condition_ids))
    markets = list(db.scalars(select(Market).where(or_(*predicates))).unique().all())
    indexed: dict[str, Market] = {}
    for market in markets:
        indexed.update(_index_market(market))
    return indexed


def _index_market(market: Market) -> dict[str, Market]:
    indexed = {
        f"id:{market.polymarket_market_id}": market,
        f"slug:{market.slug}": market,
    }
    if market.condition_id:
        indexed[f"condition:{market.condition_id}"] = market
    return indexed


def _find_local_market(
    local_markets: dict[str, Market],
    market_payload: PolymarketMarketPayload,
) -> Market | None:
    remote_id = _safe_text(market_payload.id)
    if remote_id and (market := local_markets.get(f"id:{remote_id}")) is not None:
        return market
    condition_id = _safe_text(market_payload.condition_id)
    if condition_id and (market := local_markets.get(f"condition:{condition_id}")) is not None:
        return market
    slug = _safe_text(market_payload.slug)
    if slug and (market := local_markets.get(f"slug:{slug}")) is not None:
        return market
    return None


def _skip(
    item: DiscoverySnapshotItem,
    reason: str,
    warnings: list[str] | None = None,
) -> DiscoverySnapshotItem:
    item.action = "skipped"
    item.reason = reason
    if warnings:
        item.warnings.extend(warnings)
    return item


def _include_skipped_item(item: DiscoverySnapshotItem) -> bool:
    return item.reason in {
        "not_match_winner_focus",
        "remote_payload_missing_binary_prices",
        "max_snapshots_reached",
    }


def _is_allowed_soccer_draw_snapshot(item: DiscoverySnapshotItem, *, question: str) -> bool:
    return bool(
        item.sport == "soccer"
        and item.market_shape == "yes_no_generic"
        and _teams_from_draw_title(question)
    )


def _teams_from_draw_title(title: str) -> list[str]:
    match = re.match(
        r"^Will\s+(.+?)\s+vs\.?\s+(.+?)\s+end in a draw\?$",
        title,
        flags=re.IGNORECASE,
    )
    return [match.group(1).strip(), match.group(2).strip()] if match else []


def _normalize_probability(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < ZERO or value > ONE:
        return None
    return value.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _normalize_size(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(SIZE_SCALE, rounding=ROUND_HALF_UP)


def _clean_string_list(values: list[str]) -> list[str]:
    return [value for value in (_safe_text(item) for item in values) if value is not None]


def _safe_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _combined_text(*values: str | None) -> str:
    return " ".join(value.strip() for value in values if value and value.strip())


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _decimal_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value)
