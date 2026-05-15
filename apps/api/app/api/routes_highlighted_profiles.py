from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.highlighted_profile import (
    HighlightedWalletProfileList,
    HighlightedWalletProfileRead,
    HighlightedWalletProfileUpsert,
)
from app.services.highlighted_profiles import (
    HighlightedProfileValidationError,
    get_highlighted_profile,
    list_highlighted_profiles,
    serialize_highlighted_profile,
    upsert_highlighted_profile,
)

router = APIRouter(prefix="/profiles/highlighted", tags=["profiles"])


@router.get("", response_model=HighlightedWalletProfileList)
def get_highlighted_profiles(
    min_win_rate: Decimal | None = Query(default=None, ge=Decimal("0"), le=Decimal("1")),
    min_closed_markets: int | None = Query(default=None, ge=0, le=100000),
    has_pnl: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="last_seen", pattern="^(last_seen|win_rate|capital)$"),
    db: Session = Depends(get_db),
) -> HighlightedWalletProfileList:
    return list_highlighted_profiles(
        db,
        min_win_rate=min_win_rate,
        min_closed_markets=min_closed_markets,
        has_pnl=has_pnl,
        q=q,
        limit=limit,
        offset=offset,
        sort=sort,
    )


@router.post("/upsert", response_model=HighlightedWalletProfileRead)
def post_highlighted_profile_upsert(
    payload: HighlightedWalletProfileUpsert,
    db: Session = Depends(get_db),
) -> HighlightedWalletProfileRead:
    try:
        profile = upsert_highlighted_profile(db, payload)
    except HighlightedProfileValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.reason,
        ) from exc
    db.commit()
    db.refresh(profile)
    return serialize_highlighted_profile(profile)


@router.get("/{wallet_address}", response_model=HighlightedWalletProfileRead)
def get_highlighted_profile_detail(
    wallet_address: str,
    db: Session = Depends(get_db),
) -> HighlightedWalletProfileRead:
    profile = get_highlighted_profile(db, wallet_address)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="highlighted_profile_not_found",
        )
    return serialize_highlighted_profile(profile)
