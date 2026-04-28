from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.sources import SourceQualityResponse
from app.services.source_quality import build_source_quality

router = APIRouter(tags=["sources"])


@router.get("/sources/quality", response_model=SourceQualityResponse)
def get_sources_quality(
    limit: int = Query(default=100, ge=0, le=500),
    db: Session = Depends(get_db),
) -> SourceQualityResponse:
    return build_source_quality(db, limit=limit)
