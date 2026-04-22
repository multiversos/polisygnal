from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import Event


def get_event_by_polymarket_id(db: Session, polymarket_event_id: str) -> Event | None:
    stmt = select(Event).where(Event.polymarket_event_id == polymarket_event_id)
    return db.scalar(stmt)
