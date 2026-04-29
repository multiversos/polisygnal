from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.services.research import research_packet_generation


def test_research_packet_endpoint_prepares_files_without_predictions(
    client: TestClient,
    db_session: Session,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(research_packet_generation, "REQUEST_DIR", tmp_path / "requests")
    monkeypatch.setattr(research_packet_generation, "PACKET_DIR", tmp_path / "packets")
    market = _create_market(db_session)
    _create_snapshot(db_session, market.id)
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/research-packet",
        json={"mode": "codex_agent", "notes": "Preparar fuentes publicas para revisar."},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "prepared"
    assert payload["market_id"] == market.id
    assert payload["research_status"] == "pending_agent"
    assert payload["request_path"].startswith(str(tmp_path))
    assert payload["packet_path"].startswith(str(tmp_path))
    assert payload["expected_response_path"].startswith(str(tmp_path))
    assert payload["ingest_dry_run_command"].endswith("--dry-run")
    assert (tmp_path / "requests" / f"{payload['research_run_id']}.json").exists()
    assert (tmp_path / "packets" / f"{payload['research_run_id']}.md").exists()
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == 1
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0
    assert db_session.scalar(select(func.count()).select_from(PredictionReport)) == 0
    assert db_session.scalar(select(func.count()).select_from(ResearchFinding)) == 0


def test_research_packet_endpoint_rejects_missing_market(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(research_packet_generation, "REQUEST_DIR", tmp_path / "requests")
    monkeypatch.setattr(research_packet_generation, "PACKET_DIR", tmp_path / "packets")

    response = client.post("/markets/999999/research-packet", json={"mode": "codex_agent"})

    assert response.status_code == 404


def test_research_packet_endpoint_rejects_invalid_mode(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="invalid-mode")
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/research-packet",
        json={"mode": "automatic_research"},
    )

    assert response.status_code == 422


def test_research_packet_openapi_includes_endpoint(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/markets/{market_id}/research-packet" in response.json()["paths"]


def _create_market(db_session: Session, *, suffix: str = "packet-endpoint") -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title="NBA Packet Event",
        category="sports",
        slug=f"event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"market-{suffix}",
        event_id=event.id,
        question="Will the Lakers beat the Warriors?",
        slug=f"market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime(2026, 4, 27, 2, 0, tzinfo=UTC),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _create_snapshot(db_session: Session, market_id: int) -> None:
    db_session.add(
        MarketSnapshot(
            market_id=market_id,
            captured_at=datetime(2026, 4, 26, 12, 0, tzinfo=UTC),
            yes_price=Decimal("0.4200"),
            no_price=Decimal("0.5800"),
            liquidity=Decimal("1000.0000"),
            volume=Decimal("2500.0000"),
        )
    )
