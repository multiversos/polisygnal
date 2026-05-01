from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketEventPayload, PolymarketEventsPage
from app.commands.create_snapshots_from_discovery import _run as run_discovery_snapshots
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.discovery_snapshots import create_snapshots_from_discovery_pricing


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


def test_discovery_snapshot_dry_run_does_not_create_snapshot(db_session: Session) -> None:
    _create_local_market(db_session, remote_id="remote-dry-run", slug="lakers-warriors")
    before_snapshots = db_session.scalar(select(func.count()).select_from(MarketSnapshot))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-dry-run",
                title="NBA upcoming games",
                slug="nba-upcoming-games-snapshot-dry-run",
                markets=[
                    _market_payload(
                        market_id="remote-dry-run",
                        question="Lakers vs Warriors",
                        slug="lakers-warriors",
                        prices=["0.62", "0.38"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
        max_snapshots=3,
        now=NOW,
    )

    assert summary.would_create == 1
    assert summary.snapshots_created == 0
    assert summary.items[0].action == "would_create_snapshot"
    assert summary.items[0].yes_price == Decimal("0.6200")
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == before_snapshots


def test_discovery_snapshot_apply_creates_snapshot_from_remote_prices(
    db_session: Session,
) -> None:
    market = _create_local_market(db_session, remote_id="remote-apply", slug="yankees-dodgers")
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-apply",
                title="MLB upcoming games",
                slug="mlb-upcoming-games-snapshot-apply",
                markets=[
                    _market_payload(
                        market_id="remote-apply",
                        question="Yankees vs Dodgers",
                        slug="yankees-dodgers",
                        prices=["0.57", "0.43"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_snapshots=3,
        now=NOW,
    )
    snapshot = db_session.scalar(
        select(MarketSnapshot).where(MarketSnapshot.market_id == market.id)
    )

    assert summary.snapshots_created == 1
    assert summary.predictions_created == 0
    assert summary.research_runs_created == 0
    assert snapshot is not None
    assert snapshot.yes_price == Decimal("0.5700")
    assert snapshot.no_price == Decimal("0.4300")
    assert snapshot.midpoint == Decimal("0.5700")
    assert snapshot.liquidity == Decimal("2200.2500")
    assert snapshot.volume == Decimal("1200.5000")
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_discovery_snapshot_skips_missing_binary_prices(db_session: Session) -> None:
    _create_local_market(db_session, remote_id="remote-missing-price", slug="missing-price")
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-missing-price",
                title="NBA missing price",
                slug="nba-missing-price",
                markets=[
                    _market_payload(
                        market_id="remote-missing-price",
                        question="Celtics vs Knicks",
                        slug="missing-price",
                        prices=["0.51"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_snapshots=3,
        now=NOW,
    )

    assert summary.snapshots_created == 0
    assert summary.snapshots_skipped == 1
    assert summary.items[0].reason == "remote_payload_missing_binary_prices"


def test_discovery_snapshot_ignores_remote_market_without_local_match(
    db_session: Session,
) -> None:
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-no-local",
                title="NBA no local",
                slug="nba-no-local",
                markets=[
                    _market_payload(
                        market_id="remote-no-local",
                        question="Lakers vs Warriors",
                        slug="remote-no-local",
                        prices=["0.52", "0.48"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_snapshots=3,
        now=NOW,
    )

    assert summary.local_candidates == 0
    assert summary.snapshots_created == 0


def test_discovery_snapshot_uses_min_hours_remote_window(db_session: Session) -> None:
    _create_local_market(db_session, remote_id="remote-min-window", slug="min-window")
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-min-window",
                title="NBA min window",
                slug="nba-min-window",
                markets=[
                    _market_payload(
                        market_id="remote-min-window",
                        question="Lakers vs Warriors",
                        slug="min-window",
                        prices=["0.52", "0.48"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
        max_snapshots=3,
        min_hours_to_close=24,
        now=NOW,
    )

    assert summary.would_create == 1
    assert client.calls[0]["end_date_min"] == NOW + timedelta(hours=24)


def test_discovery_snapshot_skips_unsupported_props(db_session: Session) -> None:
    _create_local_market(db_session, remote_id="remote-prop", slug="prop-market")
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-prop",
                title="NBA props",
                slug="nba-props",
                markets=[
                    _market_payload(
                        market_id="remote-prop",
                        question="Lakers vs Warriors: O/U 220.5",
                        slug="prop-market",
                        prices=["0.52", "0.48"],
                    )
                ],
            )
        ]
    )

    summary = create_snapshots_from_discovery_pricing(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_snapshots=3,
        now=NOW,
    )

    assert summary.local_candidates == 0
    assert summary.snapshots_created == 0
    assert summary.snapshots_skipped == 1


def test_discovery_snapshot_respects_max_snapshots(db_session: Session) -> None:
    _create_local_market(db_session, remote_id="remote-max-1", slug="max-one")
    _create_local_market(db_session, remote_id="remote-max-2", slug="max-two")
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-max",
                title="NBA max snapshots",
                slug="nba-max-snapshots",
                markets=[
                    _market_payload(
                        market_id="remote-max-1",
                        question="Lakers vs Warriors",
                        slug="max-one",
                        prices=["0.52", "0.48"],
                    ),
                    _market_payload(
                        market_id="remote-max-2",
                        question="Celtics vs Knicks",
                        slug="max-two",
                        prices=["0.53", "0.47"],
                    ),
                ],
            )
        ]
    )

    payload = run_discovery_snapshots(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
        max_snapshots=1,
    )

    assert payload["snapshots_created"] == 1
    assert any("max_snapshots_reached" in item["warnings"] for item in payload["items"])
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


def _market_payload(
    *,
    market_id: str,
    question: str,
    slug: str,
    prices: list[str],
) -> dict[str, object]:
    return {
        "id": market_id,
        "question": question,
        "slug": slug,
        "active": True,
        "closed": False,
        "endDate": (NOW + timedelta(days=2)).isoformat(),
        "conditionId": f"0x{market_id}",
        "clobTokenIds": [f"{market_id}-yes", f"{market_id}-no"],
        "outcomes": ["Yes", "No"],
        "outcomePrices": prices,
        "volume": "1200.50",
        "liquidity": "2200.25",
    }


def _create_local_market(db_session: Session, *, remote_id: str, slug: str) -> Market:
    event = Event(
        polymarket_event_id=f"snapshot-event-{remote_id}",
        title=f"Snapshot Event {remote_id}",
        category="sports",
        slug=f"snapshot-event-{remote_id}",
        active=True,
        closed=False,
        start_at=NOW + timedelta(days=2),
        end_at=NOW + timedelta(days=2),
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=remote_id,
        event_id=event.id,
        question="Lakers vs Warriors",
        slug=slug,
        condition_id=f"0x{remote_id}",
        clob_token_ids=[f"{remote_id}-yes", f"{remote_id}-no"],
        yes_token_id=f"{remote_id}-yes",
        no_token_id=f"{remote_id}-no",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=NOW + timedelta(days=2),
    )
    db_session.add(market)
    db_session.flush()
    return market
