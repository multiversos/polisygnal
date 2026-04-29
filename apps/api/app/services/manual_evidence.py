from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.manual_evidence_item import ManualEvidenceItem
from app.models.market import Market
from app.schemas.manual_evidence import ManualEvidenceCreate, ManualEvidenceUpdate


class ManualEvidenceNotFoundError(ValueError):
    pass


class ManualEvidenceMarketNotFoundError(ValueError):
    pass


def list_manual_evidence_for_market(
    db: Session,
    *,
    market_id: int,
) -> list[ManualEvidenceItem]:
    _require_market(db, market_id)
    stmt = (
        select(ManualEvidenceItem)
        .where(ManualEvidenceItem.market_id == market_id)
        .order_by(ManualEvidenceItem.created_at.desc(), ManualEvidenceItem.id.desc())
    )
    return list(db.scalars(stmt).all())


def list_manual_evidence(
    db: Session,
    *,
    status: str | None = None,
    stance: str | None = None,
    market_id: int | None = None,
    limit: int = 50,
) -> list[ManualEvidenceItem]:
    safe_limit = max(min(limit, 200), 0)
    stmt = (
        select(ManualEvidenceItem)
        .options(joinedload(ManualEvidenceItem.market))
        .order_by(ManualEvidenceItem.created_at.desc(), ManualEvidenceItem.id.desc())
        .limit(safe_limit)
    )
    if status:
        stmt = stmt.where(ManualEvidenceItem.review_status == status)
    if stance:
        stmt = stmt.where(ManualEvidenceItem.stance == stance)
    if market_id is not None:
        stmt = stmt.where(ManualEvidenceItem.market_id == market_id)
    return list(db.scalars(stmt).all())


def create_manual_evidence(
    db: Session,
    *,
    market_id: int,
    payload: ManualEvidenceCreate,
) -> ManualEvidenceItem:
    _require_market(db, market_id)
    item = ManualEvidenceItem(
        market_id=market_id,
        source_name=payload.source_name.strip(),
        source_url=str(payload.source_url) if payload.source_url is not None else None,
        title=_clean_optional(payload.title),
        claim=payload.claim.strip(),
        stance=payload.stance,
        evidence_type=_clean_optional(payload.evidence_type),
        credibility_score=payload.credibility_score,
        notes=_clean_optional(payload.notes),
        review_status="pending_review",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_manual_evidence(
    db: Session,
    *,
    evidence_id: int,
    payload: ManualEvidenceUpdate,
) -> ManualEvidenceItem:
    item = get_manual_evidence(db, evidence_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "source_url":
            setattr(item, field, str(value) if value is not None else None)
        elif field in {"source_name", "title", "claim", "evidence_type", "notes"}:
            setattr(item, field, _clean_required(value) if field in {"source_name", "claim"} else _clean_optional(value))
        else:
            setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def delete_manual_evidence(db: Session, *, evidence_id: int) -> None:
    item = get_manual_evidence(db, evidence_id)
    db.delete(item)
    db.commit()


def get_manual_evidence(db: Session, evidence_id: int) -> ManualEvidenceItem:
    item = db.get(ManualEvidenceItem, evidence_id)
    if item is None:
        raise ManualEvidenceNotFoundError(f"Manual evidence {evidence_id} not found")
    return item


def _require_market(db: Session, market_id: int) -> Market:
    market = db.get(Market, market_id)
    if market is None:
        raise ManualEvidenceMarketNotFoundError(f"Market {market_id} not found")
    return market


def _clean_required(value: Any) -> str:
    return str(value).strip()


def _clean_optional(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None
