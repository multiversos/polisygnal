from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.manual_evidence import (
    ManualEvidenceCreate,
    ManualEvidenceDashboardItem,
    ManualEvidenceListResponse,
    ManualEvidenceRead,
    ManualEvidenceUpdate,
)
from app.services.manual_evidence import (
    ManualEvidenceMarketNotFoundError,
    ManualEvidenceNotFoundError,
    create_manual_evidence,
    delete_manual_evidence,
    list_manual_evidence,
    list_manual_evidence_for_market,
    update_manual_evidence,
)
from app.services.research.classification import classify_market_research_context

router = APIRouter(tags=["manual-evidence"])


@router.get("/manual-evidence", response_model=ManualEvidenceListResponse)
def get_manual_evidence_list(
    status_filter: str | None = Query(default=None, alias="status"),
    stance: str | None = Query(default=None),
    market_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=0, le=200),
    db: Session = Depends(get_db),
) -> ManualEvidenceListResponse:
    items = list_manual_evidence(
        db,
        status=status_filter,
        stance=stance,
        market_id=market_id,
        limit=limit,
    )
    return ManualEvidenceListResponse(
        items=[_serialize_dashboard_item(item) for item in items],
        count=len(items),
    )


@router.get(
    "/markets/{market_id}/manual-evidence",
    response_model=list[ManualEvidenceRead],
)
def get_market_manual_evidence(
    market_id: int,
    db: Session = Depends(get_db),
) -> list[ManualEvidenceRead]:
    try:
        return [
            ManualEvidenceRead.model_validate(item)
            for item in list_manual_evidence_for_market(db, market_id=market_id)
        ]
    except ManualEvidenceMarketNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/markets/{market_id}/manual-evidence",
    response_model=ManualEvidenceRead,
    status_code=status.HTTP_201_CREATED,
)
def post_market_manual_evidence(
    market_id: int,
    payload: ManualEvidenceCreate,
    db: Session = Depends(get_db),
) -> ManualEvidenceRead:
    try:
        return ManualEvidenceRead.model_validate(
            create_manual_evidence(db, market_id=market_id, payload=payload)
        )
    except ManualEvidenceMarketNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch(
    "/manual-evidence/{evidence_id}",
    response_model=ManualEvidenceRead,
)
def patch_manual_evidence(
    evidence_id: int,
    payload: ManualEvidenceUpdate,
    db: Session = Depends(get_db),
) -> ManualEvidenceRead:
    try:
        return ManualEvidenceRead.model_validate(
            update_manual_evidence(db, evidence_id=evidence_id, payload=payload)
        )
    except ManualEvidenceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/manual-evidence/{evidence_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_manual_evidence_route(
    evidence_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_manual_evidence(db, evidence_id=evidence_id)
    except ManualEvidenceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _serialize_dashboard_item(item) -> ManualEvidenceDashboardItem:
    market = item.market
    classification = classify_market_research_context(market=market) if market is not None else None
    payload = ManualEvidenceRead.model_validate(item).model_dump()
    return ManualEvidenceDashboardItem(
        **payload,
        market_question=market.question if market is not None else None,
        market_slug=market.slug if market is not None else None,
        sport=classification.sport if classification is not None else None,
        market_shape=classification.market_shape if classification is not None else None,
    )
