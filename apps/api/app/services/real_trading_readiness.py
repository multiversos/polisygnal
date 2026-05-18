from __future__ import annotations

from decimal import Decimal

from app.schemas.real_trading import (
    RealReadinessScore,
    RealReadinessStatus,
    WalletRealReadinessProfile,
)

MIN_DEMO_DAYS = 7
MIN_CLOSED_DEMO_TRADES = 5
MIN_PROFILE_TRADES_30D = 10


def calculate_real_readiness(profile: WalletRealReadinessProfile) -> RealReadinessScore:
    blockers: list[str] = []
    warnings: list[str] = []
    reasons: list[str] = []
    score = Decimal("0")

    if not profile.real_trading_available:
        blockers.append("real_trading_globally_disabled")

    if profile.days_in_demo is None or profile.days_in_demo < MIN_DEMO_DAYS:
        blockers.append("demo_observation_period_too_short")
    else:
        score += Decimal("15")
        reasons.append("demo_observation_period_met")

    if profile.demo_closed_count < MIN_CLOSED_DEMO_TRADES:
        blockers.append("insufficient_closed_demo_positions")
    else:
        score += Decimal("20")
        reasons.append("closed_demo_sample_met")

    if profile.demo_realized_pnl_usd is None:
        blockers.append("missing_demo_realized_pnl")
    elif profile.demo_realized_pnl_usd > 0:
        score += Decimal("20")
        reasons.append("positive_demo_realized_pnl")
    else:
        warnings.append("demo_realized_pnl_not_positive")

    if profile.demo_win_rate is not None and profile.demo_win_rate >= Decimal("0.55"):
        score += Decimal("10")
        reasons.append("demo_win_rate_supportive")
    elif profile.demo_win_rate is None:
        warnings.append("demo_win_rate_unavailable")

    if profile.wallet_profile_score is not None:
        score += min(Decimal("15"), profile.wallet_profile_score * Decimal("15"))
        reasons.append("wallet_profile_score_applied")
    else:
        warnings.append("wallet_profile_score_unavailable")

    if profile.trades_30d is not None and profile.trades_30d >= MIN_PROFILE_TRADES_30D:
        score += Decimal("10")
        reasons.append("wallet_profile_sample_supported")
    else:
        warnings.append("wallet_profile_sample_small")

    copyability_complete = all(
        value is not None
        for value in (
            profile.avg_total_latency_ms,
            profile.p95_total_latency_ms,
            profile.avg_entry_price_delta_bps,
            profile.estimated_slippage_bps,
        )
    )
    if copyability_complete:
        score += Decimal("10")
        reasons.append("copyability_measurements_available")
    else:
        warnings.append("copyability_measurements_incomplete")

    if profile.avg_total_latency_ms is not None and profile.avg_total_latency_ms > 10_000:
        warnings.append("average_latency_high")
    if profile.out_of_window_rate is not None and profile.out_of_window_rate > Decimal("0.25"):
        warnings.append("out_of_window_rate_high")

    status = _resolve_status(profile, blockers=blockers, copyability_complete=copyability_complete)
    allows_dry_run = status in {
        RealReadinessStatus.DRY_RUN_CANDIDATE,
        RealReadinessStatus.SIGNED_DRY_RUN_CANDIDATE,
        RealReadinessStatus.LIVE_CANDIDATE_LOCKED,
    }
    allows_signed_dry_run = status in {
        RealReadinessStatus.SIGNED_DRY_RUN_CANDIDATE,
        RealReadinessStatus.LIVE_CANDIDATE_LOCKED,
    }

    return RealReadinessScore(
        readiness_score=min(score, Decimal("100")),
        status=status,
        real_trading_available=profile.real_trading_available,
        demo_required=True,
        allows_dry_run=allows_dry_run,
        allows_signed_dry_run=allows_signed_dry_run,
        allows_live=False,
        blockers=blockers,
        warnings=warnings,
        reasons=reasons,
    )


def _resolve_status(
    profile: WalletRealReadinessProfile,
    *,
    blockers: list[str],
    copyability_complete: bool,
) -> RealReadinessStatus:
    if profile.demo_closed_count == 0 and (profile.trades_30d or 0) == 0:
        return RealReadinessStatus.NOT_READY

    if (
        profile.days_in_demo is None
        or profile.days_in_demo < MIN_DEMO_DAYS
        or profile.demo_closed_count < MIN_CLOSED_DEMO_TRADES
        or profile.demo_realized_pnl_usd is None
    ):
        return RealReadinessStatus.NEEDS_MORE_DEMO_DATA

    if profile.demo_realized_pnl_usd <= 0:
        return RealReadinessStatus.WATCH_ONLY

    if not copyability_complete:
        return RealReadinessStatus.DRY_RUN_CANDIDATE

    if not profile.real_trading_available:
        return RealReadinessStatus.LIVE_CANDIDATE_LOCKED

    if blockers:
        return RealReadinessStatus.SIGNED_DRY_RUN_CANDIDATE

    return RealReadinessStatus.LIVE_CANDIDATE_LOCKED
