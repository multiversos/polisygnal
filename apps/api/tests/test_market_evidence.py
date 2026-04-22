from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.source import Source


def test_get_market_evidence_returns_items_with_source_and_filter(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-evidence-http-1",
        title="Knicks vs Celtics",
        category="sports",
        slug="knicks-vs-celtics-http",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-evidence-http-1",
        event_id=event.id,
        question="Will the New York Knicks beat the Boston Celtics tonight?",
        slug="will-the-new-york-knicks-beat-the-boston-celtics-tonight-http",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    source_old = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id="https://www.espn.com/story/old",
        title="Older news",
        url="https://www.espn.com/story/old",
        published_at=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
        fetched_at=datetime(2026, 4, 20, 10, 5, tzinfo=UTC),
        raw_text="Older news raw text",
    )
    source_new = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="odds-event-1",
        title="Boston Celtics at New York Knicks",
        published_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
        fetched_at=datetime(2026, 4, 20, 12, 1, tzinfo=UTC),
        raw_json={"id": "odds-event-1"},
    )
    db_session.add_all([source_old, source_new])
    db_session.flush()

    evidence_old = EvidenceItem(
        market_id=market.id,
        source_id=source_old.id,
        provider="espn_rss",
        evidence_type="news",
        stance="unknown",
        strength=None,
        confidence=None,
        summary="Older news summary",
        high_contradiction=False,
    )
    evidence_new = EvidenceItem(
        market_id=market.id,
        source_id=source_new.id,
        provider="the_odds_api",
        evidence_type="odds",
        stance="favor",
        strength=Decimal("0.6000"),
        confidence=Decimal("0.75"),
        summary="Odds summary",
        high_contradiction=False,
        bookmaker_count=3,
        metadata_json={"matched_event_id": "odds-event-1"},
    )
    db_session.add_all([evidence_old, evidence_new])
    db_session.commit()

    response = client.get(f"/markets/{market.id}/evidence")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert payload[0]["evidence_type"] == "odds"
    assert payload[0]["source"]["provider"] == "the_odds_api"
    assert payload[0]["source"]["external_id"] == "odds-event-1"
    assert payload[1]["evidence_type"] == "news"

    odds_only_response = client.get(
        f"/markets/{market.id}/evidence",
        params={"evidence_type": "odds"},
    )

    assert odds_only_response.status_code == 200
    odds_only_payload = odds_only_response.json()
    assert len(odds_only_payload) == 1
    assert odds_only_payload[0]["evidence_type"] == "odds"
    assert odds_only_payload[0]["bookmaker_count"] == 3


def test_get_market_references_returns_flattened_items_sorted_newest_first(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-references-http-1",
        title="Knicks vs Celtics references",
        category="sports",
        slug="knicks-vs-celtics-references-http",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-references-http-1",
        event_id=event.id,
        question="Will the New York Knicks beat the Boston Celtics tonight?",
        slug="will-the-new-york-knicks-beat-the-boston-celtics-tonight-references-http",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.flush()

    older_source = Source(
        market_id=market.id,
        provider="espn_rss",
        source_type="news",
        external_id="https://www.espn.com/story/references-old",
        title="Older reference",
        url="https://www.espn.com/story/references-old",
        published_at=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
        fetched_at=datetime(2026, 4, 20, 10, 10, tzinfo=UTC),
        raw_text="Older reference raw text",
    )
    newer_source = Source(
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="odds-reference-1",
        title="Newer reference",
        url="https://odds.example.com/reference-1",
        published_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
        fetched_at=datetime(2026, 4, 20, 12, 1, tzinfo=UTC),
        raw_json={"id": "odds-reference-1"},
    )
    db_session.add_all([older_source, newer_source])
    db_session.flush()

    older_item = EvidenceItem(
        market_id=market.id,
        source_id=older_source.id,
        provider="espn_rss",
        evidence_type="news",
        stance="unknown",
        strength=None,
        confidence=Decimal("0.55"),
        summary="Older reference summary",
        high_contradiction=False,
    )
    newer_item = EvidenceItem(
        market_id=market.id,
        source_id=newer_source.id,
        provider="the_odds_api",
        evidence_type="odds",
        stance="favor",
        strength=Decimal("0.6000"),
        confidence=Decimal("0.75"),
        summary="Newer reference summary",
        high_contradiction=True,
        bookmaker_count=3,
        metadata_json={"matched_event_id": "odds-reference-1"},
    )
    db_session.add_all([older_item, newer_item])
    db_session.commit()

    response = client.get(f"/markets/{market.id}/references")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["question"] == market.question
    assert len(payload["items"]) == 2
    assert payload["items"][0]["provider"] == "the_odds_api"
    assert payload["items"][0]["source_type"] == "odds"
    assert payload["items"][0]["evidence_type"] == "odds"
    assert payload["items"][0]["title"] == "Newer reference"
    assert payload["items"][0]["url"] == "https://odds.example.com/reference-1"
    assert payload["items"][0]["published_at"] == "2026-04-20T12:00:00"
    assert payload["items"][0]["summary"] == "Newer reference summary"
    assert payload["items"][0]["stance"] == "favor"
    assert payload["items"][0]["confidence"] == "0.75"
    assert payload["items"][0]["high_contradiction"] is True
    assert payload["items"][1]["provider"] == "espn_rss"
    assert payload["items"][1]["source_type"] == "news"
    assert payload["items"][1]["published_at"] == "2026-04-20T10:00:00"


def test_get_market_references_returns_empty_items_for_market_without_references(
    client: TestClient,
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-references-http-empty",
        title="Empty references event",
        category="sports",
        slug="empty-references-event-http",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-references-http-empty",
        event_id=event.id,
        question="Will the Knicks win tonight?",
        slug="will-the-knicks-win-tonight-empty-references-http",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.commit()

    response = client.get(f"/markets/{market.id}/references")

    assert response.status_code == 200
    assert response.json() == {
        "market_id": market.id,
        "question": market.question,
        "items": [],
    }


def test_get_market_evidence_returns_404_for_unknown_market(client: TestClient) -> None:
    response = client.get("/markets/999/evidence")

    assert response.status_code == 404


def test_get_market_references_returns_404_for_unknown_market(client: TestClient) -> None:
    response = client.get("/markets/999/references")

    assert response.status_code == 404
