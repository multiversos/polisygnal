from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.research_finding import ResearchFinding
from app.models.source import Source
from app.schemas.sources import SourceQualityItem, SourceQualityResponse


def build_source_quality(db: Session, *, limit: int = 100) -> SourceQualityResponse:
    safe_limit = max(limit, 0)
    sources = list(
        db.scalars(
            select(Source)
            .order_by(Source.fetched_at.desc(), Source.id.desc())
            .limit(safe_limit)
        ).all()
    )
    return SourceQualityResponse(
        generated_at=datetime.now(tz=UTC),
        total_sources=len(sources),
        items=[_build_source_item(db, source) for source in sources],
    )


def _build_source_item(db: Session, source: Source) -> SourceQualityItem:
    findings = list(
        db.scalars(
            select(ResearchFinding).where(ResearchFinding.source_id == source.id)
        ).all()
    )
    evidence_items = list(
        db.scalars(select(EvidenceItem).where(EvidenceItem.source_id == source.id)).all()
    )
    latest_seen_at = source.fetched_at or source.published_at or source.created_at
    if findings:
        latest_finding_time = max(
            (finding.published_at for finding in findings if finding.published_at is not None),
            default=None,
        )
        if latest_finding_time is not None and (
            latest_seen_at is None or latest_finding_time > latest_seen_at
        ):
            latest_seen_at = latest_finding_time

    return SourceQualityItem(
        source_id=source.id,
        source_name=source.title or source.provider,
        provider=source.provider,
        source_type=source.source_type,
        source_url=source.url,
        findings_count=len(findings),
        evidence_count=len(evidence_items),
        avg_credibility=_average(finding.credibility_score for finding in findings),
        avg_freshness=_average(finding.freshness_score for finding in findings),
        avg_impact=_average(finding.impact_score for finding in findings),
        avg_evidence_confidence=_average(item.confidence for item in evidence_items),
        latest_seen_at=latest_seen_at,
    )


def _average(values) -> Decimal | None:
    decimals = [value for value in values if value is not None]
    if not decimals:
        return None
    return sum(decimals, Decimal("0")) / Decimal(len(decimals))
