from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal
from urllib.parse import urlparse

from pydantic import ValidationError

from app.schemas.codex_agent_research import CodexAgentResearchResponse

ValidationSeverity = Literal["pass", "warning", "failed"]
ValidationAction = Literal["ingest", "review_required", "reject"]

MINIMUM_SOURCE_QUALITY_FOR_INGEST = Decimal("0.5000")
MINIMUM_EVIDENCE_BALANCE_FOR_INGEST = Decimal("0.5000")
AGGRESSIVE_ADJUSTMENT_THRESHOLD = Decimal("0.0800")


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str

    def to_payload(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


@dataclass(frozen=True, slots=True)
class ValidationReport:
    is_valid: bool
    severity: ValidationSeverity
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)
    source_quality_score: Decimal = Decimal("0.0000")
    evidence_balance_score: Decimal = Decimal("0.0000")
    confidence_adjusted: Decimal = Decimal("0.0000")
    recommended_action: ValidationAction = "reject"

    def to_payload(self) -> dict[str, object]:
        return {
            "is_valid": self.is_valid,
            "severity": self.severity,
            "errors": [item.to_payload() for item in self.errors],
            "warnings": [item.to_payload() for item in self.warnings],
            "source_quality_score": str(self.source_quality_score),
            "evidence_balance_score": str(self.evidence_balance_score),
            "confidence_adjusted": str(self.confidence_adjusted),
            "recommended_action": self.recommended_action,
        }


@dataclass(frozen=True, slots=True)
class CodexValidationResult:
    response: CodexAgentResearchResponse | None
    report: ValidationReport


def validate_codex_agent_response_text(
    raw_json: str,
    *,
    expected_run_id: int,
    expected_market_id: int,
) -> CodexValidationResult:
    try:
        response = CodexAgentResearchResponse.model_validate_json(raw_json)
    except ValidationError as exc:
        return CodexValidationResult(
            response=None,
            report=ValidationReport(
                is_valid=False,
                severity="failed",
                errors=[
                    ValidationIssue(
                        code="schema_validation_failed",
                        message=str(exc),
                    )
                ],
                recommended_action="reject",
            ),
        )
    return CodexValidationResult(
        response=response,
        report=validate_codex_agent_response(
            response,
            expected_run_id=expected_run_id,
            expected_market_id=expected_market_id,
        ),
    )


def validate_codex_agent_response(
    response: CodexAgentResearchResponse,
    *,
    expected_run_id: int,
    expected_market_id: int,
) -> ValidationReport:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    if response.run_id != expected_run_id:
        errors.append(
            ValidationIssue(
                code="run_id_mismatch",
                message=f"expected {expected_run_id}, received {response.run_id}",
            )
        )
    if response.market_id != expected_market_id:
        errors.append(
            ValidationIssue(
                code="market_id_mismatch",
                message=f"expected {expected_market_id}, received {response.market_id}",
            )
        )

    evidence = [*response.evidence_for_yes, *response.evidence_against_yes]
    if not evidence:
        errors.append(
            ValidationIssue(
                code="missing_evidence",
                message="response must include at least one evidence item",
            )
        )
    if not response.evidence_for_yes:
        warnings.append(
            ValidationIssue(
                code="missing_evidence_for_yes",
                message="response has no evidence_for_yes items",
            )
        )
    if not response.evidence_against_yes:
        warnings.append(
            ValidationIssue(
                code="missing_evidence_against_yes",
                message="response has no evidence_against_yes items",
            )
        )

    source_quality_score, source_warnings = _validate_sources(response)
    warnings.extend(source_warnings)
    evidence_balance_score = _score_evidence_balance(response)
    confidence_adjusted = _adjust_confidence(
        response=response,
        source_quality_score=source_quality_score,
        evidence_balance_score=evidence_balance_score,
    )

    if response.research_mode == "mock_structural":
        warnings.append(
            ValidationIssue(
                code="mock_structural_response",
                message="mock_structural responses require explicit review before ingest",
            )
        )
    if response.research_mode == "manual":
        warnings.append(
            ValidationIssue(
                code="manual_response",
                message="manual responses require explicit human review before ingest",
            )
        )
    if response.source_review_required:
        warnings.append(
            ValidationIssue(
                code="source_review_requested",
                message="response explicitly requested source review",
            )
        )
    if response.research_mode == "real_web" and source_quality_score < Decimal("0.5000"):
        warnings.append(
            ValidationIssue(
                code="low_source_quality_for_real_web",
                message="real_web response has weak citation coverage or URL quality",
            )
        )
    if (
        abs(response.recommended_probability_adjustment) >= AGGRESSIVE_ADJUSTMENT_THRESHOLD
        and source_quality_score < Decimal("0.7000")
    ):
        warnings.append(
            ValidationIssue(
                code="aggressive_adjustment_with_weak_sources",
                message="large adjustment requires stronger source quality",
            )
        )
    if response.confidence_score >= Decimal("0.8000") and confidence_adjusted < response.confidence_score:
        warnings.append(
            ValidationIssue(
                code="confidence_adjusted_down",
                message="confidence_score was high relative to source/evidence quality",
            )
        )

    recommended_action = _recommended_action(
        errors=errors,
        warnings=warnings,
        response=response,
        source_quality_score=source_quality_score,
        evidence_balance_score=evidence_balance_score,
    )
    severity: ValidationSeverity
    if errors:
        severity = "failed"
    elif recommended_action == "review_required":
        severity = "warning"
    else:
        severity = "pass"

    return ValidationReport(
        is_valid=not errors and recommended_action != "reject",
        severity=severity,
        errors=errors,
        warnings=warnings,
        source_quality_score=source_quality_score,
        evidence_balance_score=evidence_balance_score,
        confidence_adjusted=confidence_adjusted,
        recommended_action=recommended_action,
    )


def _validate_sources(
    response: CodexAgentResearchResponse,
) -> tuple[Decimal, list[ValidationIssue]]:
    warnings: list[ValidationIssue] = []
    evidence = [*response.evidence_for_yes, *response.evidence_against_yes]
    if not evidence:
        return Decimal("0.0000"), warnings

    citation_count = 0
    valid_url_count = 0
    duplicate_urls: set[str] = set()
    seen_urls: set[str] = set()

    for index, item in enumerate(evidence):
        citation = (item.citation_url or "").strip()
        source_name = (item.source_name or "").strip()
        if not citation:
            continue
        citation_count += 1
        if not source_name:
            warnings.append(
                ValidationIssue(
                    code="source_name_missing_for_citation",
                    message=f"evidence item {index} has citation_url without source_name",
                )
            )
        if _looks_like_url(citation):
            valid_url_count += 1
        else:
            warnings.append(
                ValidationIssue(
                    code="malformed_citation_url",
                    message=f"evidence item {index} has malformed citation_url",
                )
            )
        if citation in seen_urls:
            duplicate_urls.add(citation)
        seen_urls.add(citation)

    citation_ratio = Decimal(citation_count) / Decimal(len(evidence))
    valid_ratio = Decimal(valid_url_count) / Decimal(len(evidence))
    unique_ratio = (
        Decimal(len(seen_urls) - len(duplicate_urls)) / Decimal(len(seen_urls))
        if seen_urls
        else Decimal("0.0000")
    )
    if duplicate_urls:
        warnings.append(
            ValidationIssue(
                code="duplicate_citation_urls",
                message=f"duplicate citation URLs detected: {len(duplicate_urls)}",
            )
        )
    if response.research_mode == "real_web" and citation_ratio <= Decimal("0.5000"):
        warnings.append(
            ValidationIssue(
                code="low_citation_coverage",
                message="real_web response should cite a majority of evidence items",
            )
        )
    if citation_count == 0:
        warnings.append(
            ValidationIssue(
                code="no_citations",
                message="response has no citation_url values",
            )
        )

    score = ((citation_ratio * Decimal("0.4000")) + (valid_ratio * Decimal("0.5000")))
    if seen_urls:
        score += unique_ratio * Decimal("0.1000")
    return _quantize_score(max(Decimal("0.0000"), min(score, Decimal("1.0000")))), warnings


def _score_evidence_balance(response: CodexAgentResearchResponse) -> Decimal:
    for_count = len(response.evidence_for_yes)
    against_count = len(response.evidence_against_yes)
    total = for_count + against_count
    if total == 0:
        return Decimal("0.0000")
    if for_count and against_count:
        minority = min(for_count, against_count)
        return _quantize_score(Decimal("0.5000") + (Decimal(minority) / Decimal(total)))
    return Decimal("0.2500")


def _adjust_confidence(
    *,
    response: CodexAgentResearchResponse,
    source_quality_score: Decimal,
    evidence_balance_score: Decimal,
) -> Decimal:
    ceiling = min(
        Decimal("1.0000"),
        Decimal("0.3000") + (source_quality_score * Decimal("0.4500")) + (
            evidence_balance_score * Decimal("0.2500")
        ),
    )
    if response.research_mode == "mock_structural":
        ceiling = min(ceiling, Decimal("0.3500"))
    if response.research_mode == "manual":
        ceiling = min(ceiling, Decimal("0.5000"))
    return _quantize_score(min(response.confidence_score, ceiling))


def _recommended_action(
    *,
    errors: list[ValidationIssue],
    warnings: list[ValidationIssue],
    response: CodexAgentResearchResponse,
    source_quality_score: Decimal,
    evidence_balance_score: Decimal,
) -> ValidationAction:
    if errors:
        return "reject"
    if response.research_mode in {"mock_structural", "manual"}:
        return "review_required"
    if source_quality_score < Decimal("0.2500"):
        return "reject"
    if (
        response.research_mode == "real_web"
        and source_quality_score < MINIMUM_SOURCE_QUALITY_FOR_INGEST
    ):
        return "review_required"
    if evidence_balance_score < MINIMUM_EVIDENCE_BALANCE_FOR_INGEST:
        return "review_required"
    if response.source_review_required or warnings:
        return "review_required"
    return "ingest"


def _looks_like_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _quantize_score(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"))
