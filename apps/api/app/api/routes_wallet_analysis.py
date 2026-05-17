from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient, get_polymarket_client
from app.clients.polymarket_data import PolymarketDataClient, get_polymarket_data_client
from app.db.session import get_db
from app.schemas.wallet_analysis import (
    PolySignalMarketSignalList,
    PolySignalMarketSignalRead,
    WalletAnalysisCandidateList,
    WalletAnalysisCreateRequest,
    WalletAnalysisJobCreateResponse,
    WalletAnalysisJobRead,
    WalletAnalysisResolvedLinkRead,
    WalletAnalysisJobRunRequest,
    WalletAnalysisJobRunResponse,
    WalletProfileDemoFollowResponse,
    WalletProfileList,
    WalletProfileRead,
    WalletProfileUpdate,
    WalletProfileUpsert,
)
from app.services.polysignal_market_signals import (
    PolySignalMarketSignalNotFoundError,
    get_latest_market_signal_for_job,
    get_market_signal,
    list_market_signals,
    serialize_market_signal,
)
from app.services.wallet_analysis import (
    WalletAnalysisCandidateNotFoundError,
    WalletAnalysisJobNotFoundError,
    WalletAnalysisValidationError,
    WalletProfileNotFoundError,
    build_wallet_analysis_signal_summary,
    count_wallet_analysis_candidates,
    create_or_update_wallet_profile,
    create_wallet_analysis_job_from_link,
    follow_wallet_profile_in_demo,
    get_wallet_analysis_job,
    get_wallet_profile,
    list_wallet_analysis_candidates,
    list_wallet_profiles,
    resolve_wallet_analysis_link,
    save_candidate_as_profile,
    serialize_wallet_analysis_job,
    serialize_wallet_profile,
    update_wallet_profile,
)
from app.services.wallet_analysis_runner import (
    WalletAnalysisRunnerConfig,
    WalletAnalysisRunnerError,
    run_wallet_analysis_job_once,
)

router = APIRouter(tags=["wallet-analysis"])
profiles_router = APIRouter(prefix="/wallet-profiles", tags=["wallet-profiles"])


@router.post("/wallet-analysis/resolve-link", response_model=WalletAnalysisResolvedLinkRead)
def post_wallet_analysis_resolve_link(
    payload: WalletAnalysisCreateRequest,
    gamma_client: PolymarketGammaClient = Depends(get_polymarket_client),
) -> WalletAnalysisResolvedLinkRead:
    try:
        return resolve_wallet_analysis_link(
            polymarket_url=payload.polymarket_url,
            gamma_client=gamma_client,
        )
    except WalletAnalysisValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.reason) from exc


@router.post("/wallet-analysis/jobs", response_model=WalletAnalysisJobCreateResponse, status_code=status.HTTP_201_CREATED)
def post_wallet_analysis_job(
    payload: WalletAnalysisCreateRequest,
    db: Session = Depends(get_db),
    gamma_client: PolymarketGammaClient = Depends(get_polymarket_client),
) -> WalletAnalysisJobCreateResponse:
    try:
        job = create_wallet_analysis_job_from_link(
            db,
            polymarket_url=payload.polymarket_url,
            gamma_client=gamma_client,
        )
    except WalletAnalysisValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.reason) from exc
    db.commit()
    db.refresh(job)
    market = serialize_wallet_analysis_job(
        job,
        candidates_count=0,
        signal_summary=build_wallet_analysis_signal_summary(db, job.id),
    )
    return WalletAnalysisJobCreateResponse(
        job_id=job.id,
        status=job.status,
        message="Wallet analysis job created. Deep market analysis remains pending in this sprint.",
        market=market,
    )


@router.get("/wallet-analysis/jobs/{job_id}", response_model=WalletAnalysisJobRead)
def get_wallet_analysis_job_detail(
    job_id: str,
    db: Session = Depends(get_db),
) -> WalletAnalysisJobRead:
    try:
        job = get_wallet_analysis_job(db, job_id)
    except WalletAnalysisJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_analysis_job_not_found") from exc
    candidates_count = count_wallet_analysis_candidates(db, job.id)
    return serialize_wallet_analysis_job(
        job,
        candidates_count=candidates_count,
        signal_summary=build_wallet_analysis_signal_summary(db, job.id),
    )


@router.post("/wallet-analysis/jobs/{job_id}/run-once", response_model=WalletAnalysisJobRunResponse)
def post_wallet_analysis_job_run_once(
    job_id: str,
    payload: WalletAnalysisJobRunRequest,
    db: Session = Depends(get_db),
    data_client: PolymarketDataClient = Depends(get_polymarket_data_client),
) -> WalletAnalysisJobRunResponse:
    try:
        existing_job = get_wallet_analysis_job(db, job_id)
    except WalletAnalysisJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_analysis_job_not_found") from exc

    if existing_job.status in {"completed", "partial", "cancelled"}:
        candidates_count = count_wallet_analysis_candidates(db, existing_job.id)
        signal = get_latest_market_signal_for_job(db, existing_job.id)
        market = serialize_wallet_analysis_job(
            existing_job,
            candidates_count=candidates_count,
            signal_summary=build_wallet_analysis_signal_summary(db, existing_job.id),
        )
        return WalletAnalysisJobRunResponse(
            job_id=existing_job.id,
            status=existing_job.status,
        message="Wallet analysis job already finished for this controlled pass.",
        wallets_found=existing_job.wallets_found,
        wallets_analyzed=existing_job.wallets_analyzed,
        wallets_with_sufficient_history=existing_job.wallets_with_sufficient_history,
        candidates_count=candidates_count,
        warnings=market.warnings,
        status_detail=market.status_detail,
        signal_id=signal.id if signal is not None else None,
        signal_status=signal.signal_status if signal is not None else None,
        market=market,
        )

    try:
        job = run_wallet_analysis_job_once(
            db,
            job_id=job_id,
            data_client=data_client,
            config=WalletAnalysisRunnerConfig(
                batch_size=payload.batch_size,
                max_wallets_analyze=payload.max_wallets,
                max_wallets_discovery=payload.max_wallets_discovery,
                user_history_limit=payload.history_limit,
            ),
        )
        db.commit()
        db.refresh(job)
    except WalletAnalysisRunnerError as exc:
        db.commit()
        job = get_wallet_analysis_job(db, job_id)
        candidates_count = count_wallet_analysis_candidates(db, job.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "wallet_analysis_runner_failed",
                "job_id": job_id,
                "message": " ".join(str(exc).split())[:400],
                "status": job.status,
            },
        ) from exc

    candidates_count = count_wallet_analysis_candidates(db, job.id)
    signal = get_latest_market_signal_for_job(db, job.id)
    market = serialize_wallet_analysis_job(
        job,
        candidates_count=candidates_count,
        signal_summary=build_wallet_analysis_signal_summary(db, job.id),
    )
    return WalletAnalysisJobRunResponse(
        job_id=job.id,
        status=job.status,
        message="Controlled wallet analysis pass executed.",
        wallets_found=job.wallets_found,
        wallets_analyzed=job.wallets_analyzed,
        wallets_with_sufficient_history=job.wallets_with_sufficient_history,
        candidates_count=candidates_count,
        warnings=market.warnings,
        status_detail=market.status_detail,
        signal_id=signal.id if signal is not None else None,
        signal_status=signal.signal_status if signal is not None else None,
        market=market,
    )


@router.get("/wallet-analysis/jobs/{job_id}/candidates", response_model=WalletAnalysisCandidateList)
def get_wallet_analysis_job_candidates(
    job_id: str,
    side: str | None = Query(default=None, max_length=160),
    outcome: str | None = Query(default=None, max_length=160),
    confidence: str | None = Query(default=None, pattern="^(low|medium|high)$"),
    sort_by: str = Query(default="score", pattern="^(score|volume_30d|win_rate_30d|pnl_30d|created_at)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> WalletAnalysisCandidateList:
    try:
        return list_wallet_analysis_candidates(
            db,
            job_id=job_id,
            side=side,
            outcome=outcome,
            confidence=confidence,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )
    except WalletAnalysisJobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_analysis_job_not_found") from exc


@router.post("/wallet-analysis/candidates/{candidate_id}/save-profile", response_model=WalletProfileRead)
def post_wallet_analysis_candidate_save_profile(
    candidate_id: str,
    db: Session = Depends(get_db),
) -> WalletProfileRead:
    try:
        profile = save_candidate_as_profile(db, candidate_id=candidate_id)
    except WalletAnalysisCandidateNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_analysis_candidate_not_found") from exc
    except WalletAnalysisValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.reason) from exc
    db.commit()
    db.refresh(profile)
    return serialize_wallet_profile(profile)


@profiles_router.post("", response_model=WalletProfileRead)
def post_wallet_profile(
    payload: WalletProfileUpsert,
    db: Session = Depends(get_db),
) -> WalletProfileRead:
    try:
        profile = create_or_update_wallet_profile(db, payload)
    except WalletAnalysisValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.reason) from exc
    db.commit()
    db.refresh(profile)
    return serialize_wallet_profile(profile)


@profiles_router.get("", response_model=WalletProfileList)
def get_wallet_profiles(
    status: str | None = Query(default=None, pattern="^(candidate|watching|demo_follow|paused|rejected)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> WalletProfileList:
    return list_wallet_profiles(db, status=status, limit=limit, offset=offset)


@profiles_router.get("/{profile_id}", response_model=WalletProfileRead)
def get_wallet_profile_detail(
    profile_id: str,
    db: Session = Depends(get_db),
) -> WalletProfileRead:
    try:
        profile = get_wallet_profile(db, profile_id)
    except WalletProfileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_profile_not_found") from exc
    return serialize_wallet_profile(profile)


@profiles_router.patch("/{profile_id}", response_model=WalletProfileRead)
def patch_wallet_profile(
    profile_id: str,
    payload: WalletProfileUpdate,
    db: Session = Depends(get_db),
) -> WalletProfileRead:
    try:
        profile = update_wallet_profile(db, profile_id=profile_id, payload=payload)
    except WalletProfileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_profile_not_found") from exc
    db.commit()
    db.refresh(profile)
    return serialize_wallet_profile(profile)


@profiles_router.post("/{profile_id}/demo-follow", response_model=WalletProfileDemoFollowResponse)
def post_wallet_profile_demo_follow(
    profile_id: str,
    db: Session = Depends(get_db),
) -> WalletProfileDemoFollowResponse:
    try:
        response = follow_wallet_profile_in_demo(db, profile_id=profile_id)
    except WalletProfileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_profile_not_found") from exc
    db.commit()
    return response


@router.get("/polysignal-market-signals", response_model=PolySignalMarketSignalList)
def get_polysignal_market_signals(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    signal_status: str | None = Query(default=None, pattern="^(pending_resolution|resolved_hit|resolved_miss|cancelled|unknown|no_clear_signal)$"),
    job_id: str | None = Query(default=None),
    market_slug: str | None = Query(default=None, max_length=256),
    db: Session = Depends(get_db),
) -> PolySignalMarketSignalList:
    return list_market_signals(
        db,
        limit=limit,
        offset=offset,
        signal_status=signal_status,
        job_id=job_id,
        market_slug=market_slug,
    )


@router.get("/polysignal-market-signals/{signal_id}", response_model=PolySignalMarketSignalRead)
def get_polysignal_market_signal_detail(
    signal_id: str,
    db: Session = Depends(get_db),
) -> PolySignalMarketSignalRead:
    try:
        signal = get_market_signal(db, signal_id)
    except PolySignalMarketSignalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="polysignal_market_signal_not_found") from exc
    return serialize_market_signal(signal)
