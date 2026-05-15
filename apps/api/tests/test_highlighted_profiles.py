from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient


WALLET = "0xe1e7036279433715711a65fc3254a8af558c5fb6"


def _valid_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "walletAddress": WALLET,
        "shortAddress": "0xe1e7...5fb6",
        "profileUrl": f"https://polymarket.com/profile/{WALLET}",
        "pseudonym": "public-wallet",
        "winRate": 0.82,
        "closedMarkets": 70,
        "wins": 58,
        "losses": 12,
        "realizedPnl": 1240.5,
        "observedCapitalUsd": 5000,
        "source": "wallet_intelligence",
        "sourceMarketTitle": "Spurs vs. Timberwolves",
        "sourceMarketSlug": "nba-sas-min-2026-05-15",
        "sourceMarketUrl": "https://polymarket.com/event/nba-sas-min-2026-05-15",
        "history": [
            {
                "marketTitle": "Closed public market",
                "outcome": "Spurs",
                "realizedPnl": 52.25,
                "result": "won",
                "source": "polymarket_data_api_closed_positions",
                "timestamp": "2026-05-14T12:00:00Z",
            }
        ],
        "sourceWarnings": ["public data can be partial"],
        "sourceLimitations": ["No private or identity data stored."],
    }
    payload.update(overrides)
    return payload


def test_highlighted_profile_upsert_accepts_valid_public_profile(client: TestClient) -> None:
    response = client.post("/profiles/highlighted/upsert", json=_valid_payload())

    assert response.status_code == 200
    payload = response.json()
    assert payload["walletAddress"] == WALLET
    assert payload["winRate"] == 0.82
    assert payload["closedMarkets"] == 70
    assert payload["qualifies"] is True
    assert payload["noLongerQualifies"] is False
    assert payload["history"][0]["marketTitle"] == "Closed public market"

    listing = client.get("/profiles/highlighted?min_win_rate=0.8&min_closed_markets=50")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1


def test_highlighted_profile_upsert_rejects_invalid_wallet(client: TestClient) -> None:
    response = client.post("/profiles/highlighted/upsert", json=_valid_payload(walletAddress="0xe1e7...5fb6"))

    assert response.status_code == 422


def test_highlighted_profile_upsert_rejects_missing_real_win_rate(client: TestClient) -> None:
    response = client.post("/profiles/highlighted/upsert", json=_valid_payload(winRate=None))

    assert response.status_code == 422
    assert response.json()["detail"] == "win_rate_unavailable"


def test_highlighted_profile_upsert_rejects_low_closed_markets(client: TestClient) -> None:
    response = client.post("/profiles/highlighted/upsert", json=_valid_payload(closedMarkets=2))

    assert response.status_code == 422
    assert response.json()["detail"] == "closed_markets_below_threshold"


def test_highlighted_profile_upsert_rejects_without_pnl_or_capital(client: TestClient) -> None:
    response = client.post(
        "/profiles/highlighted/upsert",
        json=_valid_payload(realizedPnl=None, unrealizedPnl=None, observedCapitalUsd=50),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "missing_real_pnl_or_relevant_capital"


def test_highlighted_profile_upsert_dedupes_and_preserves_first_detected(client: TestClient) -> None:
    first = client.post(
        "/profiles/highlighted/upsert",
        json=_valid_payload(detectedAt=datetime(2026, 5, 1, tzinfo=UTC).isoformat()),
    )
    second = client.post(
        "/profiles/highlighted/upsert",
        json=_valid_payload(winRate=0.9, detectedAt=datetime(2026, 5, 14, tzinfo=UTC).isoformat()),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    listing = client.get("/profiles/highlighted")
    payload = listing.json()
    assert payload["total"] == 1
    assert payload["items"][0]["winRate"] == 0.9
    assert payload["items"][0]["detectedAt"].startswith("2026-05-01")


def test_highlighted_profile_marks_existing_profile_that_no_longer_qualifies(client: TestClient) -> None:
    created = client.post("/profiles/highlighted/upsert", json=_valid_payload())
    assert created.status_code == 200

    updated = client.post(
        "/profiles/highlighted/upsert",
        json=_valid_payload(winRate=0.71, closedMarkets=70, realizedPnl=100),
    )

    assert updated.status_code == 200
    payload = updated.json()
    assert payload["qualifies"] is False
    assert payload["noLongerQualifies"] is True


def test_highlighted_profile_detail_and_filters(client: TestClient) -> None:
    response = client.post("/profiles/highlighted/upsert", json=_valid_payload())
    assert response.status_code == 200

    detail = client.get(f"/profiles/highlighted/{WALLET.upper()}")
    assert detail.status_code == 200
    assert detail.json()["walletAddress"] == WALLET

    filtered = client.get("/profiles/highlighted?has_pnl=true&q=spurs&sort=win_rate")
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
