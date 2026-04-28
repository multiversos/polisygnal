from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.data_health import DataHealthOverviewRead
from app.services.data_health import build_data_health_overview

router = APIRouter(tags=["data-health"])


@router.get("/data-health/overview", response_model=DataHealthOverviewRead)
def get_data_health_overview(db: Session = Depends(get_db)) -> DataHealthOverviewRead:
    return build_data_health_overview(db)
