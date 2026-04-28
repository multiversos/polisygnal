from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.investigation_status import (
    InvestigationStatusCreate,
    InvestigationStatusRead,
    InvestigationStatusUpdate,
)
from app.services.investigation_status import (
    InvestigationMarketNotFoundError,
    delete_investigation_status,
    get_investigation_status_by_market,
    list_investigation_statuses,
    serialize_investigation_status,
    update_investigation_status,
    upsert_investigation_status,
)

router = APIRouter(tags=["investigation-status"])


@router.get("/investigation-status", response_model=list[InvestigationStatusRead])
def get_investigation_statuses(db: Session = Depends(get_db)) -> list[InvestigationStatusRead]:
    return list_investigation_statuses(db)


@router.get(
    "/markets/{market_id}/investigation-status",
    response_model=InvestigationStatusRead | None,
)
def get_market_investigation_status(
    market_id: int,
    db: Session = Depends(get_db),
) -> InvestigationStatusRead | None:
    try:
        item = get_investigation_status_by_market(db, market_id)
    except InvestigationMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    if item is None:
        return None
    return serialize_investigation_status(db, item)


@router.post(
    "/markets/{market_id}/investigation-status",
    response_model=InvestigationStatusRead,
    status_code=status.HTTP_201_CREATED,
)
def create_market_investigation_status(
    market_id: int,
    payload: InvestigationStatusCreate,
    db: Session = Depends(get_db),
) -> InvestigationStatusRead:
    try:
        item = upsert_investigation_status(db, market_id, payload)
    except InvestigationMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    db.commit()
    return serialize_investigation_status(db, item)


@router.patch(
    "/markets/{market_id}/investigation-status",
    response_model=InvestigationStatusRead,
)
def patch_market_investigation_status(
    market_id: int,
    payload: InvestigationStatusUpdate,
    db: Session = Depends(get_db),
) -> InvestigationStatusRead:
    try:
        item = get_investigation_status_by_market(db, market_id)
    except InvestigationMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    if item is None:
        item = upsert_investigation_status(
            db,
            market_id,
            InvestigationStatusCreate(
                status=payload.status or "pending_review",
                note=payload.note if "note" in payload.model_fields_set else None,
                priority=payload.priority if "priority" in payload.model_fields_set else None,
            ),
        )
    else:
        item = update_investigation_status(db, item, payload)
    db.commit()
    return serialize_investigation_status(db, item)


@router.delete(
    "/markets/{market_id}/investigation-status",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_market_investigation_status(
    market_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        item = get_investigation_status_by_market(db, market_id)
    except InvestigationMarketNotFoundError as exc:
        raise _market_not_found(exc.market_id) from exc
    if item is not None:
        delete_investigation_status(db, item)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _market_not_found(market_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Market {market_id} no encontrado.",
    )
