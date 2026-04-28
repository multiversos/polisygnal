from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.smart_alerts import SmartAlertSeverity, SmartAlertsResponse
from app.services.smart_alerts import build_smart_alerts

router = APIRouter(tags=["alerts"])


@router.get("/alerts/smart", response_model=SmartAlertsResponse)
def get_smart_alerts(
    limit: int = Query(default=20, ge=1, le=100),
    sport: str | None = Query(default=None),
    severity: SmartAlertSeverity | None = Query(default=None),
    db: Session = Depends(get_db),
) -> SmartAlertsResponse:
    return build_smart_alerts(
        db,
        limit=limit,
        sport=sport,
        severity=severity,
    )
