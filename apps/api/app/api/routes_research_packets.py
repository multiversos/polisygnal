from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.research_packet import ResearchPacketCreate, ResearchPacketRead
from app.services.research.research_packet_generation import (
    ResearchPacketMarketNotFoundError,
    generate_market_research_packet,
)

router = APIRouter(tags=["research-packets"])


@router.post(
    "/markets/{market_id}/research-packet",
    response_model=ResearchPacketRead,
    status_code=status.HTTP_201_CREATED,
)
def create_market_research_packet(
    market_id: int,
    payload: ResearchPacketCreate | None = None,
    db: Session = Depends(get_db),
) -> ResearchPacketRead:
    try:
        result = generate_market_research_packet(
            db,
            market_id=market_id,
            payload=payload or ResearchPacketCreate(),
        )
    except ResearchPacketMarketNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {exc.market_id} no encontrado.",
        ) from exc
    db.commit()
    return result
