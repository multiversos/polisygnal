from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import PolymarketGammaClient, PolymarketMarketDetailsPayload
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


SAFE_MARKET_FIELDS = (
    "question",
    "slug",
    "condition_id",
    "question_id",
    "clob_token_ids",
    "outcome_tokens",
    "polymarket_url",
    "active",
    "closed",
    "end_date",
    "rules_text",
    "image_url",
    "icon_url",
    "yes_token_id",
    "no_token_id",
)


@dataclass(slots=True)
class MetadataChange:
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
class ControlledMetadataRefreshItem:
    market_id: int
    polymarket_market_id: str
    title: str
    sport: str
    action: str
    changes: list[MetadataChange] = field(default_factory=list)
    remote_liquidity: Decimal | None = None
    remote_volume: Decimal | None = None
    error: str | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "market_id": self.market_id,
            "polymarket_market_id": self.polymarket_market_id,
            "title": self.title,
            "sport": self.sport,
            "action": self.action,
            "changes": [change.to_payload() for change in self.changes],
            "remote_liquidity": _serialize_value(self.remote_liquidity),
            "remote_volume": _serialize_value(self.remote_volume),
            "error": self.error,
        }


@dataclass(slots=True)
class ControlledMetadataRefreshSummary:
    dry_run: bool
    apply: bool
    markets_checked: int = 0
    markets_updated: int = 0
    markets_unchanged: int = 0
    partial_errors: list[str] = field(default_factory=list)
    items: list[ControlledMetadataRefreshItem] = field(default_factory=list)
    predictions_created: int = 0
    research_runs_created: int = 0
    trading_executed: bool = False

    def to_payload(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "apply": self.apply,
            "markets_checked": self.markets_checked,
            "markets_updated": self.markets_updated,
            "markets_unchanged": self.markets_unchanged,
            "partial_error_count": len(self.partial_errors),
            "partial_errors": list(self.partial_errors),
            "predictions_created": self.predictions_created,
            "research_runs_created": self.research_runs_created,
            "trading_executed": self.trading_executed,
            "items": [item.to_payload() for item in self.items],
        }


def refresh_market_metadata_controlled(
    db: Session,
    *,
    gamma_client: PolymarketGammaClient,
    market_id: int | None = None,
    sport: str | None = None,
    days: int = 7,
    limit: int = 5,
    dry_run: bool = True,
    now: datetime | None = None,
) -> ControlledMetadataRefreshSummary:
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    markets = _select_metadata_markets(
        db,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        now=now,
    )
    summary = ControlledMetadataRefreshSummary(dry_run=dry_run, apply=not dry_run)
    summary.markets_checked = len(markets)

    remote_markets = gamma_client.fetch_markets_by_ids(
        [market.polymarket_market_id for market in markets]
    )

    for market in markets:
        remote = remote_markets.get(market.polymarket_market_id)
        item = ControlledMetadataRefreshItem(
            market_id=market.id,
            polymarket_market_id=market.polymarket_market_id,
            title=market.question,
            sport=market.sport_type or "other",
            action="remote_missing" if remote is None else "unchanged",
        )
        summary.items.append(item)
        if remote is None:
            summary.partial_errors.append(
                f"Mercado {market.id} no encontrado en Gamma /markets."
            )
            continue

        updates = _safe_updates_from_remote(remote)
        item.remote_liquidity = remote.liquidity
        item.remote_volume = remote.volume
        item.changes = _build_changes(market, updates)
        if not item.changes:
            item.action = "unchanged"
            summary.markets_unchanged += 1
            continue

        item.action = "would_update" if dry_run else "updated"
        if not dry_run:
            for field_name, value in updates.items():
                if getattr(market, field_name) != value:
                    setattr(market, field_name, value)
            db.flush()
            summary.markets_updated += 1

    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    summary.predictions_created = after_predictions - before_predictions
    summary.research_runs_created = after_research_runs - before_research_runs
    return summary


def _select_metadata_markets(
    db: Session,
    *,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
    now: datetime | None,
) -> list[Market]:
    if market_id is not None:
        market = db.scalar(
            select(Market).options(joinedload(Market.event)).where(Market.id == market_id)
        )
        if market is None:
            raise ValueError(f"market_id={market_id} no existe.")
        return [market]

    current_time = now or datetime.now(tz=UTC)
    window_end = current_time + timedelta(days=max(days, 0))
    safe_limit = max(min(limit, 25), 0)
    statement = (
        select(Market)
        .options(joinedload(Market.event))
        .where(Market.active.is_(True))
        .where(Market.closed.is_(False))
        .where(
            or_(
                Market.end_date.is_(None),
                (Market.end_date >= current_time) & (Market.end_date <= window_end),
            )
        )
        .order_by(Market.end_date.asc().nullsfirst(), Market.id.asc())
        .limit(safe_limit)
    )
    if sport:
        statement = statement.where(func.lower(Market.sport_type) == sport.strip().lower())
    return list(db.scalars(statement).unique().all())


def _safe_updates_from_remote(remote: PolymarketMarketDetailsPayload) -> dict[str, object]:
    yes_token_id, no_token_id = _extract_binary_token_ids(remote.clob_token_ids)
    raw_updates: dict[str, object] = {
        "question": remote.question,
        "slug": remote.slug,
        "condition_id": _required_text(remote.condition_id),
        "question_id": _required_text(remote.question_id),
        "clob_token_ids": _clean_string_list(remote.clob_token_ids),
        "outcome_tokens": _build_outcome_tokens(remote),
        "active": remote.active,
        "closed": remote.closed,
        "end_date": remote.end_date,
        "rules_text": remote.description,
        "image_url": remote.image_url,
        "icon_url": remote.icon_url,
        "yes_token_id": yes_token_id,
        "no_token_id": no_token_id,
    }
    return {
        key: value
        for key, value in raw_updates.items()
        if key in SAFE_MARKET_FIELDS and value is not None and value != []
    }


def _build_changes(market: Market, updates: dict[str, object]) -> list[MetadataChange]:
    changes: list[MetadataChange] = []
    for field_name, remote_value in updates.items():
        local_value = getattr(market, field_name)
        if local_value != remote_value:
            changes.append(
                MetadataChange(
                    field=field_name,
                    local=local_value,
                    remote=remote_value,
                )
            )
    return changes


def _extract_binary_token_ids(token_ids: list[str]) -> tuple[str | None, str | None]:
    if len(token_ids) >= 2:
        return token_ids[0], token_ids[1]
    if len(token_ids) == 1:
        return token_ids[0], None
    return None, None


def _required_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _clean_string_list(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        cleaned = _required_text(value)
        if cleaned is not None:
            result.append(cleaned)
    return result


def _build_outcome_tokens(remote: PolymarketMarketDetailsPayload) -> list[dict[str, object]]:
    if remote.outcome_tokens:
        return remote.outcome_tokens
    clob_token_ids = _clean_string_list(remote.clob_token_ids)
    outcomes = _clean_string_list(remote.outcomes)
    if not clob_token_ids:
        return []
    tokens: list[dict[str, object]] = []
    for index, token_id in enumerate(clob_token_ids):
        item: dict[str, object] = {
            "token_id": token_id,
            "outcome_index": index,
        }
        if index < len(outcomes):
            item["outcome"] = outcomes[index]
        tokens.append(item)
    return tokens


def _serialize_value(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value
