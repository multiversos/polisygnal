from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_outcome import MarketOutcome
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun


def test_backtesting_summary_empty_state_is_stable(
    client: TestClient,
    db_session: Session,
) -> None:
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    response = client.get("/backtesting/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_outcomes"] == 0
    assert payload["total_predictions"] == 0
    assert payload["resolved_with_predictions"] == 0
    assert payload["total_resolved_with_predictions"] == 0
    assert payload["correct_direction_count"] == 0
    assert payload["accuracy_direction"] is None
    assert payload["by_prediction_family"] == []
    assert [item["bucket"] for item in payload["by_confidence_bucket"]] == [
        "0-50",
        "50-60",
        "60-70",
        "70-80",
        "80-100",
    ]
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_runs


def test_market_outcome_crud_endpoints(client: TestClient, db_session: Session) -> None:
    market = _create_market(db_session, suffix="crud")
    db_session.commit()

    create_response = client.post(
        f"/markets/{market.id}/outcome",
        json={
            "resolved_outcome": "yes",
            "source": "manual_test",
            "notes": "Resolved manually.",
        },
    )
    get_response = client.get(f"/markets/{market.id}/outcome")
    list_response = client.get("/outcomes")
    patch_response = client.patch(
        f"/markets/{market.id}/outcome",
        json={"resolved_outcome": "no", "notes": "Corrected manually."},
    )
    delete_response = client.delete(f"/markets/{market.id}/outcome")
    after_delete = client.get(f"/markets/{market.id}/outcome")

    assert create_response.status_code == 201
    assert create_response.json()["resolved_outcome"] == "yes"
    assert create_response.json()["source"] == "manual_test"
    assert get_response.status_code == 200
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["market_id"] == market.id
    assert patch_response.status_code == 200
    assert patch_response.json()["resolved_outcome"] == "no"
    assert patch_response.json()["notes"] == "Corrected manually."
    assert delete_response.status_code == 204
    assert after_delete.status_code == 404


def test_market_outcome_allows_manual_invalid_and_unknown_states(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="manual-state")
    _add_prediction(
        db_session,
        market.id,
        family="research_v1_local",
        yes_probability=Decimal("0.7200"),
    )
    db_session.commit()

    create_response = client.post(
        f"/markets/{market.id}/outcome",
        json={
            "resolved_outcome": "unknown",
            "source": "manual_test",
            "notes": "Outcome not resolved yet.",
        },
    )
    patch_response = client.patch(
        f"/markets/{market.id}/outcome",
        json={
            "resolved_outcome": "invalid",
            "notes": "Market resolved invalid.",
        },
    )
    summary_response = client.get("/backtesting/summary")

    assert create_response.status_code == 201
    assert create_response.json()["resolved_outcome"] == "unknown"
    assert patch_response.status_code == 200
    assert patch_response.json()["resolved_outcome"] == "invalid"
    assert summary_response.status_code == 200
    assert summary_response.json()["total_outcomes"] == 1
    assert summary_response.json()["total_predictions"] == 1
    assert summary_response.json()["resolved_with_predictions"] == 0
    assert summary_response.json()["total_resolved_with_predictions"] == 0


def test_backtesting_summary_compares_predictions_to_outcomes(
    client: TestClient,
    db_session: Session,
) -> None:
    yes_market = _create_market(db_session, suffix="yes")
    no_market = _create_market(db_session, suffix="no")
    _add_prediction(db_session, yes_market.id, family="research_v1_local", yes_probability=Decimal("0.7000"))
    _add_prediction(db_session, no_market.id, family="research_v1_local", yes_probability=Decimal("0.6500"))
    db_session.add(
        MarketOutcome(
            market_id=yes_market.id,
            resolved_outcome="yes",
            resolution_source="manual_test",
            resolved_at=datetime.now(tz=UTC),
        )
    )
    db_session.add(
        MarketOutcome(
            market_id=no_market.id,
            resolved_outcome="no",
            resolution_source="manual_test",
            resolved_at=datetime.now(tz=UTC),
        )
    )
    db_session.commit()

    response = client.get("/backtesting/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_outcomes"] == 2
    assert payload["total_predictions"] == 2
    assert payload["resolved_with_predictions"] == 2
    assert payload["total_resolved_with_predictions"] == 2
    assert payload["correct_direction_count"] == 1
    assert payload["accuracy_direction"] == "0.5000"
    assert payload["avg_confidence"] == "0.7000"
    assert payload["by_prediction_family"][0]["prediction_family"] == "research_v1_local"
    assert payload["by_prediction_family"][0]["brier_score"] == "0.2562"
    confidence_bucket = next(
        item for item in payload["by_confidence_bucket"] if item["bucket"] == "70-80"
    )
    assert confidence_bucket["total_resolved_with_predictions"] == 2
    assert confidence_bucket["accuracy_direction"] == "0.5000"


def test_backtesting_openapi_includes_endpoints(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/outcomes" in paths
    assert "/markets/{market_id}/outcome" in paths
    assert "/backtesting/summary" in paths


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"backtesting-event-{suffix}",
        title=f"Backtesting Event {suffix}",
        category="sports",
        slug=f"backtesting-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"backtesting-market-{suffix}",
        event_id=event.id,
        question=f"Backtesting market {suffix}",
        slug=f"backtesting-market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=datetime.now(tz=UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_prediction(
    db_session: Session,
    market_id: int,
    *,
    family: str,
    yes_probability: Decimal,
) -> None:
    db_session.add(
        Prediction(
            market_id=market_id,
            run_at=datetime.now(tz=UTC),
            model_version="fixture",
            prediction_family=family,
            yes_probability=yes_probability,
            no_probability=Decimal("1.0000") - yes_probability,
            confidence_score=Decimal("0.7000"),
            edge_signed=Decimal("0.1000"),
            edge_magnitude=Decimal("0.1000"),
            edge_class="moderate",
            opportunity=True,
            review_confidence=False,
            review_edge=False,
            explanation_json={"fixture": True},
            components_json={"fixture": True},
        )
    )
