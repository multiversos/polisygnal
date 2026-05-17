from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketMarketDetailsPayload, get_polymarket_client
from app.main import app
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob

WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
MARKET_URL = "https://polymarket.com/market/will-btc-finish-may-above-110k"


class DummyGammaAnalysisClient:
    def close(self) -> None:
        return None

    def fetch_market_by_slug(self, slug: str) -> PolymarketMarketDetailsPayload | None:
        if slug != "will-btc-finish-may-above-110k":
            return None
        return PolymarketMarketDetailsPayload.model_validate(
            {
                "slug": slug,
                "question": "Will BTC finish May above 110k?",
                "conditionId": "cond-btc-may-110k",
                "clobTokenIds": ["token-yes", "token-no"],
                "outcomes": ["Yes", "No"],
                "active": True,
                "closed": False,
            }
        )

    def fetch_event_by_slug(self, slug: str):
        return None


def test_wallet_profile_upsert_accepts_unavailable_metrics(client: TestClient) -> None:
    response = client.post(
        "/wallet-profiles",
        json={
            "wallet_address": WALLET,
            "alias": "candidate-alpha",
            "status": "candidate",
            "confidence": "low",
            "roi_30d_status": "unavailable",
            "win_rate_30d_status": "unavailable",
            "pnl_30d_status": "unavailable",
            "drawdown_30d_status": "unavailable",
            "reasons_json": ["fresh candidate"],
            "risks_json": ["history unavailable"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["wallet_address"] == WALLET
    assert payload["roi_30d_status"] == "unavailable"
    assert payload["win_rate_30d_status"] == "unavailable"
    assert payload["pnl_30d_status"] == "unavailable"


def test_wallet_profile_upsert_updates_existing_wallet_address(client: TestClient) -> None:
    first = client.post(
        "/wallet-profiles",
        json={
            "wallet_address": WALLET,
            "alias": "candidate-alpha",
            "status": "candidate",
            "confidence": "low",
        },
    )
    second = client.post(
        "/wallet-profiles",
        json={
            "wallet_address": WALLET.upper(),
            "alias": "candidate-beta",
            "status": "watching",
            "confidence": "medium",
            "score": "0.72",
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    payload = second.json()
    assert payload["wallet_address"] == WALLET
    assert payload["alias"] == "candidate-beta"
    assert payload["status"] == "watching"
    assert payload["confidence"] == "medium"


def test_create_wallet_analysis_job_from_valid_link(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    try:
        response = client.post("/wallet-analysis/jobs", json={"polymarket_url": MARKET_URL})
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["market"]["normalized_url"] == MARKET_URL
    assert payload["market"]["condition_id"] == "cond-btc-may-110k"
    assert payload["market"]["progress"]["wallets_found"] == 0
    assert payload["market"]["candidates_count"] == 0


def test_get_wallet_analysis_job_returns_initial_progress(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    try:
        created = client.post("/wallet-analysis/jobs", json={"polymarket_url": MARKET_URL})
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert created.status_code == 201
    job_id = created.json()["job_id"]
    response = client.get(f"/wallet-analysis/jobs/{job_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["progress"]["wallets_analyzed"] == 0
    assert payload["result_json"] is None
    assert payload["warnings"] == []


def test_wallet_analysis_candidates_endpoint_returns_empty_list(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    try:
        created = client.post("/wallet-analysis/jobs", json={"polymarket_url": MARKET_URL})
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert created.status_code == 201
    job_id = created.json()["job_id"]
    response = client.get(f"/wallet-analysis/jobs/{job_id}/candidates")

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


def test_save_wallet_analysis_candidate_as_profile(client: TestClient, db_session: Session) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        event_slug=None,
        condition_id="cond-btc-may-110k",
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": "token-yes"}],
        token_ids_json=["token-yes"],
        created_at=datetime(2026, 5, 17, 12, 0, tzinfo=UTC),
        updated_at=datetime(2026, 5, 17, 12, 0, tzinfo=UTC),
    )
    db_session.add(job)
    db_session.flush()
    candidate = WalletAnalysisCandidate(
        job_id=job.id,
        wallet_address=WALLET,
        outcome="Yes",
        side="YES",
        token_id="token-yes",
        score="0.81",
        confidence="medium",
        roi_30d_status="estimated",
        roi_30d_value="0.12",
        win_rate_30d_status="verified",
        win_rate_30d_value="0.64",
        pnl_30d_status="estimated",
        pnl_30d_value="42.5",
        trades_30d=11,
        volume_30d="1250",
        markets_traded_30d=7,
        reasons_json=["strong yes flow"],
        risks_json=["sample still moderate"],
    )
    db_session.add(candidate)
    db_session.commit()

    response = client.post(f"/wallet-analysis/candidates/{candidate.id}/save-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["wallet_address"] == WALLET
    assert payload["status"] == "candidate"
    assert payload["confidence"] == "medium"
    assert payload["discovered_from_market"] == "Will BTC finish May above 110k?"
    assert payload["discovered_from_url"] == MARKET_URL
