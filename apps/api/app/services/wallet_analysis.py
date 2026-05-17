from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob, WalletProfile
from app.schemas.wallet_analysis import (
    SortOrder,
    WalletAnalysisCandidateList,
    WalletAnalysisCandidateRead,
    WalletAnalysisCandidateSortBy,
    WalletAnalysisJobProgressRead,
    WalletAnalysisJobRead,
    WalletAnalysisSignalSummaryRead,
    WalletProfileRead,
    WalletProfileUpsert,
)
from app.services.polysignal_market_signals import get_latest_market_signal_for_job
from app.services.polymarket_link_resolver import (
    PolymarketLinkResolverError,
    ResolvedPolymarketMarket,
    resolve_polymarket_market_from_link,
)

WALLET_PATTERN = re.compile(r"^0x[a-f0-9]{40}$")


class WalletAnalysisValidationError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class WalletAnalysisJobNotFoundError(Exception):
    pass


class WalletAnalysisCandidateNotFoundError(Exception):
    pass


def create_wallet_analysis_job_from_link(
    db: Session,
    *,
    polymarket_url: str,
    gamma_client: PolymarketGammaClient,
) -> WalletAnalysisJob:
    try:
        resolved = resolve_polymarket_market_from_link(
            gamma_client=gamma_client,
            polymarket_url=polymarket_url,
        )
    except PolymarketLinkResolverError as exc:
        raise WalletAnalysisValidationError(exc.args[0]) from exc

    job = WalletAnalysisJob(
        source_url=polymarket_url.strip(),
        normalized_url=resolved.normalized_url,
        market_slug=resolved.market_slug,
        event_slug=resolved.event_slug,
        condition_id=resolved.condition_id,
        market_title=resolved.question or None,
        status="pending",
        outcomes_json=[
            {
                "label": outcome.label,
                "side": outcome.side,
                "token_id": outcome.token_id,
            }
            for outcome in resolved.outcomes
        ],
        token_ids_json=resolved.token_ids,
        warnings_json=_clean_text_list(resolved.warnings),
    )
    db.add(job)
    db.flush()
    db.refresh(job)
    return job


def get_wallet_analysis_job(db: Session, job_id: str) -> WalletAnalysisJob:
    job = db.get(WalletAnalysisJob, job_id)
    if job is None:
        raise WalletAnalysisJobNotFoundError(job_id)
    return job


def list_wallet_analysis_candidates(
    db: Session,
    *,
    job_id: str,
    side: str | None = None,
    outcome: str | None = None,
    confidence: str | None = None,
    sort_by: WalletAnalysisCandidateSortBy = "score",
    sort_order: SortOrder = "desc",
    limit: int = 50,
    offset: int = 0,
) -> WalletAnalysisCandidateList:
    get_wallet_analysis_job(db, job_id)
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)

    stmt = select(WalletAnalysisCandidate).where(WalletAnalysisCandidate.job_id == job_id)
    count_stmt = select(func.count()).select_from(WalletAnalysisCandidate).where(WalletAnalysisCandidate.job_id == job_id)

    if side:
        stmt = stmt.where(WalletAnalysisCandidate.side == side)
        count_stmt = count_stmt.where(WalletAnalysisCandidate.side == side)
    if outcome:
        stmt = stmt.where(WalletAnalysisCandidate.outcome == outcome)
        count_stmt = count_stmt.where(WalletAnalysisCandidate.outcome == outcome)
    if confidence:
        stmt = stmt.where(WalletAnalysisCandidate.confidence == confidence)
        count_stmt = count_stmt.where(WalletAnalysisCandidate.confidence == confidence)

    sort_column = {
        "score": WalletAnalysisCandidate.score,
        "volume_30d": WalletAnalysisCandidate.volume_30d,
        "win_rate_30d": WalletAnalysisCandidate.win_rate_30d_value,
        "pnl_30d": WalletAnalysisCandidate.pnl_30d_value,
        "created_at": WalletAnalysisCandidate.created_at,
    }[sort_by]
    primary_order = sort_column.asc().nullslast() if sort_order == "asc" else sort_column.desc().nullslast()
    stmt = stmt.order_by(
        primary_order,
        WalletAnalysisCandidate.score.desc().nullslast(),
        WalletAnalysisCandidate.observed_market_position_usd.desc().nullslast(),
        WalletAnalysisCandidate.created_at.asc(),
    )
    items = list(db.scalars(stmt.offset(safe_offset).limit(safe_limit)).all())
    total = int(db.scalar(count_stmt) or 0)
    return WalletAnalysisCandidateList(
        items=[serialize_wallet_analysis_candidate(item) for item in items],
        total=total,
    )


def create_or_update_wallet_profile(
    db: Session,
    payload: WalletProfileUpsert,
) -> WalletProfile:
    wallet_address = normalize_wallet_address(payload.wallet_address)
    if wallet_address is None:
        raise WalletAnalysisValidationError("invalid_wallet_address")

    existing = db.scalar(
        select(WalletProfile)
        .where(WalletProfile.wallet_address == wallet_address)
        .limit(1)
    )
    now = datetime.now(tz=UTC)
    profile = existing or WalletProfile(wallet_address=wallet_address)
    profile.wallet_address = wallet_address
    profile.alias = _clean_optional(payload.alias, 160)
    profile.status = payload.status
    profile.score = payload.score
    profile.confidence = payload.confidence
    profile.roi_30d_status = payload.roi_30d_status
    profile.roi_30d_value = payload.roi_30d_value
    profile.win_rate_30d_status = payload.win_rate_30d_status
    profile.win_rate_30d_value = payload.win_rate_30d_value
    profile.pnl_30d_status = payload.pnl_30d_status
    profile.pnl_30d_value = payload.pnl_30d_value
    profile.trades_30d = payload.trades_30d
    profile.volume_30d = payload.volume_30d
    profile.drawdown_30d_status = payload.drawdown_30d_status
    profile.drawdown_30d_value = payload.drawdown_30d_value
    profile.markets_traded_30d = payload.markets_traded_30d
    profile.last_activity_at = payload.last_activity_at
    profile.discovered_from_market = _clean_optional(payload.discovered_from_market, 320)
    profile.discovered_from_url = _clean_optional(payload.discovered_from_url, 512)
    profile.discovered_at = payload.discovered_at or profile.discovered_at or now
    profile.reasons_json = _clean_text_list(payload.reasons_json)
    profile.risks_json = _clean_text_list(payload.risks_json)
    next_notes = _clean_optional(payload.notes, 4000)
    if next_notes is not None:
        profile.notes = next_notes
    elif existing is None:
        profile.notes = None
    db.add(profile)
    db.flush()
    db.refresh(profile)
    return profile


def save_candidate_as_profile(
    db: Session,
    *,
    candidate_id: str,
) -> WalletProfile:
    candidate = db.get(WalletAnalysisCandidate, candidate_id)
    if candidate is None:
        raise WalletAnalysisCandidateNotFoundError(candidate_id)
    job = get_wallet_analysis_job(db, candidate.job_id)
    payload = WalletProfileUpsert(
        wallet_address=candidate.wallet_address,
        status="candidate",
        score=candidate.score,
        confidence=candidate.confidence,
        roi_30d_status=candidate.roi_30d_status,
        roi_30d_value=candidate.roi_30d_value,
        win_rate_30d_status=candidate.win_rate_30d_status,
        win_rate_30d_value=candidate.win_rate_30d_value,
        pnl_30d_status=candidate.pnl_30d_status,
        pnl_30d_value=candidate.pnl_30d_value,
        trades_30d=candidate.trades_30d,
        volume_30d=candidate.volume_30d,
        drawdown_30d_status="unavailable",
        drawdown_30d_value=None,
        markets_traded_30d=candidate.markets_traded_30d,
        last_activity_at=candidate.last_activity_at,
        discovered_from_market=_clean_optional(job.market_title, 320),
        discovered_from_url=_clean_optional(job.normalized_url, 512),
        discovered_at=job.created_at,
        reasons_json=candidate.reasons_json or [],
        risks_json=candidate.risks_json or [],
    )
    return create_or_update_wallet_profile(db, payload)


def serialize_wallet_analysis_job(
    job: WalletAnalysisJob,
    *,
    candidates_count: int,
    signal_summary: WalletAnalysisSignalSummaryRead | None = None,
) -> WalletAnalysisJobRead:
    outcomes = job.outcomes_json if isinstance(job.outcomes_json, list) else []
    token_ids = job.token_ids_json if isinstance(job.token_ids_json, list) else []
    warnings = job.warnings_json if isinstance(job.warnings_json, list) else []
    return WalletAnalysisJobRead(
        id=job.id,
        source_url=job.source_url,
        normalized_url=job.normalized_url,
        market_slug=job.market_slug,
        event_slug=job.event_slug,
        condition_id=job.condition_id,
        market_title=job.market_title,
        status=job.status,
        outcomes=outcomes,
        token_ids=[str(token_id) for token_id in token_ids if isinstance(token_id, str)],
        progress=WalletAnalysisJobProgressRead(
            wallets_found=job.wallets_found,
            wallets_analyzed=job.wallets_analyzed,
            wallets_with_sufficient_history=job.wallets_with_sufficient_history,
            yes_wallets=job.yes_wallets,
            no_wallets=job.no_wallets,
            current_batch=job.current_batch,
        ),
        result_json=job.result_json,
        warnings=[str(item) for item in warnings if isinstance(item, str)],
        error_message=_clean_optional(job.error_message, 2000),
        started_at=job.started_at,
        finished_at=job.finished_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
        candidates_count=candidates_count,
        signal_summary=signal_summary,
    )


def serialize_wallet_analysis_candidate(candidate: WalletAnalysisCandidate) -> WalletAnalysisCandidateRead:
    return WalletAnalysisCandidateRead(
        id=candidate.id,
        job_id=candidate.job_id,
        wallet_address=candidate.wallet_address,
        outcome=candidate.outcome,
        side=candidate.side,
        token_id=candidate.token_id,
        observed_market_position_usd=candidate.observed_market_position_usd,
        score=candidate.score,
        confidence=candidate.confidence,
        roi_30d_status=candidate.roi_30d_status,
        roi_30d_value=candidate.roi_30d_value,
        win_rate_30d_status=candidate.win_rate_30d_status,
        win_rate_30d_value=candidate.win_rate_30d_value,
        pnl_30d_status=candidate.pnl_30d_status,
        pnl_30d_value=candidate.pnl_30d_value,
        trades_30d=candidate.trades_30d,
        volume_30d=candidate.volume_30d,
        markets_traded_30d=candidate.markets_traded_30d,
        last_activity_at=candidate.last_activity_at,
        reasons_json=_clean_text_list(candidate.reasons_json or []),
        risks_json=_clean_text_list(candidate.risks_json or []),
        raw_summary_json=candidate.raw_summary_json,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


def serialize_wallet_profile(profile: WalletProfile) -> WalletProfileRead:
    return WalletProfileRead(
        id=profile.id,
        wallet_address=profile.wallet_address,
        alias=profile.alias,
        status=profile.status,
        score=profile.score,
        confidence=profile.confidence,
        roi_30d_status=profile.roi_30d_status,
        roi_30d_value=profile.roi_30d_value,
        win_rate_30d_status=profile.win_rate_30d_status,
        win_rate_30d_value=profile.win_rate_30d_value,
        pnl_30d_status=profile.pnl_30d_status,
        pnl_30d_value=profile.pnl_30d_value,
        trades_30d=profile.trades_30d,
        volume_30d=profile.volume_30d,
        drawdown_30d_status=profile.drawdown_30d_status,
        drawdown_30d_value=profile.drawdown_30d_value,
        markets_traded_30d=profile.markets_traded_30d,
        last_activity_at=profile.last_activity_at,
        discovered_from_market=profile.discovered_from_market,
        discovered_from_url=profile.discovered_from_url,
        discovered_at=profile.discovered_at,
        reasons_json=_clean_text_list(profile.reasons_json or []),
        risks_json=_clean_text_list(profile.risks_json or []),
        notes=profile.notes,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def count_wallet_analysis_candidates(db: Session, job_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(WalletAnalysisCandidate)
            .where(WalletAnalysisCandidate.job_id == job_id)
        )
        or 0
    )


def build_wallet_analysis_signal_summary(db: Session, job_id: str) -> WalletAnalysisSignalSummaryRead | None:
    signal = get_latest_market_signal_for_job(db, job_id)
    if signal is None:
        return None
    return WalletAnalysisSignalSummaryRead(
        id=signal.id,
        predicted_side=signal.predicted_side,
        predicted_outcome=signal.predicted_outcome,
        polysignal_score=signal.polysignal_score,
        confidence=signal.confidence,
        yes_score=signal.yes_score,
        no_score=signal.no_score,
        outcome_scores_json=signal.outcome_scores_json,
        signal_status=signal.signal_status,
        warnings_json=_clean_text_list(signal.warnings_json or []),
    )


def normalize_wallet_address(value: str | None) -> str | None:
    if not value:
        return None
    wallet = value.strip().lower()
    return wallet if WALLET_PATTERN.match(wallet) else None


def _clean_optional(value: str | None, max_length: int) -> str | None:
    if not value:
        return None
    cleaned = " ".join(str(value).replace("\x00", " ").split()).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def _clean_text_list(values: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        item = _clean_optional(value, 240)
        if item and item not in cleaned:
            cleaned.append(item)
    return cleaned[:50]
