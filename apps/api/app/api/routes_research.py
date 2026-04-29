from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.db.session import get_db
from app.models.market import Market
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.repositories.markets import get_market_by_id
from app.repositories.prediction_reports import get_latest_prediction_report_for_market
from app.repositories.research_runs import (
    get_research_run_by_id,
    get_latest_research_run_for_market,
    list_research_runs_for_market,
)
from app.schemas.prediction import PredictionItemResponse
from app.schemas.research import (
    PredictionReportRead,
    ResearchCandidatesResponse,
    ResearchFindingRead,
    ResearchRunRead,
    ResearchRunRequest,
    ResearchRunResponse,
    UpcomingDataQualityResponse,
    UpcomingSportsResponse,
)
from app.schemas.research_runs import (
    ResearchRunDetailRead,
    ResearchRunListItem,
    ResearchRunMarketSummary,
    ResearchRunsResponse,
)
from app.services.research.candidate_selector import list_research_candidates
from app.services.research.pipeline import run_market_research
from app.services.research.upcoming_data_quality import list_upcoming_data_quality
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets
from app.services.polysignal_score import build_polysignal_score

router = APIRouter()


@router.get(
    "/research/runs",
    response_model=ResearchRunsResponse,
    tags=["research"],
)
def list_research_runs(
    status_filter: str | None = Query(default=None, alias="status"),
    market_id: int | None = Query(default=None),
    research_mode: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ResearchRunsResponse:
    stmt = (
        select(ResearchRun)
        .options(
            joinedload(ResearchRun.market).joinedload(Market.event),
            selectinload(ResearchRun.findings).joinedload(ResearchFinding.source),
            selectinload(ResearchRun.reports),
            selectinload(ResearchRun.predictions),
        )
        .order_by(ResearchRun.started_at.desc(), ResearchRun.id.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(ResearchRun.status == status_filter)
    if market_id is not None:
        stmt = stmt.where(ResearchRun.market_id == market_id)
    if research_mode:
        stmt = stmt.where(ResearchRun.research_mode == research_mode)

    runs = list(db.scalars(stmt).unique().all())
    return ResearchRunsResponse(
        count=len(runs),
        limit=limit,
        filters_applied={
            "status": status_filter,
            "market_id": market_id,
            "research_mode": research_mode,
        },
        items=[_serialize_research_run_list_item(item) for item in runs],
    )


@router.get(
    "/research/runs/{run_id}",
    response_model=ResearchRunDetailRead,
    tags=["research"],
)
def get_research_run_detail(
    run_id: int,
    db: Session = Depends(get_db),
) -> ResearchRunDetailRead:
    research_run = get_research_run_by_id(db, run_id)
    if research_run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Research run {run_id} no encontrado.",
        )
    base_payload = _serialize_research_run_list_item(research_run).model_dump()
    findings = [
        ResearchFindingRead.model_validate(item)
        for item in getattr(research_run, "findings", [])
    ]
    reports = getattr(research_run, "reports", [])
    predictions = getattr(research_run, "predictions", [])
    return ResearchRunDetailRead.model_validate(
        {
            **base_payload,
            "error_message": research_run.error_message,
            "metadata_json": research_run.metadata_json,
            "findings": findings,
            "report": (
                PredictionReportRead.model_validate(reports[0])
                if reports
                else None
            ),
            "prediction": (
                PredictionItemResponse.model_validate(predictions[0])
                if predictions
                else None
            ),
        }
    )


@router.get(
    "/research/candidates",
    response_model=ResearchCandidatesResponse,
    tags=["research"],
)
def get_research_candidates(
    limit: int = Query(default=10, ge=1, le=50),
    vertical: str | None = Query(default="sports"),
    sport: str | None = Query(default=None),
    market_shape: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ResearchCandidatesResponse:
    candidates = list_research_candidates(
        db,
        limit=limit,
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
    )
    candidate_payloads = []
    for candidate in candidates:
        payload = candidate.to_payload()
        market = get_market_by_id(db, candidate.market_id)
        if market is not None:
            payload["polysignal_score"] = build_polysignal_score(
                db,
                market=market,
                candidate_score=candidate.candidate_score,
            ).model_dump()
        candidate_payloads.append(payload)

    return ResearchCandidatesResponse(
        count=len(candidates),
        limit=limit,
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
        candidates=candidate_payloads,
    )


@router.get(
    "/research/upcoming-sports",
    response_model=UpcomingSportsResponse,
    tags=["research"],
)
def get_upcoming_sports_markets(
    sport: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    days: int = Query(default=7, ge=1, le=30),
    include_futures: bool = Query(default=False),
    market_shape: str | None = Query(default=None),
    focus: str | None = Query(default="match_winner"),
    db: Session = Depends(get_db),
) -> UpcomingSportsResponse:
    selection = list_upcoming_sports_markets(
        db,
        sport=sport,
        limit=limit,
        days=days,
        include_futures=include_futures,
        market_shape=market_shape,
        focus=focus,
    )
    return UpcomingSportsResponse(
        count=len(selection.items),
        limit=limit,
        items=[item.to_payload() for item in selection.items],
        counts=selection.counts,
        filters_applied=selection.filters_applied,
    )


@router.get(
    "/research/upcoming-sports/data-quality",
    response_model=UpcomingDataQualityResponse,
    tags=["research"],
)
def get_upcoming_sports_data_quality(
    sport: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> UpcomingDataQualityResponse:
    selection = list_upcoming_data_quality(
        db,
        sport=sport,
        days=days,
        limit=limit,
    )
    return UpcomingDataQualityResponse(
        summary=selection.summary,
        items=[item.to_payload() for item in selection.items],
        filters_applied=selection.filters_applied,
    )


@router.post(
    "/markets/{market_id}/research/run",
    response_model=ResearchRunResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["research"],
)
def run_market_research_endpoint(
    market_id: int,
    payload: ResearchRunRequest,
    db: Session = Depends(get_db),
) -> ResearchRunResponse:
    market = _require_market(db, market_id)
    settings = get_settings()
    result = run_market_research(
        db,
        market=market,
        settings=settings,
        research_mode=payload.research_mode,
        create_prediction_record=payload.create_prediction,
    )
    db.commit()
    return ResearchRunResponse(
        research_run_id=result.research_run.id,
        status=result.research_run.status,
        research_mode=result.research_run.research_mode,
        degraded_mode=result.research_run.degraded_mode,
        web_search_used=result.research_run.web_search_used,
        report=(
            PredictionReportRead.model_validate(result.report)
            if result.report is not None
            else None
        ),
        prediction=(
            PredictionItemResponse.model_validate(result.prediction)
            if result.prediction is not None
            else None
        ),
        partial_errors=result.partial_errors,
    )


@router.get(
    "/markets/{market_id}/research/latest",
    response_model=ResearchRunRead,
    tags=["research"],
)
def get_latest_market_research(
    market_id: int,
    db: Session = Depends(get_db),
) -> ResearchRunRead:
    _require_market(db, market_id)
    research_run = get_latest_research_run_for_market(db, market_id)
    if research_run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no tiene research runs.",
        )
    return _serialize_research_run(research_run)


@router.get(
    "/markets/{market_id}/research/runs",
    response_model=list[ResearchRunRead],
    tags=["research"],
)
def get_market_research_runs(
    market_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[ResearchRunRead]:
    _require_market(db, market_id)
    runs = list_research_runs_for_market(db, market_id, limit=limit)
    return [_serialize_research_run(item) for item in runs]


@router.get(
    "/markets/{market_id}/prediction/report",
    response_model=PredictionReportRead,
    tags=["research"],
)
def get_latest_market_prediction_report(
    market_id: int,
    db: Session = Depends(get_db),
) -> PredictionReportRead:
    _require_market(db, market_id)
    report = get_latest_prediction_report_for_market(db, market_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no tiene prediction reports.",
        )
    return PredictionReportRead.model_validate(report)


def _require_market(db: Session, market_id: int) -> Market:
    market = get_market_by_id(db, market_id)
    if market is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no encontrado.",
        )
    return market


def _serialize_research_run_list_item(research_run: ResearchRun) -> ResearchRunListItem:
    metadata = _metadata_dict(research_run.metadata_json)
    findings = getattr(research_run, "findings", [])
    reports = getattr(research_run, "reports", [])
    predictions = getattr(research_run, "predictions", [])
    market = getattr(research_run, "market", None)
    warnings: list[str] = []
    if metadata.get("expected_response_path") and research_run.status == "pending_agent":
        warnings.append("pending_agent_response")
    if research_run.error_message:
        warnings.append("run_error")
    if not findings and not reports and not predictions:
        warnings.append("no_research_outputs")

    return ResearchRunListItem.model_validate(
        {
            "id": research_run.id,
            "market_id": research_run.market_id,
            "market": (
                ResearchRunMarketSummary(
                    id=market.id,
                    question=market.question,
                    sport=market.sport_type,
                    market_shape=market.market_type,
                    close_time=market.end_date,
                )
                if market is not None
                else None
            ),
            "status": research_run.status,
            "research_mode": research_run.research_mode,
            "vertical": research_run.vertical,
            "subvertical": research_run.subvertical,
            "market_shape": research_run.market_shape,
            "started_at": research_run.started_at,
            "finished_at": research_run.finished_at,
            "degraded_mode": research_run.degraded_mode,
            "web_search_used": research_run.web_search_used,
            "prediction_family": (
                getattr(predictions[0], "prediction_family", None)
                if predictions
                else None
            ),
            "confidence_score": research_run.confidence_score,
            "has_findings": bool(findings),
            "has_report": bool(reports),
            "has_prediction": bool(predictions),
            "findings_count": len(findings),
            "reports_count": len(reports),
            "predictions_count": len(predictions),
            "request_path": _metadata_str(metadata, "request_path"),
            "packet_path": _metadata_str(metadata, "packet_path"),
            "expected_response_path": _metadata_str(metadata, "expected_response_path"),
            "ingest_command": _metadata_str(metadata, "ingest_command"),
            "warnings": warnings,
        }
    )


def _serialize_research_run(research_run: object) -> ResearchRunRead:
    findings = [
        ResearchFindingRead.model_validate(item)
        for item in getattr(research_run, "findings", [])
    ]
    reports = getattr(research_run, "reports", [])
    predictions = getattr(research_run, "predictions", [])
    latest_report = reports[0] if reports else None
    latest_prediction = predictions[0] if predictions else None
    return ResearchRunRead.model_validate(
        {
            "id": research_run.id,
            "market_id": research_run.market_id,
            "status": research_run.status,
            "vertical": research_run.vertical,
            "subvertical": research_run.subvertical,
            "market_shape": research_run.market_shape,
            "research_mode": research_run.research_mode,
            "model_used": research_run.model_used,
            "web_search_used": research_run.web_search_used,
            "degraded_mode": research_run.degraded_mode,
            "started_at": research_run.started_at,
            "finished_at": research_run.finished_at,
            "total_sources_found": research_run.total_sources_found,
            "total_sources_used": research_run.total_sources_used,
            "confidence_score": research_run.confidence_score,
            "error_message": research_run.error_message,
            "metadata_json": research_run.metadata_json,
            "findings": findings,
            "report": (
                PredictionReportRead.model_validate(latest_report)
                if latest_report is not None
                else None
            ),
            "prediction": (
                PredictionItemResponse.model_validate(latest_prediction)
                if latest_prediction is not None
                else None
            ),
        }
    )


def _metadata_dict(value: dict[str, object] | list[object] | None) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    return {}


def _metadata_str(metadata: dict[str, object], key: str) -> str | None:
    value = metadata.get(key)
    return value if isinstance(value, str) else None
