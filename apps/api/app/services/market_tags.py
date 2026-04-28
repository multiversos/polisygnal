from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.market import Market
from app.models.market_tag import MarketTag, MarketTagLink
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.schemas.tags import MarketTagCreate, MarketTagLinkCreate, MarketTagRead, MarketTagsRead
from app.services.watchlist import get_watchlist_item_by_market


def list_tags(db: Session) -> list[MarketTagRead]:
    tags = list(db.scalars(select(MarketTag).order_by(MarketTag.name.asc())).all())
    return [_serialize_tag(tag) for tag in tags]


def create_tag(db: Session, payload: MarketTagCreate) -> MarketTag:
    slug = _normalize_slug(payload.slug or payload.name)
    existing = db.scalar(select(MarketTag).where(MarketTag.slug == slug).limit(1))
    if existing is not None:
        return existing
    tag = MarketTag(
        name=payload.name.strip(),
        slug=slug,
        color=payload.color,
        tag_type=payload.tag_type,
    )
    db.add(tag)
    db.flush()
    db.refresh(tag)
    return tag


def get_market_tags(db: Session, market_id: int) -> MarketTagsRead:
    market = _require_market(db, market_id)
    links = _load_market_links(db, market_id)
    return MarketTagsRead(
        market_id=market_id,
        tags=[_serialize_tag(link.tag) for link in links],
        suggested_tags=suggest_system_tags(db, market),
    )


def add_market_tag(
    db: Session,
    market_id: int,
    payload: MarketTagLinkCreate,
) -> MarketTagsRead:
    _require_market(db, market_id)
    tag = _resolve_tag(db, payload)
    existing = db.scalar(
        select(MarketTagLink)
        .where(MarketTagLink.market_id == market_id, MarketTagLink.tag_id == tag.id)
        .limit(1)
    )
    if existing is None:
        db.add(MarketTagLink(market_id=market_id, tag_id=tag.id))
        db.flush()
    return get_market_tags(db, market_id)


def remove_market_tag(db: Session, market_id: int, tag_id: int) -> None:
    _require_market(db, market_id)
    link = db.scalar(
        select(MarketTagLink)
        .where(MarketTagLink.market_id == market_id, MarketTagLink.tag_id == tag_id)
        .limit(1)
    )
    if link is not None:
        db.delete(link)
        db.flush()


def suggest_system_tags(db: Session, market: Market) -> list[MarketTagRead]:
    snapshot = get_latest_market_snapshot(db, market.id)
    suggestions: list[MarketTagRead] = []
    if market.market_type == "match_winner" and market.end_date is not None:
        suggestions.append(_system_tag("Partido próximo", "upcoming_match", "#2563eb"))
    if snapshot is None:
        suggestions.append(_system_tag("Sin snapshot", "missing_snapshot", "#f59e0b"))
        suggestions.append(_system_tag("Datos incompletos", "missing_price", "#f59e0b"))
    else:
        if snapshot.yes_price is None or snapshot.no_price is None:
            suggestions.append(_system_tag("Datos incompletos", "missing_price", "#f59e0b"))
        if snapshot.liquidity is not None and snapshot.liquidity >= 10000:
            suggestions.append(_system_tag("Alta liquidez", "high_liquidity", "#16a34a"))
        elif snapshot.liquidity is not None and snapshot.liquidity < 1000:
            suggestions.append(_system_tag("Baja liquidez", "low_liquidity", "#dc2626"))
    try:
        if get_watchlist_item_by_market(db, market.id) is not None:
            suggestions.append(_system_tag("Watchlist", "watchlist", "#7c3aed"))
    except Exception:
        pass
    if market.sport_type:
        suggestions.append(_system_tag(market.sport_type.upper(), _normalize_slug(market.sport_type), None))
    return _dedupe_tags(suggestions)


def _load_market_links(db: Session, market_id: int) -> list[MarketTagLink]:
    stmt = (
        select(MarketTagLink)
        .options(joinedload(MarketTagLink.tag))
        .where(MarketTagLink.market_id == market_id)
        .order_by(MarketTagLink.created_at.desc(), MarketTagLink.id.desc())
    )
    return list(db.scalars(stmt).all())


def _resolve_tag(db: Session, payload: MarketTagLinkCreate) -> MarketTag:
    if payload.tag_id is not None:
        tag = db.get(MarketTag, payload.tag_id)
        if tag is None:
            raise MarketTagNotFoundError(payload.tag_id)
        return tag
    if not payload.name:
        raise MarketTagPayloadError("name o tag_id requerido.")
    return create_tag(
        db,
        MarketTagCreate(
            name=payload.name,
            slug=payload.slug,
            color=payload.color,
            tag_type=payload.tag_type,
        ),
    )


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise MarketTagMarketNotFoundError(market_id)
    return market


def _serialize_tag(tag: MarketTag) -> MarketTagRead:
    return MarketTagRead(
        id=tag.id,
        name=tag.name,
        slug=tag.slug,
        color=tag.color,
        tag_type=tag.tag_type,  # type: ignore[arg-type]
        created_at=tag.created_at,
    )


def _system_tag(name: str, slug: str, color: str | None) -> MarketTagRead:
    return MarketTagRead(
        id=None,
        name=name,
        slug=slug,
        color=color,
        tag_type="system",
        created_at=None,
    )


def _normalize_slug(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.strip().lower())
    return slug.strip("-") or "tag"


def _dedupe_tags(tags: list[MarketTagRead]) -> list[MarketTagRead]:
    seen: set[str] = set()
    result: list[MarketTagRead] = []
    for tag in tags:
        if tag.slug in seen:
            continue
        seen.add(tag.slug)
        result.append(tag)
    return result


class MarketTagMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id


class MarketTagNotFoundError(Exception):
    def __init__(self, tag_id: int) -> None:
        super().__init__(f"Tag {tag_id} no encontrado.")
        self.tag_id = tag_id


class MarketTagPayloadError(Exception):
    pass
