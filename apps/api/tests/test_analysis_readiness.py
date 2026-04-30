from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.inspect_analysis_readiness import _run as run_readiness_command
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.research.analysis_readiness import list_analysis_readiness


NOW = datetime(2026, 4, 27, 12, 0, tzinfo=UTC)


def test_analysis_readiness_classifies_ready_needs_refresh_and_blocked(
    db_session: Session,
) -> None:
    ready = _create_market(
        db_session,
        suffix="ready",
        question="Lakers vs Warriors",
        sport_type="nba",
        market_type="winner",
        end_date=NOW + timedelta(days=2),
    )
    needs_refresh = _create_market(
        db_session,
        suffix="needs-refresh",
        question="Yankees vs Dodgers",
        sport_type="mlb",
        market_type="winner",
        end_date=NOW + timedelta(days=1),
    )
    blocked = _create_market(
        db_session,
        suffix="blocked",
        question="Will Unknown Club win on 2026-04-29?",
        sport_type=None,
        market_type="winner",
        end_date=NOW + timedelta(days=1),
    )
    exact_score = _create_market(
        db_session,
        suffix="exact-score",
        question="Exact Score: Nottingham Forest FC 1 - 0 Aston Villa FC?",
        sport_type="soccer",
        market_type="winner",
        end_date=NOW + timedelta(days=1),
    )
    _add_snapshot(db_session, market=ready)
    db_session.flush()

    response = list_analysis_readiness(db_session, days=7, limit=10, now=NOW)
    by_id = {item.market_id: item for item in response.items}

    assert response.summary.total_checked == 4
    assert response.summary.ready_count == 1
    assert response.summary.refresh_needed_count == 1
    assert response.summary.blocked_count == 2
    assert by_id[ready.id].readiness_status == "ready"
    assert by_id[ready.id].yes_price == Decimal("0.5600")
    assert by_id[ready.id].time_window_label == "1-3 dias"
    assert by_id[ready.id].suggested_next_action == "listo_para_research_packet"
    assert by_id[needs_refresh.id].readiness_status == "needs_refresh"
    assert by_id[needs_refresh.id].time_window_label == "1-3 dias"
    assert by_id[needs_refresh.id].suggested_next_action == (
        "buen_candidato_para_refresh_controlado"
    )
    assert "snapshot" in by_id[needs_refresh.id].missing_fields
    assert "--dry-run --json" in by_id[needs_refresh.id].suggested_refresh_snapshot_command
    assert by_id[blocked.id].readiness_status == "blocked"
    assert "sport" in by_id[blocked.id].missing_fields
    assert by_id[exact_score.id].readiness_status == "blocked"
    assert "non_primary_market" in by_id[exact_score.id].reasons
    assert "market_shape" in by_id[exact_score.id].missing_fields


def test_analysis_readiness_endpoint_is_read_only(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="endpoint",
        question="Lakers vs Warriors",
        sport_type="nba",
        market_type="winner",
        end_date=datetime.now(tz=UTC) + timedelta(days=2),
    )
    _add_snapshot(db_session, market=market)
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get("/research/analysis-readiness?sport=nba&days=7&limit=10")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total_checked"] == 1
    assert payload["summary"]["ready_count"] == 1
    assert payload["items"][0]["market_id"] == market.id
    assert payload["items"][0]["readiness_status"] == "ready"
    assert payload["items"][0]["suggested_refresh_snapshot_command"].endswith("--dry-run --json")
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_analysis_readiness_endpoint_is_documented(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/research/analysis-readiness" in response.json()["paths"]


def test_inspect_analysis_readiness_command_is_read_only_and_json_serializable(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="command",
        question="Yankees vs Dodgers",
        sport_type="mlb",
        market_type="winner",
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.commit()
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    payload = run_readiness_command(db_session, days=7, limit=10)

    assert payload["status"] == "ok"
    assert payload["read_only"] is True
    assert payload["sync_executed"] is False
    assert payload["predictions_created"] == 0
    assert payload["research_runs_created"] == 0
    assert payload["summary"]["refresh_needed_count"] == 1
    assert payload["needs_refresh"][0]["market_id"] == market.id
    assert json.dumps(payload, ensure_ascii=True, default=str)
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_analysis_readiness_min_hours_to_close_filters_short_windows(
    db_session: Session,
) -> None:
    too_soon = _create_market(
        db_session,
        suffix="too-soon",
        question="Lions vs Bears",
        sport_type="nfl",
        market_type="winner",
        end_date=NOW + timedelta(minutes=45),
    )
    good_window = _create_market(
        db_session,
        suffix="good-window",
        question="Knicks vs Nets",
        sport_type="nba",
        market_type="winner",
        end_date=NOW + timedelta(days=2),
    )
    db_session.flush()

    unfiltered = list_analysis_readiness(db_session, days=7, limit=10, now=NOW)
    by_id = {item.market_id: item for item in unfiltered.items}
    assert by_id[too_soon.id].time_window_label == "Menos de 1h"
    assert by_id[too_soon.id].suggested_next_action == (
        "demasiado_cerca_del_cierre_revisar_solo_si_ya_tiene_datos"
    )
    assert by_id[good_window.id].time_window_label == "1-3 dias"

    filtered = list_analysis_readiness(
        db_session,
        days=7,
        limit=10,
        min_hours_to_close=6,
        now=NOW,
    )
    filtered_ids = {item.market_id for item in filtered.items}
    assert too_soon.id not in filtered_ids
    assert good_window.id in filtered_ids


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    sport_type: str | None,
    market_type: str | None,
    end_date: datetime,
) -> Market:
    event = Event(
        polymarket_event_id=f"readiness-event-{suffix}",
        title=f"Readiness Event {suffix}",
        category="sports",
        slug=f"readiness-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"readiness-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"readiness-market-{suffix}",
        sport_type=sport_type,
        market_type=market_type,
        active=True,
        closed=False,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    *,
    market: Market,
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=datetime.now(tz=UTC),
        yes_price=Decimal("0.5600"),
        no_price=Decimal("0.4400"),
        midpoint=Decimal("0.5600"),
        last_trade_price=Decimal("0.5500"),
        spread=Decimal("0.0100"),
        liquidity=Decimal("1500.0000"),
        volume=Decimal("2500.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot
