from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketMarketDetailsPayload
from app.commands.refresh_market_metadata import _run as run_metadata_refresh
from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


class FakeGammaClient:
    def __init__(self, payloads: dict[str, dict[str, object]]) -> None:
        self.payloads = payloads

    def fetch_markets_by_ids(
        self,
        market_ids: list[str],
    ) -> dict[str, PolymarketMarketDetailsPayload]:
        return {
            market_id: PolymarketMarketDetailsPayload.model_validate(self.payloads[market_id])
            for market_id in market_ids
            if market_id in self.payloads
        }


def test_metadata_refresh_dry_run_does_not_update_market(db_session: Session) -> None:
    market = _create_market(db_session, suffix="dry-run")
    remote_end = datetime.now(tz=UTC) + timedelta(days=3)
    client = FakeGammaClient(
        {
            market.polymarket_market_id: {
                "id": market.polymarket_market_id,
                "question": "Remote question",
                "slug": "remote-question",
                "active": False,
                "closed": True,
                "endDate": remote_end.isoformat(),
                "clobTokenIds": '["remote-yes", "remote-no"]',
            }
        }
    )

    payload = run_metadata_refresh(
        db_session,
        gamma_client=client,
        market_id=market.id,
        dry_run=True,
    )
    db_session.refresh(market)

    assert payload["dry_run"] is True
    assert payload["items"][0]["action"] == "would_update"
    assert {change["field"] for change in payload["items"][0]["changes"]} >= {
        "question",
        "slug",
        "active",
        "closed",
        "end_date",
        "yes_token_id",
        "no_token_id",
    }
    assert market.question == "Local question dry-run"
    assert market.active is True
    assert market.closed is False
    assert market.yes_token_id == "local-yes"


def test_metadata_refresh_apply_updates_safe_fields_without_null_overwrite(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="apply",
        image_url="https://local.example/image.png",
        icon_url="https://local.example/icon.png",
    )
    remote_end = datetime.now(tz=UTC) + timedelta(days=4)
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))
    client = FakeGammaClient(
        {
            market.polymarket_market_id: {
                "id": market.polymarket_market_id,
                "question": "Remote question apply",
                "slug": "remote-question-apply",
                "description": "Remote rules",
                "active": True,
                "closed": False,
                "endDate": remote_end.isoformat(),
                "clobTokenIds": '["remote-yes", "remote-no"]',
                "image": None,
                "icon": None,
            }
        }
    )

    payload = run_metadata_refresh(
        db_session,
        gamma_client=client,
        market_id=market.id,
        dry_run=False,
    )
    db_session.refresh(market)

    assert payload["dry_run"] is False
    assert payload["apply"] is True
    assert payload["markets_updated"] == 1
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["trading_executed"] is False
    assert market.question == "Remote question apply"
    assert market.slug == "remote-question-apply"
    assert market.rules_text == "Remote rules"
    assert market.yes_token_id == "remote-yes"
    assert market.no_token_id == "remote-no"
    assert market.image_url == "https://local.example/image.png"
    assert market.icon_url == "https://local.example/icon.png"
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_metadata_refresh_limit_is_respected(db_session: Session) -> None:
    markets = [_create_market(db_session, suffix=f"limit-{index}") for index in range(3)]
    client = FakeGammaClient(
        {
            market.polymarket_market_id: {
                "id": market.polymarket_market_id,
                "question": market.question,
                "slug": market.slug,
                "active": market.active,
                "closed": market.closed,
                "endDate": market.end_date.isoformat() if market.end_date else None,
                "clobTokenIds": '["local-yes", "local-no"]',
            }
            for market in markets
        }
    )

    payload = run_metadata_refresh(
        db_session,
        gamma_client=client,
        limit=2,
        days=7,
        dry_run=True,
    )

    assert payload["markets_checked"] == 2
    assert len(payload["items"]) == 2


def test_metadata_refresh_market_not_found_has_stable_error(db_session: Session) -> None:
    with pytest.raises(ValueError, match="market_id=999999 no existe"):
        run_metadata_refresh(
            db_session,
            gamma_client=FakeGammaClient({}),
            market_id=999999,
            dry_run=True,
        )


def test_metadata_refresh_json_payload_is_serializable(db_session: Session) -> None:
    market = _create_market(db_session, suffix="json")
    client = FakeGammaClient(
        {
            market.polymarket_market_id: {
                "id": market.polymarket_market_id,
                "question": market.question,
                "slug": market.slug,
                "active": market.active,
                "closed": market.closed,
            }
        }
    )

    payload = run_metadata_refresh(
        db_session,
        gamma_client=client,
        market_id=market.id,
        dry_run=True,
    )

    encoded = json.dumps(payload, ensure_ascii=True)
    assert '"dry_run": true' in encoded
    assert '"trading_executed": false' in encoded


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    image_url: str | None = None,
    icon_url: str | None = None,
) -> Market:
    event = Event(
        polymarket_event_id=f"metadata-refresh-event-{suffix}",
        title=f"Metadata Refresh Event {suffix}",
        category="sports",
        slug=f"metadata-refresh-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"metadata-refresh-market-{suffix}",
        event_id=event.id,
        question=f"Local question {suffix}",
        slug=f"local-question-{suffix}",
        yes_token_id="local-yes",
        no_token_id="local-no",
        sport_type="mlb",
        market_type="match_winner",
        image_url=image_url,
        icon_url=icon_url,
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.commit()
    return market
