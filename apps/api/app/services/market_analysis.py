from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.repositories.evidence_items import list_market_evidence_items
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.repositories.predictions import get_latest_prediction_for_market, list_predictions_for_market
from app.repositories.research_runs import list_research_runs_for_market
from app.schemas.market_analysis import (
    MarketAnalysisCandidateContext,
    MarketAnalysisEvidenceItem,
    MarketAnalysisExternalSignal,
    MarketAnalysisFinding,
    MarketAnalysisMarket,
    MarketAnalysisParticipant,
    MarketAnalysisPrediction,
    MarketAnalysisPredictionReport,
    MarketAnalysisRead,
    MarketAnalysisResearchRun,
    MarketAnalysisSnapshot,
)
from app.services.external_market_signals import list_external_market_signals
from app.services.polysignal_score import build_polysignal_score
from app.services.research.candidate_selector import build_research_candidate
from app.services.research.classification import classify_market_research_context


ANALYSIS_HISTORY_LIMIT = 20


def build_market_analysis(db: Session, market: Market) -> MarketAnalysisRead:
    latest_snapshot = get_latest_market_snapshot(db, market.id)
    candidate = build_research_candidate(
        market=market,
        latest_snapshot=latest_snapshot,
        classification=classify_market_research_context(market=market),
    )
    prediction_reports = _list_prediction_reports(db, market.id, limit=ANALYSIS_HISTORY_LIMIT)
    latest_report = prediction_reports[0] if prediction_reports else None
    latest_prediction = get_latest_prediction_for_market(
        db,
        market.id,
        prediction_family=None,
    )
    prediction_history = list_predictions_for_market(
        db,
        market.id,
        prediction_family=None,
        limit=ANALYSIS_HISTORY_LIMIT,
    )
    research_runs = list_research_runs_for_market(db, market.id, limit=ANALYSIS_HISTORY_LIMIT)
    research_findings = _list_research_findings(db, market.id, limit=100)
    evidence_items = list_market_evidence_items(db, market_id=market.id)
    external_signals = list_external_market_signals(db, market_id=market.id, limit=50)
    polysignal_score = build_polysignal_score(
        db,
        market=market,
        latest_snapshot=latest_snapshot,
        latest_prediction=latest_prediction,
        external_signals=external_signals,
        candidate_score=candidate.candidate_score,
    )

    warnings: list[str] = []
    if latest_snapshot is None:
        warnings.append("missing_latest_snapshot")
    if not evidence_items and not research_findings:
        warnings.append("no_evidence_found")
    if not external_signals:
        warnings.append("no_external_signals")
    if latest_prediction is None:
        warnings.append("no_prediction_found")

    return MarketAnalysisRead(
        market=_serialize_market(market),
        latest_snapshot=(
            MarketAnalysisSnapshot.model_validate(latest_snapshot)
            if latest_snapshot is not None
            else None
        ),
        polysignal_score=polysignal_score,
        candidate_context=MarketAnalysisCandidateContext(
            candidate_score=candidate.candidate_score,
            candidate_reasons=list(candidate.candidate_reasons),
            warnings=list(candidate.warnings),
            research_template_name=candidate.research_template_name,
            vertical=candidate.vertical,
            sport=candidate.sport,
            market_shape=candidate.market_shape,
            participants=[
                MarketAnalysisParticipant(**participant.to_payload())
                for participant in candidate.participants
            ],
        ),
        latest_prediction=(
            _serialize_prediction(latest_prediction, latest_report=latest_report)
            if latest_prediction is not None
            else None
        ),
        prediction_history=[
            _serialize_prediction(prediction, latest_report=None)
            for prediction in prediction_history
        ],
        research_runs=[_serialize_research_run(run) for run in research_runs],
        research_findings=[_serialize_research_finding(finding) for finding in research_findings],
        prediction_reports=[
            _serialize_prediction_report(report) for report in prediction_reports
        ],
        evidence_items=[_serialize_evidence_item(item) for item in evidence_items],
        external_signals=[_serialize_external_signal(signal) for signal in external_signals],
        warnings=warnings,
    )


def _serialize_market(market: Market) -> MarketAnalysisMarket:
    event = market.event
    return MarketAnalysisMarket(
        id=market.id,
        polymarket_market_id=market.polymarket_market_id,
        event_id=market.event_id,
        event_title=event.title if event is not None else None,
        event_category=event.category if event is not None else None,
        question=market.question,
        slug=market.slug,
        sport_type=market.sport_type,
        market_type=market.market_type,
        evidence_shape=market.evidence_shape,
        image_url=market.image_url,
        icon_url=market.icon_url,
        event_image_url=event.image_url if event is not None else None,
        event_icon_url=event.icon_url if event is not None else None,
        active=market.active,
        closed=market.closed,
        end_date=market.end_date,
        rules_text=market.rules_text,
        created_at=market.created_at,
        updated_at=market.updated_at,
    )


def _serialize_prediction(
    prediction: Prediction,
    *,
    latest_report: PredictionReport | None,
) -> MarketAnalysisPrediction:
    recommendation = None
    if latest_report is not None and latest_report.prediction_id == prediction.id:
        recommendation = latest_report.recommendation
    return MarketAnalysisPrediction(
        id=prediction.id,
        market_id=prediction.market_id,
        prediction_family=prediction.prediction_family,
        research_run_id=prediction.research_run_id,
        yes_probability=prediction.yes_probability,
        no_probability=prediction.no_probability,
        confidence_score=prediction.confidence_score,
        edge_signed=prediction.edge_signed,
        edge_magnitude=prediction.edge_magnitude,
        edge_class=prediction.edge_class,
        opportunity=prediction.opportunity,
        review_confidence=prediction.review_confidence,
        review_edge=prediction.review_edge,
        recommendation=recommendation,
        run_at=prediction.run_at,
        created_at=prediction.created_at,
    )


def _serialize_research_run(run: ResearchRun) -> MarketAnalysisResearchRun:
    return MarketAnalysisResearchRun(
        id=run.id,
        status=run.status,
        vertical=run.vertical,
        subvertical=run.subvertical,
        market_shape=run.market_shape,
        research_mode=run.research_mode,
        model_used=run.model_used,
        web_search_used=run.web_search_used,
        degraded_mode=run.degraded_mode,
        confidence_score=run.confidence_score,
        total_sources_found=run.total_sources_found,
        total_sources_used=run.total_sources_used,
        error_message=run.error_message,
        started_at=run.started_at,
        finished_at=run.finished_at,
        metadata_json=run.metadata_json,
    )


def _serialize_research_finding(finding: ResearchFinding) -> MarketAnalysisFinding:
    return MarketAnalysisFinding(
        id=finding.id,
        research_run_id=finding.research_run_id,
        claim=finding.claim,
        stance=finding.stance,
        factor_type=finding.factor_type,
        evidence_summary=finding.evidence_summary,
        impact_score=finding.impact_score,
        credibility_score=finding.credibility_score,
        freshness_score=finding.freshness_score,
        source_name=finding.source_name,
        citation_url=finding.citation_url,
        published_at=finding.published_at,
        metadata_json=finding.metadata_json,
    )


def _serialize_prediction_report(report: PredictionReport) -> MarketAnalysisPredictionReport:
    return MarketAnalysisPredictionReport(
        id=report.id,
        prediction_id=report.prediction_id,
        research_run_id=report.research_run_id,
        thesis=report.thesis,
        final_reasoning=report.final_reasoning,
        recommendation=report.recommendation,
        evidence_for=report.evidence_for,
        evidence_against=report.evidence_against,
        risks=report.risks,
        created_at=report.created_at,
        metadata_json=report.metadata_json,
    )


def _serialize_evidence_item(item: EvidenceItem) -> MarketAnalysisEvidenceItem:
    source = item.source
    return MarketAnalysisEvidenceItem(
        id=item.id,
        provider=item.provider,
        evidence_type=item.evidence_type,
        stance=item.stance,
        strength=item.strength,
        confidence=item.confidence,
        summary=item.summary,
        high_contradiction=item.high_contradiction,
        bookmaker_count=item.bookmaker_count,
        source_name=source.title if source is not None else item.provider,
        title=source.title if source is not None else None,
        url=source.url if source is not None else None,
        citation_url=source.url if source is not None else None,
        published_at=source.published_at if source is not None else None,
        fetched_at=source.fetched_at if source is not None else None,
        metadata_json=item.metadata_json,
    )


def _serialize_external_signal(signal: ExternalMarketSignal) -> MarketAnalysisExternalSignal:
    return MarketAnalysisExternalSignal(
        id=signal.id,
        source=signal.source,
        source_market_id=signal.source_market_id,
        source_event_id=signal.source_event_id,
        source_ticker=signal.source_ticker,
        title=signal.title,
        yes_probability=signal.yes_probability,
        no_probability=signal.no_probability,
        mid_price=signal.mid_price,
        last_price=signal.last_price,
        best_yes_bid=signal.best_yes_bid,
        best_yes_ask=signal.best_yes_ask,
        best_no_bid=signal.best_no_bid,
        best_no_ask=signal.best_no_ask,
        spread=signal.spread,
        volume=signal.volume,
        liquidity=signal.liquidity,
        open_interest=signal.open_interest,
        source_confidence=signal.source_confidence,
        match_confidence=signal.match_confidence,
        match_reason=signal.match_reason,
        warnings=signal.warnings,
        fetched_at=signal.fetched_at,
        created_at=signal.created_at,
    )


def _list_research_findings(
    db: Session,
    market_id: int,
    *,
    limit: int,
) -> list[ResearchFinding]:
    stmt = (
        select(ResearchFinding)
        .where(ResearchFinding.market_id == market_id)
        .order_by(ResearchFinding.id.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def _list_prediction_reports(
    db: Session,
    market_id: int,
    *,
    limit: int,
) -> list[PredictionReport]:
    stmt = (
        select(PredictionReport)
        .where(PredictionReport.market_id == market_id)
        .order_by(PredictionReport.created_at.desc(), PredictionReport.id.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
