from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.source import Source


def get_source_by_identity(
    db: Session,
    *,
    market_id: int,
    provider: str,
    external_id: str,
) -> Source | None:
    stmt = select(Source).where(
        Source.market_id == market_id,
        Source.provider == provider,
        Source.external_id == external_id,
    )
    return db.scalar(stmt)


def upsert_source(
    db: Session,
    *,
    market_id: int,
    provider: str,
    source_type: str,
    external_id: str,
    title: str | None,
    url: str | None,
    published_at: datetime | None,
    fetched_at: datetime,
    raw_json: dict[str, object] | list[object] | None,
    raw_text: str | None,
) -> tuple[Source, bool]:
    source = get_source_by_identity(
        db,
        market_id=market_id,
        provider=provider,
        external_id=external_id,
    )
    created = source is None
    if source is None:
        source = Source(
            market_id=market_id,
            provider=provider,
            source_type=source_type,
            external_id=external_id,
        )
        db.add(source)

    _apply_updates(
        source,
        {
            "source_type": source_type,
            "title": title,
            "url": url,
            "published_at": published_at,
            "fetched_at": fetched_at,
            "raw_json": raw_json,
            "raw_text": raw_text,
        },
    )
    db.flush()
    return source, created


def _apply_updates(instance: object, values: dict[str, object]) -> None:
    for field_name, value in values.items():
        if getattr(instance, field_name) != value:
            setattr(instance, field_name, value)
