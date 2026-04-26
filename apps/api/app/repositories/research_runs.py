from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.market import Market
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun


def create_research_run(
    db: Session,
    *,
    market: Market,
    status: str,
    vertical: str,
    subvertical: str | None,
    market_shape: str,
    research_mode: str,
    model_used: str | None,
    web_search_used: bool,
    degraded_mode: bool,
    started_at: datetime,
    metadata_json: dict[str, object] | list[object] | None,
) -> ResearchRun:
    research_run = ResearchRun(
        market_id=market.id,
        status=status,
        vertical=vertical,
        subvertical=subvertical,
        market_shape=market_shape,
        research_mode=research_mode,
        model_used=model_used,
        web_search_used=web_search_used,
        degraded_mode=degraded_mode,
        started_at=started_at,
        metadata_json=metadata_json,
    )
    db.add(research_run)
    db.flush()
    return research_run


def finalize_research_run(
    research_run: ResearchRun,
    *,
    status: str,
    finished_at: datetime,
    total_sources_found: int,
    total_sources_used: int,
    confidence_score: Decimal | None,
    error_message: str | None,
    metadata_json: dict[str, object] | list[object] | None,
) -> ResearchRun:
    research_run.status = status
    research_run.finished_at = finished_at
    research_run.total_sources_found = total_sources_found
    research_run.total_sources_used = total_sources_used
    research_run.confidence_score = confidence_score
    research_run.error_message = error_message
    research_run.metadata_json = metadata_json
    return research_run


def get_latest_research_run_for_market(
    db: Session,
    market_id: int,
) -> ResearchRun | None:
    stmt = (
        select(ResearchRun)
        .where(ResearchRun.market_id == market_id)
        .options(
            joinedload(ResearchRun.market),
            selectinload(ResearchRun.findings).joinedload(ResearchFinding.source),
            selectinload(ResearchRun.reports),
            selectinload(ResearchRun.predictions),
        )
        .order_by(ResearchRun.started_at.desc(), ResearchRun.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def list_research_runs_for_market(
    db: Session,
    market_id: int,
    *,
    limit: int | None = None,
) -> list[ResearchRun]:
    stmt = (
        select(ResearchRun)
        .where(ResearchRun.market_id == market_id)
        .options(
            selectinload(ResearchRun.findings).joinedload(ResearchFinding.source),
            selectinload(ResearchRun.reports),
            selectinload(ResearchRun.predictions),
        )
        .order_by(ResearchRun.started_at.desc(), ResearchRun.id.desc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).unique().all())
