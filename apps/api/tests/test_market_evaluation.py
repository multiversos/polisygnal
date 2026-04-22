from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.market_outcome import MarketOutcome
from app.models.prediction import Prediction


def test_resolve_market_marks_it_closed_and_evaluation_summary_reflects_outcome(
    client: TestClient,
    db_session: Session,
) -> None:
    resolved_market = _create_market(db_session, suffix="resolved")
    pending_market = _create_market(db_session, suffix="pending")

    _create_prediction(
        db_session,
        market_id=resolved_market.id,
        run_at=datetime(2026, 4, 22, 8, 0, tzinfo=UTC),
        yes_probability=Decimal("0.7200"),
        opportunity=True,
    )
    _create_prediction(
        db_session,
        market_id=resolved_market.id,
        run_at=datetime(2026, 4, 22, 9, 0, tzinfo=UTC),
        yes_probability=Decimal("0.4000"),
        opportunity=False,
    )
    _create_prediction(
        db_session,
        market_id=pending_market.id,
        run_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
        yes_probability=Decimal("0.6100"),
        opportunity=True,
    )
    db_session.commit()

    resolve_response = client.post(
        f"/markets/{resolved_market.id}/resolve",
        json={"resolved_outcome": "yes", "notes": "Manual validation"},
    )

    assert resolve_response.status_code == 201
    resolve_payload = resolve_response.json()
    assert resolve_payload["market_id"] == resolved_market.id
    assert resolve_payload["resolved_outcome"] == "yes"
    assert resolve_payload["resolution_source"] == "manual"
    assert resolve_payload["notes"] == "Manual validation"
    assert resolve_payload["resolved_at"] is not None

    db_session.refresh(resolved_market)
    assert resolved_market.closed is True

    summary_response = client.get("/evaluation/summary")

    assert summary_response.status_code == 200
    summary_payload = summary_response.json()
    assert summary_payload["total_predictions"] == 3
    assert summary_payload["evaluable"] == 2
    assert summary_payload["cancelled"] == 0
    assert summary_payload["pending"] == 1
    assert summary_payload["accuracy"] == pytest.approx(0.5)
    assert summary_payload["opportunity_accuracy"] == pytest.approx(1.0)
    assert summary_payload["brier_score"] == pytest.approx(0.2192)
    assert summary_payload["first_resolution"] == resolve_payload["resolved_at"]
    assert summary_payload["last_resolution"] == resolve_payload["resolved_at"]


def test_evaluation_summary_excludes_cancelled_outcomes_from_accuracy_and_brier(
    client: TestClient,
    db_session: Session,
) -> None:
    cancelled_market = _create_market(db_session, suffix="cancelled")
    _create_prediction(
        db_session,
        market_id=cancelled_market.id,
        run_at=datetime(2026, 4, 22, 11, 0, tzinfo=UTC),
        yes_probability=Decimal("0.9000"),
        opportunity=True,
    )
    db_session.commit()

    resolve_response = client.post(
        f"/markets/{cancelled_market.id}/resolve",
        json={"resolved_outcome": "cancelled", "notes": "Void market"},
    )

    assert resolve_response.status_code == 201

    summary_response = client.get("/evaluation/summary")

    assert summary_response.status_code == 200
    summary_payload = summary_response.json()
    assert summary_payload["total_predictions"] == 1
    assert summary_payload["evaluable"] == 0
    assert summary_payload["cancelled"] == 1
    assert summary_payload["pending"] == 0
    assert summary_payload["accuracy"] is None
    assert summary_payload["opportunity_accuracy"] is None
    assert summary_payload["brier_score"] is None
    assert summary_payload["first_resolution"] is not None
    assert summary_payload["last_resolution"] is not None


def test_resolve_market_returns_409_when_it_is_already_resolved(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="duplicate")

    first_response = client.post(
        f"/markets/{market.id}/resolve",
        json={"resolved_outcome": "no"},
    )
    second_response = client.post(
        f"/markets/{market.id}/resolve",
        json={"resolved_outcome": "yes"},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == f"Market {market.id} ya fue resuelto."


def test_resolve_market_returns_404_when_market_does_not_exist(
    client: TestClient,
) -> None:
    response = client.post(
        "/markets/999/resolve",
        json={"resolved_outcome": "yes"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Market 999 no encontrado."


def test_resolve_market_returns_422_for_invalid_outcome(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="invalid-outcome")
    db_session.commit()

    response = client.post(
        f"/markets/{market.id}/resolve",
        json={"resolved_outcome": "maybe"},
    )

    assert response.status_code == 422


def test_get_evaluation_history_returns_joined_rows_ordered_by_resolved_at_desc(
    client: TestClient,
    db_session: Session,
) -> None:
    history_items = _seed_evaluation_history(db_session)

    response = client.get("/evaluation/history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 20
    assert [item["market_id"] for item in payload["items"]] == [
        history_items["cancelled_market"].id,
        history_items["no_market"].id,
        history_items["yes_market"].id,
    ]

    cancelled_item = payload["items"][0]
    assert cancelled_item["question"] == history_items["cancelled_market"].question
    assert cancelled_item["detail_path"] == f"/evaluation/history/{history_items['cancelled_market'].id}"
    assert cancelled_item["prediction_id"] == history_items["cancelled_prediction"].id
    assert cancelled_item["resolved_outcome"] == "cancelled"
    assert cancelled_item["yes_probability"] == "0.9000"
    assert cancelled_item["no_probability"] == "0.1000"
    assert cancelled_item["opportunity"] is True
    assert cancelled_item["was_correct"] is None
    assert cancelled_item["brier_component"] is None

    no_item = payload["items"][1]
    assert no_item["question"] == history_items["no_market"].question
    assert no_item["detail_path"] == f"/evaluation/history/{history_items['no_market'].id}"
    assert no_item["resolved_outcome"] == "no"
    assert no_item["prediction_id"] == history_items["no_prediction"].id
    assert no_item["was_correct"] is True
    assert no_item["brier_component"] == pytest.approx(0.09)

    yes_item = payload["items"][2]
    assert yes_item["question"] == history_items["yes_market"].question
    assert yes_item["detail_path"] == f"/evaluation/history/{history_items['yes_market'].id}"
    assert yes_item["resolved_outcome"] == "yes"
    assert yes_item["prediction_id"] == history_items["yes_prediction"].id
    assert yes_item["was_correct"] is True
    assert yes_item["brier_component"] == pytest.approx(0.0784)


def test_get_evaluation_history_supports_simple_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    history_items = _seed_evaluation_history(db_session)

    response = client.get("/evaluation/history", params={"limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["limit"] == 2
    assert len(payload["items"]) == 2
    assert [item["market_id"] for item in payload["items"]] == [
        history_items["cancelled_market"].id,
        history_items["no_market"].id,
    ]
    assert [item["detail_path"] for item in payload["items"]] == [
        f"/evaluation/history/{history_items['cancelled_market'].id}",
        f"/evaluation/history/{history_items['no_market'].id}",
    ]


def test_get_evaluation_history_by_market_returns_predictions_in_run_order(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="market-history")
    first_prediction = _create_prediction(
        db_session,
        market_id=market.id,
        run_at=datetime(2026, 4, 22, 8, 0, tzinfo=UTC),
        yes_probability=Decimal("0.6200"),
        opportunity=True,
    )
    second_prediction = _create_prediction(
        db_session,
        market_id=market.id,
        run_at=datetime(2026, 4, 22, 9, 0, tzinfo=UTC),
        yes_probability=Decimal("0.4500"),
        opportunity=False,
    )
    third_prediction = _create_prediction(
        db_session,
        market_id=market.id,
        run_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
        yes_probability=Decimal("0.8000"),
        opportunity=True,
    )
    db_session.add(
        MarketOutcome(
            market_id=market.id,
            resolved_outcome="yes",
            resolution_source="manual",
            notes="market history yes",
            resolved_at=datetime(2026, 4, 22, 12, 0, tzinfo=UTC),
        )
    )
    market.closed = True
    db_session.commit()

    response = client.get(f"/evaluation/history/{market.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["question"] == market.question
    assert payload["resolved_outcome"] == "yes"
    assert payload["resolved_at"].startswith("2026-04-22T12:00:00")
    assert [item["prediction_id"] for item in payload["items"]] == [
        first_prediction.id,
        second_prediction.id,
        third_prediction.id,
    ]
    assert payload["items"][0]["run_at"].startswith("2026-04-22T08:00:00")
    assert payload["items"][1]["run_at"].startswith("2026-04-22T09:00:00")
    assert payload["items"][2]["run_at"].startswith("2026-04-22T10:00:00")
    assert payload["items"][0]["was_correct"] is True
    assert payload["items"][0]["brier_component"] == pytest.approx(0.1444)
    assert payload["items"][1]["was_correct"] is False
    assert payload["items"][1]["brier_component"] == pytest.approx(0.3025)
    assert payload["items"][2]["was_correct"] is True
    assert payload["items"][2]["brier_component"] == pytest.approx(0.04)


def test_get_evaluation_history_by_market_returns_empty_items_when_market_has_outcome_but_no_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="market-history-empty")
    db_session.add(
        MarketOutcome(
            market_id=market.id,
            resolved_outcome="no",
            resolution_source="manual",
            notes="market history empty",
            resolved_at=datetime(2026, 4, 22, 13, 0, tzinfo=UTC),
        )
    )
    market.closed = True
    db_session.commit()

    response = client.get(f"/evaluation/history/{market.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market_id"] == market.id
    assert payload["resolved_outcome"] == "no"
    assert payload["items"] == []


def test_get_evaluation_history_by_market_returns_cancelled_items_with_null_correctness(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="market-history-cancelled")
    prediction = _create_prediction(
        db_session,
        market_id=market.id,
        run_at=datetime(2026, 4, 22, 11, 0, tzinfo=UTC),
        yes_probability=Decimal("0.9000"),
        opportunity=True,
    )
    db_session.add(
        MarketOutcome(
            market_id=market.id,
            resolved_outcome="cancelled",
            resolution_source="manual",
            notes="market history cancelled",
            resolved_at=datetime(2026, 4, 22, 14, 0, tzinfo=UTC),
        )
    )
    market.closed = True
    db_session.commit()

    response = client.get(f"/evaluation/history/{market.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resolved_outcome"] == "cancelled"
    assert len(payload["items"]) == 1
    assert payload["items"][0]["prediction_id"] == prediction.id
    assert payload["items"][0]["was_correct"] is None
    assert payload["items"][0]["brier_component"] is None


def test_get_evaluation_history_by_market_returns_404_when_market_does_not_exist(
    client: TestClient,
) -> None:
    response = client.get("/evaluation/history/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Market 999 no encontrado."


def test_get_evaluation_history_by_market_returns_404_when_market_has_no_outcome(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="market-history-no-outcome")
    _create_prediction(
        db_session,
        market_id=market.id,
        run_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
        yes_probability=Decimal("0.5500"),
        opportunity=True,
    )
    db_session.commit()

    response = client.get(f"/evaluation/history/{market.id}")

    assert response.status_code == 404
    assert response.json()["detail"] == f"Market {market.id} no tiene outcome resuelto."


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"event-evaluation-{suffix}",
        title=f"Evaluation Event {suffix}",
        category="sports",
        slug=f"evaluation-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-evaluation-{suffix}",
        event_id=event.id,
        question=f"Will evaluation market {suffix} resolve yes?",
        slug=f"evaluation-market-{suffix}",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
        end_date=datetime.now(UTC) + timedelta(days=1),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _seed_evaluation_history(db_session: Session) -> dict[str, object]:
    yes_market = _create_market(db_session, suffix="history-yes")
    no_market = _create_market(db_session, suffix="history-no")
    cancelled_market = _create_market(db_session, suffix="history-cancelled")

    yes_prediction = _create_prediction(
        db_session,
        market_id=yes_market.id,
        run_at=datetime(2026, 4, 22, 8, 0, tzinfo=UTC),
        yes_probability=Decimal("0.7200"),
        opportunity=True,
    )
    no_prediction = _create_prediction(
        db_session,
        market_id=no_market.id,
        run_at=datetime(2026, 4, 22, 9, 0, tzinfo=UTC),
        yes_probability=Decimal("0.3000"),
        opportunity=False,
    )
    cancelled_prediction = _create_prediction(
        db_session,
        market_id=cancelled_market.id,
        run_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
        yes_probability=Decimal("0.9000"),
        opportunity=True,
    )

    base_resolved_at = datetime(2026, 4, 22, 12, 0, tzinfo=UTC)
    db_session.add_all(
        [
            MarketOutcome(
                market_id=yes_market.id,
                resolved_outcome="yes",
                resolution_source="manual",
                notes="history yes",
                resolved_at=base_resolved_at,
            ),
            MarketOutcome(
                market_id=no_market.id,
                resolved_outcome="no",
                resolution_source="manual",
                notes="history no",
                resolved_at=base_resolved_at + timedelta(minutes=1),
            ),
            MarketOutcome(
                market_id=cancelled_market.id,
                resolved_outcome="cancelled",
                resolution_source="manual",
                notes="history cancelled",
                resolved_at=base_resolved_at + timedelta(minutes=2),
            ),
        ]
    )
    yes_market.closed = True
    no_market.closed = True
    cancelled_market.closed = True
    db_session.commit()

    return {
        "yes_market": yes_market,
        "no_market": no_market,
        "cancelled_market": cancelled_market,
        "yes_prediction": yes_prediction,
        "no_prediction": no_prediction,
        "cancelled_prediction": cancelled_prediction,
    }


def _create_prediction(
    db_session: Session,
    *,
    market_id: int,
    run_at: datetime,
    yes_probability: Decimal,
    opportunity: bool,
) -> Prediction:
    prediction = Prediction(
        market_id=market_id,
        run_at=run_at,
        model_version="scoring_v1",
        yes_probability=yes_probability,
        no_probability=Decimal("1.0000") - yes_probability,
        confidence_score=Decimal("0.7500"),
        edge_signed=Decimal("0.1000"),
        edge_magnitude=Decimal("0.1000"),
        edge_class="moderate",
        opportunity=opportunity,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": "Evaluation test prediction"},
    )
    db_session.add(prediction)
    return prediction
