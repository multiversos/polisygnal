from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_decision_log import MarketDecisionLog
from app.models.market_investigation_status import MarketInvestigationStatus
from app.models.market_outcome import MarketOutcome
from app.models.market_snapshot import MarketSnapshot
from app.models.market_tag import MarketTagLink
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.models.watchlist_item import WatchlistItem
from app.schemas.market_timeline import MarketTimelineItem, MarketTimelineRead


def get_market_timeline(
    db: Session,
    *,
    market_id: int,
    limit: int = 50,
) -> MarketTimelineRead:
    market = db.get(Market, market_id)
    if market is None:
        raise MarketTimelineMarketNotFoundError(market_id)

    items: list[MarketTimelineItem] = []
    items.extend(_snapshot_items(db, market_id=market_id, limit=8))
    items.extend(_research_run_items(db, market_id=market_id, limit=10))
    items.extend(_finding_items(db, market_id=market_id, limit=10))
    items.extend(_prediction_report_items(db, market_id=market_id, limit=5))
    items.extend(_external_signal_items(db, market_id=market_id, limit=10))
    items.extend(_watchlist_items(db, market_id=market_id))
    items.extend(_investigation_status_items(db, market_id=market_id))
    items.extend(_decision_items(db, market_id=market_id, limit=10))
    items.extend(_outcome_items(db, market_id=market_id))
    items.extend(_tag_items(db, market_id=market_id, limit=10))

    items.sort(key=lambda item: item.timestamp, reverse=True)
    return MarketTimelineRead(market_id=market_id, items=items[:limit])


def _snapshot_items(db: Session, *, market_id: int, limit: int) -> list[MarketTimelineItem]:
    stmt = (
        select(MarketSnapshot)
        .where(MarketSnapshot.market_id == market_id)
        .order_by(MarketSnapshot.captured_at.desc(), MarketSnapshot.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=snapshot.captured_at,
            type="price_snapshot",
            title="Movimiento de precio",
            description=(
                f"Snapshot SÍ {_format_decimal(snapshot.yes_price)} / "
                f"NO {_format_decimal(snapshot.no_price)}."
            ),
            source="market_snapshots",
            data={
                "snapshot_id": snapshot.id,
                "yes_price": _json_decimal(snapshot.yes_price),
                "no_price": _json_decimal(snapshot.no_price),
                "liquidity": _json_decimal(snapshot.liquidity),
                "volume": _json_decimal(snapshot.volume),
            },
        )
        for snapshot in db.scalars(stmt).all()
    ]


def _research_run_items(db: Session, *, market_id: int, limit: int) -> list[MarketTimelineItem]:
    stmt = (
        select(ResearchRun)
        .where(ResearchRun.market_id == market_id)
        .order_by(ResearchRun.started_at.desc(), ResearchRun.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=run.started_at,
            type="research_run",
            title="Investigación preparada",
            description=f"Research run {run.id} en estado {run.status}.",
            source="research_runs",
            status=run.status,
            data={
                "research_run_id": run.id,
                "research_mode": run.research_mode,
                "market_shape": run.market_shape,
            },
        )
        for run in db.scalars(stmt).all()
    ]


def _finding_items(db: Session, *, market_id: int, limit: int) -> list[MarketTimelineItem]:
    stmt = (
        select(ResearchFinding)
        .options(joinedload(ResearchFinding.research_run))
        .where(ResearchFinding.market_id == market_id)
        .order_by(ResearchFinding.id.desc())
        .limit(limit)
    )
    items: list[MarketTimelineItem] = []
    for finding in db.scalars(stmt).all():
        timestamp = finding.published_at or finding.research_run.started_at
        items.append(
            MarketTimelineItem(
                timestamp=timestamp,
                type="finding",
                title="Evidencia",
                description=finding.claim,
                source=finding.source_name or "research_findings",
                url=finding.citation_url,
                status=finding.stance,
                data={
                    "finding_id": finding.id,
                    "research_run_id": finding.research_run_id,
                    "factor_type": finding.factor_type,
                    "impact_score": _json_decimal(finding.impact_score),
                },
            )
        )
    return items


def _prediction_report_items(
    db: Session,
    *,
    market_id: int,
    limit: int,
) -> list[MarketTimelineItem]:
    stmt = (
        select(PredictionReport)
        .where(PredictionReport.market_id == market_id)
        .order_by(PredictionReport.created_at.desc(), PredictionReport.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=report.created_at,
            type="prediction_report",
            title="Reporte de predicción",
            description=report.thesis,
            source="prediction_reports",
            status=report.recommendation,
            data={
                "prediction_report_id": report.id,
                "prediction_id": report.prediction_id,
                "research_run_id": report.research_run_id,
            },
        )
        for report in db.scalars(stmt).all()
    ]


def _external_signal_items(
    db: Session,
    *,
    market_id: int,
    limit: int,
) -> list[MarketTimelineItem]:
    stmt = (
        select(ExternalMarketSignal)
        .where(ExternalMarketSignal.polymarket_market_id == market_id)
        .order_by(ExternalMarketSignal.fetched_at.desc(), ExternalMarketSignal.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=signal.fetched_at,
            type="external_signal",
            title="Señal externa",
            description=signal.title or signal.source_ticker or "Señal externa vinculada.",
            source=signal.source,
            status=signal.source_ticker,
            data={
                "signal_id": signal.id,
                "yes_probability": _json_decimal(signal.yes_probability),
                "source_confidence": _json_decimal(signal.source_confidence),
                "match_confidence": _json_decimal(signal.match_confidence),
            },
        )
        for signal in db.scalars(stmt).all()
    ]


def _watchlist_items(db: Session, *, market_id: int) -> list[MarketTimelineItem]:
    item = db.scalar(select(WatchlistItem).where(WatchlistItem.market_id == market_id).limit(1))
    if item is None:
        return []
    return [
        MarketTimelineItem(
            timestamp=item.updated_at,
            type="watchlist",
            title="Watchlist actualizada",
            description=item.note or f"Estado watchlist: {item.status}.",
            source="watchlist_items",
            status=item.status,
            data={"watchlist_item_id": item.id},
        )
    ]


def _investigation_status_items(db: Session, *, market_id: int) -> list[MarketTimelineItem]:
    item = db.scalar(
        select(MarketInvestigationStatus)
        .where(MarketInvestigationStatus.market_id == market_id)
        .limit(1)
    )
    if item is None:
        return []
    return [
        MarketTimelineItem(
            timestamp=item.updated_at,
            type="investigation_status",
            title="Estado de investigación",
            description=item.note or f"Estado: {item.status}.",
            source="market_investigation_statuses",
            status=item.status,
            data={"investigation_status_id": item.id, "priority": item.priority},
        )
    ]


def _decision_items(db: Session, *, market_id: int, limit: int) -> list[MarketTimelineItem]:
    stmt = (
        select(MarketDecisionLog)
        .where(MarketDecisionLog.market_id == market_id)
        .order_by(MarketDecisionLog.created_at.desc(), MarketDecisionLog.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=item.created_at,
            type="decision",
            title="Decisión humana",
            description=item.note or f"Decisión manual: {item.decision}.",
            source="market_decision_logs",
            status=item.decision,
            data={
                "decision_id": item.id,
                "confidence_label": item.confidence_label,
            },
        )
        for item in db.scalars(stmt).all()
    ]


def _outcome_items(db: Session, *, market_id: int) -> list[MarketTimelineItem]:
    item = db.get(MarketOutcome, market_id)
    if item is None:
        return []
    return [
        MarketTimelineItem(
            timestamp=item.resolved_at,
            type="outcome",
            title="Resultado registrado",
            description=item.notes or f"Resultado manual: {item.resolved_outcome}.",
            source=item.resolution_source,
            status=item.resolved_outcome,
            data={"resolved_outcome": item.resolved_outcome},
        )
    ]


def _tag_items(db: Session, *, market_id: int, limit: int) -> list[MarketTimelineItem]:
    stmt = (
        select(MarketTagLink)
        .options(joinedload(MarketTagLink.tag))
        .where(MarketTagLink.market_id == market_id)
        .order_by(MarketTagLink.created_at.desc(), MarketTagLink.id.desc())
        .limit(limit)
    )
    return [
        MarketTimelineItem(
            timestamp=link.created_at,
            type="tag",
            title="Etiqueta agregada",
            description=link.tag.name,
            source="market_tags",
            status=link.tag.tag_type,
            data={"tag_id": link.tag_id, "slug": link.tag.slug},
        )
        for link in db.scalars(stmt).all()
    ]


def _format_decimal(value: Decimal | None) -> str:
    return str(value) if value is not None else "N/D"


def _json_decimal(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


class MarketTimelineMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id
