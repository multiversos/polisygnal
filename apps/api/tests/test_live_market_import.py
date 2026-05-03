from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketEventPayload, PolymarketEventsPage
from app.commands.import_live_discovered_markets import _run as run_live_market_import
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


NOW = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)


class FakeGammaClient:
    def __init__(self, events: list[PolymarketEventPayload]) -> None:
        self.events = events
        self.calls: list[dict[str, object]] = []

    def fetch_active_events_page(
        self,
        *,
        limit: int,
        offset: int,
        tag_id: str | None = None,
        order: str | None = None,
        ascending: bool | None = None,
        end_date_min: datetime | None = None,
        end_date_max: datetime | None = None,
    ):
        self.calls.append(
            {
                "limit": limit,
                "offset": offset,
                "tag_id": tag_id,
                "order": order,
                "ascending": ascending,
                "end_date_min": end_date_min,
                "end_date_max": end_date_max,
            }
        )
        return PolymarketEventsPage(events=self.events)


def test_import_live_discovered_markets_dry_run_does_not_mutate_db(
    db_session: Session,
) -> None:
    before_markets = db_session.scalar(select(func.count()).select_from(Market))
    before_snapshots = db_session.scalar(select(func.count()).select_from(MarketSnapshot))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-dry-run",
                title="NBA upcoming games",
                slug="nba-upcoming-games-import-dry-run",
                markets=[
                    _market_payload(
                        market_id="remote-import-dry-run",
                        question="Lakers vs Warriors",
                        slug="lakers-warriors-import-dry-run",
                    )
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
        max_import=3,
        source_tag_id="sports",
        now=NOW,
    )

    assert payload["status"] == "ok"
    assert payload["read_only"] is True
    assert payload["would_import"] == 1
    assert payload["imported"] == 0
    assert payload["items"][0]["action"] == "would_import"
    assert payload["items"][0]["condition_id"] == "0xremote-import-dry-run"
    assert client.calls[0]["tag_id"] == "sports"
    assert client.calls[0]["order"] == "endDate"
    assert db_session.scalar(select(func.count()).select_from(Market)) == before_markets
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == before_snapshots


def test_import_live_discovered_markets_apply_creates_market_with_identifiers(
    db_session: Session,
) -> None:
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-apply",
                title="MLB upcoming games",
                slug="mlb-upcoming-games-import-apply",
                markets=[
                    _market_payload(
                        market_id="remote-import-apply",
                        question="Yankees vs Dodgers",
                        slug="yankees-dodgers-import-apply",
                    )
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_import=3,
        now=NOW,
    )
    market = db_session.scalar(
        select(Market).where(Market.polymarket_market_id == "remote-import-apply")
    )

    assert payload["imported"] == 1
    assert payload["markets_created"] == 1
    assert payload["snapshots_created"] == 0
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert market is not None
    assert market.condition_id == "0xremote-import-apply"
    assert market.clob_token_ids == [
        "remote-import-apply-yes",
        "remote-import-apply-no",
    ]
    assert market.yes_token_id == "remote-import-apply-yes"
    assert market.no_token_id == "remote-import-apply-no"
    assert market.polymarket_url == "https://polymarket.com/event/mlb-upcoming-games-import-apply"
    assert market.sport_type == "mlb"
    assert market.market_type == "match_winner"
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_import_live_discovered_markets_does_not_duplicate_existing_market(
    db_session: Session,
) -> None:
    _create_existing_market(db_session, remote_id="remote-existing-import")
    before_markets = db_session.scalar(select(func.count()).select_from(Market))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-existing",
                title="NBA existing games",
                slug="nba-existing-games-import",
                markets=[
                    _market_payload(
                        market_id="remote-existing-import",
                        question="Celtics vs Knicks",
                        slug="celtics-knicks-existing-import",
                    )
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_import=3,
    )

    assert payload["imported"] == 0
    assert payload["skipped"] == 1
    assert payload["items"] == []
    assert db_session.scalar(select(func.count()).select_from(Market)) == before_markets


def test_import_live_discovered_markets_uses_min_hours_remote_window(
    db_session: Session,
) -> None:
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-min-window",
                title="NBA min window games",
                slug="nba-min-window-import",
                markets=[
                    _market_payload(
                        market_id="remote-min-window",
                        question="Lakers vs Warriors",
                        slug="lakers-warriors-min-window",
                    )
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
        max_import=3,
        min_hours_to_close=24,
        now=NOW,
    )

    assert payload["would_import"] == 1
    assert client.calls[0]["end_date_min"] == NOW + timedelta(hours=24)


def test_import_live_discovered_markets_respects_max_import(
    db_session: Session,
) -> None:
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-max",
                title="NBA max games",
                slug="nba-max-games-import",
                markets=[
                    _market_payload(
                        market_id="remote-max-1",
                        question="Lakers vs Warriors",
                        slug="lakers-warriors-max-1",
                    ),
                    _market_payload(
                        market_id="remote-max-2",
                        question="Celtics vs Knicks",
                        slug="celtics-knicks-max-2",
                    ),
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_import=1,
        now=NOW,
    )

    assert payload["imported"] == 1
    assert payload["would_import"] == 0
    assert any("max_import_reached" in item["warnings"] for item in payload["items"])


def test_import_live_discovered_markets_skips_incomplete_payload(
    db_session: Session,
) -> None:
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-incomplete",
                title="NBA incomplete games",
                slug="nba-incomplete-games-import",
                markets=[
                    {
                        "id": "remote-incomplete",
                        "question": "Lakers vs Warriors",
                        "active": True,
                        "closed": False,
                        "endDate": (NOW + timedelta(days=2)).isoformat(),
                        "conditionId": "0xincomplete",
                    }
                ],
            )
        ]
    )

    payload = run_live_market_import(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_import=3,
        now=NOW,
    )

    assert payload["imported"] == 0
    assert payload["items"][0]["action"] == "skipped"
    assert "missing_required_metadata" in payload["items"][0]["reasons"]
    assert json.dumps(payload, ensure_ascii=True, default=str)


def _event_payload(
    *,
    event_id: str,
    title: str,
    slug: str,
    markets: list[dict[str, object]],
) -> PolymarketEventPayload:
    return PolymarketEventPayload.model_validate(
        {
            "id": event_id,
            "title": title,
            "slug": slug,
            "category": "sports",
            "active": True,
            "closed": False,
            "endDate": (NOW + timedelta(days=2)).isoformat(),
            "markets": markets,
        }
    )


def _market_payload(*, market_id: str, question: str, slug: str) -> dict[str, object]:
    return {
        "id": market_id,
        "question": question,
        "slug": slug,
        "active": True,
        "closed": False,
        "endDate": (NOW + timedelta(days=2)).isoformat(),
        "conditionId": f"0x{market_id}",
        "questionID": f"qid-{market_id}",
        "clobTokenIds": [f"{market_id}-yes", f"{market_id}-no"],
        "outcomes": ["Yes", "No"],
        "outcomePrices": ["0.55", "0.45"],
        "volume": "1200.50",
        "liquidity": "2200.25",
    }


def _create_existing_market(db_session: Session, *, remote_id: str) -> Market:
    event = Event(
        polymarket_event_id="existing-import-event",
        title="Existing Import Event",
        category="sports",
        slug="existing-import-event",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=remote_id,
        event_id=event.id,
        question="Celtics vs Knicks",
        slug="celtics-knicks-existing-import",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=NOW + timedelta(days=2),
    )
    db_session.add(market)
    db_session.flush()
    return market
