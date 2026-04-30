from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import PolymarketGammaClient
from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.live_upcoming_discovery import discover_live_upcoming_markets
from app.services.research.classification import classify_market_research_context, normalize_sport


HIGH_CONFIDENCE = Decimal("0.90")
REVIEW_CONFIDENCE = Decimal("0.70")


@dataclass(slots=True)
class IdentifierBackfillChange:
    field: str
    local: object
    remote: object

    def to_payload(self) -> dict[str, object]:
        return {
            "field": self.field,
            "local": _serialize_value(self.local),
            "remote": _serialize_value(self.remote),
        }


@dataclass(slots=True)
class IdentifierBackfillItem:
    action: str
    match_confidence: Decimal
    match_reason: str
    remote_id: str | None
    remote_title: str
    local_market_id: int | None = None
    local_title: str | None = None
    condition_id: str | None = None
    clob_token_ids: list[str] = field(default_factory=list)
    market_slug: str | None = None
    event_slug: str | None = None
    changes: list[IdentifierBackfillChange] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, object]:
        return {
            "action": self.action,
            "match_confidence": str(self.match_confidence),
            "match_reason": self.match_reason,
            "remote_id": self.remote_id,
            "remote_title": self.remote_title,
            "local_market_id": self.local_market_id,
            "local_title": self.local_title,
            "condition_id": self.condition_id,
            "clob_token_ids": list(self.clob_token_ids),
            "market_slug": self.market_slug,
            "event_slug": self.event_slug,
            "changes": [change.to_payload() for change in self.changes],
            "warnings": list(self.warnings),
        }


@dataclass(slots=True)
class IdentifierBackfillSummary:
    dry_run: bool
    apply: bool
    min_confidence: Decimal
    markets_checked: int = 0
    candidates_checked: int = 0
    candidates_updated: int = 0
    review_required_count: int = 0
    no_match_count: int = 0
    already_has_identifiers_count: int = 0
    partial_errors: list[str] = field(default_factory=list)
    items: list[IdentifierBackfillItem] = field(default_factory=list)
    predictions_created: int = 0
    research_runs_created: int = 0
    trading_executed: bool = False

    def to_payload(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "apply": self.apply,
            "min_confidence": str(self.min_confidence),
            "markets_checked": self.markets_checked,
            "candidates_checked": self.candidates_checked,
            "candidates_updated": self.candidates_updated,
            "review_required_count": self.review_required_count,
            "no_match_count": self.no_match_count,
            "already_has_identifiers_count": self.already_has_identifiers_count,
            "partial_error_count": len(self.partial_errors),
            "partial_errors": list(self.partial_errors),
            "predictions_created": self.predictions_created,
            "research_runs_created": self.research_runs_created,
            "trading_executed": self.trading_executed,
            "items": [item.to_payload() for item in self.items],
        }


def backfill_market_identifiers_from_discovery(
    db: Session,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    market_id: int | None = None,
    days: int = 7,
    limit: int = 50,
    dry_run: bool = True,
    min_confidence: Decimal = HIGH_CONFIDENCE,
    source_tag_id: str | None = None,
    now: datetime | None = None,
) -> IdentifierBackfillSummary:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    before_predictions_count = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs_count = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    summary = IdentifierBackfillSummary(
        dry_run=dry_run,
        apply=not dry_run,
        min_confidence=min_confidence,
    )
    local_markets = _load_local_candidate_markets(
        db,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        now=current_time,
    )
    summary.markets_checked = len(local_markets)
    if market_id is not None and not local_markets:
        raise ValueError(f"market_id={market_id} no existe.")

    discovery = discover_live_upcoming_markets(
        db,
        client=client,
        sport=sport,
        days=days,
        limit=limit,
        include_futures=False,
        focus="match_winner",
        source_tag_id=source_tag_id,
        now=current_time,
    )
    if market_id is None:
        local_markets = _merge_discovered_local_markets(db, local_markets, discovery.items)
    summary.candidates_checked = len(discovery.items)
    for remote_item in discovery.items:
        if remote_item.discovery_status == "unsupported":
            continue
        match = _match_remote_to_local(remote_item, local_markets)
        if match.market is None:
            summary.no_match_count += 1
            summary.items.append(
                IdentifierBackfillItem(
                    action="no_match",
                    match_confidence=match.confidence,
                    match_reason=match.reason,
                    remote_id=remote_item.remote_id,
                    remote_title=remote_item.title,
                    condition_id=remote_item.condition_id,
                    clob_token_ids=remote_item.clob_token_ids,
                    market_slug=remote_item.market_slug,
                    event_slug=remote_item.event_slug,
                    warnings=match.warnings,
                )
            )
            continue

        changes = _build_changes(match.market, remote_item)
        action = _action_for_candidate(
            confidence=match.confidence,
            min_confidence=min_confidence,
            changes=changes,
        )
        if action == "review_required":
            summary.review_required_count += 1
        elif action == "already_has_identifiers":
            summary.already_has_identifiers_count += 1
        elif action == "no_match":
            summary.no_match_count += 1
        item = IdentifierBackfillItem(
            action=action if dry_run else ("updated" if action == "would_update" else action),
            match_confidence=match.confidence,
            match_reason=match.reason,
            remote_id=remote_item.remote_id,
            remote_title=remote_item.title,
            local_market_id=match.market.id,
            local_title=match.market.question,
            condition_id=remote_item.condition_id,
            clob_token_ids=remote_item.clob_token_ids,
            market_slug=remote_item.market_slug,
            event_slug=remote_item.event_slug,
            changes=changes,
            warnings=match.warnings,
        )
        if action == "would_update" and not dry_run:
            _apply_changes(match.market, changes)
            db.flush()
            summary.candidates_updated += 1
            item.action = "updated"
        summary.items.append(item)

    after_predictions_count = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs_count = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    summary.predictions_created = after_predictions_count - before_predictions_count
    summary.research_runs_created = after_research_runs_count - before_research_runs_count
    return summary


@dataclass(slots=True)
class _MatchResult:
    market: Market | None
    confidence: Decimal
    reason: str
    warnings: list[str] = field(default_factory=list)


def _load_local_candidate_markets(
    db: Session,
    *,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
    now: datetime,
) -> list[Market]:
    if market_id is not None:
        market = db.scalar(
            select(Market).options(joinedload(Market.event)).where(Market.id == market_id)
        )
        return [market] if market is not None else []

    window_end = now + timedelta(days=max(days, 1))
    safe_limit = max(min(limit, 100), 0)
    stmt = (
        select(Market)
        .options(joinedload(Market.event))
        .outerjoin(Market.event)
        .where(Market.active.is_(True), Market.closed.is_(False))
        .where(
            or_(
                (Market.end_date >= now) & (Market.end_date <= window_end),
                (Market.end_date.is_(None)) & (Event.start_at >= now) & (Event.start_at <= window_end),
            )
        )
        .order_by(Market.end_date.asc().nulls_last(), Market.id.asc())
        .limit(safe_limit)
    )
    markets = list(db.scalars(stmt).unique().all())
    if sport is None:
        return markets
    normalized_sport = normalize_sport(sport)
    return [
        market
        for market in markets
        if classify_market_research_context(market=market).sport == normalized_sport
    ]


def _merge_discovered_local_markets(db: Session, markets: list[Market], items: list[object]) -> list[Market]:
    markets_by_id = {market.id: market for market in markets}
    missing_ids = [
        item.local_market_id
        for item in items
        if getattr(item, "local_market_id", None) is not None
        and item.local_market_id not in markets_by_id
    ]
    if not missing_ids:
        return markets
    stmt = select(Market).options(joinedload(Market.event)).where(Market.id.in_(missing_ids))
    for market in db.scalars(stmt).unique().all():
        markets_by_id[market.id] = market
    return list(markets_by_id.values())


def _match_remote_to_local(remote_item, local_markets: list[Market]) -> _MatchResult:
    by_exact: list[tuple[Market, Decimal, str]] = []
    for market in local_markets:
        if remote_item.local_market_id == market.id:
            by_exact.append((market, Decimal("1.00"), "matched_by_existing_local_id"))
        elif remote_item.remote_id and market.polymarket_market_id == remote_item.remote_id:
            by_exact.append((market, Decimal("1.00"), "matched_by_polymarket_market_id"))
        elif remote_item.condition_id and market.condition_id == remote_item.condition_id:
            by_exact.append((market, Decimal("1.00"), "matched_by_condition_id"))
        elif remote_item.market_slug and market.slug == remote_item.market_slug:
            by_exact.append((market, Decimal("0.98"), "matched_by_market_slug"))
    if len(by_exact) == 1:
        market, confidence, reason = by_exact[0]
        return _MatchResult(market=market, confidence=confidence, reason=reason)
    if len(by_exact) > 1:
        if len({market.id for market, _, _ in by_exact}) == 1:
            market, confidence, reason = by_exact[0]
            return _MatchResult(market=market, confidence=confidence, reason=reason)
        return _MatchResult(
            market=None,
            confidence=Decimal("0.00"),
            reason="ambiguous_exact_identifier_match",
            warnings=["ambiguous_match"],
        )

    scored: list[tuple[Market, Decimal, str]] = []
    remote_title_key = _normalize_text(remote_item.title)
    remote_close = remote_item.close_time
    for market in local_markets:
        local_title_key = _normalize_text(market.question)
        if not remote_title_key or not local_title_key:
            continue
        classification = classify_market_research_context(market=market)
        if classification.sport != remote_item.sport or classification.market_shape != remote_item.market_shape:
            continue
        time_delta_hours = _time_delta_hours(_market_close_time(market), remote_close)
        if time_delta_hours is None or time_delta_hours > 3:
            continue
        if remote_title_key == local_title_key:
            scored.append((market, Decimal("0.93"), "matched_by_title_close_time_sport_shape"))
        elif remote_title_key in local_title_key or local_title_key in remote_title_key:
            scored.append((market, Decimal("0.82"), "matched_by_partial_title_close_time_sport_shape"))
    scored.sort(key=lambda item: item[1], reverse=True)
    if not scored:
        return _MatchResult(market=None, confidence=Decimal("0.00"), reason="no_safe_match")
    if len(scored) > 1 and scored[0][1] == scored[1][1]:
        return _MatchResult(
            market=None,
            confidence=scored[0][1],
            reason="ambiguous_title_match",
            warnings=["ambiguous_match"],
        )
    market, confidence, reason = scored[0]
    return _MatchResult(market=market, confidence=confidence, reason=reason)


def _build_changes(market: Market, remote_item) -> list[IdentifierBackfillChange]:
    proposed: dict[str, object] = {}
    if not market.condition_id and remote_item.condition_id:
        proposed["condition_id"] = remote_item.condition_id
    if not market.clob_token_ids and remote_item.clob_token_ids:
        proposed["clob_token_ids"] = remote_item.clob_token_ids
        proposed["outcome_tokens"] = _outcome_tokens(remote_item.clob_token_ids)
    if not market.yes_token_id and len(remote_item.clob_token_ids) >= 1:
        proposed["yes_token_id"] = remote_item.clob_token_ids[0]
    if not market.no_token_id and len(remote_item.clob_token_ids) >= 2:
        proposed["no_token_id"] = remote_item.clob_token_ids[1]
    if not market.polymarket_url and remote_item.event_slug:
        proposed["polymarket_url"] = f"https://polymarket.com/event/{remote_item.event_slug}"

    changes: list[IdentifierBackfillChange] = []
    for field_name, remote_value in proposed.items():
        local_value = getattr(market, field_name)
        if local_value != remote_value:
            changes.append(
                IdentifierBackfillChange(
                    field=field_name,
                    local=local_value,
                    remote=remote_value,
                )
            )
    return changes


def _action_for_candidate(
    *,
    confidence: Decimal,
    min_confidence: Decimal,
    changes: list[IdentifierBackfillChange],
) -> str:
    if not changes:
        return "already_has_identifiers"
    if confidence >= min_confidence:
        return "would_update"
    if confidence >= REVIEW_CONFIDENCE:
        return "review_required"
    return "no_match"


def _apply_changes(market: Market, changes: list[IdentifierBackfillChange]) -> None:
    for change in changes:
        setattr(market, change.field, change.remote)


def _outcome_tokens(clob_token_ids: list[str]) -> list[dict[str, object]]:
    tokens: list[dict[str, object]] = []
    outcomes = ("Yes", "No")
    for index, token_id in enumerate(clob_token_ids):
        item: dict[str, object] = {"token_id": token_id, "outcome_index": index}
        if index < len(outcomes):
            item["outcome"] = outcomes[index]
        tokens.append(item)
    return tokens


def _market_close_time(market: Market) -> datetime | None:
    if market.end_date is not None:
        return _normalize_datetime(market.end_date)
    if market.event is not None and market.event.start_at is not None:
        return _normalize_datetime(market.event.start_at)
    return None


def _time_delta_hours(left: datetime | None, right: datetime | None) -> float | None:
    if left is None or right is None:
        return None
    return abs((_normalize_datetime(left) - _normalize_datetime(right)).total_seconds()) / 3600


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    lowered = ascii_value.lower()
    return re.sub(r"[^a-z0-9]+", " ", lowered).strip()


def _serialize_value(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value
