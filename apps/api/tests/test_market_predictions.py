from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.market import Market
from app.models.prediction import Prediction


def test_get_market_prediction_returns_latest_prediction(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="latest")
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)

    old_prediction = Prediction(
        market_id=market.id,
        run_at=base_time - timedelta(hours=1),
        model_version="scoring_v1",
        yes_probability=Decimal("0.4100"),
        no_probability=Decimal("0.5900"),
        confidence_score=Decimal("0.6500"),
        edge_signed=Decimal("0.0600"),
        edge_magnitude=Decimal("0.0600"),
        edge_class="moderate",
        opportunity=True,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": "Older prediction"},
    )
    new_prediction = Prediction(
        market_id=market.id,
        run_at=base_time,
        model_version="scoring_v1",
        yes_probability=Decimal("0.3111"),
        no_probability=Decimal("0.6889"),
        confidence_score=Decimal("1.0000"),
        edge_signed=Decimal("0.3071"),
        edge_magnitude=Decimal("0.3071"),
        edge_class="review",
        opportunity=True,
        review_confidence=True,
        review_edge=True,
        explanation_json={"summary": "Latest prediction"},
    )
    db_session.add_all([old_prediction, new_prediction])
    db_session.commit()

    response = client.get(f"/markets/{market.id}/prediction")

    assert response.status_code == 200
    payload = response.json()
    assert payload["market"]["id"] == market.id
    assert payload["market"]["sport_type"] == "nba"
    assert payload["market"]["evidence_eligible"] is False
    assert payload["market"]["evidence_shape"] == "futures"
    assert payload["prediction"]["id"] == new_prediction.id
    assert payload["prediction"]["yes_probability"] == "0.3111"
    assert payload["prediction"]["confidence_score"] == "1.0000"
    assert payload["prediction"]["edge_class"] == "review"
    assert payload["prediction"]["explanation_json"]["summary"] == "Latest prediction"


def test_get_market_predictions_returns_history_desc_with_limit(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="history")
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    predictions = [
        Prediction(
            market_id=market.id,
            run_at=base_time - timedelta(hours=2),
            model_version="scoring_v1",
            yes_probability=Decimal("0.2800"),
            no_probability=Decimal("0.7200"),
            confidence_score=Decimal("0.5000"),
            edge_signed=Decimal("0.0200"),
            edge_magnitude=Decimal("0.0200"),
            edge_class="no_signal",
            opportunity=False,
            review_confidence=False,
            review_edge=False,
            explanation_json={"summary": "Prediction 1"},
        ),
        Prediction(
            market_id=market.id,
            run_at=base_time - timedelta(hours=1),
            model_version="scoring_v1",
            yes_probability=Decimal("0.3000"),
            no_probability=Decimal("0.7000"),
            confidence_score=Decimal("0.7000"),
            edge_signed=Decimal("0.0800"),
            edge_magnitude=Decimal("0.0800"),
            edge_class="moderate",
            opportunity=True,
            review_confidence=False,
            review_edge=False,
            explanation_json={"summary": "Prediction 2"},
        ),
        Prediction(
            market_id=market.id,
            run_at=base_time,
            model_version="scoring_v1",
            yes_probability=Decimal("0.3111"),
            no_probability=Decimal("0.6889"),
            confidence_score=Decimal("1.0000"),
            edge_signed=Decimal("0.3071"),
            edge_magnitude=Decimal("0.3071"),
            edge_class="review",
            opportunity=True,
            review_confidence=True,
            review_edge=True,
            explanation_json={"summary": "Prediction 3"},
        ),
    ]
    db_session.add_all(predictions)
    db_session.commit()

    response = client.get(f"/markets/{market.id}/predictions", params={"limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["market"]["id"] == market.id
    assert payload["latest_prediction"]["id"] == predictions[2].id
    assert len(payload["items"]) == 2
    assert payload["items"][0]["id"] == predictions[2].id
    assert payload["items"][1]["id"] == predictions[1].id
    assert payload["items"][0]["edge_class"] == "review"
    assert payload["items"][1]["edge_class"] == "moderate"


def test_get_market_predictions_returns_empty_payload_when_market_has_no_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="empty")

    latest_response = client.get(f"/markets/{market.id}/prediction")
    history_response = client.get(f"/markets/{market.id}/predictions")

    assert latest_response.status_code == 200
    latest_payload = latest_response.json()
    assert latest_payload["market"]["id"] == market.id
    assert latest_payload["prediction"] is None

    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["market"]["id"] == market.id
    assert history_payload["latest_prediction"] is None
    assert history_payload["items"] == []


def test_get_market_predictions_returns_404_for_unknown_market(client: TestClient) -> None:
    latest_response = client.get("/markets/999/prediction")
    history_response = client.get("/markets/999/predictions")

    assert latest_response.status_code == 404
    assert history_response.status_code == 404


def test_legacy_prediction_endpoints_ignore_research_family_predictions(
    client: TestClient,
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="research-family")
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)

    legacy_prediction = Prediction(
        market_id=market.id,
        run_at=base_time,
        model_version="scoring_v1",
        yes_probability=Decimal("0.4800"),
        no_probability=Decimal("0.5200"),
        confidence_score=Decimal("0.6200"),
        edge_signed=Decimal("0.0300"),
        edge_magnitude=Decimal("0.0300"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": "Legacy scoring prediction"},
    )
    research_prediction = Prediction(
        market_id=market.id,
        run_at=base_time + timedelta(minutes=5),
        model_version="research_local_v1",
        prediction_family="research_v1_local",
        yes_probability=Decimal("0.6100"),
        no_probability=Decimal("0.3900"),
        confidence_score=Decimal("0.5500"),
        edge_signed=Decimal("0.1300"),
        edge_magnitude=Decimal("0.1300"),
        edge_class="strong",
        opportunity=True,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": "Research prediction"},
        components_json={"baseline_yes_probability": "0.4800"},
    )
    db_session.add_all([legacy_prediction, research_prediction])
    db_session.commit()

    latest_response = client.get(f"/markets/{market.id}/prediction")
    history_response = client.get(f"/markets/{market.id}/predictions")

    assert latest_response.status_code == 200
    latest_payload = latest_response.json()
    assert latest_payload["prediction"]["id"] == legacy_prediction.id
    assert latest_payload["prediction"]["prediction_family"] == "scoring_v1"

    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert len(history_payload["items"]) == 1
    assert history_payload["items"][0]["id"] == legacy_prediction.id
    assert history_payload["items"][0]["prediction_family"] == "scoring_v1"


def test_prediction_model_defaults_prediction_family_to_scoring_v1(
    db_session: Session,
) -> None:
    market = _create_market(db_session, suffix="default-family")
    prediction = Prediction(
        market_id=market.id,
        run_at=datetime(2026, 4, 21, 12, 0, tzinfo=UTC),
        model_version="scoring_v1",
        yes_probability=Decimal("0.5100"),
        no_probability=Decimal("0.4900"),
        confidence_score=Decimal("0.6000"),
        edge_signed=Decimal("0.0100"),
        edge_magnitude=Decimal("0.0100"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"summary": "Default family"},
    )
    db_session.add(prediction)
    db_session.commit()
    db_session.refresh(prediction)

    assert prediction.prediction_family == "scoring_v1"


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"event-prediction-{suffix}",
        title=f"2026 NBA Champion {suffix}",
        category="sports",
        slug=f"2026-nba-champion-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-prediction-{suffix}",
        event_id=event.id,
        question=f"Will team {suffix} win the 2026 NBA Finals?",
        slug=f"will-team-{suffix}-win-the-2026-nba-finals",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.commit()
    return market
