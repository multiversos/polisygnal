from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketMarketDetailsPayload, get_polymarket_client
from app.main import app
from app.models import Event, Market, MarketOutcome, PolySignalMarketSignal, WalletAnalysisJob
from app.services.polysignal_market_signals import list_market_signals

MARKET_URL = "https://polymarket.com/market/will-btc-finish-may-above-110k"
CONDITION_ID = "cond-btc-may-110k"
TOKEN_YES = "token-yes"
TOKEN_NO = "token-no"


class DummyGammaSettlementClient:
    def __init__(self, *, markets_by_condition: dict[str, dict[str, object]] | None = None) -> None:
        self.markets_by_condition = markets_by_condition or {}

    def close(self) -> None:
        return None

    def fetch_market_by_condition_id(self, condition_id: str) -> PolymarketMarketDetailsPayload | None:
        payload = self.markets_by_condition.get(condition_id)
        if payload is None:
            return None
        return PolymarketMarketDetailsPayload.model_validate(payload)

    def fetch_market_by_slug(self, slug: str) -> PolymarketMarketDetailsPayload | None:
        for payload in self.markets_by_condition.values():
            if payload.get("slug") == slug:
                return PolymarketMarketDetailsPayload.model_validate(payload)
        return None


def _create_job(db_session: Session) -> WalletAnalysisJob:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[
            {"label": "Yes", "side": "YES", "token_id": TOKEN_YES},
            {"label": "No", "side": "NO", "token_id": TOKEN_NO},
        ],
        token_ids_json=[TOKEN_YES, TOKEN_NO],
    )
    db_session.add(job)
    db_session.flush()
    return job


def _create_signal(
    db_session: Session,
    *,
    predicted_side: str | None = "YES",
    predicted_outcome: str | None = "Yes",
    signal_status: str = "pending_resolution",
    condition_id: str = CONDITION_ID,
    market_slug: str = "will-btc-finish-may-above-110k",
    confidence: str = "medium",
) -> PolySignalMarketSignal:
    job = _create_job(db_session)
    signal = PolySignalMarketSignal(
        job_id=job.id,
        source_url=MARKET_URL,
        market_slug=market_slug,
        condition_id=condition_id,
        market_title="Will BTC finish May above 110k?",
        predicted_side=predicted_side,
        predicted_outcome=predicted_outcome,
        polysignal_score=Decimal("0.8400"),
        confidence=confidence,
        yes_score=Decimal("1.40"),
        no_score=Decimal("0.22"),
        outcome_scores_json={"YES": "1.40", "NO": "0.22"},
        wallets_analyzed=12,
        wallets_with_sufficient_history=8,
        warnings_json=["signal_ready"],
        signal_status=signal_status,
        outcomes_json=[
            {"label": "Yes", "side": "YES", "token_id": TOKEN_YES},
            {"label": "No", "side": "NO", "token_id": TOKEN_NO},
        ],
        token_ids_json=[TOKEN_YES, TOKEN_NO],
    )
    db_session.add(signal)
    db_session.commit()
    db_session.refresh(signal)
    return signal


def _gamma_market(*, closed: bool, outcome_prices: list[str], outcomes: list[str] | None = None) -> dict[str, object]:
    return {
        "slug": "will-btc-finish-may-above-110k",
        "question": "Will BTC finish May above 110k?",
        "conditionId": CONDITION_ID,
        "clobTokenIds": [TOKEN_YES, TOKEN_NO],
        "outcomes": outcomes or ["Yes", "No"],
        "outcomePrices": outcome_prices,
        "active": not closed,
        "closed": closed,
        "resolutionSource": "gamma-test",
    }


def test_settle_signal_keeps_pending_when_market_is_open(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session)
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={CONDITION_ID: _gamma_market(closed=False, outcome_prices=["0.62", "0.38"])}
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["changed"] is False
    assert payload["resolution"]["status"] == "open"
    assert payload["signal"]["signal_status"] == "pending_resolution"


def test_settle_signal_marks_yes_hit_when_market_resolves_yes(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session, predicted_side="YES", predicted_outcome="Yes")
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={CONDITION_ID: _gamma_market(closed=True, outcome_prices=["0.999", "0.001"])}
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["changed"] is True
    assert payload["signal"]["signal_status"] == "resolved_hit"
    assert payload["signal"]["final_outcome"] == "Yes"
    assert payload["signal"]["predicted_side"] == "YES"
    assert payload["signal"]["polysignal_score"] == "0.840000"


def test_settle_signal_marks_yes_miss_when_market_resolves_no(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session, predicted_side="YES", predicted_outcome="Yes")
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={CONDITION_ID: _gamma_market(closed=True, outcome_prices=["0.001", "0.999"])}
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["signal"]["signal_status"] == "resolved_miss"
    assert payload["signal"]["final_outcome"] == "No"


def test_settle_signal_marks_no_hit_when_market_resolves_no(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session, predicted_side="NO", predicted_outcome="No")
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={CONDITION_ID: _gamma_market(closed=True, outcome_prices=["0.001", "0.999"])}
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    assert response.json()["signal"]["signal_status"] == "resolved_hit"


def test_settle_signal_marks_cancelled_from_local_market_outcome(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session)
    event = Event(
        polymarket_event_id="event-1",
        title="BTC May event",
        slug="btc-may-event",
        active=False,
        closed=True,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id="market-1",
        event_id=event.id,
        question="Will BTC finish May above 110k?",
        slug="will-btc-finish-may-above-110k",
        condition_id=CONDITION_ID,
        active=False,
        closed=True,
    )
    db_session.add(market)
    db_session.flush()
    db_session.add(
        MarketOutcome(
            market_id=market.id,
            resolved_outcome="cancelled",
            resolution_source="local_market_outcome",
        )
    )
    db_session.commit()

    response = client.post(f"/polysignal-market-signals/{signal.id}/settle")

    assert response.status_code == 200
    payload = response.json()
    assert payload["signal"]["signal_status"] == "cancelled"
    assert payload["signal"]["final_outcome"] == "cancelled"


def test_settle_signal_marks_unknown_when_remote_resolution_is_not_reliable(client: TestClient, db_session: Session) -> None:
    signal = _create_signal(db_session)
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={CONDITION_ID: _gamma_market(closed=True, outcome_prices=["0.51", "0.49"])}
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["signal"]["signal_status"] == "unknown"
    assert payload["resolution"]["status"] == "unknown"


def test_multi_outcome_signal_compares_predicted_outcome_label_correctly(client: TestClient, db_session: Session) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="who-wins-the-title",
        condition_id="cond-title",
        market_title="Who wins the title?",
        status="completed",
        outcomes_json=[
            {"label": "Alpha", "side": "Alpha", "token_id": "alpha"},
            {"label": "Beta", "side": "Beta", "token_id": "beta"},
            {"label": "Gamma", "side": "Gamma", "token_id": "gamma"},
        ],
        token_ids_json=["alpha", "beta", "gamma"],
    )
    db_session.add(job)
    db_session.flush()
    signal = PolySignalMarketSignal(
        job_id=job.id,
        source_url=MARKET_URL,
        market_slug="who-wins-the-title",
        condition_id="cond-title",
        market_title="Who wins the title?",
        predicted_side="Beta",
        predicted_outcome="Beta",
        polysignal_score=Decimal("0.6700"),
        confidence="medium",
        outcome_scores_json={"Alpha": "0.12", "Beta": "0.67", "Gamma": "0.21"},
        signal_status="pending_resolution",
        outcomes_json=job.outcomes_json,
        token_ids_json=job.token_ids_json,
    )
    db_session.add(signal)
    db_session.commit()

    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={
            "cond-title": {
                "slug": "who-wins-the-title",
                "question": "Who wins the title?",
                "conditionId": "cond-title",
                "clobTokenIds": ["alpha", "beta", "gamma"],
                "outcomes": ["Alpha", "Beta", "Gamma"],
                "outcomePrices": ["0.001", "0.998", "0.001"],
                "active": False,
                "closed": True,
                "resolutionSource": "gamma-test",
            }
        }
    )
    try:
        response = client.post(f"/polysignal-market-signals/{signal.id}/settle")
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    assert response.json()["signal"]["signal_status"] == "resolved_hit"


def test_settle_pending_respects_limit_and_metrics_exclude_non_resolved(client: TestClient, db_session: Session) -> None:
    first = _create_signal(db_session, predicted_side="YES", predicted_outcome="Yes", confidence="high")
    second = _create_signal(db_session, predicted_side="YES", predicted_outcome="Yes", confidence="medium")
    third = _create_signal(db_session, predicted_side="YES", predicted_outcome="Yes", confidence="low")

    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaSettlementClient(
        markets_by_condition={
            CONDITION_ID: _gamma_market(closed=True, outcome_prices=["0.999", "0.001"]),
        }
    )
    try:
        batch = client.post("/polysignal-market-signals/settle-pending", json={"limit": 2})
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert batch.status_code == 200
    payload = batch.json()
    assert payload["checked"] == 2
    assert payload["resolved_hit"] == 2

    listing = list_market_signals(db_session, limit=20)
    assert listing.metrics.total == 3
    assert listing.metrics.resolved_hit == 2
    assert listing.metrics.pending_resolution == 1
    assert listing.metrics.win_rate == Decimal("1.0000")

    refreshed_first = db_session.get(PolySignalMarketSignal, first.id)
    refreshed_second = db_session.get(PolySignalMarketSignal, second.id)
    refreshed_third = db_session.get(PolySignalMarketSignal, third.id)
    assert refreshed_first is not None and refreshed_first.signal_status == "resolved_hit"
    assert refreshed_second is not None and refreshed_second.signal_status == "resolved_hit"
    assert refreshed_third is not None and refreshed_third.signal_status == "pending_resolution"
