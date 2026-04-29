from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.services.market_links import build_market_links


def test_market_links_builds_known_urls(db_session: Session) -> None:
    market = _create_market(
        db_session,
        event_slug="j-league-vissel-kobe-cerezo-osaka",
        market_slug="vissel-kobe-win-2026-04-29",
        yes_token_id="yes-token",
        no_token_id="no-token",
    )

    links = build_market_links(market)

    assert links.polymarket_url == "https://polymarket.com/event/j-league-vissel-kobe-cerezo-osaka"
    assert links.internal_analysis_url == f"/markets/{market.id}"
    assert links.internal_json_url == f"/markets/{market.id}/analysis"
    assert links.price_history_url == f"/markets/{market.id}/price-history"
    assert links.markdown_url == f"/markets/{market.id}/analysis/markdown"
    assert links.clob_yes_book_url == "https://clob.polymarket.com/book?token_id=yes-token"
    assert links.clob_no_book_url == "https://clob.polymarket.com/book?token_id=no-token"
    assert "polymarket_url_constructed_from_event_slug" in links.source_notes


def test_market_links_do_not_invent_polymarket_url_without_event_slug(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        event_slug="",
        market_slug="market-only-slug",
        yes_token_id=None,
        no_token_id=None,
    )

    links = build_market_links(market)

    assert links.polymarket_url is None
    assert links.polymarket_market_slug == "market-only-slug"
    assert "polymarket_event_slug_missing" in links.source_notes
    assert links.clob_yes_book_url is None
    assert links.clob_no_book_url is None


def test_market_analysis_includes_links(client: TestClient, db_session: Session) -> None:
    market = _create_market(
        db_session,
        event_slug="event-link-test",
        market_slug="market-link-test",
        yes_token_id="yes-token",
        no_token_id="no-token",
    )
    db_session.commit()

    response = client.get(f"/markets/{market.id}/analysis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["links"]["polymarket_url"] == "https://polymarket.com/event/event-link-test"
    assert payload["links"]["internal_json_url"] == f"/markets/{market.id}/analysis"


def _create_market(
    db_session: Session,
    *,
    event_slug: str,
    market_slug: str,
    yes_token_id: str | None,
    no_token_id: str | None,
) -> Market:
    event = Event(
        polymarket_event_id=f"market-links-event-{market_slug}",
        title="Market Links Event",
        category="sports",
        slug=event_slug,
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"market-links-market-{market_slug}",
        event_id=event.id,
        question="Will Vissel Kobe win on 2026-04-29?",
        slug=market_slug,
        yes_token_id=yes_token_id,
        no_token_id=no_token_id,
        sport_type=None,
        market_type="winner",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market
