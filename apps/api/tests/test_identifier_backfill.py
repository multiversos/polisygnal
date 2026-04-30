from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketEventPayload, PolymarketEventsPage
from app.commands.backfill_market_identifiers_from_discovery import (
    _run as run_identifier_backfill,
)
from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.identifier_backfill import backfill_market_identifiers_from_discovery


NOW = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)


class FakeGammaClient:
    def __init__(self, events: list[PolymarketEventPayload]) -> None:
        self.events = events

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
        del limit, offset, tag_id, order, ascending, end_date_min, end_date_max
        return PolymarketEventsPage(events=self.events)


def test_identifier_backfill_dry_run_does_not_update_market(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="dry-run",
        polymarket_market_id="remote-dry-run",
        question="Lakers vs Warriors",
        slug="local-lakers-warriors",
        end_date=NOW + timedelta(days=1),
    )
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-dry-run",
                title="Lakers vs Warriors",
                slug="nba-lal-gsw-2026-04-30",
                markets=[
                    _market_payload(
                        market_id="remote-dry-run",
                        question="Lakers vs Warriors",
                        slug="nba-lal-gsw-2026-04-30",
                        condition_id="0xdryrun",
                    )
                ],
            )
        ]
    )

    payload = run_identifier_backfill(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
    )
    db_session.refresh(market)

    assert payload["dry_run"] is True
    assert payload["items"][0]["action"] == "would_update"
    assert payload["items"][0]["match_confidence"] == "1.00"
    assert {change["field"] for change in payload["items"][0]["changes"]} >= {
        "condition_id",
        "clob_token_ids",
        "yes_token_id",
        "no_token_id",
        "polymarket_url",
    }
    assert market.condition_id is None
    assert market.clob_token_ids is None
    assert market.yes_token_id is None


def test_identifier_backfill_apply_updates_missing_identifiers_only(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="apply",
        polymarket_market_id="remote-apply",
        question="Yankees vs Dodgers",
        slug="local-yankees-dodgers",
        end_date=NOW + timedelta(days=2),
    )
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-apply",
                title="Yankees vs Dodgers",
                slug="mlb-nyy-lad-2026-05-01",
                markets=[
                    _market_payload(
                        market_id="remote-apply",
                        question="Yankees vs Dodgers",
                        slug="mlb-nyy-lad-2026-05-01",
                        condition_id="0xapply",
                    )
                ],
            )
        ]
    )

    payload = run_identifier_backfill(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
    )
    db_session.refresh(market)

    assert payload["dry_run"] is False
    assert payload["apply"] is True
    assert payload["items"][0]["action"] == "updated"
    assert payload["candidates_updated"] == 1
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert market.condition_id == "0xapply"
    assert market.clob_token_ids == ["remote-apply-yes", "remote-apply-no"]
    assert market.yes_token_id == "remote-apply-yes"
    assert market.no_token_id == "remote-apply-no"
    assert market.outcome_tokens == [
        {"token_id": "remote-apply-yes", "outcome_index": 0, "outcome": "Yes"},
        {"token_id": "remote-apply-no", "outcome_index": 1, "outcome": "No"},
    ]
    assert market.polymarket_url == "https://polymarket.com/event/mlb-nyy-lad-2026-05-01"
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_identifier_backfill_does_not_overwrite_existing_identifiers(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="existing",
        polymarket_market_id="remote-existing",
        question="Celtics vs 76ers",
        slug="local-celtics-76ers",
        end_date=NOW + timedelta(days=2),
    )
    market.condition_id = "0xexisting"
    market.clob_token_ids = ["existing-yes", "existing-no"]
    market.yes_token_id = "existing-yes"
    market.no_token_id = "existing-no"
    db_session.flush()
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-existing",
                title="Celtics vs 76ers",
                slug="nba-bos-phi-2026-05-01",
                markets=[
                    _market_payload(
                        market_id="remote-existing",
                        question="Celtics vs 76ers",
                        slug="nba-bos-phi-2026-05-01",
                        condition_id="0xremote-different",
                    )
                ],
            )
        ]
    )

    payload = run_identifier_backfill(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
    )
    db_session.refresh(market)

    assert payload["items"][0]["action"] == "would_update" or payload["items"][0]["action"] == "updated"
    assert market.condition_id == "0xexisting"
    assert market.clob_token_ids == ["existing-yes", "existing-no"]
    assert market.yes_token_id == "existing-yes"
    assert market.no_token_id == "existing-no"


def test_identifier_backfill_title_match_can_update_above_threshold(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="title",
        polymarket_market_id="old-local-id",
        question="Nuggets vs Timberwolves",
        slug="old-nuggets-timberwolves",
        end_date=NOW + timedelta(days=1),
    )
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-title",
                title="Nuggets vs Timberwolves",
                slug="nba-den-min-2026-04-30",
                markets=[
                    _market_payload(
                        market_id="remote-title",
                        question="Nuggets vs Timberwolves",
                        slug="nba-den-min-2026-04-30",
                        condition_id="0xtitle",
                    )
                ],
            )
        ]
    )

    summary = backfill_market_identifiers_from_discovery(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
        now=NOW,
    )

    assert summary.items[0].action == "would_update"
    assert summary.items[0].match_reason == "matched_by_title_close_time_sport_shape"
    assert summary.items[0].match_confidence == Decimal("0.93")
    assert summary.items[0].local_market_id == market.id


def test_identifier_backfill_ambiguous_match_requires_no_apply(
    db_session: Session,
) -> None:
    _create_market(
        db_session,
        suffix="ambiguous-a",
        polymarket_market_id="ambiguous-local-a",
        question="Knicks vs Hawks",
        slug="ambiguous-local-a",
        end_date=NOW + timedelta(days=1),
    )
    _create_market(
        db_session,
        suffix="ambiguous-b",
        polymarket_market_id="ambiguous-local-b",
        question="Knicks vs Hawks",
        slug="ambiguous-local-b",
        end_date=NOW + timedelta(days=1),
    )
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-ambiguous",
                title="Knicks vs Hawks",
                slug="nba-nyk-atl-2026-04-30",
                markets=[
                    _market_payload(
                        market_id="remote-ambiguous",
                        question="Knicks vs Hawks",
                        slug="nba-nyk-atl-2026-04-30",
                        condition_id="0xambiguous",
                    )
                ],
            )
        ]
    )

    payload = run_identifier_backfill(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=False,
    )

    assert payload["items"][0]["action"] == "no_match"
    assert payload["items"][0]["match_reason"] == "ambiguous_title_match"
    assert payload["items"][0]["warnings"] == ["ambiguous_match"]


def test_identifier_backfill_market_not_found_has_stable_error(db_session: Session) -> None:
    client = FakeGammaClient([])

    try:
        run_identifier_backfill(
            db_session,
            client=client,  # type: ignore[arg-type]
            market_id=999999,
            dry_run=True,
        )
    except ValueError as exc:
        assert "market_id=999999 no existe" in str(exc)
    else:
        raise AssertionError("Expected ValueError for missing market_id")


def test_identifier_backfill_json_payload_is_serializable(db_session: Session) -> None:
    _create_market(
        db_session,
        suffix="json",
        polymarket_market_id="remote-json",
        question="Spurs vs Trail Blazers",
        slug="local-spurs-trail-blazers",
        end_date=NOW + timedelta(days=1),
    )
    client = FakeGammaClient(
        [
            _event_payload(
                event_id="event-json",
                title="Spurs vs Trail Blazers",
                slug="nba-sas-por-2026-04-30",
                markets=[
                    _market_payload(
                        market_id="remote-json",
                        question="Spurs vs Trail Blazers",
                        slug="nba-sas-por-2026-04-30",
                        condition_id="0xjson",
                    )
                ],
            )
        ]
    )

    payload = run_identifier_backfill(
        db_session,
        client=client,  # type: ignore[arg-type]
        days=7,
        limit=10,
        dry_run=True,
    )

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
            "endDate": (NOW + timedelta(days=1)).isoformat(),
            "markets": markets,
        }
    )


def _market_payload(
    *,
    market_id: str,
    question: str,
    slug: str,
    condition_id: str,
) -> dict[str, object]:
    return {
        "id": market_id,
        "question": question,
        "slug": slug,
        "active": True,
        "closed": False,
        "endDate": (NOW + timedelta(days=1)).isoformat(),
        "conditionId": condition_id,
        "clobTokenIds": [f"{market_id}-yes", f"{market_id}-no"],
        "outcomes": ["Yes", "No"],
        "outcomePrices": ["0.55", "0.45"],
    }


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    polymarket_market_id: str,
    question: str,
    slug: str,
    end_date: datetime,
) -> Market:
    event = Event(
        polymarket_event_id=f"identifier-backfill-event-{suffix}",
        title=f"Identifier Backfill Event {suffix}",
        category="sports",
        slug=f"identifier-backfill-event-{suffix}",
        active=True,
        closed=False,
        start_at=end_date,
        end_at=end_date,
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
