from __future__ import annotations

from urllib.parse import quote

from app.models.market import Market
from app.schemas.market_analysis import MarketLinksRead


POLYMARKET_BASE_URL = "https://polymarket.com"
CLOB_BASE_URL = "https://clob.polymarket.com"


def build_market_links(market: Market) -> MarketLinksRead:
    event = market.event
    source_notes: list[str] = []
    polymarket_url = None
    if event is not None and event.slug:
        polymarket_url = f"{POLYMARKET_BASE_URL}/event/{quote(event.slug.strip(), safe='')}"
        source_notes.append("polymarket_url_constructed_from_event_slug")
    elif market.slug:
        source_notes.append("polymarket_event_slug_missing")
    else:
        source_notes.append("polymarket_slug_missing")

    yes_token_url = _clob_book_url(market.yes_token_id)
    no_token_url = _clob_book_url(market.no_token_id)
    if yes_token_url or no_token_url:
        source_notes.append("clob_book_urls_constructed_from_token_ids")

    return MarketLinksRead(
        polymarket_url=polymarket_url,
        polymarket_event_slug=event.slug if event is not None else None,
        polymarket_market_slug=market.slug,
        internal_analysis_url=f"/markets/{market.id}",
        internal_json_url=f"/markets/{market.id}/analysis",
        price_history_url=f"/markets/{market.id}/price-history",
        markdown_url=f"/markets/{market.id}/analysis/markdown",
        external_signals_url=f"/markets/{market.id}/external-signals",
        clob_yes_book_url=yes_token_url,
        clob_no_book_url=no_token_url,
        source_notes=source_notes,
    )


def _clob_book_url(token_id: str | None) -> str | None:
    token = (token_id or "").strip()
    if not token:
        return None
    return f"{CLOB_BASE_URL}/book?token_id={quote(token, safe='')}"
