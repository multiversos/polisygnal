from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.data_health import (
    DataHealthOverviewRead,
    RefreshPrioritiesRead,
    SnapshotGapsRead,
)
from app.schemas.refresh_run import RefreshRunsRead
from app.services.data_refresh_prioritization import build_refresh_priorities
from app.services.data_health import build_data_health_overview, build_snapshot_gaps
from app.services.refresh_runs import list_refresh_runs

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


@router.get("/data-health/refresh-runs", response_model=RefreshRunsRead)
def get_refresh_runs(
    refresh_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=0, le=100),
    db: Session = Depends(get_db),
) -> RefreshRunsRead:
    return RefreshRunsRead(items=list_refresh_runs(db, refresh_type=refresh_type, limit=limit))


@router.get("/data-health/refresh-priorities", response_model=RefreshPrioritiesRead)
def get_refresh_priorities(
    sport: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=25, ge=0, le=100),
    db: Session = Depends(get_db),
) -> RefreshPrioritiesRead:
    return build_refresh_priorities(db, sport=sport, days=days, limit=limit)
