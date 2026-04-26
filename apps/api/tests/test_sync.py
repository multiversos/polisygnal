from __future__ import annotations

from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes import get_polymarket_client
from app.clients.polymarket import PolymarketEventPayload, PolymarketEventsPage
from app.main import app
from app.models.event import Event
from app.models.market import Market


class FakePolymarketClient:
    requested_tag_ids: list[str | None] = []
    include_images: bool = True

    def __init__(self) -> None:
        event_payload = {
            "id": "27830",
            "slug": "2026-nba-champion",
            "title": "2026 NBA Champion",
            "active": True,
            "closed": False,
            "tags": [
                {"id": "1", "label": "Sports", "slug": "sports"},
                {"id": "745", "label": "NBA", "slug": "nba"},
            ],
            "markets": [
                {
                    "id": "553856",
                    "question": "Will the Oklahoma City Thunder win the 2026 NBA Finals?",
                    "slug": "will-the-oklahoma-city-thunder-win-the-2026-nba-finals",
                    "description": "Official NBA result determines resolution.",
                    "active": True,
                    "closed": False,
                    "clobTokenIds": "[\"yes-token\", \"no-token\"]",
                },
                {
                    "id": "bad-market",
                    "slug": "bad-market",
                    "active": True,
                    "closed": False,
                },
            ],
        }
        if self.include_images:
            event_payload["image"] = "https://polymarket.example/events/nba.png"
            event_payload["icon"] = "https://polymarket.example/events/nba-icon.png"
            event_payload["markets"][0]["imageUrl"] = (
                "https://polymarket.example/markets/thunder.png"
            )
            event_payload["markets"][0]["iconUrl"] = (
                "https://polymarket.example/markets/thunder-icon.png"
            )
        self._pages = {
            0: PolymarketEventsPage(
                events=[
                    PolymarketEventPayload.model_validate(event_payload),
                    PolymarketEventPayload.model_validate(
                        {
                            "id": "99999",
                            "slug": "will-bitcoin-hit-200k",
                            "title": "Will Bitcoin hit 200k in 2026?",
                            "category": "crypto",
                            "active": True,
                            "closed": False,
                            "tags": [
                                {"id": "2", "label": "Crypto", "slug": "crypto"},
                            ],
                            "markets": [
                                {
                                    "id": "crypto-1",
                                    "question": "Will Bitcoin hit 200k in 2026?",
                                    "slug": "will-bitcoin-hit-200k-in-2026",
                                    "active": True,
                                    "closed": False,
                                    "clobTokenIds": "[\"crypto-yes\", \"crypto-no\"]",
                                }
                            ],
                        }
                    ),
                ],
                errors=[],
                next_offset=None,
            )
        }

    def fetch_active_events_page(
        self,
        *,
        limit: int,
        offset: int,
        tag_id: str | None = None,
    ) -> PolymarketEventsPage:
        self.requested_tag_ids.append(tag_id)
        return self._pages.get(offset, PolymarketEventsPage(events=[], next_offset=None))

    def close(self) -> None:
        return None


def override_polymarket_client() -> Generator[FakePolymarketClient, None, None]:
    yield FakePolymarketClient()


def test_sync_polymarket_creates_records(client: TestClient, db_session: Session) -> None:
    FakePolymarketClient.requested_tag_ids.clear()
    app.dependency_overrides[get_polymarket_client] = override_polymarket_client
    try:
        FakePolymarketClient.include_images = True
        first_response = client.post("/sync/polymarket")
        FakePolymarketClient.include_images = False
        second_response = client.post("/sync/polymarket")
    finally:
        FakePolymarketClient.include_images = True
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert first_response.status_code == 200
    first_payload = first_response.json()
    assert first_payload["events_created"] == 1
    assert first_payload["markets_created"] == 1
    assert first_payload["events_updated"] == 0
    assert first_payload["markets_updated"] == 0
    assert len(first_payload["partial_errors"]) == 1
    assert "Mercado descartado" in first_payload["partial_errors"][0]

    assert second_response.status_code == 200
    second_payload = second_response.json()
    assert second_payload["events_created"] == 0
    assert second_payload["markets_created"] == 0
    assert second_payload["events_updated"] == 0
    assert second_payload["markets_updated"] == 0

    stored_market = db_session.scalar(select(Market).where(Market.polymarket_market_id == "553856"))
    assert stored_market is not None
    assert stored_market.sport_type == "nba"
    assert stored_market.market_type == "winner"
    assert stored_market.yes_token_id == "yes-token"
    assert stored_market.no_token_id == "no-token"
    assert stored_market.image_url == "https://polymarket.example/markets/thunder.png"
    assert stored_market.icon_url == "https://polymarket.example/markets/thunder-icon.png"

    stored_event = db_session.scalar(select(Event).where(Event.polymarket_event_id == "27830"))
    assert stored_event is not None
    assert stored_event.image_url == "https://polymarket.example/events/nba.png"
    assert stored_event.icon_url == "https://polymarket.example/events/nba-icon.png"

    skipped_market = db_session.scalar(
        select(Market).where(Market.polymarket_market_id == "crypto-1")
    )
    assert skipped_market is None
    assert FakePolymarketClient.requested_tag_ids == ["745", "745"]
