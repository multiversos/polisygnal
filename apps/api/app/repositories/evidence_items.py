from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.models.evidence_item import EvidenceItem
from app.models.source import Source


@dataclass(slots=True)
class MarketEvidenceSummary:
    market_id: int
    evidence_count: int = 0
    odds_evidence_count: int = 0
    news_evidence_count: int = 0
    latest_evidence_at: datetime | None = None


def get_evidence_item_by_source(
    db: Session,
    *,
    source_id: int,
    evidence_type: str,
) -> EvidenceItem | None:
    stmt = select(EvidenceItem).where(
        EvidenceItem.source_id == source_id,
        EvidenceItem.evidence_type == evidence_type,
    )
    return db.scalar(stmt)


def upsert_evidence_item(
    db: Session,
    *,
    market_id: int,
    source_id: int,
    provider: str,
    evidence_type: str,
    stance: str,
    strength: Decimal | None,
    confidence: Decimal | None,
    summary: str,
    high_contradiction: bool,
    bookmaker_count: int | None,
    metadata_json: dict[str, object] | list[object] | None,
) -> tuple[EvidenceItem, bool]:
    evidence_item = get_evidence_item_by_source(
        db,
        source_id=source_id,
        evidence_type=evidence_type,
    )
    created = evidence_item is None
    if evidence_item is None:
        evidence_item = EvidenceItem(
            market_id=market_id,
            source_id=source_id,
            provider=provider,
            evidence_type=evidence_type,
        )
        db.add(evidence_item)

    _apply_updates(
        evidence_item,
        {
            "provider": provider,
            "stance": stance,
            "strength": strength,
            "confidence": confidence,
            "summary": summary,
            "high_contradiction": high_contradiction,
            "bookmaker_count": bookmaker_count,
            "metadata_json": metadata_json,
        },
    )
    db.flush()
    return evidence_item, created


def list_market_evidence_items(
    db: Session,
    *,
    market_id: int,
    evidence_type: str | None = None,
) -> list[EvidenceItem]:
    sort_date = func.coalesce(Source.published_at, Source.fetched_at, EvidenceItem.created_at)
    stmt = (
        select(EvidenceItem)
        .join(EvidenceItem.source)
        .where(EvidenceItem.market_id == market_id)
        .options(joinedload(EvidenceItem.source))
        .order_by(sort_date.desc(), EvidenceItem.created_at.desc(), EvidenceItem.id.desc())
    )
    if evidence_type is not None:
        stmt = stmt.where(EvidenceItem.evidence_type == evidence_type)
    return list(db.scalars(stmt).unique().all())


def summarize_evidence_for_markets(
    db: Session,
    market_ids: list[int],
) -> dict[int, MarketEvidenceSummary]:
    if not market_ids:
        return {}

    sort_date = func.coalesce(Source.published_at, Source.fetched_at, EvidenceItem.created_at)
    stmt = (
        select(
            EvidenceItem.market_id,
            func.count(EvidenceItem.id).label("evidence_count"),
            func.sum(case((EvidenceItem.evidence_type == "odds", 1), else_=0)).label(
                "odds_evidence_count"
            ),
            func.sum(case((EvidenceItem.evidence_type == "news", 1), else_=0)).label(
                "news_evidence_count"
            ),
            func.max(sort_date).label("latest_evidence_at"),
        )
        .join(EvidenceItem.source)
        .where(EvidenceItem.market_id.in_(market_ids))
        .group_by(EvidenceItem.market_id)
    )

    summaries: dict[int, MarketEvidenceSummary] = {}
    for row in db.execute(stmt):
        summaries[row.market_id] = MarketEvidenceSummary(
            market_id=row.market_id,
            evidence_count=int(row.evidence_count or 0),
            odds_evidence_count=int(row.odds_evidence_count or 0),
            news_evidence_count=int(row.news_evidence_count or 0),
            latest_evidence_at=row.latest_evidence_at,
        )
    return summaries


def _apply_updates(instance: object, values: dict[str, object]) -> None:
    for field_name, value in values.items():
        if getattr(instance, field_name) != value:
            setattr(instance, field_name, value)
