from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.copy_trading import CopyTradingStatusResponse
from app.schemas.real_trading import (
    ExecutionAction,
    ExecutionDataQuality,
    ExecutionIntent,
    ExecutionLatencyStatus,
    ExecutionMode,
    ExecutionSimulationStatus,
    RealReadinessStatus,
    WalletRealReadinessProfile,
)
from app.services.real_trading_execution_models import (
    build_execution_intent,
    build_execution_simulation_result,
    build_latency_metrics,
    current_real_trading_guard,
    is_live_execution_enabled,
    mode_requires_order_submission,
)
from app.services.real_trading_readiness import calculate_real_readiness


def test_execution_mode_enum_exists_and_live_is_not_enabled() -> None:
    assert ExecutionMode.DEMO == "demo"
    assert ExecutionMode.DRY_RUN == "dry_run"
    assert ExecutionMode.SIGNED_DRY_RUN == "signed_dry_run"
    assert ExecutionMode.LIVE == "live"
    assert is_live_execution_enabled(real_trading_available=False) is False
    assert mode_requires_order_submission(ExecutionMode.LIVE) is False


def test_real_trading_available_remains_false_in_guard_models() -> None:
    status = CopyTradingStatusResponse(
        wallets_total=0,
        wallets_enabled=0,
        trades_detected=0,
        orders_simulated=0,
        orders_skipped=0,
        orders_blocked=0,
    )
    guard = current_real_trading_guard()

    assert status.real_trading_available is False
    assert guard.real_trading_available is False


def test_execution_intent_forbids_secret_fields() -> None:
    with pytest.raises(ValidationError):
        ExecutionIntent(
            mode=ExecutionMode.DRY_RUN,
            source_wallet_address="0x1111111111111111111111111111111111111111",
            action=ExecutionAction.BUY,
            private_key="secret",
        )


def test_execution_intent_has_no_secret_or_order_submission_fields() -> None:
    fields = set(ExecutionIntent.model_fields)

    assert "private_key" not in fields
    assert "seed_phrase" not in fields
    assert "api_secret" not in fields
    assert "clob_api_key" not in fields
    assert "signed_order" not in fields
    assert "submitted_order_id" not in fields


def test_execution_simulation_result_marks_unavailable_without_inventing_pnl() -> None:
    intent = build_execution_intent(
        mode=ExecutionMode.DRY_RUN,
        source_wallet_address="0x1111111111111111111111111111111111111111",
        action=ExecutionAction.BUY,
        intended_amount_usd=Decimal("10"),
    )

    result = build_execution_simulation_result(
        intent=intent,
        source_price=Decimal("0.55"),
        polysignal_quote_price=None,
        estimated_gross_pnl=Decimal("2.00"),
        estimated_fees=Decimal("0.10"),
        estimated_slippage=Decimal("0.20"),
        data_quality=ExecutionDataQuality.UNAVAILABLE,
    )

    assert result.status == ExecutionSimulationStatus.UNAVAILABLE
    assert result.estimated_gross_pnl is None
    assert result.estimated_net_pnl is None
    assert result.estimated_net_roi is None
    assert result.worth_copying is False


def test_execution_latency_metrics_calculates_available_latencies() -> None:
    source_at = _now()
    metrics = build_latency_metrics(
        source_wallet_trade_at=source_at,
        detected_at=source_at + timedelta(milliseconds=800),
        quote_started_at=source_at + timedelta(seconds=1),
        quote_finished_at=source_at + timedelta(seconds=2),
        decision_started_at=source_at + timedelta(seconds=2),
        decision_finished_at=source_at + timedelta(seconds=3),
        order_build_started_at=source_at + timedelta(seconds=3),
        order_build_finished_at=source_at + timedelta(seconds=4),
        ready_to_send_at=source_at + timedelta(seconds=5),
    )

    assert metrics.detection_latency_ms == 800
    assert metrics.quote_latency_ms == 1000
    assert metrics.decision_latency_ms == 1000
    assert metrics.order_build_latency_ms == 1000
    assert metrics.signature_latency_ms is None
    assert metrics.total_latency_ms == 5000
    assert metrics.latency_status == ExecutionLatencyStatus.ACCEPTABLE


def test_real_readiness_returns_not_ready_without_demo_or_profile_data() -> None:
    profile = WalletRealReadinessProfile(
        wallet_address="0x1111111111111111111111111111111111111111",
    )

    result = calculate_real_readiness(profile)

    assert result.status == RealReadinessStatus.NOT_READY
    assert result.allows_live is False


def test_real_readiness_never_allows_live_when_real_trading_is_false() -> None:
    profile = WalletRealReadinessProfile(
        wallet_address="0x1111111111111111111111111111111111111111",
        real_trading_available=False,
        days_in_demo=12,
        demo_closed_count=8,
        demo_realized_pnl_usd=Decimal("25"),
        demo_win_rate=Decimal("0.66"),
        trades_30d=18,
        wallet_profile_score=Decimal("0.82"),
        avg_total_latency_ms=3000,
        p95_total_latency_ms=6000,
        avg_entry_price_delta_bps=Decimal("45"),
        estimated_slippage_bps=Decimal("30"),
    )

    result = calculate_real_readiness(profile)

    assert result.status == RealReadinessStatus.LIVE_CANDIDATE_LOCKED
    assert result.allows_live is False
    assert "real_trading_globally_disabled" in result.blockers


def test_wallet_with_good_profile_but_no_closed_demo_stays_needs_more_demo_data() -> None:
    profile = WalletRealReadinessProfile(
        wallet_address="0x1111111111111111111111111111111111111111",
        real_trading_available=False,
        days_in_demo=10,
        demo_closed_count=0,
        wallet_profile_score=Decimal("0.91"),
        trades_30d=30,
        roi_30d_status="verified",
        roi_30d_value=Decimal("0.18"),
        win_rate_30d_status="verified",
        win_rate_30d_value=Decimal("0.63"),
        pnl_30d_status="verified",
        pnl_30d_value=Decimal("90"),
    )

    result = calculate_real_readiness(profile)

    assert result.status == RealReadinessStatus.NEEDS_MORE_DEMO_DATA


def test_positive_demo_without_slippage_or_latency_caps_at_dry_run_candidate() -> None:
    profile = WalletRealReadinessProfile(
        wallet_address="0x1111111111111111111111111111111111111111",
        days_in_demo=14,
        demo_closed_count=9,
        demo_realized_pnl_usd=Decimal("44"),
        demo_win_rate=Decimal("0.61"),
        trades_30d=22,
        wallet_profile_score=Decimal("0.80"),
        real_trading_available=False,
    )

    result = calculate_real_readiness(profile)

    assert result.status == RealReadinessStatus.DRY_RUN_CANDIDATE
    assert result.allows_dry_run is True
    assert result.allows_signed_dry_run is False


def test_real_trading_models_do_not_reference_private_key_seed_clob_or_real_orders() -> None:
    serialized = (
        str(ExecutionIntent.model_json_schema())
        + str(WalletRealReadinessProfile.model_json_schema())
    ).lower()

    assert "private_key" not in serialized
    assert "seed_phrase" not in serialized
    assert "clob" not in serialized
    assert "submit_order" not in serialized


def _now() -> datetime:
    return datetime(2026, 5, 17, 12, 0, tzinfo=UTC)
