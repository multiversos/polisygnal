from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.market import Market
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.repositories.evidence_items import list_market_evidence_items
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.repositories.prediction_reports import create_prediction_report
from app.repositories.predictions import create_prediction
from app.repositories.research_runs import create_research_run, finalize_research_run
from app.services.external_market import normalize_external_market_payload, parse_external_market_decimal
from app.services.research.openai_client import CheapResearchOutput, ResearchOpenAIClient
from app.services.research.scoring import (
    ResearchScoringResult,
    score_llm_research,
    score_local_research,
)
from app.services.research.screener import ResearchScreeningDecision, screen_market_for_research
from app.services.structured_context import (
    STRUCTURED_CONTEXT_COMPONENTS,
    normalize_structured_context_payload,
    parse_structured_context_decimal,
)

RESEARCH_LOCAL_MODEL_VERSION = "research_local_v1"
RESEARCH_LOCAL_PREDICTION_FAMILY = "research_v1_local"
RESEARCH_LLM_MODEL_VERSION = "research_llm_v1"
RESEARCH_LLM_PREDICTION_FAMILY = "research_v1_llm"
ZERO = Decimal("0")


@dataclass(slots=True)
class ResearchPipelineResult:
    research_run: ResearchRun
    report: PredictionReport | None = None
    prediction: Prediction | None = None
    findings: list[ResearchFinding] = field(default_factory=list)
    partial_errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ResearchBatchSummary:
    markets_considered: int = 0
    markets_processed: int = 0
    research_runs_created: int = 0
    reports_created: int = 0
    predictions_created: int = 0
    degraded_runs: int = 0
    partial_errors: list[str] = field(default_factory=list)


def run_market_research(
    db: Session,
    *,
    market: Market,
    settings: Settings,
    research_mode: str = "local_only",
    create_prediction_record: bool = True,
    run_at: datetime | None = None,
) -> ResearchPipelineResult:
    current_run_at = run_at or datetime.now(tz=UTC)
    screening = screen_market_for_research(market)
    partial_errors: list[str] = []
    requested_mode = research_mode
    effective_mode = research_mode
    degraded_mode = research_mode == "local_only"
    model_used: str | None = None
    web_search_used = False
    request_preview: dict[str, object] | None = None
    cheap_research_output: CheapResearchOutput | None = None
    run_error_message: str | None = None

    openai_client = ResearchOpenAIClient(settings=settings)
    try:
        snapshot = get_latest_market_snapshot(db, market.id)
        if research_mode == "cheap_research":
            if not openai_client.is_enabled:
                effective_mode = "local_only"
                degraded_mode = True
                run_error_message = "OPENAI_RESEARCH_ENABLED=false; cheap_research cae a local_only."
                partial_errors.append(run_error_message)
            elif not openai_client.is_configured:
                effective_mode = "local_only"
                degraded_mode = True
                run_error_message = (
                    "OPENAI_API_KEY ausente; cheap_research cae automaticamente a local_only."
                )
                partial_errors.append(run_error_message)
            elif snapshot is not None and snapshot.yes_price is not None:
                research_result = openai_client.run_cheap_research(
                    market=market,
                    snapshot=snapshot,
                    screening=screening,
                )
                model_used = research_result.model_used
                web_search_used = research_result.web_search_used
                request_preview = research_result.request_preview
                if research_result.ok and research_result.output is not None:
                    cheap_research_output = research_result.output
                    degraded_mode = False
                else:
                    effective_mode = "local_only"
                    degraded_mode = True
                    run_error_message = research_result.error_message or (
                        "OpenAI cheap_research fallo sin detalle; fallback local_only."
                    )
                    partial_errors.append(run_error_message)
                    partial_errors.extend(research_result.notes)
            else:
                degraded_mode = True
                run_error_message = "No existe snapshot usable para cheap_research."
                partial_errors.append(run_error_message)

        research_run = create_research_run(
            db,
            market=market,
            status="running",
            vertical=screening.vertical,
            subvertical=screening.subvertical,
            market_shape=screening.market_shape,
            research_mode=effective_mode,
            model_used=model_used,
            web_search_used=web_search_used,
            degraded_mode=degraded_mode,
            started_at=current_run_at,
            metadata_json={
                "requested_research_mode": requested_mode,
                "screening_should_research": screening.should_research,
                "screening_skip_reason": screening.skip_reason,
                "request_preview": request_preview,
            },
        )
        result = ResearchPipelineResult(
            research_run=research_run,
            partial_errors=partial_errors,
        )

        if snapshot is None or snapshot.yes_price is None:
            finalize_research_run(
                research_run,
                status="failed",
                finished_at=current_run_at,
                total_sources_found=0,
                total_sources_used=0,
                confidence_score=None,
                error_message=run_error_message or "No existe snapshot usable para research.",
                metadata_json=_build_run_metadata(
                    research_run=research_run,
                    partial_errors=partial_errors,
                    snapshot_id=None,
                ),
            )
            return result

        evidence_items: list[object] = []
        if cheap_research_output is not None:
            findings = _create_research_findings_from_llm(
                db,
                market=market,
                research_run=research_run,
                output=cheap_research_output,
            )
        else:
            evidence_items = (
                list_market_evidence_items(db, market_id=market.id)
                if screening.should_research
                else []
            )
            findings = _create_research_findings(
                db,
                market=market,
                research_run=research_run,
                screening=screening,
                evidence_items=evidence_items,
                baseline_yes_price=Decimal(snapshot.yes_price),
            )
        result.findings = findings

        if cheap_research_output is not None:
            scoring = score_llm_research(
                market=market,
                snapshot=snapshot,
                findings=findings,
                market_summary=cheap_research_output.market_summary,
                participants=cheap_research_output.participants,
                confidence_score=cheap_research_output.confidence_score,
                recommended_probability_adjustment=(
                    cheap_research_output.recommended_probability_adjustment
                ),
                final_reasoning=cheap_research_output.final_reasoning,
                recommendation=cheap_research_output.recommendation,
                risks=cheap_research_output.risks,
                model_used=model_used,
            )
            prediction_model_version = RESEARCH_LLM_MODEL_VERSION
            prediction_family = RESEARCH_LLM_PREDICTION_FAMILY
        else:
            scoring = score_local_research(
                market=market,
                snapshot=snapshot,
                findings=findings,
                degraded_mode=degraded_mode,
                market_shape=screening.market_shape,
                screening_skip_reason=screening.skip_reason,
            )
            prediction_model_version = RESEARCH_LOCAL_MODEL_VERSION
            prediction_family = RESEARCH_LOCAL_PREDICTION_FAMILY

        prediction = None
        if create_prediction_record:
            prediction = create_prediction(
                db,
                market_id=market.id,
                run_at=current_run_at,
                model_version=prediction_model_version,
                prediction_family=prediction_family,
                research_run_id=research_run.id,
                yes_probability=scoring.adjusted_yes_probability,
                no_probability=scoring.adjusted_no_probability,
                confidence_score=scoring.confidence_score,
                edge_signed=scoring.edge_signed,
                edge_magnitude=scoring.edge_magnitude,
                edge_class=scoring.edge_class,
                opportunity=scoring.opportunity,
                review_confidence=scoring.review_confidence,
                review_edge=scoring.review_edge,
                explanation_json=scoring.explanation_json,
                components_json=scoring.components_json,
            )
            result.prediction = prediction

        report = create_prediction_report(
            db,
            market_id=market.id,
            prediction_id=prediction.id if prediction is not None else None,
            research_run_id=research_run.id,
            thesis=scoring.thesis,
            evidence_for=scoring.evidence_for,
            evidence_against=scoring.evidence_against,
            risks=scoring.risks,
            final_reasoning=scoring.final_reasoning,
            recommendation=scoring.recommendation,
            metadata_json={
                "baseline_yes_probability": str(scoring.baseline_yes_probability),
                "adjusted_yes_probability": str(scoring.adjusted_yes_probability),
                "net_adjustment": str(scoring.net_adjustment),
            },
        )
        result.report = report

        total_sources_found = len({item.source_id for item in evidence_items})
        if cheap_research_output is not None:
            source_keys = {
                finding.citation_url or finding.source_name
                for finding in findings
                if finding.citation_url or finding.source_name
            }
            total_sources_found = len(source_keys)
            total_sources_used = len(source_keys)
        else:
            total_sources_used = len(
                {finding.source_id for finding in findings if finding.source_id is not None}
            )
        finalize_research_run(
            research_run,
            status="completed",
            finished_at=current_run_at,
            total_sources_found=total_sources_found,
            total_sources_used=total_sources_used,
            confidence_score=scoring.confidence_score,
            error_message=run_error_message,
            metadata_json=_build_run_metadata(
                research_run=research_run,
                partial_errors=partial_errors,
                snapshot_id=snapshot.id,
                scoring=scoring,
            ),
        )
        return result
    finally:
        openai_client.close()


def run_market_research_batch(
    db: Session,
    *,
    markets: list[Market],
    settings: Settings,
    research_mode: str = "local_only",
    create_prediction_record: bool = True,
    run_at: datetime | None = None,
) -> ResearchBatchSummary:
    current_run_at = run_at or datetime.now(tz=UTC)
    summary = ResearchBatchSummary(markets_considered=len(markets))

    for market in markets:
        try:
            with db.begin_nested():
                result = run_market_research(
                    db,
                    market=market,
                    settings=settings,
                    research_mode=research_mode,
                    create_prediction_record=create_prediction_record,
                    run_at=current_run_at,
                )
            summary.markets_processed += 1
            summary.research_runs_created += 1
            if result.report is not None:
                summary.reports_created += 1
            if result.prediction is not None:
                summary.predictions_created += 1
            if result.research_run.degraded_mode:
                summary.degraded_runs += 1
            summary.partial_errors.extend(result.partial_errors)
        except Exception as exc:
            summary.partial_errors.append(f"Market {market.id}: error ejecutando research: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        summary.partial_errors.append(f"Error confirmando research runs en base: {exc}")

    return summary


def _create_research_findings(
    db: Session,
    *,
    market: Market,
    research_run: ResearchRun,
    screening: ResearchScreeningDecision,
    evidence_items: list[object],
    baseline_yes_price: Decimal,
) -> list[ResearchFinding]:
    findings: list[ResearchFinding] = []
    for evidence_item in evidence_items:
        finding = ResearchFinding(
            research_run_id=research_run.id,
            market_id=market.id,
            source_id=evidence_item.source_id,
            factor_type=_resolve_factor_type(evidence_item=evidence_item),
            stance=_resolve_finding_stance(evidence_item=evidence_item),
            impact_score=_resolve_impact_score(
                evidence_item=evidence_item,
                baseline_yes_price=baseline_yes_price,
            ),
            freshness_score=_resolve_freshness_score(evidence_item=evidence_item),
            credibility_score=_resolve_credibility_score(evidence_item=evidence_item),
            claim=_build_claim(
                market=market,
                screening=screening,
                evidence_item=evidence_item,
            ),
            evidence_summary=evidence_item.summary,
            citation_url=evidence_item.source.url,
            source_name=evidence_item.source.title or evidence_item.provider,
            published_at=_resolve_published_at(evidence_item=evidence_item),
            metadata_json={
                "evidence_item_id": evidence_item.id,
                "evidence_type": evidence_item.evidence_type,
                "provider": evidence_item.provider,
            },
        )
        db.add(finding)
        findings.append(finding)

    db.flush()
    return findings


def _create_research_findings_from_llm(
    db: Session,
    *,
    market: Market,
    research_run: ResearchRun,
    output: CheapResearchOutput,
) -> list[ResearchFinding]:
    findings: list[ResearchFinding] = []
    for evidence in [*output.evidence_for_yes, *output.evidence_against_yes]:
        finding = ResearchFinding(
            research_run_id=research_run.id,
            market_id=market.id,
            source_id=None,
            factor_type=evidence.factor_type,
            stance=evidence.stance,
            impact_score=evidence.impact_score,
            freshness_score=evidence.freshness_score,
            credibility_score=evidence.credibility_score,
            claim=evidence.claim,
            evidence_summary=evidence.evidence_summary,
            citation_url=evidence.citation_url,
            source_name=evidence.source_name,
            published_at=evidence.published_at,
            metadata_json={
                "provider": "openai_web_search",
                "research_mode": "cheap_research",
                "participants": output.participants,
            },
        )
        db.add(finding)
        findings.append(finding)

    db.flush()
    return findings


def _resolve_factor_type(*, evidence_item: object) -> str:
    evidence_type = getattr(evidence_item, "evidence_type", "signal")
    if evidence_type == "odds":
        return "odds_consensus"
    if evidence_type == "news":
        return "news_context"
    return f"{evidence_type}_signal"


def _resolve_finding_stance(*, evidence_item: object) -> str:
    stance = str(getattr(evidence_item, "stance", "unknown") or "unknown")
    if stance in {"favor", "against", "neutral"}:
        return stance

    structured_context = normalize_structured_context_payload(
        getattr(evidence_item, "metadata_json", None)
    )
    context_sum = ZERO
    if structured_context is not None:
        for code in STRUCTURED_CONTEXT_COMPONENTS:
            availability = structured_context.get("availability")
            is_available = (
                bool(availability.get(code, False))
                if isinstance(availability, dict)
                else False
            )
            if not is_available:
                continue
            parsed_value = parse_structured_context_decimal(structured_context.get(code))
            if parsed_value is not None:
                context_sum += parsed_value

    if context_sum >= Decimal("0.0030"):
        return "favor"
    if context_sum <= Decimal("-0.0030"):
        return "against"
    return "unknown"


def _resolve_impact_score(
    *,
    evidence_item: object,
    baseline_yes_price: Decimal,
) -> Decimal:
    evidence_type = getattr(evidence_item, "evidence_type", "")
    if evidence_type == "odds":
        strength = getattr(evidence_item, "strength", None)
        if isinstance(strength, Decimal):
            delta = abs(strength - baseline_yes_price)
            external_market = normalize_external_market_payload(
                getattr(evidence_item, "metadata_json", None)
            )
            consensus_strength = ZERO
            if external_market is not None:
                parsed_consensus = parse_external_market_decimal(
                    external_market.get("consensus_strength")
                )
                if parsed_consensus is not None:
                    consensus_strength = min(max(parsed_consensus, ZERO), Decimal("1"))
            impact = Decimal("0.2000") + min(delta, Decimal("0.2500"))
            impact += consensus_strength * Decimal("0.2000")
            return _quantize_probability(impact)

    structured_context = normalize_structured_context_payload(
        getattr(evidence_item, "metadata_json", None)
    )
    if structured_context is not None:
        total = ZERO
        available_components = 0
        for code in STRUCTURED_CONTEXT_COMPONENTS:
            availability = structured_context.get("availability")
            is_available = (
                bool(availability.get(code, False))
                if isinstance(availability, dict)
                else False
            )
            if not is_available:
                continue
            parsed_value = parse_structured_context_decimal(structured_context.get(code))
            if parsed_value is not None:
                available_components += 1
                total += abs(parsed_value)
        if available_components > 0:
            scaled_total = Decimal("0.2500") + (total * Decimal("10"))
            return _quantize_probability(min(scaled_total, Decimal("0.7500")))

    confidence = getattr(evidence_item, "confidence", None)
    if isinstance(confidence, Decimal):
        return _quantize_probability(
            Decimal("0.2000") + min(confidence / Decimal("2"), Decimal("0.5000"))
        )
    return Decimal("0.2500")


def _resolve_freshness_score(*, evidence_item: object) -> Decimal:
    published_at = _resolve_published_at(evidence_item=evidence_item)
    if published_at is None:
        return Decimal("0.3000")
    now = datetime.now(tz=UTC)
    age_hours = max((now - published_at).total_seconds() / 3600, 0)
    if age_hours <= 6:
        return Decimal("1.0000")
    if age_hours <= 24:
        return Decimal("0.8500")
    if age_hours <= 72:
        return Decimal("0.6000")
    if age_hours <= 168:
        return Decimal("0.4000")
    return Decimal("0.2000")


def _resolve_credibility_score(*, evidence_item: object) -> Decimal:
    provider = str(getattr(evidence_item, "provider", "") or "")
    provider_base = {
        "the_odds_api": Decimal("0.8500"),
        "espn_rss": Decimal("0.7500"),
    }.get(provider, Decimal("0.6000"))
    confidence = getattr(evidence_item, "confidence", None)
    if isinstance(confidence, Decimal):
        provider_base = (provider_base + min(confidence, Decimal("1.0000"))) / Decimal("2")
    if bool(getattr(evidence_item, "high_contradiction", False)):
        provider_base -= Decimal("0.1500")
    return _quantize_probability(provider_base)


def _build_claim(
    *,
    market: Market,
    screening: ResearchScreeningDecision,
    evidence_item: object,
) -> str:
    evidence_type = getattr(evidence_item, "evidence_type", "")
    if evidence_type == "odds" and getattr(evidence_item, "strength", None) is not None:
        return (
            f"Odds externas para '{market.question}' implican una lectura "
            f"{getattr(evidence_item, 'stance', 'unknown')} con fuerza "
            f"{getattr(evidence_item, 'strength')}."
        )
    return (
        f"Fuente {getattr(evidence_item, 'provider', 'unknown')} aporta contexto "
        f"{screening.market_shape} para '{market.question}'."
    )


def _resolve_published_at(*, evidence_item: object) -> datetime | None:
    source = getattr(evidence_item, "source", None)
    if source is None:
        return None
    timestamp = source.published_at or source.fetched_at or source.created_at
    if timestamp is None:
        return None
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=UTC)
    return timestamp


def _build_run_metadata(
    *,
    research_run: ResearchRun,
    partial_errors: list[str],
    snapshot_id: int | None,
    scoring: ResearchScoringResult | None = None,
) -> dict[str, object]:
    metadata: dict[str, object] = {
        "requested_research_mode": research_run.metadata_json.get("requested_research_mode")
        if isinstance(research_run.metadata_json, dict)
        else None,
        "partial_errors": partial_errors,
        "snapshot_id": snapshot_id,
    }
    if isinstance(research_run.metadata_json, dict):
        metadata["request_preview"] = research_run.metadata_json.get("request_preview")
        metadata["screening_should_research"] = research_run.metadata_json.get(
            "screening_should_research"
        )
        metadata["screening_skip_reason"] = research_run.metadata_json.get(
            "screening_skip_reason"
        )
    if scoring is not None:
        metadata["baseline_yes_probability"] = str(scoring.baseline_yes_probability)
        metadata["adjusted_yes_probability"] = str(scoring.adjusted_yes_probability)
        metadata["net_adjustment"] = str(scoring.net_adjustment)
    return metadata


def _quantize_probability(value: Decimal) -> Decimal:
    return min(max(value, Decimal("0.0000")), Decimal("1.0000")).quantize(Decimal("0.0001"))
