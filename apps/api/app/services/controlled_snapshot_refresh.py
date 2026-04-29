from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import PolymarketGammaClient
from app.clients.clob import PolymarketClobClient
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.repositories.market_snapshots import (
    create_market_snapshot,
    list_latest_market_snapshots_for_markets,
)
from app.services.data_health import build_snapshot_gaps
from app.services.market_freshness import build_market_freshness
from app.services.market_snapshots import (
    SnapshotCandidate,
    _build_snapshot_values,
    _fetch_gamma_market_details,
    _fetch_last_trade_prices,
    _resolve_pricing_token,
)


@dataclass(slots=True)
class ControlledSnapshotRefreshItem:
    market_id: int
    polymarket_market_id: str
    title: str
    sport: str
    close_time: datetime | None
    latest_snapshot_at: datetime | None
    token_side: str | None
    token_id: str | None
    action: str
    reason: str
    snapshot_created: bool = False
    snapshot_id: int | None = None
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    error: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "market_id": self.market_id,
            "polymarket_market_id": self.polymarket_market_id,
            "title": self.title,
            "sport": self.sport,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "latest_snapshot_at": (
                self.latest_snapshot_at.isoformat() if self.latest_snapshot_at else None
            ),
            "token_side": self.token_side,
            "token_id": self.token_id,
            "action": self.action,
            "reason": self.reason,
            "snapshot_created": self.snapshot_created,
            "snapshot_id": self.snapshot_id,
            "yes_price": _decimal_to_string(self.yes_price),
            "no_price": _decimal_to_string(self.no_price),
            "liquidity": _decimal_to_string(self.liquidity),
            "volume": _decimal_to_string(self.volume),
            "error": self.error,
        }


@dataclass(slots=True)
class ControlledSnapshotRefreshSummary:
    dry_run: bool
    apply: bool
    markets_checked: int = 0
    snapshots_created: int = 0
    snapshots_skipped: int = 0
    partial_errors: list[str] = field(default_factory=list)
    items: list[ControlledSnapshotRefreshItem] = field(default_factory=list)
    predictions_created: int = 0
    research_runs_created: int = 0
    trading_executed: bool = False

    def to_payload(self) -> dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "apply": self.apply,
            "markets_checked": self.markets_checked,
            "snapshots_created": self.snapshots_created,
            "snapshots_skipped": self.snapshots_skipped,
            "partial_error_count": len(self.partial_errors),
            "partial_errors": list(self.partial_errors),
            "predictions_created": self.predictions_created,
            "research_runs_created": self.research_runs_created,
            "trading_executed": self.trading_executed,
            "items": [item.to_payload() for item in self.items],
        }


def refresh_market_snapshots_controlled(
    db: Session,
    *,
    gamma_client: PolymarketGammaClient,
    clob_client: PolymarketClobClient,
    market_id: int | None = None,
    sport: str | None = None,
    days: int = 7,
    limit: int = 5,
    dry_run: bool = True,
    gamma_batch_size: int = 50,
    now: datetime | None = None,
) -> ControlledSnapshotRefreshSummary:
    before_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    markets = _select_refresh_markets(
        db,
        market_id=market_id,
        sport=sport,
        days=days,
        limit=limit,
        now=now,
    )
    summary = ControlledSnapshotRefreshSummary(dry_run=dry_run, apply=not dry_run)
    summary.markets_checked = len(markets)
    latest_snapshots = list_latest_market_snapshots_for_markets(db, [market.id for market in markets])

    candidate_tokens: list[SnapshotCandidate] = []
    plan_items: dict[int, ControlledSnapshotRefreshItem] = {}
    for market in markets:
        token_info = _resolve_pricing_token(market)
        freshness = build_market_freshness(
            market=market,
            latest_snapshot=latest_snapshots.get(market.id),
            now=now,
        )
        reason = ",".join(freshness.reasons) if freshness.reasons else "manual_refresh"
        item = ControlledSnapshotRefreshItem(
            market_id=market.id,
            polymarket_market_id=market.polymarket_market_id,
            title=market.question,
            sport=(market.sport_type or "other"),
            close_time=market.end_date,
            latest_snapshot_at=(
                latest_snapshots[market.id].captured_at if market.id in latest_snapshots else None
            ),
            token_side=token_info[1] if token_info else None,
            token_id=token_info[0] if token_info else None,
            action="would_refresh" if token_info else "skipped",
            reason=reason if token_info else "missing_token_id",
        )
        plan_items[market.id] = item
        summary.items.append(item)
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

    if dry_run:
        after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
        after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
        summary.predictions_created = after_predictions - before_predictions
        summary.research_runs_created = after_research_runs - before_research_runs
        return summary

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
        item = plan_items[candidate.market.id]
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
                    item.action = "skipped"
                    item.reason = "no_pricing_or_liquidity"
                    summary.snapshots_skipped += 1
                    continue
                snapshot = create_market_snapshot(
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
                item.action = "created"
                item.snapshot_created = True
                item.snapshot_id = snapshot.id
                item.yes_price = snapshot_values.yes_price
                item.no_price = snapshot_values.no_price
                item.volume = snapshot_values.volume
                item.liquidity = snapshot_values.liquidity
                summary.snapshots_created += 1
        except Exception as exc:
            item.action = "error"
            item.error = str(exc)
            summary.snapshots_skipped += 1
            summary.partial_errors.append(
                f"Error refrescando snapshot para market_id={candidate.market.id}: {exc}"
            )

    after_predictions = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    summary.predictions_created = after_predictions - before_predictions
    summary.research_runs_created = after_research_runs - before_research_runs
    return summary


def _select_refresh_markets(
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
    gaps = build_snapshot_gaps(db, sport=sport, days=days, limit=max(safe_limit * 3, safe_limit), now=now)
    candidate_ids = [
        item.market_id
        for item in gaps.items
        if item.recommended_action == "needs_snapshot"
        or not item.has_yes_price
        or not item.has_no_price
    ][:safe_limit]
    if not candidate_ids:
        return []

    rows = db.scalars(
        select(Market)
        .options(joinedload(Market.event))
        .where(Market.id.in_(candidate_ids))
        .where(Market.end_date.is_not(None))
        .where(Market.end_date >= current_time)
        .where(Market.end_date <= window_end)
    ).unique().all()
    by_id = {market.id: market for market in rows}
    return [by_id[market_id] for market_id in candidate_ids if market_id in by_id]


def _decimal_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value)
