from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.manual_evidence import (
    ManualEvidenceCreate,
    ManualEvidenceRead,
    ManualEvidenceUpdate,
)
from app.services.manual_evidence import (
    ManualEvidenceMarketNotFoundError,
    ManualEvidenceNotFoundError,
    create_manual_evidence,
    delete_manual_evidence,
    list_manual_evidence_for_market,
    update_manual_evidence,
)

router = APIRouter(tags=["manual-evidence"])


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
