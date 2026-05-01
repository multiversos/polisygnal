from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.routes_research import get_polymarket_client
from app.clients.polymarket import PolymarketEventPayload, PolymarketEventsPage
from app.commands.discover_live_upcoming_markets import _run as run_discovery_command
from app.main import app
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.live_upcoming_discovery import discover_live_upcoming_markets


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


def test_live_upcoming_discovery_classifies_remote_and_local_items(
    db_session: Session,
) -> None:
    local_market = _create_local_market(
        db_session,
        suffix="local-ready",
        polymarket_market_id="remote-local-ready",
        question="Lakers vs Warriors",
        slug="lakers-vs-warriors",
        end_date=NOW + timedelta(days=2),
    )
    _add_snapshot(db_session, market=local_market)
    db_session.flush()
    events = [
        _event_payload(
            event_id="event-1",
            title="NBA upcoming games",
            slug="nba-upcoming-games",
            markets=[
                _market_payload(
                    market_id="remote-local-ready",
                    question="Lakers vs Warriors",
                    slug="lakers-vs-warriors",
                    end_date=NOW + timedelta(days=2),
                    condition_id="0xlocal",
                    prices=["0.55", "0.45"],
                ),
                _market_payload(
                    market_id="remote-missing-local",
                    question="Yankees vs Dodgers",
                    slug="yankees-vs-dodgers",
                    end_date=NOW + timedelta(days=3),
                    condition_id="0xmissing",
                    prices=["0.52", "0.48"],
                ),
                _market_payload(
                    market_id="remote-missing-price",
                    question="Cubs vs Phillies",
                    slug="cubs-vs-phillies",
                    end_date=NOW + timedelta(days=3),
                    condition_id="0xmissingprice",
                    prices=[],
                ),
            ],
        )
    ]
    fake_client = FakeGammaClient(events)

    response = discover_live_upcoming_markets(
        db_session,
        client=fake_client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        source_tag_id="1",
        now=NOW,
    )

    by_remote_id = {item.remote_id: item for item in response.items}
    assert response.summary.total_remote_checked == 3
    assert response.summary.already_local_count == 1
    assert response.summary.missing_local_count == 2
    assert response.summary.remote_with_price_count == 2
    assert response.summary.remote_with_condition_id_count == 3
    assert by_remote_id["remote-local-ready"].discovery_status == "already_local_ready"
    assert by_remote_id["remote-local-ready"].has_local_price is True
    assert by_remote_id["remote-missing-local"].discovery_status == "missing_local_market"
    assert by_remote_id["remote-missing-price"].discovery_status == "remote_missing_price"
    assert fake_client.calls[0]["tag_id"] == "1"
    assert fake_client.calls[0]["order"] == "endDate"
    assert fake_client.calls[0]["ascending"] is True
    assert fake_client.calls[0]["end_date_min"] == NOW
    assert fake_client.calls[0]["end_date_max"] == NOW + timedelta(days=7)


def test_live_upcoming_discovery_filters_focus_and_sport(db_session: Session) -> None:
    events = [
        _event_payload(
            event_id="event-2",
            title="Soccer upcoming games",
            slug="soccer-upcoming-games",
            markets=[
                _market_payload(
                    market_id="remote-soccer",
                    question="Real Madrid vs Barcelona",
                    slug="real-madrid-vs-barcelona",
                    end_date=NOW + timedelta(days=1),
                    condition_id="0xsoccer",
                    prices=["0.58", "0.42"],
                ),
                _market_payload(
                    market_id="remote-prop",
                    question="Both teams to score in Real Madrid vs Barcelona?",
                    slug="both-teams-to-score",
                    end_date=NOW + timedelta(days=1),
                    condition_id="0xprop",
                    prices=["0.50", "0.50"],
                ),
            ],
        )
    ]

    response = discover_live_upcoming_markets(
        db_session,
        client=FakeGammaClient(events),  # type: ignore[arg-type]
        sport="soccer",
        days=7,
        limit=10,
        now=NOW,
    )

    by_remote_id = {item.remote_id: item for item in response.items}
    assert by_remote_id["remote-soccer"].sport == "soccer"
    assert by_remote_id["remote-soccer"].market_shape == "match_winner"
    assert by_remote_id["remote-soccer"].discovery_status == "missing_local_market"
    assert by_remote_id["remote-prop"].discovery_status == "unsupported"
    assert "not_match_winner_focus" in by_remote_id["remote-prop"].reasons


def test_live_upcoming_discovery_uses_min_hours_remote_window(db_session: Session) -> None:
    events = [
        _event_payload(
            event_id="event-min-window",
            title="Soccer upcoming games",
            slug="soccer-min-window",
            markets=[
                _market_payload(
                    market_id="remote-too-soon",
                    question="Real Madrid vs Barcelona",
                    slug="remote-too-soon",
                    end_date=NOW + timedelta(hours=12),
                    condition_id="0xtoosoon",
                    prices=["0.58", "0.42"],
                ),
                _market_payload(
                    market_id="remote-good-window",
                    question="Manchester United vs Chelsea",
                    slug="remote-good-window",
                    end_date=NOW + timedelta(hours=36),
                    condition_id="0xgoodwindow",
                    prices=["0.52", "0.48"],
                ),
            ],
        )
    ]
    fake_client = FakeGammaClient(events)

    response = discover_live_upcoming_markets(
        db_session,
        client=fake_client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        min_hours_to_close=24,
        now=NOW,
    )

    assert fake_client.calls[0]["end_date_min"] == NOW + timedelta(hours=24)
    assert response.filters_applied["remote_end_date_min"] == (NOW + timedelta(hours=24)).isoformat()
    assert {item.remote_id for item in response.items} == {"remote-good-window"}


def test_live_upcoming_discovery_endpoint_is_read_only(
    client: TestClient,
    db_session: Session,
) -> None:
    events = [
        _event_payload(
            event_id="event-3",
            title="MLB upcoming games",
            slug="mlb-upcoming-games",
            markets=[
                _market_payload(
                    market_id="remote-endpoint",
                    question="Yankees vs Dodgers",
                    slug="endpoint-yankees-dodgers",
                    end_date=datetime.now(tz=UTC) + timedelta(days=2),
                    condition_id="0xendpoint",
                    prices=["0.53", "0.47"],
                ),
            ],
        )
    ]
    fake_client = FakeGammaClient(events)

    def override_polymarket_client() -> FakeGammaClient:
        return fake_client

    app.dependency_overrides[get_polymarket_client] = override_polymarket_client
    before_markets = db_session.scalar(select(func.count()).select_from(Market))
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    try:
        response = client.get("/research/live-upcoming-discovery?days=7&limit=5")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total_remote_checked"] == 1
    assert payload["summary"]["missing_local_count"] == 1
    assert payload["items"][0]["condition_id"] == "0xendpoint"
    assert db_session.scalar(select(func.count()).select_from(Market)) == before_markets
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_discover_live_upcoming_markets_command_is_read_only_and_json_serializable(
    db_session: Session,
) -> None:
    events = [
        _event_payload(
            event_id="event-4",
            title="NBA upcoming games",
            slug="nba-upcoming-games-command",
            markets=[
                _market_payload(
                    market_id="remote-command",
                    question="Lakers vs Warriors",
                    slug="command-lakers-warriors",
                    end_date=NOW + timedelta(days=1),
                    condition_id="0xcommand",
                    prices=["0.54", "0.46"],
                ),
            ],
        )
    ]
    before_markets = db_session.scalar(select(func.count()).select_from(Market))
    before_snapshots = db_session.scalar(select(func.count()).select_from(MarketSnapshot))

    payload = run_discovery_command(
        db_session,
        client=FakeGammaClient(events),  # type: ignore[arg-type]
        days=7,
        limit=10,
        now=NOW,
    )

    assert payload["status"] == "ok"
    assert payload["read_only"] is True
    assert payload["sync_executed"] is False
    assert payload["markets_created"] == 0
    assert payload["snapshots_created"] == 0
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["summary"]["remote_with_clob_token_ids_count"] == 1
    assert json.dumps(payload, ensure_ascii=True, default=str)
    assert db_session.scalar(select(func.count()).select_from(Market)) == before_markets
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == before_snapshots


def test_live_upcoming_discovery_endpoint_is_documented(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/research/live-upcoming-discovery" in response.json()["paths"]


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
            "markets": markets,
        }
    )


def _market_payload(
    *,
    market_id: str,
    question: str,
    slug: str,
    end_date: datetime,
    condition_id: str,
    prices: list[str],
) -> dict[str, object]:
    return {
        "id": market_id,
        "question": question,
        "slug": slug,
        "active": True,
        "closed": False,
        "endDate": end_date.isoformat(),
        "conditionId": condition_id,
        "clobTokenIds": [f"{market_id}-yes", f"{market_id}-no"],
        "outcomes": ["Yes", "No"],
        "outcomePrices": prices,
        "volume": "1200.50",
        "liquidity": "2200.25",
    }


def _create_local_market(
    db_session: Session,
    *,
    suffix: str,
    polymarket_market_id: str,
    question: str,
    slug: str,
    end_date: datetime,
) -> Market:
    event = Event(
        polymarket_event_id=f"live-discovery-event-{suffix}",
        title=f"Live Discovery Event {suffix}",
        category="sports",
        slug=f"live-discovery-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=polymarket_market_id,
        event_id=event.id,
        question=question,
        slug=slug,
        sport_type="nba",
        market_type="winner",
        active=True,
        closed=False,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(db_session: Session, *, market: Market) -> None:
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=NOW,
            yes_price=Decimal("0.5500"),
            no_price=Decimal("0.4500"),
            midpoint=Decimal("0.5500"),
            last_trade_price=Decimal("0.5400"),
            spread=Decimal("0.0100"),
            volume=Decimal("1200.0000"),
            liquidity=Decimal("2200.0000"),
        )
    )
    db_session.flush()
