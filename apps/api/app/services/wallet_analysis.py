from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal
import re
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.copy_trading import CopyWallet
from app.clients.polymarket import PolymarketGammaClient
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob, WalletProfile
from app.schemas.copy_trading import CopyWalletRead
from app.schemas.wallet_analysis import (
    SortOrder,
    WalletAnalysisCandidateList,
    WalletAnalysisCandidateRead,
    WalletAnalysisCandidateSortBy,
    WalletAnalysisJobProgressRead,
    WalletAnalysisJobRead,
    WalletAnalysisResolvedLinkRead,
    WalletAnalysisSignalSummaryRead,
    WalletProfileDemoFollowResponse,
    WalletProfileList,
    WalletProfileRead,
    WalletProfileUpdate,
    WalletProfileUpsert,
)
from app.services.copy_trading_service import add_copy_event, build_copy_wallet_read
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


class WalletProfileNotFoundError(Exception):
    pass


def resolve_wallet_analysis_link(
    *,
    polymarket_url: str,
    gamma_client: PolymarketGammaClient,
) -> WalletAnalysisResolvedLinkRead:
    try:
        resolved = resolve_polymarket_market_from_link(
            gamma_client=gamma_client,
            polymarket_url=polymarket_url,
        )
    except PolymarketLinkResolverError as exc:
        reason = exc.args[0]
        if reason == "market_not_found":
            return WalletAnalysisResolvedLinkRead(
                source_url=polymarket_url.strip(),
                normalized_url=polymarket_url.strip(),
                status="not_found",
                raw_source="gamma",
                warnings=["No pudimos obtener este mercado desde Polymarket."],
            )
        if reason == "unsupported_polymarket_url":
            return WalletAnalysisResolvedLinkRead(
                source_url=polymarket_url.strip(),
                normalized_url=polymarket_url.strip(),
                status="unsupported",
                raw_source="gamma",
                warnings=["Este tipo de enlace todavia no esta soportado."],
            )
        if reason == "invalid_polymarket_url":
            raise WalletAnalysisValidationError(reason) from exc
        return WalletAnalysisResolvedLinkRead(
            source_url=polymarket_url.strip(),
            normalized_url=polymarket_url.strip(),
            status="error",
            raw_source="gamma",
            warnings=["No pudimos consultar Polymarket ahora."],
        )

    return serialize_resolved_wallet_analysis_link(
        source_url=polymarket_url,
        resolved=resolved,
    )


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


def list_wallet_profiles(
    db: Session,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> WalletProfileList:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = select(WalletProfile)
    count_stmt = select(func.count()).select_from(WalletProfile)
    if status:
        stmt = stmt.where(WalletProfile.status == status)
        count_stmt = count_stmt.where(WalletProfile.status == status)
    stmt = stmt.order_by(
        WalletProfile.updated_at.desc(),
        WalletProfile.score.desc().nullslast(),
        WalletProfile.created_at.desc(),
    )
    items = list(db.scalars(stmt.offset(safe_offset).limit(safe_limit)).all())
    total = int(db.scalar(count_stmt) or 0)
    return WalletProfileList(
        items=[serialize_wallet_profile(item) for item in items],
        total=total,
    )


def get_wallet_profile(db: Session, profile_id: str) -> WalletProfile:
    profile = db.get(WalletProfile, profile_id)
    if profile is None:
        raise WalletProfileNotFoundError(profile_id)
    return profile


def update_wallet_profile(
    db: Session,
    *,
    profile_id: str,
    payload: WalletProfileUpdate,
) -> WalletProfile:
    profile = get_wallet_profile(db, profile_id)
    if "alias" in payload.model_fields_set:
        profile.alias = _clean_optional(payload.alias, 160)
    if "status" in payload.model_fields_set and payload.status is not None:
        profile.status = payload.status
    if "notes" in payload.model_fields_set:
        profile.notes = _clean_optional(payload.notes, 4000)
    db.add(profile)
    db.flush()
    db.refresh(profile)
    return profile


def follow_wallet_profile_in_demo(
    db: Session,
    *,
    profile_id: str,
) -> WalletProfileDemoFollowResponse:
    profile = get_wallet_profile(db, profile_id)
    existing_wallet = db.scalar(
        select(CopyWallet)
        .where(CopyWallet.proxy_wallet == profile.wallet_address)
        .limit(1)
    )
    already_following = existing_wallet is not None
    wallet = existing_wallet or CopyWallet(
        id=str(uuid4()),
        label=_default_copy_wallet_label(profile),
        profile_url=_build_polymarket_profile_url(profile.wallet_address),
        proxy_wallet=profile.wallet_address,
        enabled=True,
        mode="demo",
        real_trading_enabled=False,
        copy_buys=True,
        copy_sells=True,
        copy_amount_mode="preset",
        copy_amount_usd=Decimal("5"),
        max_trade_usd=Decimal("20"),
        max_daily_usd=Decimal("100"),
        max_slippage_bps=300,
        max_delay_seconds=10,
        sports_only=False,
    )
    if existing_wallet is not None:
        wallet.enabled = True
        wallet.mode = "demo"
        wallet.real_trading_enabled = False
        wallet.copy_buys = True if wallet.copy_buys is None else wallet.copy_buys
        wallet.copy_sells = True if wallet.copy_sells is None else wallet.copy_sells
        wallet.copy_amount_mode = wallet.copy_amount_mode or "preset"
        wallet.copy_amount_usd = wallet.copy_amount_usd or Decimal("5")
        wallet.max_trade_usd = wallet.max_trade_usd or Decimal("20")
        wallet.max_daily_usd = wallet.max_daily_usd or Decimal("100")
        wallet.max_slippage_bps = wallet.max_slippage_bps if wallet.max_slippage_bps is not None else 300
        wallet.max_delay_seconds = wallet.max_delay_seconds if wallet.max_delay_seconds is not None else 10
        wallet.sports_only = False
        wallet.label = wallet.label or _default_copy_wallet_label(profile)
        wallet.profile_url = wallet.profile_url or _build_polymarket_profile_url(profile.wallet_address)

    profile.status = "demo_follow"
    db.add(wallet)
    db.add(profile)
    db.flush()
    db.refresh(wallet)
    db.refresh(profile)
    add_copy_event(
        db,
        wallet_id=wallet.id,
        level="info",
        event_type="wallet_analysis_demo_follow_enabled",
        message="Wallet agregada a Copy Trading demo desde wallet profile. Solo se copiaran trades nuevos desde ahora.",
        metadata={
            "profile_id": profile.id,
            "wallet_address": profile.wallet_address,
            "source": "wallet_analysis_profile",
        },
    )
    return WalletProfileDemoFollowResponse(
        profile=serialize_wallet_profile(profile),
        copy_wallet=CopyWalletRead.model_validate(build_copy_wallet_read(wallet)).model_dump(mode="json"),
        already_following=already_following,
        baseline_created_at=wallet.created_at,
        message=(
            "Wallet ya estaba en Copy Trading demo. Se mantiene el baseline actual de seguimiento."
            if already_following
            else "Wallet agregada a Copy Trading demo. Solo se copiaran trades nuevos desde ahora."
        ),
    )


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
            wallets_found=job.wallets_found or 0,
            wallets_analyzed=job.wallets_analyzed or 0,
            wallets_with_sufficient_history=job.wallets_with_sufficient_history or 0,
            yes_wallets=job.yes_wallets or 0,
            no_wallets=job.no_wallets or 0,
            current_batch=job.current_batch or 0,
        ),
        result_json=_public_job_result_json(job.result_json),
        warnings=[str(item) for item in warnings if isinstance(item, str)],
        status_detail=_job_status_detail(job),
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


def serialize_resolved_wallet_analysis_link(
    *,
    source_url: str,
    resolved: ResolvedPolymarketMarket,
) -> WalletAnalysisResolvedLinkRead:
    warnings = _clean_text_list(resolved.warnings)
    status = "ok"
    if not resolved.condition_id or not resolved.question or not resolved.outcomes or not resolved.token_ids:
        warnings = _clean_text_list([*warnings, "resolved_market_metadata_incomplete"])
        status = "partial"
    return WalletAnalysisResolvedLinkRead(
        source_url=source_url.strip(),
        normalized_url=resolved.normalized_url,
        status=status,
        raw_source=resolved.raw_source,
        market_title=resolved.question or None,
        condition_id=resolved.condition_id,
        market_slug=resolved.market_slug,
        event_slug=resolved.event_slug,
        sport_or_league=resolved.sport_or_league,
        outcomes=[
            {
                "label": outcome.label,
                "side": outcome.side,
                "token_id": outcome.token_id,
            }
            for outcome in resolved.outcomes
        ],
        token_ids=resolved.token_ids,
        warnings=warnings,
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


def _job_status_detail(job: WalletAnalysisJob) -> str | None:
    public_result = _public_job_result_json(job.result_json)
    if isinstance(public_result, dict):
        status_detail = _clean_optional(public_result.get("status_detail"), 400)
        if status_detail:
            return status_detail
    warnings = [str(item) for item in (job.warnings_json or []) if isinstance(item, str)]
    if job.status == "partial":
        if "wallet_discovery_truncated" in warnings:
            return "El analisis quedo parcial porque el discovery alcanzo el limite configurado de wallets."
        if "trade_discovery_truncated" in warnings:
            return "El analisis quedo parcial porque la discovery de trades del mercado fue paginada hasta el limite seguro."
        if any(warning.startswith("wallet_fetch_failed:") for warning in warnings):
            return "El analisis quedo parcial porque algunas wallets no devolvieron historial completo en esta pasada."
        return "El analisis quedo parcial por limites de lote, tiempo o datos incompletos de la API."
    if job.status == "failed" and job.error_message:
        return "El job fallo y guardo un error sanitizado."
    if job.status == "completed" and (job.wallets_found or 0) == 0:
        return "No se detectaron wallets publicas suficientes para este mercado en esta pasada."
    return None


def _public_job_result_json(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    public_value = {
        key: item
        for key, item in value.items()
        if key not in {"runner_state", "lock"}
    }
    return public_value or None


def _default_copy_wallet_label(profile: WalletProfile) -> str:
    if profile.alias:
        return profile.alias[:160]
    return f"Wallet candidata {profile.wallet_address[:6]}...{profile.wallet_address[-4:]}"


def _build_polymarket_profile_url(wallet_address: str) -> str:
    return f"https://polymarket.com/profile/{wallet_address}"
