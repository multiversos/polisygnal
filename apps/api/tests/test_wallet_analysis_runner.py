from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.polymarket_data import (
    PolymarketDataClientError,
    PolymarketDataMarketPosition,
    PolymarketDataTrade,
    PolymarketDataUserPosition,
    PolymarketPublicProfile,
)
from app.models import PolySignalMarketSignal, WalletAnalysisCandidate, WalletAnalysisJob
from app.services.polysignal_market_signals import list_market_signals, mark_market_signal_resolved
from app.services.wallet_analysis_runner import WalletAnalysisRunnerConfig, run_wallet_analysis_job_once

MARKET_URL = "https://polymarket.com/market/will-btc-finish-may-above-110k"
CONDITION_ID = "cond-btc-may-110k"
TOKEN_YES = "token-yes"
TOKEN_NO = "token-no"
WALLET_YES = "0x1111111111111111111111111111111111111111"
WALLET_NO = "0x2222222222222222222222222222222222222222"
WALLET_THIRD = "0x3333333333333333333333333333333333333333"


class DummyDataClient:
    def __init__(
        self,
        *,
        market_positions: list[PolymarketDataMarketPosition] | None = None,
        market_trades: list[PolymarketDataTrade] | None = None,
        closed_positions_by_wallet: dict[str, list[PolymarketDataUserPosition]] | None = None,
        open_positions_by_wallet: dict[str, list[PolymarketDataUserPosition]] | None = None,
        trades_by_wallet: dict[str, list[PolymarketDataTrade]] | None = None,
        profiles_by_wallet: dict[str, PolymarketPublicProfile | None] | None = None,
        fail_market_positions: bool = False,
        fail_market_trades: bool = False,
    ) -> None:
        self.market_positions = market_positions or []
        self.market_trades = market_trades or []
        self.closed_positions_by_wallet = closed_positions_by_wallet or {}
        self.open_positions_by_wallet = open_positions_by_wallet or {}
        self.trades_by_wallet = trades_by_wallet or {}
        self.profiles_by_wallet = profiles_by_wallet or {}
        self.fail_market_positions = fail_market_positions
        self.fail_market_trades = fail_market_trades

    def get_positions_for_market(self, condition_id: str, *, status: str = "OPEN", limit: int = 50):
        assert condition_id == CONDITION_ID
        if self.fail_market_positions:
            raise PolymarketDataClientError("market positions unavailable")
        return self.market_positions[:limit]

    def get_trades_for_market(self, condition_id: str, *, limit: int = 50, offset: int = 0, taker_only: bool = True):
        assert condition_id == CONDITION_ID
        if self.fail_market_trades:
            raise PolymarketDataClientError("market trades unavailable")
        return self.market_trades[offset : offset + limit]

    def get_user_closed_positions(self, wallet: str, *, limit: int = 100, offset: int = 0):
        return list(self.closed_positions_by_wallet.get(wallet.lower(), []))[:limit]

    def get_user_positions(self, wallet: str, *, limit: int = 100, offset: int = 0):
        return list(self.open_positions_by_wallet.get(wallet.lower(), []))[:limit]

    def get_trades_for_user(self, wallet: str, *, limit: int = 50, offset: int = 0):
        return list(self.trades_by_wallet.get(wallet.lower(), []))[:limit]

    def get_user_profile(self, wallet: str):
        return self.profiles_by_wallet.get(wallet.lower())


def _build_market_position(wallet: str, outcome: str, token_id: str, value: str) -> PolymarketDataMarketPosition:
    return PolymarketDataMarketPosition.model_validate(
        {
            "proxyWallet": wallet,
            "conditionId": CONDITION_ID,
            "asset": token_id,
            "outcome": outcome,
            "currentValue": value,
            "totalBought": value,
            "avgPrice": "0.60",
            "pseudonym": wallet[:8],
        }
    )


def _build_user_position(
    *,
    wallet: str,
    outcome: str,
    timestamp: datetime,
    realized_pnl: str = "0",
    total_bought: str = "50",
    title: str = "Will BTC finish May above 110k?",
) -> PolymarketDataUserPosition:
    return PolymarketDataUserPosition.model_validate(
        {
            "proxyWallet": wallet,
            "conditionId": CONDITION_ID,
            "asset": TOKEN_YES if outcome.lower() == "yes" else TOKEN_NO,
            "outcome": outcome,
            "timestamp": timestamp.isoformat(),
            "realizedPnl": realized_pnl,
            "totalBought": total_bought,
            "currentValue": total_bought,
            "title": title,
        }
    )


def _build_trade(
    *,
    wallet: str,
    outcome: str,
    timestamp: datetime,
    size: str = "10",
    price: str = "0.60",
) -> PolymarketDataTrade:
    return PolymarketDataTrade.model_validate(
        {
            "proxyWallet": wallet,
            "conditionId": CONDITION_ID,
            "asset": TOKEN_YES if outcome.lower() == "yes" else TOKEN_NO,
            "outcome": outcome,
            "timestamp": timestamp.isoformat(),
            "size": size,
            "price": price,
            "transactionHash": f"0x{wallet[-8:]}{timestamp.day:02d}",
        }
    )


def _build_profile(wallet: str, pseudonym: str) -> PolymarketPublicProfile:
    return PolymarketPublicProfile.model_validate(
        {
            "proxyWallet": wallet,
            "pseudonym": pseudonym,
        }
    )


def _create_job(db_session: Session, *, created_at: datetime) -> WalletAnalysisJob:
    job = WalletAnalysisJob(
        source_url=MARKET_URL,
        normalized_url=MARKET_URL,
        market_slug="will-btc-finish-may-above-110k",
        event_slug=None,
        condition_id=CONDITION_ID,
        market_title="Will BTC finish May above 110k?",
        status="pending",
        outcomes_json=[
            {"label": "Yes", "side": "YES", "token_id": TOKEN_YES},
            {"label": "No", "side": "NO", "token_id": TOKEN_NO},
        ],
        token_ids_json=[TOKEN_YES, TOKEN_NO],
        created_at=created_at,
        updated_at=created_at,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_runner_completes_job_and_persists_candidates_and_signal(db_session: Session) -> None:
    now = datetime(2026, 5, 17, 18, 0, tzinfo=UTC)
    job = _create_job(db_session, created_at=now - timedelta(minutes=5))
    client = DummyDataClient(
        market_positions=[
            _build_market_position(WALLET_YES, "Yes", TOKEN_YES, "1200"),
            _build_market_position(WALLET_NO, "No", TOKEN_NO, "350"),
        ],
        closed_positions_by_wallet={
            WALLET_YES: [
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=day), realized_pnl=value)
                for day, value in [(1, "18"), (2, "12"), (3, "10"), (5, "-4"), (7, "8"), (10, "6")]
            ],
            WALLET_NO: [
                _build_user_position(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=2), realized_pnl="-3"),
                _build_user_position(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=9), realized_pnl="2"),
            ],
        },
        open_positions_by_wallet={
            WALLET_YES: [_build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=1), realized_pnl="0", total_bought="70")],
        },
        trades_by_wallet={
            WALLET_YES: [
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=day), size="12", price="0.63")
                for day in [1, 2, 3, 4, 6, 8]
            ],
            WALLET_NO: [_build_trade(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=3), size="5", price="0.42")],
        },
        profiles_by_wallet={
            WALLET_YES: _build_profile(WALLET_YES, "alpha"),
            WALLET_NO: _build_profile(WALLET_NO, "beta"),
        },
    )

    run_wallet_analysis_job_once(
        db_session,
        job_id=job.id,
        data_client=client,
        config=WalletAnalysisRunnerConfig(batch_size=1, max_wallets_analyze=10, max_wallets_discovery=10, user_history_limit=100),
        now=now,
    )
    db_session.commit()
    db_session.refresh(job)

    candidates = list(
        db_session.scalars(
            select(WalletAnalysisCandidate)
            .where(WalletAnalysisCandidate.job_id == job.id)
            .order_by(WalletAnalysisCandidate.side.asc())
        ).all()
    )
    signal = db_session.scalar(
        select(PolySignalMarketSignal).where(PolySignalMarketSignal.job_id == job.id)
    )

    assert job.status == "completed"
    assert job.wallets_found == 2
    assert job.wallets_analyzed == 2
    assert job.wallets_with_sufficient_history == 1
    assert job.yes_wallets == 1
    assert job.no_wallets == 1
    assert len(candidates) == 2
    assert signal is not None
    assert signal.signal_status == "pending_resolution"
    assert signal.predicted_side == "YES"
    assert signal.wallets_analyzed == 2

    yes_candidate = next(candidate for candidate in candidates if candidate.side == "YES")
    assert yes_candidate.wallet_address == WALLET_YES
    assert yes_candidate.confidence == "medium"
    assert yes_candidate.pnl_30d_status == "verified"
    assert yes_candidate.win_rate_30d_status == "verified"
    assert yes_candidate.roi_30d_status == "verified"
    assert yes_candidate.trades_30d == 6
    assert yes_candidate.markets_traded_30d == 1
    assert yes_candidate.score is not None and yes_candidate.score > Decimal("0")
    assert "realized_pnl_30d_observed" in (yes_candidate.reasons_json or [])


def test_runner_marks_metrics_unavailable_when_wallet_history_is_missing(db_session: Session) -> None:
    now = datetime(2026, 5, 17, 18, 30, tzinfo=UTC)
    job = _create_job(db_session, created_at=now - timedelta(minutes=3))
    client = DummyDataClient(
        market_positions=[_build_market_position(WALLET_YES, "Yes", TOKEN_YES, "250")],
        profiles_by_wallet={WALLET_YES: _build_profile(WALLET_YES, "alpha")},
    )

    run_wallet_analysis_job_once(
        db_session,
        job_id=job.id,
        data_client=client,
        config=WalletAnalysisRunnerConfig(batch_size=1, max_wallets_analyze=10, max_wallets_discovery=10, user_history_limit=100),
        now=now,
    )
    db_session.commit()

    candidate = db_session.scalar(select(WalletAnalysisCandidate).where(WalletAnalysisCandidate.job_id == job.id))
    assert candidate is not None
    assert candidate.pnl_30d_status == "unavailable"
    assert candidate.win_rate_30d_status == "unavailable"
    assert candidate.roi_30d_status == "unavailable"
    assert candidate.trades_30d == 0
    assert candidate.confidence == "low"
    assert "no_resolved_closed_positions_30d" in (candidate.risks_json or [])
    assert "sample_size_small" in (candidate.risks_json or [])


def test_runner_marks_estimated_metrics_and_partial_when_limits_cut_analysis(db_session: Session) -> None:
    now = datetime(2026, 5, 17, 19, 0, tzinfo=UTC)
    job = _create_job(db_session, created_at=now - timedelta(minutes=4))
    client = DummyDataClient(
        market_positions=[
            _build_market_position(WALLET_YES, "Yes", TOKEN_YES, "700"),
            _build_market_position(WALLET_NO, "No", TOKEN_NO, "600"),
            _build_market_position(WALLET_THIRD, "Yes", TOKEN_YES, "550"),
        ],
        closed_positions_by_wallet={
            WALLET_YES: [
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=1), realized_pnl="8"),
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=2), realized_pnl="-2"),
            ],
            WALLET_NO: [
                _build_user_position(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=1), realized_pnl="4"),
                _build_user_position(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=3), realized_pnl="3"),
            ],
        },
        trades_by_wallet={
            WALLET_YES: [
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=1)),
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=2)),
            ],
            WALLET_NO: [
                _build_trade(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=1)),
                _build_trade(wallet=WALLET_NO, outcome="No", timestamp=now - timedelta(days=3)),
            ],
        },
    )

    run_wallet_analysis_job_once(
        db_session,
        job_id=job.id,
        data_client=client,
        config=WalletAnalysisRunnerConfig(batch_size=1, max_wallets_analyze=2, max_wallets_discovery=10, user_history_limit=2),
        now=now,
    )
    db_session.commit()
    db_session.refresh(job)

    candidates = list(db_session.scalars(select(WalletAnalysisCandidate).where(WalletAnalysisCandidate.job_id == job.id)).all())
    assert job.status == "partial"
    assert job.wallets_found == 3
    assert job.wallets_analyzed == 2
    assert len(candidates) == 2
    assert all(candidate.pnl_30d_status == "estimated" for candidate in candidates)
    assert all(candidate.win_rate_30d_status == "estimated" for candidate in candidates)
    assert all(candidate.roi_30d_status == "estimated" for candidate in candidates)


def test_runner_sanitizes_discovery_failures_into_warnings_and_creates_no_clear_signal(db_session: Session) -> None:
    now = datetime(2026, 5, 17, 19, 30, tzinfo=UTC)
    job = _create_job(db_session, created_at=now - timedelta(minutes=2))
    client = DummyDataClient(
        fail_market_positions=True,
        fail_market_trades=True,
    )

    run_wallet_analysis_job_once(
        db_session,
        job_id=job.id,
        data_client=client,
        config=WalletAnalysisRunnerConfig(batch_size=1, max_wallets_analyze=10, max_wallets_discovery=10, user_history_limit=100),
        now=now,
    )
    db_session.commit()
    db_session.refresh(job)

    signal = db_session.scalar(select(PolySignalMarketSignal).where(PolySignalMarketSignal.job_id == job.id))
    assert job.status == "completed"
    assert job.wallets_found == 0
    assert "market_positions_unavailable" in (job.warnings_json or [])
    assert "market_trades_unavailable" in (job.warnings_json or [])
    assert signal is not None
    assert signal.signal_status == "no_clear_signal"


def test_market_signal_can_be_resolved_without_mutating_original_prediction(db_session: Session) -> None:
    now = datetime(2026, 5, 17, 20, 0, tzinfo=UTC)
    job = _create_job(db_session, created_at=now - timedelta(minutes=5))
    client = DummyDataClient(
        market_positions=[_build_market_position(WALLET_YES, "Yes", TOKEN_YES, "1000")],
        closed_positions_by_wallet={
            WALLET_YES: [
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=1), realized_pnl="8"),
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=2), realized_pnl="7"),
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=3), realized_pnl="6"),
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=4), realized_pnl="5"),
                _build_user_position(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=5), realized_pnl="4"),
            ],
        },
        trades_by_wallet={
            WALLET_YES: [
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=1)),
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=2)),
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=3)),
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=4)),
                _build_trade(wallet=WALLET_YES, outcome="Yes", timestamp=now - timedelta(days=5)),
            ],
        },
    )

    run_wallet_analysis_job_once(
        db_session,
        job_id=job.id,
        data_client=client,
        config=WalletAnalysisRunnerConfig(batch_size=1, max_wallets_analyze=5, max_wallets_discovery=5, user_history_limit=100),
        now=now,
    )
    db_session.commit()

    signal = db_session.scalar(select(PolySignalMarketSignal).where(PolySignalMarketSignal.job_id == job.id))
    assert signal is not None
    original_predicted_outcome = signal.predicted_outcome
    assert signal.signal_status == "pending_resolution"

    resolved = mark_market_signal_resolved(
        db_session,
        signal_id=signal.id,
        final_outcome="YES",
        resolution_source="manual_test",
        resolved_at=now,
    )
    db_session.commit()

    listing = list_market_signals(db_session, limit=10)
    assert resolved.signal_status == "resolved_hit"
    assert resolved.final_outcome == "YES"
    assert resolved.predicted_outcome == original_predicted_outcome
    assert listing.total == 1
    assert listing.items[0].signal_status == "resolved_hit"
