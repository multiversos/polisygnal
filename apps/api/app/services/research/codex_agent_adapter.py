from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.prediction_report import PredictionReport
from app.models.research_finding import ResearchFinding
from app.models.research_run import ResearchRun
from app.repositories.evidence_items import list_market_evidence_items
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.repositories.prediction_reports import create_prediction_report
from app.repositories.predictions import create_prediction
from app.repositories.research_runs import (
    create_research_run,
    finalize_research_run,
    get_research_run_by_id,
)
from app.schemas.codex_agent_research import (
    CODEX_AGENT_OUTPUT_SCHEMA_VERSION,
    CodexAgentEvidenceResponse,
    CodexAgentExistingEvidencePayload,
    CodexAgentResearchRequest,
    CodexAgentResearchResponse,
    CodexAgentRiskResponse,
    CodexAgentSnapshotPayload,
)
from app.services.research.prompts import select_research_template
from app.services.research.scoring import ResearchScoringResult, score_codex_agent_research
from app.services.research.screener import ResearchScreeningDecision, screen_market_for_research

CODEX_AGENT_RESEARCH_MODE = "codex_agent"
CODEX_AGENT_MODEL_VERSION = "research_codex_agent_v1"
CODEX_AGENT_PREDICTION_FAMILY = "research_v1_codex_agent"
DEFAULT_REQUEST_DIR = REPO_ROOT / "logs" / "research-agent" / "requests"
DEFAULT_RESPONSE_DIR = REPO_ROOT / "logs" / "research-agent" / "responses"


@dataclass(slots=True)
class CodexAgentPreparedRequest:
    research_run: ResearchRun
    request_payload: CodexAgentResearchRequest
    request_path: Path
    prompt: str


@dataclass(slots=True)
class CodexAgentIngestResult:
    ok: bool
    research_run: ResearchRun
    response_path: Path
    prediction: Prediction | None = None
    report: PredictionReport | None = None
    findings: list[ResearchFinding] = field(default_factory=list)
    error_message: str | None = None


def prepare_codex_agent_research_request(
    db: Session,
    *,
    market: Market,
    output_dir: Path | str | None = None,
    sport_override: str | None = None,
    market_shape_override: str | None = None,
    started_at: datetime | None = None,
) -> CodexAgentPreparedRequest:
    current_started_at = started_at or datetime.now(tz=UTC)
    screening = _build_screening(
        market=market,
        sport_override=sport_override,
        market_shape_override=market_shape_override,
    )
    template = select_research_template(screening=screening)
    snapshot = get_latest_market_snapshot(db, market.id)
    research_run = create_research_run(
        db,
        market=market,
        status="pending_agent",
        vertical=screening.vertical,
        subvertical=screening.subvertical,
        market_shape=screening.market_shape,
        research_mode=CODEX_AGENT_RESEARCH_MODE,
        model_used="codex_agent_external",
        web_search_used=False,
        degraded_mode=False,
        started_at=current_started_at,
        metadata_json={
            "adapter": "codex_agent_research",
            "output_schema_version": CODEX_AGENT_OUTPUT_SCHEMA_VERSION,
            "research_template_name": template.name,
        },
    )
    request_payload = CodexAgentResearchRequest(
        run_id=research_run.id,
        market_id=market.id,
        market_question=market.question,
        market_slug=market.slug,
        event_title=market.event.title if market.event is not None else None,
        vertical=screening.vertical,
        sport=screening.subvertical,
        market_shape=screening.market_shape,
        current_market_yes_price=snapshot.yes_price if snapshot is not None else None,
        current_market_no_price=snapshot.no_price if snapshot is not None else None,
        liquidity=snapshot.liquidity if snapshot is not None else None,
        volume=snapshot.volume if snapshot is not None else None,
        close_time=market.end_date,
        latest_snapshot=_snapshot_payload(snapshot),
        existing_evidence=_existing_evidence_payload(db, market_id=market.id),
        research_template_name=template.name,
        instructions=_build_agent_instructions(template.instructions),
    )
    request_path = _resolve_artifact_path(
        output_dir or DEFAULT_REQUEST_DIR,
        f"{research_run.id}.json",
    )
    request_path.parent.mkdir(parents=True, exist_ok=True)
    request_path.write_text(
        json.dumps(request_payload.model_dump(mode="json"), indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    research_run.metadata_json = {
        **_metadata_dict(research_run.metadata_json),
        "request_path": str(request_path),
    }
    db.flush()
    return CodexAgentPreparedRequest(
        research_run=research_run,
        request_payload=request_payload,
        request_path=request_path,
        prompt=(
            "Usa Codex/ChatGPT como agente externo: lee este request JSON, investiga con "
            "fuentes publicas si corresponde, y escribe SOLO JSON valido con el schema "
            f"{CODEX_AGENT_OUTPUT_SCHEMA_VERSION} en "
            f"{DEFAULT_RESPONSE_DIR / f'{research_run.id}.json'}."
        ),
    )


def ingest_codex_agent_research_response(
    db: Session,
    *,
    run_id: int,
    response_path: Path | str | None = None,
    finished_at: datetime | None = None,
) -> CodexAgentIngestResult:
    current_finished_at = finished_at or datetime.now(tz=UTC)
    resolved_response_path = _resolve_artifact_path(
        response_path or DEFAULT_RESPONSE_DIR,
        f"{run_id}.json",
    )
    research_run = get_research_run_by_id(db, run_id)
    if research_run is None:
        raise ValueError(f"Research run {run_id} no encontrado.")

    try:
        response = CodexAgentResearchResponse.model_validate_json(
            resolved_response_path.read_text(encoding="utf-8-sig")
        )
        _validate_response_identity(research_run=research_run, response=response)
        snapshot = get_latest_market_snapshot(db, research_run.market_id)
        if snapshot is None or snapshot.yes_price is None:
            raise ValueError("No existe snapshot usable para ingestar codex_agent.")
    except (OSError, ValidationError, ValueError) as exc:
        error_message = f"Respuesta codex_agent invalida: {exc}"
        _mark_codex_run_failed(
            research_run=research_run,
            error_message=error_message,
            finished_at=current_finished_at,
            response_path=resolved_response_path,
        )
        db.flush()
        return CodexAgentIngestResult(
            ok=False,
            research_run=research_run,
            response_path=resolved_response_path,
            error_message=error_message,
        )

    findings = _create_findings_from_response(
        db,
        research_run=research_run,
        response=response,
    )
    scoring = score_codex_agent_research(
        market=research_run.market,
        snapshot=snapshot,
        findings=findings,
        market_summary=response.market_summary,
        participants=response.participants,
        confidence_score=response.confidence_score,
        recommended_probability_adjustment=response.recommended_probability_adjustment,
        final_reasoning=response.final_reasoning,
        recommendation=response.recommendation,
        risks=[item.model_dump(mode="json") for item in response.risks],
    )
    prediction = create_prediction(
        db,
        market_id=research_run.market_id,
        run_at=current_finished_at,
        model_version=CODEX_AGENT_MODEL_VERSION,
        prediction_family=CODEX_AGENT_PREDICTION_FAMILY,
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
    report = create_prediction_report(
        db,
        market_id=research_run.market_id,
        prediction_id=prediction.id,
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
            "adapter": "codex_agent_research",
        },
    )

    source_keys = {
        finding.citation_url or finding.source_name
        for finding in findings
        if finding.citation_url or finding.source_name
    }
    research_run.web_search_used = bool(source_keys)
    finalize_research_run(
        research_run,
        status="completed",
        finished_at=current_finished_at,
        total_sources_found=len(source_keys),
        total_sources_used=len(source_keys),
        confidence_score=scoring.confidence_score,
        error_message=None,
        metadata_json={
            **_metadata_dict(research_run.metadata_json),
            "response_path": str(resolved_response_path),
            "baseline_yes_probability": str(scoring.baseline_yes_probability),
            "adjusted_yes_probability": str(scoring.adjusted_yes_probability),
            "net_adjustment": str(scoring.net_adjustment),
        },
    )
    db.flush()
    return CodexAgentIngestResult(
        ok=True,
        research_run=research_run,
        response_path=resolved_response_path,
        prediction=prediction,
        report=report,
        findings=findings,
    )


def _build_screening(
    *,
    market: Market,
    sport_override: str | None,
    market_shape_override: str | None,
) -> ResearchScreeningDecision:
    screening = screen_market_for_research(market)
    if sport_override is None and market_shape_override is None:
        return screening
    return ResearchScreeningDecision(
        vertical=screening.vertical,
        subvertical=sport_override or screening.subvertical,
        market_shape=market_shape_override or screening.market_shape,
        should_research=screening.should_research,
        skip_reason=screening.skip_reason,
    )


def _snapshot_payload(snapshot: MarketSnapshot | None) -> CodexAgentSnapshotPayload | None:
    if snapshot is None:
        return None
    return CodexAgentSnapshotPayload(
        id=snapshot.id,
        captured_at=snapshot.captured_at,
        yes_price=snapshot.yes_price,
        no_price=snapshot.no_price,
        midpoint=snapshot.midpoint,
        last_trade_price=snapshot.last_trade_price,
        spread=snapshot.spread,
        volume=snapshot.volume,
        liquidity=snapshot.liquidity,
    )


def _existing_evidence_payload(
    db: Session,
    *,
    market_id: int,
) -> list[CodexAgentExistingEvidencePayload]:
    evidence_items = list_market_evidence_items(db, market_id=market_id)
    payload: list[CodexAgentExistingEvidencePayload] = []
    for item in evidence_items[:10]:
        source = item.source
        payload.append(
            CodexAgentExistingEvidencePayload(
                evidence_type=item.evidence_type,
                stance=item.stance,
                strength=item.strength,
                confidence=item.confidence,
                summary=item.summary,
                source_name=(source.title if source is not None else None),
                citation_url=(source.url if source is not None else None),
                published_at=(
                    source.published_at or source.fetched_at
                    if source is not None
                    else None
                ),
            )
        )
    return payload


def _build_agent_instructions(template_instructions: str) -> str:
    return (
        f"{template_instructions}\n\n"
        "Devuelve solo JSON valido. No inventes fuentes. Incluye evidencia a favor y "
        "en contra del YES. Separa hechos de inferencias en los claims. Incluye riesgos. "
        "Incluye citation_url cuando exista una fuente publica. Limita "
        "recommended_probability_adjustment a +/- 0.12. No recomiendes apuestas "
        "automaticas ni ejecucion de trades."
    )


def _create_findings_from_response(
    db: Session,
    *,
    research_run: ResearchRun,
    response: CodexAgentResearchResponse,
) -> list[ResearchFinding]:
    findings: list[ResearchFinding] = []
    for evidence in [*response.evidence_for_yes, *response.evidence_against_yes]:
        finding = _finding_from_evidence(
            research_run=research_run,
            evidence=evidence,
        )
        db.add(finding)
        findings.append(finding)
    db.flush()
    return findings


def _finding_from_evidence(
    *,
    research_run: ResearchRun,
    evidence: CodexAgentEvidenceResponse,
) -> ResearchFinding:
    return ResearchFinding(
        research_run_id=research_run.id,
        market_id=research_run.market_id,
        source_id=None,
        factor_type=evidence.factor_type,
        stance=evidence.stance,
        impact_score=evidence.impact_score,
        freshness_score=evidence.freshness_score,
        credibility_score=evidence.credibility_score,
        claim=evidence.claim,
        evidence_summary=evidence.reasoning,
        citation_url=evidence.citation_url,
        source_name=evidence.source_name,
        published_at=evidence.published_at,
        metadata_json={
            "provider": "codex_agent",
            "research_mode": CODEX_AGENT_RESEARCH_MODE,
            "output_schema_version": CODEX_AGENT_OUTPUT_SCHEMA_VERSION,
        },
    )


def _validate_response_identity(
    *,
    research_run: ResearchRun,
    response: CodexAgentResearchResponse,
) -> None:
    if response.run_id != research_run.id:
        raise ValueError(
            f"run_id no coincide: esperado {research_run.id}, recibido {response.run_id}."
        )
    if response.market_id != research_run.market_id:
        raise ValueError(
            "market_id no coincide: "
            f"esperado {research_run.market_id}, recibido {response.market_id}."
        )


def _mark_codex_run_failed(
    *,
    research_run: ResearchRun,
    error_message: str,
    finished_at: datetime,
    response_path: Path,
) -> None:
    finalize_research_run(
        research_run,
        status="failed",
        finished_at=finished_at,
        total_sources_found=0,
        total_sources_used=0,
        confidence_score=None,
        error_message=error_message,
        metadata_json={
            **_metadata_dict(research_run.metadata_json),
            "response_path": str(response_path),
        },
    )


def _resolve_artifact_path(path: Path | str, default_filename: str) -> Path:
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = REPO_ROOT / resolved
    if resolved.suffix.lower() != ".json":
        resolved = resolved / default_filename
    return resolved


def _metadata_dict(value: dict[str, object] | list[object] | None) -> dict[str, object]:
    if isinstance(value, dict):
        return dict(value)
    return {}
