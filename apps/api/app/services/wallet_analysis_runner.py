from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.polymarket_data import (
    PolymarketDataClient,
    PolymarketDataClientError,
    PolymarketDataMarketPosition,
    PolymarketDataTrade,
    PolymarketDataUserPosition,
)
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob
from app.services.polysignal_market_signals import create_market_signal_from_analysis_result
from app.services.wallet_analysis import get_wallet_analysis_job, normalize_wallet_address

ANALYSIS_WINDOW_DAYS = 30
DEFAULT_DISCOVERY_LIMIT = 150
DEFAULT_ANALYZE_LIMIT = 100
DEFAULT_BATCH_SIZE = 20
DEFAULT_TRADES_PAGE_SIZE = 100
DEFAULT_USER_HISTORY_LIMIT = 100
MIN_HISTORY_ITEMS_FOR_CONFIDENCE = 5


class WalletAnalysisRunnerError(Exception):
    pass


@dataclass(slots=True)
class WalletAnalysisRunnerConfig:
    batch_size: int = DEFAULT_BATCH_SIZE
    max_wallets_analyze: int = DEFAULT_ANALYZE_LIMIT
    max_wallets_discovery: int = DEFAULT_DISCOVERY_LIMIT
    trades_page_size: int = DEFAULT_TRADES_PAGE_SIZE
    user_history_limit: int = DEFAULT_USER_HISTORY_LIMIT


@dataclass(slots=True)
class DiscoveredWalletCandidate:
    wallet_address: str
    side: str
    outcome: str | None
    token_id: str | None
    observed_market_position_usd: Decimal
    raw_summary_json: dict[str, object]


def run_wallet_analysis_job_once(
    db: Session,
    *,
    job_id: str,
    data_client: PolymarketDataClient,
    config: WalletAnalysisRunnerConfig | None = None,
    now: datetime | None = None,
) -> WalletAnalysisJob:
    runner_config = config or WalletAnalysisRunnerConfig()
    job = get_wallet_analysis_job(db, job_id)
    job_now = now or datetime.now(tz=UTC)
    if job.status in {"completed", "cancelled"}:
        return job
    try:
        if not job.condition_id:
            job.status = "failed"
            job.started_at = job.started_at or job_now
            job.finished_at = job_now
            job.error_message = "condition_id_unavailable"
            job.result_json = {"status": "failed", "reason": "condition_id_unavailable"}
            db.add(job)
            db.flush()
            return job

        job.status = "resolving_market"
        job.started_at = job.started_at or job_now
        job.error_message = None
        job.warnings_json = []
        db.add(job)
        db.flush()

        warnings: list[str] = []
        job.status = "discovering_wallets"
        discovered = discover_market_wallets(
            job,
            data_client=data_client,
            max_wallets_discovery=runner_config.max_wallets_discovery,
            trades_page_size=runner_config.trades_page_size,
            warnings=warnings,
        )
        job.wallets_found = len(discovered)
        db.add(job)
        db.flush()

        if not discovered:
            job.status = "completed"
            job.finished_at = job_now
            job.result_json = {
                "status": "completed",
                "wallets_found": 0,
                "wallets_analyzed": 0,
                "wallets_with_sufficient_history": 0,
                "warnings": warnings,
            }
            job.warnings_json = _dedupe(warnings)
            create_market_signal_from_analysis_result(db, job=job, candidates=[], result_summary=job.result_json)
            db.flush()
            return job

        job.status = "analyzing_wallets"
        db.add(job)
        db.flush()

        wallets_to_analyze = discovered[: runner_config.max_wallets_analyze]
        sufficient_history = 0
        batch_number = 0

        for batch_start in range(0, len(wallets_to_analyze), runner_config.batch_size):
            batch_number += 1
            batch = wallets_to_analyze[batch_start : batch_start + runner_config.batch_size]
            job.current_batch = batch_number
            db.add(job)
            db.flush()
            sufficient_history += analyze_wallet_batch(
                db,
                job=job,
                discovered_wallets=batch,
                data_client=data_client,
                history_limit=runner_config.user_history_limit,
                now=job_now,
                warnings=warnings,
            )
            job.wallets_analyzed = min(len(wallets_to_analyze), batch_start + len(batch))
            job.wallets_with_sufficient_history = sufficient_history
            db.add(job)
            db.flush()

        job.status = "scoring"
        db.add(job)
        db.flush()

        candidates = list(
            db.scalars(
                select(WalletAnalysisCandidate)
                .where(WalletAnalysisCandidate.job_id == job.id)
                .order_by(WalletAnalysisCandidate.score.desc().nullslast(), WalletAnalysisCandidate.created_at.asc())
            ).all()
        )
        job.yes_wallets = sum(1 for candidate in candidates if (candidate.side or "").upper() == "YES")
        job.no_wallets = sum(1 for candidate in candidates if (candidate.side or "").upper() == "NO")
        status = "partial" if len(discovered) > len(wallets_to_analyze) else "completed"
        job.status = status
        job.finished_at = job_now
        job.warnings_json = _dedupe(warnings)

        result_json = build_wallet_analysis_result(job, candidates, status=status)
        job.result_json = result_json
        create_market_signal_from_analysis_result(db, job=job, candidates=candidates, result_summary=result_json)
        db.add(job)
        db.flush()
        return job
    except Exception as exc:
        job.status = "failed"
        job.finished_at = datetime.now(tz=UTC)
        job.error_message = _sanitize_error_message(exc)
        job.result_json = {
            "status": "failed",
            "reason": "wallet_analysis_runner_failed",
        }
        warnings = list(job.warnings_json or [])
        warnings.append("wallet_analysis_runner_failed")
        job.warnings_json = _dedupe(warnings)
        db.add(job)
        db.flush()
        raise WalletAnalysisRunnerError(job.error_message) from exc


def discover_market_wallets(
    job: WalletAnalysisJob,
    *,
    data_client: PolymarketDataClient,
    max_wallets_discovery: int,
    trades_page_size: int,
    warnings: list[str],
) -> list[DiscoveredWalletCandidate]:
    aggregated: dict[tuple[str, str, str | None], DiscoveredWalletCandidate] = {}
    try:
        positions = data_client.get_positions_for_market(job.condition_id or "", limit=max_wallets_discovery)
    except PolymarketDataClientError:
        positions = []
        warnings.append("market_positions_unavailable")
    else:
        for position in positions:
            candidate = _candidate_from_market_position(position)
            if candidate is None:
                continue
            _merge_discovered_candidate(aggregated, candidate)

    offset = 0
    while len(aggregated) < max_wallets_discovery:
        try:
            trades = data_client.get_trades_for_market(
                job.condition_id or "",
                limit=trades_page_size,
                offset=offset,
            )
        except PolymarketDataClientError:
            warnings.append("market_trades_unavailable")
            break
        if not trades:
            break
        for trade in trades:
            candidate = _candidate_from_trade(trade)
            if candidate is None:
                continue
            _merge_discovered_candidate(aggregated, candidate)
        if len(trades) < trades_page_size:
            break
        offset += trades_page_size
        if offset >= max_wallets_discovery * trades_page_size:
            warnings.append("trade_discovery_truncated")
            break

    ranked = sorted(
        aggregated.values(),
        key=lambda item: (item.observed_market_position_usd, item.wallet_address),
        reverse=True,
    )
    if len(ranked) > max_wallets_discovery:
        warnings.append("wallet_discovery_truncated")
    return ranked[:max_wallets_discovery]


def analyze_wallet_batch(
    db: Session,
    *,
    job: WalletAnalysisJob,
    discovered_wallets: list[DiscoveredWalletCandidate],
    data_client: PolymarketDataClient,
    history_limit: int,
    now: datetime,
    warnings: list[str],
) -> int:
    sufficient_history = 0
    for discovered in discovered_wallets:
        try:
            closed_positions = data_client.get_user_closed_positions(discovered.wallet_address, limit=history_limit)
            open_positions = data_client.get_user_positions(discovered.wallet_address, limit=history_limit)
            trades = data_client.get_trades_for_user(discovered.wallet_address, limit=history_limit)
            profile = data_client.get_user_profile(discovered.wallet_address)
        except PolymarketDataClientError:
            closed_positions = []
            open_positions = []
            trades = []
            profile = None
            warnings.append(f"wallet_fetch_failed:{discovered.wallet_address[:10]}")

        summary = summarize_wallet_history(
            discovered=discovered,
            closed_positions=closed_positions,
            open_positions=open_positions,
            trades=trades,
            profile=profile.model_dump(mode="python") if profile is not None else None,
            now=now,
            history_limit=history_limit,
        )
        if summary["has_sufficient_history"]:
            sufficient_history += 1
        upsert_wallet_analysis_candidate(
            db,
            job=job,
            discovered=discovered,
            summary=summary,
        )
    return sufficient_history


def summarize_wallet_history(
    *,
    discovered: DiscoveredWalletCandidate,
    closed_positions: list[PolymarketDataUserPosition],
    open_positions: list[PolymarketDataUserPosition],
    trades: list[PolymarketDataTrade],
    profile: dict[str, object] | None,
    now: datetime,
    history_limit: int,
) -> dict[str, object]:
    cutoff = now - timedelta(days=ANALYSIS_WINDOW_DAYS)
    recent_closed = [position for position in closed_positions if position.timestamp and position.timestamp >= cutoff]
    recent_trades = [trade for trade in trades if trade.timestamp and trade.timestamp >= cutoff]
    wins = sum(1 for position in recent_closed if (position.realized_pnl or Decimal("0")) > 0)
    losses = sum(1 for position in recent_closed if (position.realized_pnl or Decimal("0")) < 0)
    resolved_count = wins + losses
    pnl_30d = sum((position.realized_pnl or Decimal("0")) for position in recent_closed)
    closed_volume = sum((position.total_bought or Decimal("0")) for position in recent_closed)
    trade_volume = sum(
        abs((trade.size or Decimal("0")) * (trade.price or Decimal("0")))
        for trade in recent_trades
        if trade.size is not None and trade.price is not None
    )
    volume_30d = closed_volume + trade_volume
    markets = {
        value
        for value in [
            *[position.condition_id for position in recent_closed if position.condition_id],
            *[trade.condition_id for trade in recent_trades if trade.condition_id],
            *[position.condition_id for position in open_positions if position.condition_id],
        ]
        if value
    }
    last_activity = max(
        [item.timestamp for item in recent_closed if item.timestamp]
        + [item.timestamp for item in recent_trades if item.timestamp],
        default=None,
    )
    risks: list[str] = []
    reasons: list[str] = []

    pnl_status = "unavailable"
    pnl_value: Decimal | None = None
    win_rate_status = "unavailable"
    win_rate_value: Decimal | None = None
    roi_status = "unavailable"
    roi_value: Decimal | None = None

    if recent_closed:
        pnl_value = pnl_30d.quantize(Decimal("0.0001"))
        pnl_status = "estimated" if len(closed_positions) >= history_limit else "verified"
        reasons.append("realized_pnl_30d_observed")
    if resolved_count > 0:
        win_rate_value = (Decimal(wins) / Decimal(resolved_count)).quantize(Decimal("0.0001"))
        win_rate_status = "estimated" if len(closed_positions) >= history_limit else "verified"
        reasons.append("closed_positions_resolved_observed")
    if closed_volume > 0 and pnl_value is not None:
        roi_value = (pnl_30d / closed_volume).quantize(Decimal("0.0001"))
        roi_status = "estimated" if len(closed_positions) >= history_limit else "verified"
        reasons.append("roi_derived_from_closed_positions")

    if resolved_count < MIN_HISTORY_ITEMS_FOR_CONFIDENCE:
        risks.append("sample_size_small")
    if resolved_count == 0:
        risks.append("no_resolved_closed_positions_30d")
    if len(recent_trades) < MIN_HISTORY_ITEMS_FOR_CONFIDENCE:
        risks.append("recent_trade_sample_small")
    if losses > wins and resolved_count > 0:
        risks.append("recent_losses_outnumber_wins")
    if pnl_value is not None and pnl_value < 0:
        risks.append("negative_realized_pnl_30d")
    if len(closed_positions) >= history_limit or len(trades) >= history_limit:
        risks.append("history_may_be_partial_due_to_limit")

    confidence = "low"
    if resolved_count >= 10 and len(recent_trades) >= 10:
        confidence = "high"
    elif resolved_count >= MIN_HISTORY_ITEMS_FOR_CONFIDENCE and len(recent_trades) >= MIN_HISTORY_ITEMS_FOR_CONFIDENCE:
        confidence = "medium"

    score = _score_candidate(
        observed_market_position_usd=discovered.observed_market_position_usd,
        win_rate=win_rate_value,
        pnl_30d=pnl_value,
        resolved_count=resolved_count,
        volume_30d=volume_30d,
        confidence=confidence,
    )

    return {
        "confidence": confidence,
        "has_sufficient_history": resolved_count >= MIN_HISTORY_ITEMS_FOR_CONFIDENCE,
        "last_activity_at": last_activity,
        "markets_traded_30d": len(markets),
        "pnl_30d_status": pnl_status,
        "pnl_30d_value": pnl_value,
        "profile": profile,
        "raw_summary_json": {
            "closed_positions_count": len(closed_positions),
            "recent_closed_positions_count": len(recent_closed),
            "recent_trades_count": len(recent_trades),
            "resolved_count": resolved_count,
            "wins": wins,
            "losses": losses,
        },
        "reasons_json": _dedupe(reasons),
        "risks_json": _dedupe(risks),
        "roi_30d_status": roi_status,
        "roi_30d_value": roi_value,
        "score": score,
        "trades_30d": len(recent_trades),
        "volume_30d": volume_30d.quantize(Decimal("0.0001")) if volume_30d > 0 else None,
        "win_rate_30d_status": win_rate_status,
        "win_rate_30d_value": win_rate_value,
    }


def upsert_wallet_analysis_candidate(
    db: Session,
    *,
    job: WalletAnalysisJob,
    discovered: DiscoveredWalletCandidate,
    summary: dict[str, object],
) -> WalletAnalysisCandidate:
    candidate = db.scalar(
        select(WalletAnalysisCandidate)
        .where(WalletAnalysisCandidate.job_id == job.id)
        .where(WalletAnalysisCandidate.wallet_address == discovered.wallet_address)
        .where(WalletAnalysisCandidate.token_id == discovered.token_id)
        .limit(1)
    )
    candidate = candidate or WalletAnalysisCandidate(
        job_id=job.id,
        wallet_address=discovered.wallet_address,
        token_id=discovered.token_id,
    )
    candidate.outcome = discovered.outcome
    candidate.side = discovered.side
    candidate.observed_market_position_usd = discovered.observed_market_position_usd
    candidate.score = summary["score"]
    candidate.confidence = str(summary["confidence"])
    candidate.roi_30d_status = str(summary["roi_30d_status"])
    candidate.roi_30d_value = summary["roi_30d_value"]
    candidate.win_rate_30d_status = str(summary["win_rate_30d_status"])
    candidate.win_rate_30d_value = summary["win_rate_30d_value"]
    candidate.pnl_30d_status = str(summary["pnl_30d_status"])
    candidate.pnl_30d_value = summary["pnl_30d_value"]
    candidate.trades_30d = int(summary["trades_30d"])
    candidate.volume_30d = summary["volume_30d"]
    candidate.markets_traded_30d = int(summary["markets_traded_30d"])
    candidate.last_activity_at = summary["last_activity_at"]
    candidate.reasons_json = list(summary["reasons_json"])
    candidate.risks_json = list(summary["risks_json"])
    candidate.raw_summary_json = {
        **discovered.raw_summary_json,
        **summary["raw_summary_json"],
        "profile": summary["profile"],
    }
    db.add(candidate)
    db.flush()
    return candidate


def build_wallet_analysis_result(
    job: WalletAnalysisJob,
    candidates: list[WalletAnalysisCandidate],
    *,
    status: str,
) -> dict[str, object]:
    side_scores: dict[str, Decimal] = {}
    for candidate in candidates:
        side_key = (candidate.side or candidate.outcome or "UNKNOWN").strip()[:160] or "UNKNOWN"
        side_scores[side_key] = side_scores.get(side_key, Decimal("0")) + (candidate.score or Decimal("0"))
    outcome_scores_json = {key: str(value.quantize(Decimal("0.0001"))) for key, value in side_scores.items()}
    top_candidates = sorted(
        candidates,
        key=lambda item: ((item.score or Decimal("0")), (item.observed_market_position_usd or Decimal("0"))),
        reverse=True,
    )[:10]
    return {
        "status": status,
        "wallets_found": job.wallets_found,
        "wallets_analyzed": job.wallets_analyzed,
        "wallets_with_sufficient_history": job.wallets_with_sufficient_history,
        "yes_wallets": job.yes_wallets,
        "no_wallets": job.no_wallets,
        "outcome_scores": outcome_scores_json,
        "top_wallets": [
            {
                "wallet_address": candidate.wallet_address,
                "side": candidate.side,
                "outcome": candidate.outcome,
                "score": str((candidate.score or Decimal("0")).quantize(Decimal("0.0001"))),
                "confidence": candidate.confidence,
            }
            for candidate in top_candidates
        ],
    }


def _candidate_from_market_position(position: PolymarketDataMarketPosition) -> DiscoveredWalletCandidate | None:
    wallet = normalize_wallet_address(position.proxy_wallet)
    if wallet is None:
        return None
    observed_usd = _position_size_usd(position)
    if observed_usd is None or observed_usd <= 0:
        return None
    side = _normalize_side(position.outcome)
    outcome = _clean_optional_text(position.outcome)
    token_id = _clean_optional_text(position.asset)
    return DiscoveredWalletCandidate(
        wallet_address=wallet,
        side=side,
        outcome=outcome,
        token_id=token_id,
        observed_market_position_usd=observed_usd,
        raw_summary_json={
            "source": "market_positions",
            "avg_price": str(position.avg_price) if position.avg_price is not None else None,
            "current_value": str(position.current_value) if position.current_value is not None else None,
            "asset": token_id,
            "pseudonym": _clean_optional_text(position.pseudonym),
        },
    )


def _candidate_from_trade(trade: PolymarketDataTrade) -> DiscoveredWalletCandidate | None:
    wallet = normalize_wallet_address(trade.proxy_wallet)
    if wallet is None:
        return None
    if trade.size is None or trade.price is None:
        return None
    observed_usd = abs(trade.size * trade.price)
    if observed_usd <= 0:
        return None
    side = _normalize_side(trade.outcome)
    outcome = _clean_optional_text(trade.outcome)
    token_id = _clean_optional_text(trade.asset)
    return DiscoveredWalletCandidate(
        wallet_address=wallet,
        side=side,
        outcome=outcome,
        token_id=token_id,
        observed_market_position_usd=observed_usd,
        raw_summary_json={
            "source": "market_trades",
            "price": str(trade.price),
            "size": str(trade.size),
            "timestamp": trade.timestamp.isoformat() if trade.timestamp else None,
            "asset": token_id,
            "transaction_hash": _clean_optional_text(trade.transaction_hash),
        },
    )


def _merge_discovered_candidate(
    aggregated: dict[tuple[str, str, str | None], DiscoveredWalletCandidate],
    candidate: DiscoveredWalletCandidate,
) -> None:
    key = (candidate.wallet_address, candidate.side, candidate.token_id)
    existing = aggregated.get(key)
    if existing is None:
        aggregated[key] = candidate
        return
    existing.observed_market_position_usd += candidate.observed_market_position_usd
    existing.raw_summary_json["sources"] = _dedupe(
        [
            str(existing.raw_summary_json.get("source", "")),
            str(candidate.raw_summary_json.get("source", "")),
        ]
    )


def _position_size_usd(position: PolymarketDataMarketPosition) -> Decimal | None:
    for value in (position.current_value, position.total_bought):
        if value is not None:
            return abs(value)
    if position.size is not None and position.curr_price is not None:
        return abs(position.size * position.curr_price)
    return None


def _normalize_side(value: str | None) -> str:
    if not value:
        return "UNKNOWN"
    normalized = value.strip().lower()
    if normalized == "yes":
        return "YES"
    if normalized == "no":
        return "NO"
    if normalized in {"draw", "empate"}:
        return "DRAW"
    return value.strip()[:160] or "UNKNOWN"


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.replace("\x00", " ").split()).strip()
    return cleaned[:160] if cleaned else None


def _score_candidate(
    *,
    observed_market_position_usd: Decimal,
    win_rate: Decimal | None,
    pnl_30d: Decimal | None,
    resolved_count: int,
    volume_30d: Decimal,
    confidence: str,
) -> Decimal:
    position_factor = min(Decimal("1"), observed_market_position_usd / Decimal("2500"))
    win_rate_factor = win_rate if win_rate is not None else Decimal("0")
    pnl_factor = Decimal("0")
    if pnl_30d is not None:
        pnl_factor = min(Decimal("1"), max(Decimal("-1"), pnl_30d / Decimal("500"))) * Decimal("0.25")
    sample_factor = min(Decimal("1"), Decimal(resolved_count) / Decimal("20"))
    volume_factor = min(Decimal("1"), volume_30d / Decimal("5000")) if volume_30d > 0 else Decimal("0")
    confidence_factor = {"low": Decimal("0.70"), "medium": Decimal("0.85"), "high": Decimal("1.00")}[confidence]
    raw_score = (
        position_factor * Decimal("0.30")
        + win_rate_factor * Decimal("0.35")
        + pnl_factor
        + sample_factor * Decimal("0.20")
        + volume_factor * Decimal("0.15")
    ) * confidence_factor
    bounded = max(Decimal("0"), min(Decimal("1"), raw_score))
    return bounded.quantize(Decimal("0.0001"))


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def _sanitize_error_message(exc: Exception) -> str:
    return " ".join(str(exc).replace("\x00", " ").split())[:400] or exc.__class__.__name__
