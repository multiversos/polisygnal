from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.event import Event
from app.models.market import Market


def list_markets(db: Session) -> list[Market]:
    stmt = (
        select(Market)
        .options(joinedload(Market.event), selectinload(Market.snapshots))
        .order_by(Market.created_at.desc())
    )
    return list(db.scalars(stmt).unique().all())


def get_market_by_id(db: Session, market_id: int) -> Market | None:
    stmt = select(Market).where(Market.id == market_id).options(joinedload(Market.event))
    return db.scalar(stmt)


def get_market_by_polymarket_id(db: Session, polymarket_market_id: str) -> Market | None:
    stmt = select(Market).where(Market.polymarket_market_id == polymarket_market_id)
    return db.scalar(stmt)


def list_markets_for_overview(
    db: Session,
    *,
    sport_type: str | None,
    market_type: str | None,
    active: bool | None,
) -> list[Market]:
    stmt = select(Market).order_by(Market.id.asc())
    if sport_type is not None:
        stmt = stmt.where(func.lower(Market.sport_type).in_(_sport_filter_values(sport_type)))
    if market_type is not None:
        stmt = stmt.where(Market.market_type == market_type)
    if active is not None:
        stmt = stmt.where(Market.active.is_(active))
    return list(db.scalars(stmt).all())


def _sport_filter_values(value: str) -> tuple[str, ...]:
    normalized = value.strip().lower()
    aliases = {
        "basketball": ("basketball", "nba"),
        "nba": ("basketball", "nba"),
        "football": ("football", "nfl"),
        "american_football": ("football", "nfl"),
        "nfl": ("football", "nfl"),
        "baseball": ("baseball", "mlb"),
        "mlb": ("baseball", "mlb"),
    }
    return aliases.get(normalized, (normalized,))


def list_snapshot_candidates(
    db: Session,
    *,
    discovery_scope: str,
    market_type: str | None = None,
    limit: int | None = None,
) -> list[Market]:
    stmt = (
        select(Market)
        .options(joinedload(Market.event))
        .where(
            Market.active.is_(True),
            Market.closed.is_(False),
            or_(Market.yes_token_id.is_not(None), Market.no_token_id.is_not(None)),
        )
        .order_by(Market.id.asc())
    )

    if discovery_scope == "nba":
        stmt = stmt.where(func.lower(Market.sport_type).in_(_sport_filter_values("basketball")))
    elif discovery_scope == "sports":
        stmt = stmt.join(Market.event).where(
            or_(Market.sport_type.is_not(None), Event.category == "sports")
        )

    if market_type is not None:
        stmt = stmt.where(Market.market_type == market_type)

    if limit is not None:
        stmt = stmt.limit(limit)

    return list(db.scalars(stmt).unique().all())


def list_nba_winner_evidence_candidates(
    db: Session,
    *,
    limit: int | None = None,
) -> list[Market]:
    stmt = (
        select(Market)
        .options(joinedload(Market.event))
        .where(
            Market.active.is_(True),
            Market.closed.is_(False),
            func.lower(Market.sport_type).in_(_sport_filter_values("basketball")),
            Market.market_type == "winner",
        )
        .order_by(Market.id.asc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).unique().all())
