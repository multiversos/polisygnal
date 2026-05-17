from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient, get_polymarket_client
from app.db.session import get_db
from app.schemas.wallet_analysis import (
    WalletAnalysisCandidateList,
    WalletAnalysisCreateRequest,
    WalletAnalysisJobCreateResponse,
    WalletAnalysisJobRead,
    WalletProfileRead,
    WalletProfileUpsert,
)
from app.services.wallet_analysis import (
    WalletAnalysisCandidateNotFoundError,
    WalletAnalysisJobNotFoundError,
    WalletAnalysisValidationError,
    count_wallet_analysis_candidates,
    create_or_update_wallet_profile,
    create_wallet_analysis_job_from_link,
    get_wallet_analysis_job,
    list_wallet_analysis_candidates,
    save_candidate_as_profile,
    serialize_wallet_analysis_job,
    serialize_wallet_profile,
)

router = APIRouter(tags=["wallet-analysis"])
profiles_router = APIRouter(prefix="/wallet-profiles", tags=["wallet-profiles"])


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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.reason) from exc
    db.commit()
    db.refresh(job)
    market = serialize_wallet_analysis_job(job, candidates_count=0)
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
    return serialize_wallet_analysis_job(job, candidates_count=candidates_count)


@router.get("/wallet-analysis/jobs/{job_id}/candidates", response_model=WalletAnalysisCandidateList)
def get_wallet_analysis_job_candidates(
    job_id: str,
    side: str | None = Query(default=None, max_length=160),
    outcome: str | None = Query(default=None, max_length=160),
    confidence: str | None = Query(default=None, pattern="^(low|medium|high)$"),
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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.reason) from exc
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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.reason) from exc
    db.commit()
    db.refresh(profile)
    return serialize_wallet_profile(profile)
