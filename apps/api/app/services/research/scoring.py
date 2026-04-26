from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.research_finding import ResearchFinding

ZERO = Decimal("0")
ONE = Decimal("1")
PROBABILITY_SCALE = Decimal("0.0001")
MAX_TOTAL_ADJUSTMENT = Decimal("0.1200")
FINDING_MULTIPLIER = Decimal("0.0800")
MIN_RESEARCH_PROBABILITY = Decimal("0.0100")
MAX_RESEARCH_PROBABILITY = Decimal("0.9900")
MATCH_WINNER_SHAPES = {"matchup", "match_winner"}


@dataclass(slots=True)
class ResearchScoringResult:
    baseline_yes_probability: Decimal
    adjusted_yes_probability: Decimal
    adjusted_no_probability: Decimal
    confidence_score: Decimal
    net_adjustment: Decimal
    edge_signed: Decimal
    edge_magnitude: Decimal
    edge_class: str
    opportunity: bool
    review_confidence: bool
    review_edge: bool
    recommendation: str
    thesis: str
    final_reasoning: str
    evidence_for: list[dict[str, object]]
    evidence_against: list[dict[str, object]]
    risks: list[dict[str, object]]
    explanation_json: dict[str, object]
    components_json: dict[str, object]


def score_local_research(
    *,
    market: Market,
    snapshot: MarketSnapshot,
    findings: list[ResearchFinding],
    degraded_mode: bool,
    market_shape: str,
    screening_skip_reason: str | None,
) -> ResearchScoringResult:
    baseline_yes_probability = _quantize_probability(snapshot.yes_price or ZERO)

    contributions: list[dict[str, object]] = []
    for finding in findings:
        weighted_strength = _weighted_strength(finding)
        contribution = _quantize_signed(
            _stance_sign(finding.stance) * weighted_strength * FINDING_MULTIPLIER
        )
        contributions.append(
            {
                "finding": finding,
                "weighted_strength": weighted_strength,
                "contribution": contribution,
            }
        )

    raw_adjustment = sum(
        (item["contribution"] for item in contributions),
        start=ZERO,
    )
    net_adjustment = _quantize_signed(
        max(min(raw_adjustment, MAX_TOTAL_ADJUSTMENT), ZERO - MAX_TOTAL_ADJUSTMENT)
    )
    adjusted_yes_probability = _quantize_probability(baseline_yes_probability + net_adjustment)
    adjusted_no_probability = _quantize_probability(ONE - adjusted_yes_probability)
    edge_signed = _quantize_signed(adjusted_yes_probability - baseline_yes_probability)
    edge_magnitude = _quantize_probability(abs(edge_signed))
    edge_class = _classify_edge(edge_magnitude)
    confidence_score = _compute_confidence(
        contributions=contributions,
        degraded_mode=degraded_mode,
        market_shape=market_shape,
    )
    opportunity = edge_magnitude >= Decimal("0.0500") and confidence_score >= Decimal("0.4500")
    review_confidence = confidence_score >= Decimal("0.8000")
    review_edge = edge_magnitude > Decimal("0.1500")
    recommendation = _build_recommendation(
        adjusted_yes_probability=adjusted_yes_probability,
        baseline_yes_probability=baseline_yes_probability,
        confidence_score=confidence_score,
        edge_magnitude=edge_magnitude,
    )

    evidence_for = _serialize_contributions(
        [item for item in contributions if item["contribution"] > ZERO]
    )
    evidence_against = _serialize_contributions(
        [item for item in contributions if item["contribution"] < ZERO]
    )
    risks = _build_risks(
        findings=findings,
        degraded_mode=degraded_mode,
        market_shape=market_shape,
        screening_skip_reason=screening_skip_reason,
    )

    thesis = (
        f"Local research mantiene baseline cerca de {baseline_yes_probability} "
        f"y ajusta a {adjusted_yes_probability}."
    )
    final_reasoning = (
        f"Baseline Polymarket {baseline_yes_probability}. "
        f"Ajuste neto {net_adjustment} usando {len(findings)} finding(s) locales. "
        f"Confidence {confidence_score}."
    )
    explanation_json = {
        "summary": thesis,
        "mode": "local_only",
        "baseline_yes_probability": str(baseline_yes_probability),
        "adjusted_yes_probability": str(adjusted_yes_probability),
        "net_adjustment": str(net_adjustment),
        "counts": {
            "findings_count": len(findings),
            "evidence_for_count": len(evidence_for),
            "evidence_against_count": len(evidence_against),
        },
        "risks": risks,
    }
    components_json = {
        "baseline_yes_probability": str(baseline_yes_probability),
        "adjusted_yes_probability": str(adjusted_yes_probability),
        "adjusted_no_probability": str(adjusted_no_probability),
        "net_adjustment": str(net_adjustment),
        "confidence_score": str(confidence_score),
        "findings": [
            {
                "finding_id": item["finding"].id,
                "factor_type": item["finding"].factor_type,
                "stance": item["finding"].stance,
                "impact_score": str(item["finding"].impact_score),
                "freshness_score": str(item["finding"].freshness_score),
                "credibility_score": str(item["finding"].credibility_score),
                "weighted_strength": str(item["weighted_strength"]),
                "contribution": str(item["contribution"]),
            }
            for item in contributions
        ],
    }

    return ResearchScoringResult(
        baseline_yes_probability=baseline_yes_probability,
        adjusted_yes_probability=adjusted_yes_probability,
        adjusted_no_probability=adjusted_no_probability,
        confidence_score=confidence_score,
        net_adjustment=net_adjustment,
        edge_signed=edge_signed,
        edge_magnitude=edge_magnitude,
        edge_class=edge_class,
        opportunity=opportunity,
        review_confidence=review_confidence,
        review_edge=review_edge,
        recommendation=recommendation,
        thesis=thesis,
        final_reasoning=final_reasoning,
        evidence_for=evidence_for,
        evidence_against=evidence_against,
        risks=risks,
        explanation_json=explanation_json,
        components_json=components_json,
    )


def score_llm_research(
    *,
    market: Market,
    snapshot: MarketSnapshot,
    findings: list[ResearchFinding],
    market_summary: str,
    participants: list[str],
    confidence_score: Decimal,
    recommended_probability_adjustment: Decimal,
    final_reasoning: str,
    recommendation: str,
    risks: list[dict[str, object]],
    model_used: str | None,
) -> ResearchScoringResult:
    baseline_yes_probability = _quantize_research_probability(snapshot.yes_price or ZERO)
    net_adjustment = _quantize_signed(
        max(
            min(recommended_probability_adjustment, MAX_TOTAL_ADJUSTMENT),
            ZERO - MAX_TOTAL_ADJUSTMENT,
        )
    )
    adjusted_yes_probability = _quantize_research_probability(
        baseline_yes_probability + net_adjustment
    )
    adjusted_no_probability = _quantize_probability(ONE - adjusted_yes_probability)
    market_yes_price = _quantize_research_probability(snapshot.yes_price or ZERO)
    edge_signed = _quantize_signed(adjusted_yes_probability - market_yes_price)
    edge_magnitude = _quantize_probability(abs(edge_signed))
    normalized_confidence = _quantize_probability(confidence_score)
    edge_class = _classify_edge(edge_magnitude)
    opportunity = edge_magnitude >= Decimal("0.0500") and normalized_confidence >= Decimal("0.4500")
    review_confidence = normalized_confidence >= Decimal("0.8000")
    review_edge = edge_magnitude > MAX_TOTAL_ADJUSTMENT

    evidence_for = _serialize_findings([item for item in findings if item.stance == "favor"])
    evidence_against = _serialize_findings(
        [item for item in findings if item.stance == "against"]
    )
    thesis = (
        f"{market_summary} Baseline Polymarket {baseline_yes_probability}; "
        f"research_v1_llm ajusta a {adjusted_yes_probability}."
    )
    explanation_json = {
        "summary": thesis,
        "mode": "cheap_research",
        "model_used": model_used,
        "baseline_yes_probability": str(baseline_yes_probability),
        "adjusted_yes_probability": str(adjusted_yes_probability),
        "net_adjustment": str(net_adjustment),
        "confidence_score": str(normalized_confidence),
        "recommendation": recommendation,
        "participants": participants,
        "counts": {
            "findings_count": len(findings),
            "evidence_for_count": len(evidence_for),
            "evidence_against_count": len(evidence_against),
        },
        "risks": risks,
    }
    components_json = {
        "baseline_yes_probability": str(baseline_yes_probability),
        "market_yes_price": str(market_yes_price),
        "recommended_probability_adjustment": str(net_adjustment),
        "adjusted_yes_probability": str(adjusted_yes_probability),
        "adjusted_no_probability": str(adjusted_no_probability),
        "edge_signed": str(edge_signed),
        "edge_magnitude": str(edge_magnitude),
        "confidence_score": str(normalized_confidence),
        "confidence_is_evidence_quality": True,
        "participants": participants,
        "findings": [
            {
                "finding_id": finding.id,
                "factor_type": finding.factor_type,
                "stance": finding.stance,
                "impact_score": str(finding.impact_score),
                "freshness_score": str(finding.freshness_score),
                "credibility_score": str(finding.credibility_score),
                "claim": finding.claim,
                "citation_url": finding.citation_url,
            }
            for finding in findings
        ],
    }

    return ResearchScoringResult(
        baseline_yes_probability=baseline_yes_probability,
        adjusted_yes_probability=adjusted_yes_probability,
        adjusted_no_probability=adjusted_no_probability,
        confidence_score=normalized_confidence,
        net_adjustment=net_adjustment,
        edge_signed=edge_signed,
        edge_magnitude=edge_magnitude,
        edge_class=edge_class,
        opportunity=opportunity,
        review_confidence=review_confidence,
        review_edge=review_edge,
        recommendation=recommendation,
        thesis=thesis,
        final_reasoning=final_reasoning,
        evidence_for=evidence_for,
        evidence_against=evidence_against,
        risks=risks,
        explanation_json=explanation_json,
        components_json=components_json,
    )


def score_codex_agent_research(
    *,
    market: Market,
    snapshot: MarketSnapshot,
    findings: list[ResearchFinding],
    market_summary: str,
    participants: list[str],
    confidence_score: Decimal,
    recommended_probability_adjustment: Decimal,
    final_reasoning: str,
    recommendation: str,
    risks: list[dict[str, object]],
) -> ResearchScoringResult:
    scoring = score_llm_research(
        market=market,
        snapshot=snapshot,
        findings=findings,
        market_summary=market_summary,
        participants=participants,
        confidence_score=confidence_score,
        recommended_probability_adjustment=recommended_probability_adjustment,
        final_reasoning=final_reasoning,
        recommendation=recommendation,
        risks=risks,
        model_used="codex_agent_external",
    )
    scoring.explanation_json["mode"] = "codex_agent"
    scoring.explanation_json["model_used"] = "codex_agent_external"
    scoring.components_json["research_mode"] = "codex_agent"
    scoring.components_json["model_used"] = "codex_agent_external"
    return scoring


def _weighted_strength(finding: ResearchFinding) -> Decimal:
    return _quantize_probability(
        finding.impact_score * finding.freshness_score * finding.credibility_score
    )


def _compute_confidence(
    *,
    contributions: list[dict[str, object]],
    degraded_mode: bool,
    market_shape: str,
) -> Decimal:
    if not contributions:
        confidence = Decimal("0.2500")
    else:
        weighted = [
            item["weighted_strength"]
            for item in contributions
            if isinstance(item["weighted_strength"], Decimal)
        ]
        avg_strength = sum(weighted, start=ZERO) / Decimal(len(weighted))
        confidence = Decimal("0.3000") + (avg_strength * Decimal("0.4500"))
        confidence += Decimal("0.0500") * Decimal(min(len(weighted), 3))
        has_for = any(item["contribution"] > ZERO for item in contributions)
        has_against = any(item["contribution"] < ZERO for item in contributions)
        if has_for and has_against:
            confidence += Decimal("0.0500")

    if market_shape not in MATCH_WINNER_SHAPES:
        confidence *= Decimal("0.8500")
    if degraded_mode:
        confidence = min(confidence, Decimal("0.7800"))
    return _quantize_probability(confidence)


def _build_recommendation(
    *,
    adjusted_yes_probability: Decimal,
    baseline_yes_probability: Decimal,
    confidence_score: Decimal,
    edge_magnitude: Decimal,
) -> str:
    if edge_magnitude < Decimal("0.0300") or confidence_score < Decimal("0.3500"):
        return "hold"
    if adjusted_yes_probability > baseline_yes_probability:
        return "lean_yes"
    return "lean_no"


def _build_risks(
    *,
    findings: list[ResearchFinding],
    degraded_mode: bool,
    market_shape: str,
    screening_skip_reason: str | None,
) -> list[dict[str, object]]:
    risks: list[dict[str, object]] = []
    if degraded_mode:
        risks.append(
            {
                "code": "degraded_mode",
                "summary": "Research corrio sin OpenAI/web_search y depende solo de datos locales.",
            }
        )
    if not findings:
        risks.append(
            {
                "code": "limited_evidence",
                "summary": "No existe evidencia local util para ajustar con conviccion.",
            }
        )
    if market_shape not in MATCH_WINNER_SHAPES:
        risks.append(
            {
                "code": "non_matchup_shape",
                "summary": f"Market shape actual {market_shape} tiene menos soporte en el MVP.",
            }
        )
    if screening_skip_reason:
        risks.append(
            {
                "code": "screening_skip_reason",
                "summary": screening_skip_reason,
            }
        )
    if any(finding.freshness_score < Decimal("0.5000") for finding in findings):
        risks.append(
            {
                "code": "stale_evidence",
                "summary": "Parte de la evidencia local ya no es fresca.",
            }
        )
    if any(finding.credibility_score < Decimal("0.5000") for finding in findings):
        risks.append(
            {
                "code": "low_credibility",
                "summary": "Hay findings con credibilidad limitada.",
            }
        )
    return risks


def _serialize_contributions(items: list[dict[str, object]]) -> list[dict[str, object]]:
    ordered = sorted(
        items,
        key=lambda item: abs(item["contribution"]),
        reverse=True,
    )
    return [
        {
            "finding_id": item["finding"].id,
            "factor_type": item["finding"].factor_type,
            "stance": item["finding"].stance,
            "claim": item["finding"].claim,
            "evidence_summary": item["finding"].evidence_summary,
            "source_name": item["finding"].source_name,
            "citation_url": item["finding"].citation_url,
            "impact_score": str(item["finding"].impact_score),
            "freshness_score": str(item["finding"].freshness_score),
            "credibility_score": str(item["finding"].credibility_score),
            "weighted_strength": str(item["weighted_strength"]),
            "contribution": str(item["contribution"]),
        }
        for item in ordered[:3]
    ]


def _serialize_findings(findings: list[ResearchFinding]) -> list[dict[str, object]]:
    ordered = sorted(
        findings,
        key=lambda finding: finding.impact_score * finding.freshness_score * finding.credibility_score,
        reverse=True,
    )
    return [
        {
            "finding_id": finding.id,
            "factor_type": finding.factor_type,
            "stance": finding.stance,
            "claim": finding.claim,
            "evidence_summary": finding.evidence_summary,
            "source_name": finding.source_name,
            "citation_url": finding.citation_url,
            "published_at": finding.published_at.isoformat() if finding.published_at else None,
            "impact_score": str(finding.impact_score),
            "freshness_score": str(finding.freshness_score),
            "credibility_score": str(finding.credibility_score),
        }
        for finding in ordered[:5]
    ]


def _classify_edge(edge_magnitude: Decimal) -> str:
    if edge_magnitude < Decimal("0.0500"):
        return "no_signal"
    if edge_magnitude <= Decimal("0.1200"):
        return "moderate"
    if edge_magnitude <= Decimal("0.2500"):
        return "strong"
    return "review"


def _stance_sign(stance: str) -> Decimal:
    if stance == "favor":
        return ONE
    if stance == "against":
        return ZERO - ONE
    return ZERO


def _quantize_probability(value: Decimal | None) -> Decimal:
    if value is None:
        return ZERO
    clamped = max(min(value, ONE), ZERO)
    return clamped.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _quantize_research_probability(value: Decimal | None) -> Decimal:
    if value is None:
        return MIN_RESEARCH_PROBABILITY
    clamped = max(min(value, MAX_RESEARCH_PROBABILITY), MIN_RESEARCH_PROBABILITY)
    return clamped.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _quantize_signed(value: Decimal) -> Decimal:
    return value.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)
