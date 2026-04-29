from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.data_health import DataHealthOverviewRead, SnapshotGapsRead
from app.services.data_health import build_data_health_overview, build_snapshot_gaps

router = APIRouter(tags=["data-health"])


@router.get("/data-health/overview", response_model=DataHealthOverviewRead)
def get_data_health_overview(db: Session = Depends(get_db)) -> DataHealthOverviewRead:
    return build_data_health_overview(db)


@router.get("/data-health/snapshot-gaps", response_model=SnapshotGapsRead)
def get_snapshot_gaps(
    sport: str | None = Query(default=None),
    days: int = Query(default=7, ge=0, le=30),
    limit: int = Query(default=50, ge=0, le=200),
    db: Session = Depends(get_db),
) -> SnapshotGapsRead:
    return build_snapshot_gaps(db, sport=sport, days=days, limit=limit)
