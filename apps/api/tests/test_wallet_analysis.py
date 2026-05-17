from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.clients.polymarket_data import (
    PolymarketDataMarketPosition,
    PolymarketDataTrade,
    PolymarketDataUserPosition,
    get_polymarket_data_client,
)
from app.clients.polymarket import PolymarketMarketDetailsPayload, get_polymarket_client
from app.main import app
from app.models import CopyWallet, PolySignalMarketSignal, WalletProfile
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob

WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SECOND_WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
MARKET_URL = "https://polymarket.com/market/will-btc-finish-may-above-110k"
CONDITION_ID = "cond-btc-may-110k"
TOKEN_YES = "token-yes"
TOKEN_NO = "token-no"


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


class DummyDataRouteClient:
    def __init__(self) -> None:
        now = datetime(2026, 5, 17, 12, 0, tzinfo=UTC)
        self.market_positions = [
            PolymarketDataMarketPosition.model_validate(
                {
                    "proxyWallet": WALLET,
                    "conditionId": CONDITION_ID,
                    "asset": TOKEN_YES,
                    "outcome": "Yes",
                    "currentValue": "900",
                    "totalBought": "900",
                }
            ),
            PolymarketDataMarketPosition.model_validate(
                {
                    "proxyWallet": SECOND_WALLET,
                    "conditionId": CONDITION_ID,
                    "asset": TOKEN_NO,
                    "outcome": "No",
                    "currentValue": "450",
                    "totalBought": "450",
                }
            ),
        ]
        self.closed_positions_by_wallet = {
            WALLET: [
                PolymarketDataUserPosition.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=15)).isoformat(),
                        "realizedPnl": "14",
                        "totalBought": "70",
                        "currentValue": "84",
                    }
                ),
                PolymarketDataUserPosition.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=14)).isoformat(),
                        "realizedPnl": "10",
                        "totalBought": "60",
                        "currentValue": "70",
                    }
                ),
                PolymarketDataUserPosition.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=13)).isoformat(),
                        "realizedPnl": "-4",
                        "totalBought": "55",
                        "currentValue": "48",
                    }
                ),
                PolymarketDataUserPosition.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=12)).isoformat(),
                        "realizedPnl": "7",
                        "totalBought": "45",
                        "currentValue": "52",
                    }
                ),
                PolymarketDataUserPosition.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=11)).isoformat(),
                        "realizedPnl": "6",
                        "totalBought": "50",
                        "currentValue": "56",
                    }
                ),
            ],
            SECOND_WALLET: [],
        }
        self.open_positions_by_wallet = {
            WALLET: [],
            SECOND_WALLET: [],
        }
        self.trades_by_wallet = {
            WALLET: [
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=16)).isoformat(),
                        "size": "10",
                        "price": "0.61",
                    }
                ),
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=10)).isoformat(),
                        "size": "8",
                        "price": "0.63",
                    }
                ),
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=9)).isoformat(),
                        "size": "9",
                        "price": "0.58",
                    }
                ),
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=8)).isoformat(),
                        "size": "6",
                        "price": "0.57",
                    }
                ),
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_YES,
                        "outcome": "Yes",
                        "timestamp": (now.replace(day=7)).isoformat(),
                        "size": "5",
                        "price": "0.62",
                    }
                ),
            ],
            SECOND_WALLET: [
                PolymarketDataTrade.model_validate(
                    {
                        "proxyWallet": SECOND_WALLET,
                        "conditionId": CONDITION_ID,
                        "asset": TOKEN_NO,
                        "outcome": "No",
                        "timestamp": (now.replace(day=16)).isoformat(),
                        "size": "4",
                        "price": "0.44",
                    }
                ),
            ],
        }

    def get_positions_for_market(self, condition_id: str, *, status: str = "OPEN", limit: int = 50):
        assert condition_id == CONDITION_ID
        return self.market_positions[:limit]

    def get_trades_for_market(self, condition_id: str, *, limit: int = 50, offset: int = 0, taker_only: bool = True):
        assert condition_id == CONDITION_ID
        return []

    def get_user_closed_positions(self, wallet: str, *, limit: int = 100, offset: int = 0):
        return self.closed_positions_by_wallet.get(wallet.lower(), [])[:limit]

    def get_user_positions(self, wallet: str, *, limit: int = 100, offset: int = 0):
        return self.open_positions_by_wallet.get(wallet.lower(), [])[:limit]

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0):
        return self.trades_by_wallet.get(wallet.lower(), [])[:limit]

    def get_user_profile(self, wallet: str):
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


def test_wallet_analysis_resolve_link_returns_complete_metadata(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    try:
        response = client.post("/wallet-analysis/resolve-link", json={"polymarket_url": MARKET_URL})
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["market_title"] == "Will BTC finish May above 110k?"
    assert payload["condition_id"] == CONDITION_ID
    assert payload["market_slug"] == "will-btc-finish-may-above-110k"
    assert payload["token_ids"] == [TOKEN_YES, TOKEN_NO]
    assert payload["outcomes"][0]["label"] == "Yes"


def test_wallet_analysis_resolve_link_rejects_invalid_url(client: TestClient) -> None:
    response = client.post("/wallet-analysis/resolve-link", json={"polymarket_url": "https://example.com/not-polymarket"})

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_polymarket_url"


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
    assert payload["progress"]["current_batch"] == 0
    assert payload["result_json"] is None
    assert payload["warnings"] == []
    assert payload["status_detail"] is None


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


def test_wallet_analysis_run_once_route_returns_progress_and_signal(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    app.dependency_overrides[get_polymarket_data_client] = lambda: DummyDataRouteClient()
    try:
        created = client.post("/wallet-analysis/jobs", json={"polymarket_url": MARKET_URL})
        assert created.status_code == 201
        job_id = created.json()["job_id"]
        response = client.post(
            f"/wallet-analysis/jobs/{job_id}/run-once",
            json={
                "max_wallets": 20,
                "max_wallets_discovery": 20,
                "batch_size": 10,
                "history_limit": 100,
            },
        )
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)
        app.dependency_overrides.pop(get_polymarket_data_client, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == job_id
    assert payload["status"] == "completed"
    assert payload["run_state"] == "progressed"
    assert payload["has_more"] is False
    assert payload["wallets_found"] == 2
    assert payload["wallets_analyzed"] == 2
    assert payload["candidates_count"] == 2
    assert payload["signal_id"]
    assert payload["market"]["signal_summary"]["signal_status"] in {"pending_resolution", "no_clear_signal"}
    assert payload["market"]["progress"]["wallets_with_sufficient_history"] >= 1


def test_wallet_analysis_run_step_route_returns_incremental_progress(client: TestClient) -> None:
    app.dependency_overrides[get_polymarket_client] = lambda: DummyGammaAnalysisClient()
    app.dependency_overrides[get_polymarket_data_client] = lambda: DummyDataRouteClient()
    try:
        created = client.post("/wallet-analysis/jobs", json={"polymarket_url": MARKET_URL})
        assert created.status_code == 201
        job_id = created.json()["job_id"]
        first = client.post(
            f"/wallet-analysis/jobs/{job_id}/run-step",
            json={
                "max_wallets": 20,
                "max_wallets_discovery": 20,
                "batch_size": 1,
                "history_limit": 100,
                "max_runtime_seconds": 8,
            },
        )
        second = client.post(
            f"/wallet-analysis/jobs/{job_id}/run-step",
            json={
                "max_wallets": 20,
                "max_wallets_discovery": 20,
                "batch_size": 1,
                "history_limit": 100,
                "max_runtime_seconds": 8,
            },
        )
    finally:
        app.dependency_overrides.pop(get_polymarket_client, None)
        app.dependency_overrides.pop(get_polymarket_data_client, None)

    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["run_state"] == "progressed"
    assert first_payload["status"] == "analyzing_wallets"
    assert first_payload["has_more"] is True
    assert first_payload["next_action"] == "run_next_batch"
    assert first_payload["wallets_found"] == 2
    assert first_payload["wallets_analyzed"] == 1

    assert second.status_code == 200
    second_payload = second.json()
    assert second_payload["run_state"] == "progressed"
    assert second_payload["status"] == "completed"
    assert second_payload["has_more"] is False
    assert second_payload["wallets_found"] == 2
    assert second_payload["wallets_analyzed"] == 2


def test_wallet_analysis_job_detail_includes_signal_summary(client: TestClient, db_session: Session) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        event_slug=None,
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": TOKEN_YES}],
        token_ids_json=[TOKEN_YES],
    )
    db_session.add(job)
    db_session.flush()
    signal = PolySignalMarketSignal(
        job_id=job.id,
        source_url=MARKET_URL,
        market_slug=job.market_slug,
        event_slug=job.event_slug,
        condition_id=job.condition_id,
        market_title=job.market_title,
        predicted_side="YES",
        predicted_outcome="YES",
        polysignal_score=Decimal("0.7300"),
        confidence="medium",
        yes_score=Decimal("1.20"),
        no_score=Decimal("0.44"),
        outcome_scores_json={"YES": "1.20", "NO": "0.44"},
        wallets_analyzed=7,
        wallets_with_sufficient_history=4,
        warnings_json=["signal_ready"],
        signal_status="pending_resolution",
    )
    db_session.add(signal)
    db_session.commit()

    response = client.get(f"/wallet-analysis/jobs/{job.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["signal_summary"]["id"] == signal.id
    assert payload["signal_summary"]["predicted_side"] == "YES"
    assert payload["signal_summary"]["confidence"] == "medium"


def test_wallet_analysis_job_detail_partial_has_clean_progress_and_status_detail(
    client: TestClient,
    db_session: Session,
) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="partial",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": TOKEN_YES}],
        token_ids_json=[TOKEN_YES],
        warnings_json=["wallet_discovery_truncated"],
    )
    db_session.add(job)
    db_session.commit()

    response = client.get(f"/wallet-analysis/jobs/{job.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["progress"]["wallets_found"] == 0
    assert payload["progress"]["wallets_analyzed"] == 0
    assert payload["progress"]["yes_wallets"] == 0
    assert payload["progress"]["no_wallets"] == 0
    assert payload["warnings"] == ["wallet_discovery_truncated"]
    assert "limite configurado de wallets" in payload["status_detail"]


def test_wallet_analysis_candidates_support_filters_and_sort(client: TestClient, db_session: Session) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        event_slug=None,
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": TOKEN_YES}],
        token_ids_json=[TOKEN_YES],
    )
    db_session.add(job)
    db_session.flush()
    db_session.add_all(
        [
            WalletAnalysisCandidate(
                job_id=job.id,
                wallet_address=WALLET,
                outcome="Yes",
                side="YES",
                token_id=TOKEN_YES,
                score=Decimal("0.81"),
                confidence="high",
                volume_30d=Decimal("3000"),
                win_rate_30d_status="verified",
                win_rate_30d_value=Decimal("0.66"),
                pnl_30d_status="verified",
                pnl_30d_value=Decimal("85"),
            ),
            WalletAnalysisCandidate(
                job_id=job.id,
                wallet_address=SECOND_WALLET,
                outcome="No",
                side="NO",
                token_id=TOKEN_NO,
                score=Decimal("0.42"),
                confidence="low",
                volume_30d=Decimal("900"),
                win_rate_30d_status="estimated",
                win_rate_30d_value=Decimal("0.51"),
                pnl_30d_status="estimated",
                pnl_30d_value=Decimal("9"),
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        f"/wallet-analysis/jobs/{job.id}/candidates?confidence=high&sort_by=volume_30d&sort_order=desc"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["wallet_address"] == WALLET


def test_save_candidate_as_profile_preserves_manual_notes(client: TestClient, db_session: Session) -> None:
    profile = WalletProfile(
        wallet_address=WALLET,
        alias="existing-profile",
        status="watching",
        confidence="medium",
        notes="nota manual que no debe borrarse",
    )
    db_session.add(profile)
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        event_slug=None,
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": TOKEN_YES}],
        token_ids_json=[TOKEN_YES],
    )
    db_session.add(job)
    db_session.flush()
    candidate = WalletAnalysisCandidate(
        job_id=job.id,
        wallet_address=WALLET,
        outcome="Yes",
        side="YES",
        token_id=TOKEN_YES,
        score=Decimal("0.88"),
        confidence="high",
        roi_30d_status="unavailable",
        win_rate_30d_status="verified",
        win_rate_30d_value=Decimal("0.72"),
        pnl_30d_status="estimated",
        pnl_30d_value=Decimal("55"),
        reasons_json=["strong sample"],
        risks_json=["manual check later"],
    )
    db_session.add(candidate)
    db_session.commit()

    response = client.post(f"/wallet-analysis/candidates/{candidate.id}/save-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["wallet_address"] == WALLET
    assert payload["notes"] == "nota manual que no debe borrarse"


def test_wallet_profiles_list_and_patch_status(client: TestClient, db_session: Session) -> None:
    profile = WalletProfile(
        wallet_address=WALLET,
        alias="alpha",
        status="candidate",
        confidence="medium",
        notes="nota inicial",
    )
    db_session.add(profile)
    db_session.commit()

    listed = client.get("/wallet-profiles?status=candidate&limit=10&offset=0")
    assert listed.status_code == 200
    listed_payload = listed.json()
    assert listed_payload["total"] == 1
    assert listed_payload["items"][0]["wallet_address"] == WALLET

    patched = client.patch(
        f"/wallet-profiles/{profile.id}",
        json={"status": "watching", "notes": "nota actualizada"},
    )
    assert patched.status_code == 200
    patched_payload = patched.json()
    assert patched_payload["status"] == "watching"
    assert patched_payload["notes"] == "nota actualizada"


def test_wallet_profile_demo_follow_creates_copy_wallet_once(client: TestClient, db_session: Session) -> None:
    profile = WalletProfile(
        wallet_address=WALLET,
        alias="alpha",
        status="candidate",
        confidence="medium",
    )
    db_session.add(profile)
    db_session.commit()

    first = client.post(f"/wallet-profiles/{profile.id}/demo-follow")
    second = client.post(f"/wallet-profiles/{profile.id}/demo-follow")

    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["profile"]["status"] == "demo_follow"
    assert first_payload["already_following"] is False
    assert first_payload["copy_wallet"]["proxy_wallet"] == WALLET
    assert first_payload["copy_wallet"]["mode"] == "demo"
    assert first_payload["copy_wallet"]["real_trading_enabled"] is False
    assert first_payload["baseline_created_at"]

    assert second.status_code == 200
    second_payload = second.json()
    assert second_payload["already_following"] is True
    assert second_payload["copy_wallet"]["proxy_wallet"] == WALLET
    assert second_payload["copy_wallet"]["real_trading_enabled"] is False

    wallets = db_session.query(CopyWallet).filter(CopyWallet.proxy_wallet == WALLET).count()
    assert wallets == 1


def test_polysignal_market_signals_endpoints_list_and_detail(client: TestClient, db_session: Session) -> None:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="completed",
        outcomes_json=[{"label": "Yes", "side": "YES", "token_id": TOKEN_YES}],
        token_ids_json=[TOKEN_YES, TOKEN_NO],
    )
    db_session.add(job)
    db_session.flush()
    signal = PolySignalMarketSignal(
        job_id=job.id,
        source_url=MARKET_URL,
        market_slug=job.market_slug,
        condition_id=job.condition_id,
        market_title=job.market_title,
        predicted_side="YES",
        predicted_outcome="YES",
        polysignal_score=Decimal("0.8400"),
        confidence="high",
        yes_score=Decimal("1.50"),
        no_score=Decimal("0.28"),
        outcome_scores_json={"YES": "1.50", "NO": "0.28"},
        wallets_analyzed=12,
        wallets_with_sufficient_history=8,
        warnings_json=["signal_ready"],
        signal_status="pending_resolution",
    )
    db_session.add(signal)
    db_session.commit()

    listed = client.get(f"/polysignal-market-signals?job_id={job.id}&limit=10&offset=0")
    assert listed.status_code == 200
    listed_payload = listed.json()
    assert listed_payload["total"] == 1
    assert listed_payload["items"][0]["id"] == signal.id

    detail = client.get(f"/polysignal-market-signals/{signal.id}")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["id"] == signal.id
    assert detail_payload["predicted_side"] == "YES"
    assert detail_payload["signal_status"] == "pending_resolution"
