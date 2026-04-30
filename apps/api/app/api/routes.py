from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketClientError, PolymarketGammaClient, get_polymarket_client
from app.clients.polymarket_data import PolymarketDataClient, get_polymarket_data_client
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.repositories.evidence_items import list_market_evidence_items
from app.repositories.market_snapshots import get_latest_market_snapshot, list_market_snapshots
from app.repositories.markets import get_market_by_id, list_markets
from app.repositories.market_outcomes import create_market_outcome, get_market_outcome
from app.repositories.predictions import get_latest_prediction_for_market, list_predictions_for_market
from app.schemas.briefing import (
    BriefingArtifactResponse,
    BriefingRunsResponse,
    DailyBriefingMarkdownResponse,
    DailyBriefingRead,
    OperationalBriefingResponse,
)
from app.schemas.dashboard_artifacts import AppMetaResponse, DashboardLatestMetaResponse
from app.schemas.diff import DiffRunDetailResponse, DiffRunsResponse, LatestDiffResponse
from app.schemas.evidence import EvidenceItemResponse
from app.schemas.evidence import MarketReferenceItemResponse, MarketReferencesResponse
from app.schemas.evaluation import (
    EvaluationHistoryResponse,
    EvaluationMarketHistoryResponse,
    EvaluationSummaryResponse,
    MarketOutcomeResponse,
    MarketResolveRequest,
)
from app.schemas.market import (
    EventSummary,
    HealthResponse,
    MarketDetail,
    MarketListItem,
    MarketSnapshotItem,
)
from app.schemas.market_analysis import MarketAnalysisMarkdownResponse, MarketAnalysisRead
from app.schemas.market_price_history import MarketPriceHistoryRead
from app.schemas.overview import MarketOverviewResponse, OverviewSortBy, PriorityBucket
from app.schemas.pipeline_artifacts import PipelineArtifactResponse, PipelineRunsResponse
from app.schemas.prediction import (
    LatestPredictionResponse,
    PredictionHistoryResponse,
    PredictionItemResponse,
    PredictionMarketSummary,
)
from app.schemas.report_artifacts import ReportArtifactResponse, ReportRunsResponse
from app.schemas.status import (
    HealthStatus,
    OperationalStatusHistoryCompareResponse,
    OperationalStatusHistoryResponse,
    OperationalStatusHistorySummaryResponse,
    OperationalStatusResponse,
    StatusHistoryComponent,
)
from app.schemas.stage_artifacts import StageArtifactResponse, StageRunsResponse
from app.services.briefing import (
    build_daily_briefing,
    build_operational_briefing,
    render_daily_briefing_markdown,
)
from app.services.briefing_artifacts import (
    BriefingRunNotFoundError,
    list_briefing_runs,
    read_briefing_run_artifact,
    read_latest_briefing_artifact,
)
from app.services.dashboard_artifacts import (
    LatestDashboardArtifactNotFoundError,
    read_latest_dashboard_html_path,
    read_latest_dashboard_meta,
)
from app.services.diff_artifacts import (
    DiffRunNotFoundError,
    list_diff_runs,
    read_diff_run_artifact,
    read_latest_diff_artifact,
)
from app.services.market_overview import build_markets_overview
from app.services.market_analysis import build_market_analysis
from app.services.market_analysis_markdown import render_market_analysis_markdown
from app.services.market_price_history import build_market_price_history
from app.schemas.wallet_intelligence import WalletIntelligenceRead
from app.services.wallet_intelligence import build_wallet_intelligence
from app.services.evaluation import (
    EVALUATION_HISTORY_DEFAULT_LIMIT,
    build_evaluation_history,
    build_evaluation_market_history,
    build_evaluation_summary,
)
from app.services.operational_status import (
    STATUS_HISTORY_DEFAULT_LIMIT,
    build_operational_status,
    build_operational_status_history_compare,
    build_operational_status_history,
    build_operational_status_history_summary,
)
from app.services.pipeline_artifacts import (
    PipelineRunNotFoundError,
    list_pipeline_runs,
    read_latest_pipeline_artifact,
    read_pipeline_run_artifact,
)
from app.services.report_artifacts import (
    ReportRunNotFoundError,
    list_report_runs,
    read_latest_report_artifact,
    read_report_run_artifact,
)
from app.services.stage_artifacts import (
    EVIDENCE_STAGE,
    SCORING_STAGE,
    SNAPSHOTS_STAGE,
    StageRunNotFoundError,
    list_stage_runs,
    read_latest_stage_artifact,
    read_stage_run_artifact,
)
from app.schemas.sync import PolymarketSyncResponse
from app.services.polymarket_sync import resolve_source_tag_id, sync_active_markets

router = APIRouter()


@router.get("/", tags=["dashboard"])
def redirect_root_to_latest_dashboard() -> RedirectResponse:
    return RedirectResponse(url="/dashboard/latest", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/app", tags=["dashboard"])
def redirect_app_to_latest_dashboard() -> RedirectResponse:
    return RedirectResponse(url="/dashboard/latest", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/app/meta", response_model=AppMetaResponse, tags=["dashboard"])
def get_app_meta() -> AppMetaResponse:
    dashboard_meta = read_latest_dashboard_meta()
    return AppMetaResponse(
        dashboard_available=dashboard_meta.artifact_available,
    )


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", environment=settings.environment)


@router.get("/status", response_model=OperationalStatusResponse, tags=["status"])
def get_operational_status() -> OperationalStatusResponse:
    return build_operational_status()


@router.get("/status/history/compare", response_model=OperationalStatusHistoryCompareResponse, tags=["status"])
def get_operational_status_history_compare(
    limit: int = Query(default=STATUS_HISTORY_DEFAULT_LIMIT, ge=1, le=50),
    status: HealthStatus | None = Query(default=None),
    component: StatusHistoryComponent | None = Query(default=None),
) -> OperationalStatusHistoryCompareResponse:
    return build_operational_status_history_compare(
        limit=limit,
        status=status,
        component=component,
    )


@router.get("/status/history/summary", response_model=OperationalStatusHistorySummaryResponse, tags=["status"])
def get_operational_status_history_summary(
    limit: int = Query(default=STATUS_HISTORY_DEFAULT_LIMIT, ge=1, le=50),
    status: HealthStatus | None = Query(default=None),
    component: StatusHistoryComponent | None = Query(default=None),
) -> OperationalStatusHistorySummaryResponse:
    return build_operational_status_history_summary(
        limit=limit,
        status=status,
        component=component,
    )


@router.get("/status/history", response_model=OperationalStatusHistoryResponse, tags=["status"])
def get_operational_status_history(
    limit: int = Query(default=STATUS_HISTORY_DEFAULT_LIMIT, ge=1, le=50),
    status: HealthStatus | None = Query(default=None),
    component: StatusHistoryComponent | None = Query(default=None),
) -> OperationalStatusHistoryResponse:
    return build_operational_status_history(
        limit=limit,
        status=status,
        component=component,
    )


@router.get("/markets", response_model=list[MarketListItem], tags=["markets"])
def get_markets(db: Session = Depends(get_db)) -> list[MarketListItem]:
    markets = list_markets(db)
    return [MarketListItem.model_validate(market) for market in markets]


@router.get("/briefing", response_model=OperationalBriefingResponse, tags=["briefing"])
def get_operational_briefing(
    sport_type: str | None = Query(default="nba"),
    market_type: str | None = Query(default="winner"),
    active: bool | None = Query(default=True),
    top_limit: int = Query(default=5, ge=1, le=20),
    watchlist_limit: int = Query(default=5, ge=1, le=20),
    review_limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
) -> OperationalBriefingResponse:
    return build_operational_briefing(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        top_limit=top_limit,
        watchlist_limit=watchlist_limit,
        review_limit=review_limit,
    )


@router.get("/briefing/daily", response_model=DailyBriefingRead, tags=["briefing"])
def get_daily_briefing(
    sport: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=14),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> DailyBriefingRead:
    return build_daily_briefing(
        db,
        sport=sport,
        days=days,
        limit=limit,
    )


@router.get(
    "/briefing/daily/markdown",
    response_model=DailyBriefingMarkdownResponse,
    tags=["briefing"],
)
def get_daily_briefing_markdown(
    sport: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=14),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> DailyBriefingMarkdownResponse:
    briefing = build_daily_briefing(
        db,
        sport=sport,
        days=days,
        limit=limit,
    )
    return DailyBriefingMarkdownResponse(markdown=render_daily_briefing_markdown(briefing))


@router.get("/briefing/latest", response_model=BriefingArtifactResponse, tags=["briefing"])
def get_latest_briefing_artifact() -> BriefingArtifactResponse:
    return read_latest_briefing_artifact()


@router.get("/briefing/runs", response_model=BriefingRunsResponse, tags=["briefing"])
def get_briefing_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> BriefingRunsResponse:
    return list_briefing_runs(limit=limit)


@router.get("/briefing/{run_id}", response_model=BriefingArtifactResponse, tags=["briefing"])
def get_briefing_run(run_id: str) -> BriefingArtifactResponse:
    try:
        return read_briefing_run_artifact(run_id)
    except BriefingRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Briefing run {run_id} no encontrado.",
        ) from exc


@router.get("/dashboard/latest/meta", response_model=DashboardLatestMetaResponse, tags=["dashboard"])
def get_latest_dashboard_meta() -> DashboardLatestMetaResponse:
    return read_latest_dashboard_meta()


@router.get("/dashboard/latest", tags=["dashboard"])
def get_latest_dashboard_html() -> FileResponse:
    try:
        dashboard_path = read_latest_dashboard_html_path()
    except LatestDashboardArtifactNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard latest artifact no encontrado. Ejecuta generate_dashboard primero.",
        ) from exc
    return FileResponse(
        path=dashboard_path,
        media_type="text/html",
        filename=dashboard_path.name,
    )


@router.get("/diff/latest", response_model=LatestDiffResponse, tags=["diff"])
def get_latest_diff() -> LatestDiffResponse:
    return read_latest_diff_artifact()


@router.get("/diff/runs", response_model=DiffRunsResponse, tags=["diff"])
def get_diff_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> DiffRunsResponse:
    return list_diff_runs(limit=limit)


@router.get("/diff/{run_id}", response_model=DiffRunDetailResponse, tags=["diff"])
def get_diff_run(run_id: str) -> DiffRunDetailResponse:
    try:
        return read_diff_run_artifact(run_id)
    except DiffRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Diff run {run_id} no encontrado.",
        ) from exc


@router.get("/snapshots/latest", response_model=StageArtifactResponse, tags=["snapshots"])
def get_latest_snapshots_run() -> StageArtifactResponse:
    return read_latest_stage_artifact(SNAPSHOTS_STAGE)


@router.get("/snapshots/runs", response_model=StageRunsResponse, tags=["snapshots"])
def get_snapshots_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> StageRunsResponse:
    return list_stage_runs(SNAPSHOTS_STAGE, limit=limit)


@router.get("/snapshots/{run_id}", response_model=StageArtifactResponse, tags=["snapshots"])
def get_snapshots_run(run_id: str) -> StageArtifactResponse:
    try:
        return read_stage_run_artifact(SNAPSHOTS_STAGE, run_id)
    except StageRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Snapshots run {run_id} no encontrado.",
        ) from exc


@router.get("/pipeline/latest", response_model=PipelineArtifactResponse, tags=["pipeline"])
def get_latest_pipeline_artifact() -> PipelineArtifactResponse:
    return read_latest_pipeline_artifact()


@router.get("/pipeline/runs", response_model=PipelineRunsResponse, tags=["pipeline"])
def get_pipeline_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> PipelineRunsResponse:
    return list_pipeline_runs(limit=limit)


@router.get("/pipeline/{run_id}", response_model=PipelineArtifactResponse, tags=["pipeline"])
def get_pipeline_run(run_id: str) -> PipelineArtifactResponse:
    try:
        return read_pipeline_run_artifact(run_id)
    except PipelineRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run {run_id} no encontrado.",
        ) from exc


@router.get("/evidence/latest-run", response_model=StageArtifactResponse, tags=["evidence"])
def get_latest_evidence_run() -> StageArtifactResponse:
    return read_latest_stage_artifact(EVIDENCE_STAGE)


@router.get("/evidence/runs", response_model=StageRunsResponse, tags=["evidence"])
def get_evidence_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> StageRunsResponse:
    return list_stage_runs(EVIDENCE_STAGE, limit=limit)


@router.get("/evidence/{run_id}", response_model=StageArtifactResponse, tags=["evidence"])
def get_evidence_run(run_id: str) -> StageArtifactResponse:
    try:
        return read_stage_run_artifact(EVIDENCE_STAGE, run_id)
    except StageRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evidence run {run_id} no encontrado.",
        ) from exc


@router.get("/reports/latest", response_model=ReportArtifactResponse, tags=["reports"])
def get_latest_reports_artifact() -> ReportArtifactResponse:
    return read_latest_report_artifact()


@router.get("/reports/runs", response_model=ReportRunsResponse, tags=["reports"])
def get_reports_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> ReportRunsResponse:
    return list_report_runs(limit=limit)


@router.get("/reports/{run_id}", response_model=ReportArtifactResponse, tags=["reports"])
def get_reports_run(run_id: str) -> ReportArtifactResponse:
    try:
        return read_report_run_artifact(run_id)
    except ReportRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report run {run_id} no encontrado.",
        ) from exc


@router.get("/scoring/latest", response_model=StageArtifactResponse, tags=["scoring"])
def get_latest_scoring_run() -> StageArtifactResponse:
    return read_latest_stage_artifact(SCORING_STAGE)


@router.get("/scoring/runs", response_model=StageRunsResponse, tags=["scoring"])
def get_scoring_runs(
    limit: int = Query(default=10, ge=1, le=50),
) -> StageRunsResponse:
    return list_stage_runs(SCORING_STAGE, limit=limit)


@router.get("/scoring/{run_id}", response_model=StageArtifactResponse, tags=["scoring"])
def get_scoring_run(run_id: str) -> StageArtifactResponse:
    try:
        return read_stage_run_artifact(SCORING_STAGE, run_id)
    except StageRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scoring run {run_id} no encontrado.",
        ) from exc


@router.get("/markets/overview", response_model=MarketOverviewResponse, tags=["markets"])
def get_markets_overview(
    sport_type: str | None = Query(default="nba"),
    market_type: str | None = Query(default="winner"),
    active: bool | None = Query(default=None),
    opportunity_only: bool = Query(default=False),
    evidence_eligible_only: bool = Query(default=False),
    evidence_only: bool = Query(default=False),
    fallback_only: bool = Query(default=False),
    bucket: PriorityBucket | None = Query(default=None),
    edge_class: Literal["no_signal", "moderate", "strong", "review"] | None = Query(default=None),
    sort_by: OverviewSortBy = Query(default="priority"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> MarketOverviewResponse:
    return build_markets_overview(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        opportunity_only=opportunity_only,
        evidence_eligible_only=evidence_eligible_only,
        evidence_only=evidence_only,
        fallback_only=fallback_only,
        bucket=bucket,
        edge_class=edge_class,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/markets/{market_id}/analysis",
    response_model=MarketAnalysisRead,
    tags=["markets"],
)
def get_market_analysis(
    market_id: int,
    db: Session = Depends(get_db),
) -> MarketAnalysisRead:
    market = _require_market(db, market_id)
    return build_market_analysis(db, market)


@router.get(
    "/markets/{market_id}/wallet-intelligence",
    response_model=WalletIntelligenceRead,
    tags=["markets"],
)
def get_market_wallet_intelligence(
    market_id: int,
    min_usd: Decimal = Query(default=Decimal("10000"), ge=Decimal("0"), le=Decimal("10000000")),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    data_client: PolymarketDataClient = Depends(get_polymarket_data_client),
    gamma_client: PolymarketGammaClient = Depends(get_polymarket_client),
) -> WalletIntelligenceRead:
    market = _require_market(db, market_id)
    return build_wallet_intelligence(
        db,
        market,
        data_client=data_client,
        gamma_client=gamma_client,
        min_usd=min_usd,
        limit=limit,
    )


@router.get(
    "/markets/{market_id}/analysis/markdown",
    response_model=MarketAnalysisMarkdownResponse,
    tags=["markets"],
)
def get_market_analysis_markdown(
    market_id: int,
    db: Session = Depends(get_db),
) -> MarketAnalysisMarkdownResponse:
    market = _require_market(db, market_id)
    analysis = build_market_analysis(db, market)
    return MarketAnalysisMarkdownResponse(
        markdown=render_market_analysis_markdown(db, market, analysis=analysis)
    )


@router.get(
    "/markets/{market_id}/price-history",
    response_model=MarketPriceHistoryRead,
    tags=["markets"],
)
def get_market_price_history(
    market_id: int,
    limit: int = Query(default=50, ge=1, le=500),
    order: Literal["asc", "desc"] = Query(default="asc"),
    db: Session = Depends(get_db),
) -> MarketPriceHistoryRead:
    market = _require_market(db, market_id)
    return build_market_price_history(
        db,
        market_id=market.id,
        limit=limit,
        order=order,
    )


@router.get("/markets/{market_id}", response_model=MarketDetail, tags=["markets"])
def get_market_detail(
    market_id: int,
    snapshots_limit: int | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
) -> MarketDetail:
    settings = get_settings()
    market = _require_market(db, market_id)
    history_limit = _resolve_history_limit(settings, snapshots_limit)
    latest_snapshot = get_latest_market_snapshot(db, market.id)
    recent_snapshots = (
        list_market_snapshots(db, market_id=market.id, limit=history_limit)
        if history_limit > 0
        else []
    )
    return _build_market_detail(
        market=market,
        latest_snapshot=latest_snapshot,
        recent_snapshots=recent_snapshots,
    )


@router.get(
    "/markets/{market_id}/snapshots",
    response_model=list[MarketSnapshotItem],
    tags=["markets"],
)
def get_market_snapshot_history(
    market_id: int,
    limit: int | None = Query(default=None, ge=1),
    captured_after: datetime | None = None,
    captured_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[MarketSnapshotItem]:
    settings = get_settings()
    market = _require_market(db, market_id)
    history_limit = _resolve_history_limit(settings, limit)
    snapshots = list_market_snapshots(
        db,
        market_id=market.id,
        limit=history_limit,
        captured_after=captured_after,
        captured_before=captured_before,
    )
    return [MarketSnapshotItem.model_validate(snapshot) for snapshot in snapshots]


@router.get(
    "/markets/{market_id}/evidence",
    response_model=list[EvidenceItemResponse],
    tags=["markets"],
)
def get_market_evidence(
    market_id: int,
    evidence_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[EvidenceItemResponse]:
    market = _require_market(db, market_id)
    evidence_items = list_market_evidence_items(
        db,
        market_id=market.id,
        evidence_type=evidence_type,
    )
    return [EvidenceItemResponse.model_validate(item) for item in evidence_items]


@router.get(
    "/markets/{market_id}/references",
    response_model=MarketReferencesResponse,
    tags=["markets"],
)
def get_market_references(
    market_id: int,
    db: Session = Depends(get_db),
) -> MarketReferencesResponse:
    market = _require_market(db, market_id)
    evidence_items = list_market_evidence_items(db, market_id=market.id)
    return MarketReferencesResponse(
        market_id=market.id,
        question=market.question,
        items=[
            MarketReferenceItemResponse(
                provider=item.provider,
                source_type=item.source.source_type,
                evidence_type=item.evidence_type,
                title=item.source.title,
                url=item.source.url,
                published_at=item.source.published_at,
                summary=item.summary,
                stance=item.stance,
                confidence=item.confidence,
                high_contradiction=item.high_contradiction,
            )
            for item in evidence_items
        ],
    )


@router.get(
    "/markets/{market_id}/prediction",
    response_model=LatestPredictionResponse,
    tags=["markets"],
)
def get_latest_market_prediction(
    market_id: int,
    db: Session = Depends(get_db),
) -> LatestPredictionResponse:
    market = _require_market(db, market_id)
    prediction = get_latest_prediction_for_market(db, market.id)
    return LatestPredictionResponse(
        market=_build_prediction_market_summary(market),
        prediction=(
            PredictionItemResponse.model_validate(prediction)
            if prediction is not None
            else None
        ),
    )


@router.get(
    "/markets/{market_id}/predictions",
    response_model=PredictionHistoryResponse,
    tags=["markets"],
)
def get_market_prediction_history(
    market_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PredictionHistoryResponse:
    market = _require_market(db, market_id)
    predictions = list_predictions_for_market(db, market.id, limit=limit)
    latest_prediction = predictions[0] if predictions else None
    return PredictionHistoryResponse(
        market=_build_prediction_market_summary(market),
        latest_prediction=(
            PredictionItemResponse.model_validate(latest_prediction)
            if latest_prediction is not None
            else None
        ),
        items=[PredictionItemResponse.model_validate(item) for item in predictions],
    )


@router.post(
    "/markets/{market_id}/resolve",
    response_model=MarketOutcomeResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["markets"],
)
def resolve_market(
    market_id: int,
    payload: MarketResolveRequest,
    db: Session = Depends(get_db),
) -> MarketOutcomeResponse:
    market = _require_market(db, market_id)
    existing_outcome = get_market_outcome(db, market.id)
    if existing_outcome is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Market {market_id} ya fue resuelto.",
        )

    outcome = create_market_outcome(
        db,
        market_id=market.id,
        resolved_outcome=payload.resolved_outcome,
        notes=payload.notes,
    )
    market.closed = True
    db.add(market)
    db.commit()
    db.refresh(outcome)
    return MarketOutcomeResponse.model_validate(outcome)


@router.get(
    "/evaluation/history",
    response_model=EvaluationHistoryResponse,
    tags=["evaluation"],
)
def get_evaluation_history(
    limit: int = Query(default=EVALUATION_HISTORY_DEFAULT_LIMIT, ge=1, le=100),
    db: Session = Depends(get_db),
) -> EvaluationHistoryResponse:
    return build_evaluation_history(db, limit=limit)


@router.get(
    "/evaluation/history/{market_id}",
    response_model=EvaluationMarketHistoryResponse,
    tags=["evaluation"],
)
def get_evaluation_market_history(
    market_id: int,
    db: Session = Depends(get_db),
) -> EvaluationMarketHistoryResponse:
    market = _require_market(db, market_id)
    outcome = get_market_outcome(db, market.id)
    if outcome is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no tiene outcome resuelto.",
        )
    return build_evaluation_market_history(
        db,
        market_id=market.id,
        question=market.question,
        resolved_outcome=outcome.resolved_outcome,
        resolved_at=outcome.resolved_at,
    )


@router.get(
    "/evaluation/summary",
    response_model=EvaluationSummaryResponse,
    tags=["evaluation"],
)
def get_evaluation_summary(
    db: Session = Depends(get_db),
) -> EvaluationSummaryResponse:
    return build_evaluation_summary(db)


@router.post("/sync/polymarket", response_model=PolymarketSyncResponse, tags=["sync"])
def sync_polymarket(
    db: Session = Depends(get_db),
    polymarket_client: PolymarketGammaClient = Depends(get_polymarket_client),
) -> PolymarketSyncResponse:
    settings = get_settings()
    try:
        return sync_active_markets(
            db,
            client=polymarket_client,
            page_limit=settings.polymarket_page_limit,
            discovery_scope=settings.mvp_discovery_scope,
            source_tag_id=resolve_source_tag_id(
                settings.mvp_discovery_scope,
                sports_tag_id=settings.polymarket_sports_tag_id,
                nba_tag_id=settings.polymarket_nba_tag_id,
            ),
        )
    except PolymarketClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


def _require_market(db: Session, market_id: int) -> Market:
    market = get_market_by_id(db, market_id)
    if market is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Market {market_id} no encontrado.",
        )
    return market


def _resolve_history_limit(settings: Settings, requested_limit: int | None) -> int:
    if requested_limit is None:
        return settings.snapshot_history_default_limit
    return min(requested_limit, settings.snapshot_history_max_limit)


def _build_market_detail(
    *,
    market: Market,
    latest_snapshot: MarketSnapshot | None,
    recent_snapshots: list[MarketSnapshot],
) -> MarketDetail:
    return MarketDetail.model_validate(
        {
            "id": market.id,
            "polymarket_market_id": market.polymarket_market_id,
            "event_id": market.event_id,
            "question": market.question,
            "slug": market.slug,
            "yes_token_id": market.yes_token_id,
            "no_token_id": market.no_token_id,
            "sport_type": market.sport_type,
            "market_type": market.market_type,
            "evidence_eligible": market.evidence_eligible,
            "evidence_shape": market.evidence_shape,
            "evidence_skip_reason": market.evidence_skip_reason,
            "active": market.active,
            "closed": market.closed,
            "end_date": market.end_date,
            "rules_text": market.rules_text,
            "latest_yes_price": latest_snapshot.yes_price if latest_snapshot is not None else None,
            "created_at": market.created_at,
            "updated_at": market.updated_at,
            "event": EventSummary.model_validate(market.event),
            "latest_snapshot": (
                MarketSnapshotItem.model_validate(latest_snapshot)
                if latest_snapshot is not None
                else None
            ),
            "recent_snapshots": [
                MarketSnapshotItem.model_validate(snapshot) for snapshot in recent_snapshots
            ],
        }
    )


def _build_prediction_market_summary(market: Market) -> PredictionMarketSummary:
    return PredictionMarketSummary.model_validate(market)
