from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.clients.polymarket import (
    PolymarketEventPayload,
    PolymarketGammaClient,
    PolymarketMarketPayload,
)
from app.models.event import Event
from app.models.market import Market
from app.repositories.events import get_event_by_polymarket_id
from app.repositories.markets import get_market_by_polymarket_id
from app.schemas.sync import PolymarketSyncResponse

WINNER_PATTERNS = (
    "champion",
    "winner",
    "who will win",
)

SPORTS_KEYWORDS = (
    "nba",
    "wnba",
    "nfl",
    "mlb",
    "nhl",
    "soccer",
    "football",
    "basketball",
    "playoffs",
    "finals",
    "championship",
    "sports",
)


@dataclass(slots=True)
class EventSyncResult:
    events_created: int = 0
    events_updated: int = 0
    markets_created: int = 0
    markets_updated: int = 0
    events_processed: int = 0
    markets_processed: int = 0
    partial_errors: list[str] | None = None


def sync_active_markets(
    db: Session,
    *,
    client: PolymarketGammaClient,
    page_limit: int,
    discovery_scope: str,
    source_tag_id: str | None = None,
) -> PolymarketSyncResponse:
    summary = PolymarketSyncResponse()
    offset = 0

    while True:
        page = client.fetch_active_events_page(
            limit=page_limit,
            offset=offset,
            tag_id=source_tag_id,
        )
        page_summary = PolymarketSyncResponse(partial_errors=list(page.errors))

        for event_payload in page.events:
            if not should_sync_event(event_payload, discovery_scope):
                continue

            try:
                with db.begin_nested():
                    event_result = _sync_single_event(db, event_payload)
            except Exception as exc:
                page_summary.partial_errors.append(
                    f"Error sincronizando evento {event_payload.id or event_payload.slug or 'sin-id'}: {exc}"
                )
                continue

            page_summary.events_created += event_result.events_created
            page_summary.events_updated += event_result.events_updated
            page_summary.markets_created += event_result.markets_created
            page_summary.markets_updated += event_result.markets_updated
            page_summary.events_processed += event_result.events_processed
            page_summary.markets_processed += event_result.markets_processed
            page_summary.partial_errors.extend(event_result.partial_errors or [])

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            summary.partial_errors.extend(page_summary.partial_errors)
            summary.partial_errors.append(
                f"Error confirmando cambios de la pagina offset={offset}: {exc}"
            )
        else:
            _merge_sync_summary(summary, page_summary)

        if page.next_offset is None:
            break
        offset = page.next_offset

    return summary


def resolve_source_tag_id(
    discovery_scope: str,
    *,
    sports_tag_id: str,
    nba_tag_id: str,
) -> str | None:
    if discovery_scope == "nba":
        return nba_tag_id
    if discovery_scope == "sports":
        return sports_tag_id
    return None


def should_sync_event(event_payload: PolymarketEventPayload, discovery_scope: str) -> bool:
    if discovery_scope == "all":
        return True
    if discovery_scope == "sports":
        return is_sports_event(event_payload)
    return classify_sport_type(event_payload) == "nba"


def _sync_single_event(db: Session, event_payload: PolymarketEventPayload) -> EventSyncResult:
    errors: list[str] = []
    event_id = _required_text(event_payload.id)
    event_slug = _required_text(event_payload.slug)
    event_title = _required_text(event_payload.title)
    if not event_id or not event_slug or not event_title:
        missing = [
            name
            for name, value in (
                ("id", event_id),
                ("slug", event_slug),
                ("title", event_title),
            )
            if not value
        ]
        return EventSyncResult(
            partial_errors=[
                f"Evento descartado por datos incompletos ({', '.join(missing)})."
            ]
        )

    event = get_event_by_polymarket_id(db, event_id)
    event_created = event is None
    if event is None:
        event = Event(
            polymarket_event_id=event_id,
            title=event_title,
            slug=event_slug,
            active=bool(event_payload.active),
            closed=bool(event_payload.closed),
        )
        db.add(event)

    event_updates: dict[str, object] = {
        "title": event_title,
        "category": event_payload.category or _derive_event_category(event_payload),
        "slug": event_slug,
        "active": bool(event_payload.active),
        "closed": bool(event_payload.closed),
        "start_at": event_payload.start_date,
        "end_at": event_payload.end_date,
    }
    event_updates.update(_image_update_values(event_payload))
    event_changed = _apply_model_updates(event, event_updates)
    db.flush()

    result = EventSyncResult(
        events_created=1 if event_created else 0,
        events_updated=1 if (not event_created and event_changed) else 0,
        events_processed=1,
        partial_errors=errors,
    )

    for market_payload in event_payload.markets:
        market_result = _sync_single_market(db, event, event_payload, market_payload)
        result.markets_created += market_result.markets_created
        result.markets_updated += market_result.markets_updated
        result.markets_processed += market_result.markets_processed
        result.partial_errors.extend(market_result.partial_errors or [])

    return result


def _sync_single_market(
    db: Session,
    event: Event,
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
) -> EventSyncResult:
    market_id = _required_text(market_payload.id)
    market_slug = _required_text(market_payload.slug)
    market_question = _required_text(market_payload.question)
    if not market_id or not market_slug or not market_question:
        missing = [
            name
            for name, value in (
                ("id", market_id),
                ("slug", market_slug),
                ("question", market_question),
            )
            if not value
        ]
        return EventSyncResult(
            partial_errors=[
                (
                    "Mercado descartado en evento "
                    f"{event.polymarket_event_id} por datos incompletos ({', '.join(missing)})."
                )
            ]
        )

    yes_token_id, no_token_id = _extract_binary_token_ids(market_payload.clob_token_ids)

    market = get_market_by_polymarket_id(db, market_id)
    market_created = market is None
    if market is None:
        market = Market(
            polymarket_market_id=market_id,
            event_id=event.id,
            question=market_question,
            slug=market_slug,
            active=bool(market_payload.active),
            closed=bool(market_payload.closed),
        )
        db.add(market)

    market_updates: dict[str, object] = {
        "event_id": event.id,
        "question": market_question,
        "slug": market_slug,
        "yes_token_id": yes_token_id,
        "no_token_id": no_token_id,
        "active": bool(market_payload.active),
        "closed": bool(market_payload.closed),
        "end_date": market_payload.end_date,
        "rules_text": market_payload.description,
        "sport_type": classify_sport_type(event_payload),
        "market_type": classify_market_type(event_payload, market_payload),
    }
    market_updates.update(_image_update_values(market_payload))
    market_changed = _apply_model_updates(market, market_updates)

    return EventSyncResult(
        markets_created=1 if market_created else 0,
        markets_updated=1 if (not market_created and market_changed) else 0,
        markets_processed=1,
        partial_errors=[],
    )


def is_sports_event(event_payload: PolymarketEventPayload) -> bool:
    tags = {
        (tag.slug or "").strip().lower()
        for tag in event_payload.tags
        if (tag.slug or "").strip()
    }
    tag_labels = {
        (tag.label or "").strip().lower()
        for tag in event_payload.tags
        if (tag.label or "").strip()
    }
    if "sports" in tags or "sports" in tag_labels:
        return True
    if classify_sport_type(event_payload) == "nba":
        return True

    haystack = " ".join(
        part
        for part in [
            event_payload.slug or "",
            event_payload.title or "",
            event_payload.category or "",
        ]
        if part
    ).lower()
    return any(keyword in haystack for keyword in SPORTS_KEYWORDS)


def classify_sport_type(event_payload: PolymarketEventPayload) -> str | None:
    for tag in event_payload.tags:
        if (tag.slug or "").lower() == "nba":
            return "nba"
        if (tag.label or "").strip().lower() == "nba":
            return "nba"

    haystack = " ".join(
        part
        for part in [
            event_payload.slug or "",
            event_payload.title or "",
            event_payload.category or "",
        ]
        if part
    ).lower()
    if "nba" in haystack:
        return "nba"
    return None


def classify_market_type(
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
) -> str | None:
    haystack = " ".join(
        part
        for part in [
            event_payload.title or "",
            event_payload.slug or "",
            market_payload.question or "",
            market_payload.slug or "",
        ]
        if part
    ).lower()

    if any(pattern in haystack for pattern in WINNER_PATTERNS):
        return "winner"
    if re.search(r"will .+ win the .+finals", haystack):
        return "winner"
    if re.search(r"will .+ win the .+championship", haystack):
        return "winner"
    return None


def _apply_model_updates(instance: object, values: dict[str, object]) -> bool:
    changed = False
    for field_name, value in values.items():
        if getattr(instance, field_name) != value:
            setattr(instance, field_name, value)
            changed = True
    return changed


def _image_update_values(
    payload: PolymarketEventPayload | PolymarketMarketPayload,
) -> dict[str, str]:
    values: dict[str, str] = {}
    fields_set = getattr(payload, "model_fields_set", set())
    for field_name in ("image_url", "icon_url"):
        if field_name not in fields_set:
            continue
        value = _required_text(getattr(payload, field_name, None))
        if value is not None:
            values[field_name] = value
    return values


def _derive_event_category(event_payload: PolymarketEventPayload) -> str | None:
    for tag in event_payload.tags:
        label = _required_text(tag.label)
        if label:
            return label.lower()
    return None


def _required_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _extract_binary_token_ids(token_ids: list[str]) -> tuple[str | None, str | None]:
    if len(token_ids) >= 2:
        return token_ids[0], token_ids[1]
    if len(token_ids) == 1:
        return token_ids[0], None
    return None, None


def _merge_sync_summary(
    summary: PolymarketSyncResponse,
    page_summary: PolymarketSyncResponse,
) -> None:
    summary.events_created += page_summary.events_created
    summary.events_updated += page_summary.events_updated
    summary.markets_created += page_summary.markets_created
    summary.markets_updated += page_summary.markets_updated
    summary.events_processed += page_summary.events_processed
    summary.markets_processed += page_summary.markets_processed
    summary.partial_errors.extend(page_summary.partial_errors)
