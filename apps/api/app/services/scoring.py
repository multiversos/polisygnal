from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.evidence_item import EvidenceItem
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.repositories.evidence_items import list_market_evidence_items
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.repositories.markets import list_nba_winner_evidence_candidates
from app.repositories.predictions import create_prediction
from app.services.external_market import (
    LINE_MOVEMENT_SCORE_CAP,
    normalize_external_market_payload,
    parse_external_market_decimal,
    quantize_consensus_strength,
    quantize_line_movement_score,
)
from app.services.nba_team_matching import assess_market_for_evidence
from app.services.structured_context import (
    STRUCTURED_CONTEXT_COMPONENTS,
    STRUCTURED_CONTEXT_COMPONENT_CAP,
    STRUCTURED_CONTEXT_TOTAL_CAP,
    normalize_structured_context_payload,
    parse_structured_context_decimal,
)

PROBABILITY_SCALE = Decimal("0.0001")
CONFIDENCE_SCALE = Decimal("0.0001")
ONE = Decimal("1")
ZERO = Decimal("0")


@dataclass(slots=True)
class BonusApplied:
    code: str
    value: Decimal
    reason: str


@dataclass(slots=True)
class PenaltyApplied:
    code: str
    multiplier: Decimal
    reason: str


@dataclass(slots=True)
class DataQualityComponent:
    code: str
    weight: Decimal
    value: Decimal
    applied: bool
    note: str


@dataclass(slots=True)
class DataQualityResult:
    score: Decimal
    components: list[DataQualityComponent]


@dataclass(slots=True)
class ActionScoreComponent:
    code: str
    weight: Decimal
    value: Decimal
    applied: bool
    note: str


@dataclass(slots=True)
class ActionScoreResult:
    score: Decimal
    components: list[ActionScoreComponent]


@dataclass(slots=True)
class StructuredContextComponent:
    code: str
    value: Decimal
    available: bool
    source: str | None
    note: str


@dataclass(slots=True)
class ExternalMarketContext:
    opening_implied_prob: Decimal | None
    current_implied_prob: Decimal | None
    line_movement_score: Decimal
    consensus_strength: Decimal
    available: bool
    source: str | None
    note: str
    field_availability: dict[str, bool]
    field_reasons: dict[str, str]


@dataclass(slots=True)
class ScoringContext:
    snapshot: MarketSnapshot
    evidence_eligible: bool
    evidence_shape: str
    evidence_skip_reason: str | None
    usable_odds: list[EvidenceItem]
    usable_news: list[EvidenceItem]
    distinct_providers: set[str]
    latest_evidence_at: datetime | None
    has_high_contradiction: bool
    structured_context_components: dict[str, StructuredContextComponent]
    external_market_context: ExternalMarketContext
    odds_implied_prob: Decimal | None
    odds_bookmaker_count: int | None


@dataclass(slots=True)
class MarketScoreResult:
    prediction: Prediction | None = None
    partial_errors: list[str] = field(default_factory=list)
    used_odds_count: int = 0
    used_news_count: int = 0


@dataclass(slots=True)
class BatchScoringSummary:
    markets_considered: int = 0
    markets_scored: int = 0
    predictions_created: int = 0
    predictions_updated: int = 0
    markets_scored_with_any_evidence: int = 0
    markets_scored_with_odds_evidence: int = 0
    markets_scored_with_news_evidence: int = 0
    markets_scored_with_snapshot_fallback: int = 0
    used_odds_count: int = 0
    used_news_count: int = 0
    partial_errors: list[str] = field(default_factory=list)


def score_market(
    db: Session,
    *,
    market: Market,
    settings: Settings,
    run_at: datetime | None = None,
) -> MarketScoreResult:
    result = MarketScoreResult()
    current_run_at = run_at or datetime.now(tz=UTC)
    snapshot = get_latest_market_snapshot(db, market.id)
    if snapshot is None:
        result.partial_errors.append(f"Market {market.id}: no existe snapshot para scoring.")
        return result
    if snapshot.yes_price is None:
        result.partial_errors.append(f"Market {market.id}: el snapshot mas reciente no tiene yes_price.")
        return result

    context = _build_scoring_context(
        db,
        market=market,
        snapshot=snapshot,
        settings=settings,
        current_time=current_run_at,
    )
    scoring_values = _compute_scoring_values(
        market=market,
        context=context,
        settings=settings,
        current_time=current_run_at,
    )
    prediction = create_prediction(
        db,
        market_id=market.id,
        run_at=current_run_at,
        model_version=settings.scoring_model_version,
        yes_probability=scoring_values["yes_probability"],
        no_probability=scoring_values["no_probability"],
        confidence_score=scoring_values["confidence_score"],
        edge_signed=scoring_values["edge_signed"],
        edge_magnitude=scoring_values["edge_magnitude"],
        edge_class=scoring_values["edge_class"],
        opportunity=scoring_values["opportunity"],
        review_confidence=scoring_values["review_confidence"],
        review_edge=scoring_values["review_edge"],
        explanation_json=scoring_values["explanation_json"],
    )
    result.prediction = prediction
    result.used_odds_count = len(context.usable_odds)
    result.used_news_count = len(context.usable_news)
    return result


def score_nba_winner_markets(
    db: Session,
    *,
    settings: Settings,
    limit: int | None = None,
    run_at: datetime | None = None,
) -> BatchScoringSummary:
    current_run_at = run_at or datetime.now(tz=UTC)
    markets = list_nba_winner_evidence_candidates(db, limit=limit)
    summary = BatchScoringSummary(markets_considered=len(markets))

    for market in markets:
        try:
            with db.begin_nested():
                result = score_market(
                    db,
                    market=market,
                    settings=settings,
                    run_at=current_run_at,
                )
            if result.prediction is not None:
                summary.markets_scored += 1
                summary.predictions_created += 1
                if result.used_odds_count > 0 or result.used_news_count > 0:
                    summary.markets_scored_with_any_evidence += 1
                else:
                    summary.markets_scored_with_snapshot_fallback += 1
                if result.used_odds_count > 0:
                    summary.markets_scored_with_odds_evidence += 1
                if result.used_news_count > 0:
                    summary.markets_scored_with_news_evidence += 1
                summary.used_odds_count += result.used_odds_count
                summary.used_news_count += result.used_news_count
            summary.partial_errors.extend(result.partial_errors)
        except Exception as exc:
            summary.partial_errors.append(f"Market {market.id}: error ejecutando scoring: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        summary.partial_errors.append(f"Error confirmando predictions en base: {exc}")

    return summary


def _build_scoring_context(
    db: Session,
    *,
    market: Market,
    snapshot: MarketSnapshot,
    settings: Settings,
    current_time: datetime,
) -> ScoringContext:
    assessment = assess_market_for_evidence(market.question)
    evidence_items = (
        list_market_evidence_items(db, market_id=market.id)
        if assessment.eligible
        else []
    )
    odds_cutoff = current_time - timedelta(hours=settings.scoring_odds_window_hours)
    news_cutoff = current_time - timedelta(hours=settings.scoring_news_window_hours)

    usable_odds = [
        item
        for item in evidence_items
        if item.evidence_type == "odds"
        and item.strength is not None
        and _resolve_evidence_timestamp(item) is not None
        and _resolve_evidence_timestamp(item) >= odds_cutoff
    ]
    usable_news = [
        item
        for item in evidence_items
        if item.evidence_type == "news"
        and _resolve_evidence_timestamp(item) is not None
        and _resolve_evidence_timestamp(item) >= news_cutoff
    ]

    usable_evidence = usable_odds + usable_news
    usable_evidence_ids = {item.id for item in usable_evidence}
    structured_context_components = _resolve_structured_context_components(
        evidence_items=[item for item in evidence_items if item.id in usable_evidence_ids]
    )
    external_market_context = _resolve_external_market_context(evidence_items=usable_odds)
    distinct_providers = {item.provider for item in usable_evidence}
    timestamps = [timestamp for timestamp in (_resolve_evidence_timestamp(item) for item in usable_evidence) if timestamp is not None]
    latest_evidence_at = max(timestamps) if timestamps else None
    has_high_contradiction = any(item.high_contradiction for item in usable_evidence)

    latest_odds_item = None
    if usable_odds:
        latest_odds_item = max(
            usable_odds,
            key=lambda item: _resolve_evidence_timestamp(item) or datetime.min.replace(tzinfo=UTC),
        )

    return ScoringContext(
        snapshot=snapshot,
        evidence_eligible=assessment.eligible,
        evidence_shape=assessment.shape,
        evidence_skip_reason=assessment.skip_reason,
        usable_odds=usable_odds,
        usable_news=usable_news,
        distinct_providers=distinct_providers,
        latest_evidence_at=latest_evidence_at,
        has_high_contradiction=has_high_contradiction,
        structured_context_components=structured_context_components,
        external_market_context=external_market_context,
        odds_implied_prob=latest_odds_item.strength if latest_odds_item is not None else None,
        odds_bookmaker_count=latest_odds_item.bookmaker_count if latest_odds_item is not None else None,
    )


def _compute_scoring_values(
    *,
    market: Market,
    context: ScoringContext,
    settings: Settings,
    current_time: datetime,
) -> dict[str, object]:
    market_yes_price = _quantize_probability(context.snapshot.yes_price or ZERO)
    odds_implied_prob = (
        _quantize_probability(context.odds_implied_prob)
        if context.odds_implied_prob is not None
        else None
    )

    if odds_implied_prob is not None:
        base_yes_probability = _quantize_probability(
            (Decimal("0.40") * market_yes_price) + (Decimal("0.60") * odds_implied_prob)
        )
    else:
        base_yes_probability = market_yes_price

    structured_context_adjustment = _compute_structured_context_adjustment(
        context.structured_context_components
    )
    structured_yes_probability = _quantize_probability(
        base_yes_probability + structured_context_adjustment
    )
    line_movement_adjustment = (
        context.external_market_context.line_movement_score
        if context.external_market_context.available
        else quantize_line_movement_score(None)
    )
    yes_probability = _quantize_probability(
        structured_yes_probability + line_movement_adjustment
    )
    no_probability = _quantize_probability(ONE - yes_probability)

    edge_signed = _quantize_signed(yes_probability - market_yes_price)
    edge_magnitude = _quantize_probability(abs(edge_signed))
    edge_class = _classify_edge(edge_magnitude)

    data_quality = _compute_data_quality(context=context, settings=settings)
    bonuses, penalties, confidence_score = _compute_confidence(
        context=context,
        settings=settings,
        current_time=current_time,
        data_quality=data_quality,
    )

    opportunity = edge_magnitude >= Decimal("0.05") and confidence_score >= Decimal("0.40")
    review_confidence = confidence_score > Decimal("0.80")
    review_edge = edge_magnitude > Decimal("0.25")
    action_score = _compute_action_score(
        context=context,
        settings=settings,
        edge_magnitude=edge_magnitude,
        confidence_score=confidence_score,
        data_quality=data_quality,
        opportunity=opportunity,
    )

    explanation_json = _build_explanation(
        market=market,
        context=context,
        settings=settings,
        market_yes_price=market_yes_price,
        odds_implied_prob=odds_implied_prob,
        base_yes_probability=base_yes_probability,
        structured_context_adjustment=structured_context_adjustment,
        structured_yes_probability=structured_yes_probability,
        line_movement_adjustment=line_movement_adjustment,
        yes_probability=yes_probability,
        no_probability=no_probability,
        confidence_score=confidence_score,
        edge_signed=edge_signed,
        edge_magnitude=edge_magnitude,
        edge_class=edge_class,
        opportunity=opportunity,
        review_confidence=review_confidence,
        review_edge=review_edge,
        bonuses=bonuses,
        penalties=penalties,
        data_quality=data_quality,
        action_score=action_score,
    )

    return {
        "yes_probability": yes_probability,
        "no_probability": no_probability,
        "confidence_score": confidence_score,
        "edge_signed": edge_signed,
        "edge_magnitude": edge_magnitude,
        "edge_class": edge_class,
        "opportunity": opportunity,
        "review_confidence": review_confidence,
        "review_edge": review_edge,
        "explanation_json": explanation_json,
    }


def _compute_confidence(
    *,
    context: ScoringContext,
    settings: Settings,
    current_time: datetime,
    data_quality: DataQualityResult,
) -> tuple[list[BonusApplied], list[PenaltyApplied], Decimal]:
    bonuses: list[BonusApplied] = []
    penalties: list[PenaltyApplied] = []
    confidence = Decimal("0.20")

    if context.odds_bookmaker_count is not None and context.odds_bookmaker_count >= 2:
        bonuses.append(
            BonusApplied(
                code="odds_bookmaker_depth",
                value=Decimal("0.25"),
                reason="Existe evidencia odds con bookmaker_count >= 2.",
            )
        )
        confidence += Decimal("0.25")

    if context.external_market_context.available and context.external_market_context.consensus_strength > ZERO:
        consensus_bonus = _quantize_probability(
            Decimal("0.05") * context.external_market_context.consensus_strength
        )
        bonuses.append(
            BonusApplied(
                code="external_consensus_strength",
                value=consensus_bonus,
                reason="Existe consenso externo persistido en metadata_json.external_market.",
            )
        )
        confidence += consensus_bonus

    if data_quality.score >= Decimal("0.5000"):
        data_quality_bonus = _quantize_probability(Decimal("0.0300") * data_quality.score)
        bonuses.append(
            BonusApplied(
                code="data_quality_support",
                value=data_quality_bonus,
                reason="data_quality_score >= 0.50 aporta un apoyo menor a confidence_score.",
            )
        )
        confidence += data_quality_bonus

    if len(context.distinct_providers) >= 2:
        bonuses.append(
            BonusApplied(
                code="distinct_sources",
                value=Decimal("0.25"),
                reason="Hay evidencia de al menos 2 fuentes distintas.",
            )
        )
        confidence += Decimal("0.25")

    freshness_cutoff = current_time - timedelta(hours=settings.scoring_freshness_window_hours)
    if context.latest_evidence_at is not None and context.latest_evidence_at >= freshness_cutoff:
        bonuses.append(
            BonusApplied(
                code="fresh_evidence",
                value=Decimal("0.15"),
                reason="La evidencia mas reciente cae dentro de la ventana fresca del MVP.",
            )
        )
        confidence += Decimal("0.15")

    if not context.has_high_contradiction:
        bonuses.append(
            BonusApplied(
                code="no_high_contradiction",
                value=Decimal("0.15"),
                reason="No hay high_contradiction en la evidencia usada.",
            )
        )
        confidence += Decimal("0.15")

    confidence = min(confidence, ONE)

    if context.snapshot.spread is not None and context.snapshot.spread > Decimal("0.10"):
        penalties.append(
            PenaltyApplied(
                code="wide_spread",
                multiplier=Decimal("0.85"),
                reason="El spread mas reciente supera 0.10.",
            )
        )
        confidence *= Decimal("0.85")

    low_liquidity_threshold = Decimal(str(settings.scoring_low_liquidity_threshold))
    if context.snapshot.liquidity is None or context.snapshot.liquidity < low_liquidity_threshold:
        penalties.append(
            PenaltyApplied(
                code="low_liquidity",
                multiplier=Decimal("0.80"),
                reason="La liquidez es baja o falta respecto al umbral configurado.",
            )
        )
        confidence *= Decimal("0.80")

    if context.has_high_contradiction:
        penalties.append(
            PenaltyApplied(
                code="high_contradiction",
                multiplier=Decimal("0.75"),
                reason="Hay high_contradiction en la evidencia usada.",
            )
        )
        confidence *= Decimal("0.75")

    if len(context.distinct_providers) < 2:
        penalties.append(
            PenaltyApplied(
                code="insufficient_sources",
                multiplier=Decimal("0.70"),
                reason="Hay menos de 2 fuentes distintas en la ventana de scoring.",
            )
        )
        confidence *= Decimal("0.70")

    confidence = _quantize_probability(max(min(confidence, ONE), ZERO))
    return bonuses, penalties, confidence


def _build_explanation(
    *,
    market: Market,
    context: ScoringContext,
    settings: Settings,
    market_yes_price: Decimal,
    odds_implied_prob: Decimal | None,
    base_yes_probability: Decimal,
    structured_context_adjustment: Decimal,
    structured_yes_probability: Decimal,
    line_movement_adjustment: Decimal,
    yes_probability: Decimal,
    no_probability: Decimal,
    confidence_score: Decimal,
    edge_signed: Decimal,
    edge_magnitude: Decimal,
    edge_class: str,
    opportunity: bool,
    review_confidence: bool,
    review_edge: bool,
    bonuses: list[BonusApplied],
    penalties: list[PenaltyApplied],
    data_quality: DataQualityResult,
    action_score: ActionScoreResult,
) -> dict[str, object]:
    inputs = {
        "market_id": market.id,
        "question": market.question,
        "snapshot_id": context.snapshot.id,
        "snapshot_captured_at": _serialize_datetime(context.snapshot.captured_at),
        "market_yes_price": str(market_yes_price),
        "spread": _serialize_decimal(context.snapshot.spread),
        "liquidity": _serialize_decimal(context.snapshot.liquidity),
        "odds_implied_prob": _serialize_decimal(odds_implied_prob),
        "odds_bookmaker_count": context.odds_bookmaker_count,
        "latest_evidence_at": _serialize_datetime(context.latest_evidence_at),
        "evidence_eligible": context.evidence_eligible,
        "evidence_shape": context.evidence_shape,
        "evidence_skip_reason": context.evidence_skip_reason,
        "evidence_windows_hours": {
            "odds": settings.scoring_odds_window_hours,
            "news": settings.scoring_news_window_hours,
            "freshness": settings.scoring_freshness_window_hours,
        },
        "low_liquidity_threshold": str(Decimal(str(settings.scoring_low_liquidity_threshold))),
        "structured_context_component_cap": str(STRUCTURED_CONTEXT_COMPONENT_CAP),
        "structured_context_total_cap": str(STRUCTURED_CONTEXT_TOTAL_CAP),
        "line_movement_score_cap": str(LINE_MOVEMENT_SCORE_CAP),
    }

    counts = {
        "distinct_source_count": len(context.distinct_providers),
        "providers_used": sorted(context.distinct_providers),
        "odds_count": len(context.usable_odds),
        "news_count": len(context.usable_news),
        "bookmaker_count": context.odds_bookmaker_count,
    }

    summary = _build_summary(
        odds_implied_prob=odds_implied_prob,
        edge_class=edge_class,
        confidence_score=confidence_score,
    )
    available_structured_components = {
        code: component
        for code, component in context.structured_context_components.items()
        if component.available
    }
    missing_structured_components = [
        code
        for code, component in context.structured_context_components.items()
        if not component.available
    ]

    return {
        "inputs": inputs,
        "bonuses_applied": [
            {"code": item.code, "value": str(item.value), "reason": item.reason} for item in bonuses
        ],
        "penalties_applied": [
            {"code": item.code, "multiplier": str(item.multiplier), "reason": item.reason}
            for item in penalties
        ],
        "counts": counts,
        "structured_context": {
            "has_structured_data": bool(available_structured_components),
            "applied_to_yes_probability": structured_context_adjustment != ZERO,
            "applied_total_adjustment": str(structured_context_adjustment),
            "available_component_count": len(available_structured_components),
            "missing_components": missing_structured_components,
            "components": {
                code: {
                    "value": _serialize_decimal(component.value),
                    "available": component.available,
                    "source": component.source,
                    "note": component.note,
                }
                for code, component in context.structured_context_components.items()
            },
        },
        "external_market": {
            "available": context.external_market_context.available,
            "opening_implied_prob": _serialize_decimal(
                context.external_market_context.opening_implied_prob
            ),
            "current_implied_prob": _serialize_decimal(
                context.external_market_context.current_implied_prob
            ),
            "line_movement_score": _serialize_decimal(
                context.external_market_context.line_movement_score
            ),
            "line_movement_adjustment": str(line_movement_adjustment),
            "consensus_strength": _serialize_decimal(
                context.external_market_context.consensus_strength
            ),
            "source": context.external_market_context.source,
            "note": context.external_market_context.note,
            "field_availability": context.external_market_context.field_availability,
            "field_reasons": context.external_market_context.field_reasons,
        },
        "data_quality": {
            "data_quality_score": str(data_quality.score),
            "range": {"min": "0.0000", "max": "1.0000"},
            "confidence_support_rule": "adds 0.0300 * data_quality_score to confidence_score only when score >= 0.5000",
            "components": [
                {
                    "code": component.code,
                    "weight": str(component.weight),
                    "value": str(component.value),
                    "applied": component.applied,
                    "note": component.note,
                }
                for component in data_quality.components
            ],
        },
        "action": {
            "action_score": str(action_score.score),
            "range": {"min": "0.0000", "max": "1.0000"},
            "usage": "prioritization_only",
            "probability_impact": "none",
            "opportunity_impact": "none",
            "components": [
                {
                    "code": component.code,
                    "weight": str(component.weight),
                    "value": str(component.value),
                    "applied": component.applied,
                    "note": component.note,
                }
                for component in action_score.components
            ],
        },
        "computed": {
            "base_yes_probability": str(base_yes_probability),
            "structured_context_adjustment": str(structured_context_adjustment),
            "structured_yes_probability": str(structured_yes_probability),
            "line_movement_adjustment": str(line_movement_adjustment),
            "data_quality_score": str(data_quality.score),
            "action_score": str(action_score.score),
            "yes_probability": str(yes_probability),
            "no_probability": str(no_probability),
            "confidence_score": str(confidence_score),
            "edge_signed": str(edge_signed),
            "edge_magnitude": str(edge_magnitude),
            "edge_class": edge_class,
            "opportunity": opportunity,
            "review_confidence": review_confidence,
            "review_edge": review_edge,
        },
        "summary": summary,
    }


def _resolve_structured_context_components(
    *,
    evidence_items: list[EvidenceItem],
) -> dict[str, StructuredContextComponent]:
    components: dict[str, StructuredContextComponent] = {}

    for code in STRUCTURED_CONTEXT_COMPONENTS:
        component = None
        for item in evidence_items:
            component = _extract_structured_context_component(item=item, code=code)
            if component is not None:
                break
        if component is None:
            component = StructuredContextComponent(
                code=code,
                value=ZERO,
                available=False,
                source=None,
                note="missing_structured_context",
            )
        components[code] = component

    return components


def _compute_data_quality(
    *,
    context: ScoringContext,
    settings: Settings,
) -> DataQualityResult:
    evidence_count = len(context.usable_odds) + len(context.usable_news)
    low_liquidity_threshold = Decimal(str(settings.scoring_low_liquidity_threshold))
    liquidity = context.snapshot.liquidity
    has_structured_context = any(
        component.available for component in context.structured_context_components.values()
    )

    components = [
        _data_quality_component(
            code="valid_odds",
            weight=Decimal("0.2500"),
            fraction=ONE if context.odds_implied_prob is not None and context.usable_odds else ZERO,
            note="odds_implied_prob disponible desde evidencia odds reciente.",
        ),
        _data_quality_component(
            code="useful_evidence_count",
            weight=Decimal("0.1500"),
            fraction=min(Decimal(evidence_count) / Decimal("2"), ONE) if evidence_count > 0 else ZERO,
            note=f"{evidence_count} evidencia(s) util(es) en ventana de scoring.",
        ),
        _data_quality_component(
            code="structured_context_available",
            weight=Decimal("0.1500"),
            fraction=ONE if has_structured_context else ZERO,
            note="Existe al menos un componente de structured_context disponible.",
        ),
        _data_quality_component(
            code="external_market_available",
            weight=Decimal("0.1500"),
            fraction=ONE if context.external_market_context.available else ZERO,
            note="Existe metadata_json.external_market usable.",
        ),
        _data_quality_component(
            code="liquidity_available",
            weight=Decimal("0.1000"),
            fraction=ONE if liquidity is not None else ZERO,
            note="El snapshot trae liquidez disponible.",
        ),
        _data_quality_component(
            code="liquidity_above_threshold",
            weight=Decimal("0.1000"),
            fraction=ONE if liquidity is not None and liquidity >= low_liquidity_threshold else ZERO,
            note=f"Liquidez >= umbral configurado {low_liquidity_threshold}.",
        ),
        _data_quality_component(
            code="low_contradiction",
            weight=Decimal("0.1000"),
            fraction=ONE if evidence_count > 0 and not context.has_high_contradiction else ZERO,
            note="Hay evidencia util y no se detecto high_contradiction.",
        ),
        _data_quality_component(
            code="high_contradiction_penalty",
            weight=Decimal("-0.1500"),
            fraction=ONE if context.has_high_contradiction else ZERO,
            note="Penaliza calidad cuando hay high_contradiction en evidencia usada.",
        ),
    ]

    raw_score = sum((component.value for component in components), start=ZERO)
    score = _quantize_probability(max(min(raw_score, ONE), ZERO))
    return DataQualityResult(score=score, components=components)


def _data_quality_component(
    *,
    code: str,
    weight: Decimal,
    fraction: Decimal,
    note: str,
) -> DataQualityComponent:
    clamped_fraction = max(min(fraction, ONE), ZERO)
    value = _quantize_probability(weight * clamped_fraction) if weight >= ZERO else _quantize_signed(weight * clamped_fraction)
    return DataQualityComponent(
        code=code,
        weight=_quantize_signed(weight),
        value=value,
        applied=value != ZERO,
        note=note,
    )


def _compute_action_score(
    *,
    context: ScoringContext,
    settings: Settings,
    edge_magnitude: Decimal,
    confidence_score: Decimal,
    data_quality: DataQualityResult,
    opportunity: bool,
) -> ActionScoreResult:
    low_liquidity_threshold = Decimal(str(settings.scoring_low_liquidity_threshold))
    liquidity = context.snapshot.liquidity
    if liquidity is None:
        liquidity_fraction = ZERO
        liquidity_note = "Liquidez no disponible; no aporta apoyo operativo."
    elif liquidity >= low_liquidity_threshold:
        liquidity_fraction = ONE
        liquidity_note = f"Liquidez >= umbral configurado {low_liquidity_threshold}."
    else:
        liquidity_fraction = Decimal("0.5000")
        liquidity_note = f"Liquidez disponible pero debajo del umbral {low_liquidity_threshold}."

    components = [
        _action_score_component(
            code="edge_magnitude",
            weight=Decimal("0.4000"),
            fraction=edge_magnitude / Decimal("0.2500") if edge_magnitude > ZERO else ZERO,
            note="edge_magnitude normalizado contra 0.2500; no modifica opportunity.",
        ),
        _action_score_component(
            code="confidence_score",
            weight=Decimal("0.2500"),
            fraction=confidence_score,
            note="confidence_score persistido por el scoring actual.",
        ),
        _action_score_component(
            code="data_quality_score",
            weight=Decimal("0.2000"),
            fraction=data_quality.score,
            note="data_quality_score explicativo calculado con senales existentes.",
        ),
        _action_score_component(
            code="opportunity_bonus",
            weight=Decimal("0.1000"),
            fraction=ONE if opportunity else ZERO,
            note="Bonus de priorizacion si la regla existente de opportunity ya marco true.",
        ),
        _action_score_component(
            code="liquidity_signal",
            weight=Decimal("0.0500"),
            fraction=liquidity_fraction,
            note=liquidity_note,
        ),
    ]

    raw_score = sum((component.value for component in components), start=ZERO)
    score = _quantize_probability(max(min(raw_score, ONE), ZERO))
    return ActionScoreResult(score=score, components=components)


def _action_score_component(
    *,
    code: str,
    weight: Decimal,
    fraction: Decimal,
    note: str,
) -> ActionScoreComponent:
    clamped_fraction = max(min(fraction, ONE), ZERO)
    value = _quantize_probability(weight * clamped_fraction)
    return ActionScoreComponent(
        code=code,
        weight=_quantize_probability(weight),
        value=value,
        applied=value != ZERO,
        note=note,
    )


def _resolve_external_market_context(
    *,
    evidence_items: list[EvidenceItem],
) -> ExternalMarketContext:
    for item in evidence_items:
        payload = normalize_external_market_payload(item.metadata_json)
        if payload is None:
            continue

        field_availability = _external_market_field_availability(payload)
        field_reasons = _external_market_field_reasons(payload)
        if not any(field_availability.values()):
            continue

        line_movement_score = (
            quantize_line_movement_score(payload.get("line_movement_score"))
            if field_availability.get("line_movement_score", False)
            else ZERO
        )
        consensus_strength = (
            quantize_consensus_strength(payload.get("consensus_strength"))
            if field_availability.get("consensus_strength", False)
            else ZERO
        )
        note = _external_market_note(field_availability=field_availability, reasons=field_reasons)
        return ExternalMarketContext(
            opening_implied_prob=parse_external_market_decimal(payload.get("opening_implied_prob")),
            current_implied_prob=parse_external_market_decimal(payload.get("current_implied_prob")),
            line_movement_score=line_movement_score,
            consensus_strength=consensus_strength,
            available=True,
            source=f"{item.provider}:{item.evidence_type}:metadata_json",
            note=note,
            field_availability=field_availability,
            field_reasons=field_reasons,
        )

    return _default_external_market_context()


def _default_external_market_context() -> ExternalMarketContext:
    return ExternalMarketContext(
        opening_implied_prob=None,
        current_implied_prob=None,
        line_movement_score=ZERO,
        consensus_strength=ZERO,
        available=False,
        source=None,
        note="missing_external_market",
        field_availability={
            "opening_implied_prob": False,
            "current_implied_prob": False,
            "line_movement_score": False,
            "consensus_strength": False,
        },
        field_reasons={
            "opening_implied_prob": "missing_opening_implied_prob",
            "current_implied_prob": "missing_current_implied_prob",
            "line_movement_score": "missing_line_movement_score",
            "consensus_strength": "missing_consensus_strength",
        },
    )


def _external_market_field_availability(payload: dict[str, object]) -> dict[str, bool]:
    availability = payload.get("availability")
    return {
        "opening_implied_prob": bool(
            availability.get("opening_implied_prob", False)
            if isinstance(availability, dict)
            else False
        ),
        "current_implied_prob": bool(
            availability.get("current_implied_prob", False)
            if isinstance(availability, dict)
            else False
        ),
        "line_movement_score": bool(
            availability.get("line_movement_score", False)
            if isinstance(availability, dict)
            else False
        ),
        "consensus_strength": bool(
            availability.get("consensus_strength", False)
            if isinstance(availability, dict)
            else False
        ),
    }


def _external_market_field_reasons(payload: dict[str, object]) -> dict[str, str]:
    reasons = payload.get("reasons")
    return {
        "opening_implied_prob": _external_market_reason(
            reasons,
            "opening_implied_prob",
            "missing_opening_implied_prob",
        ),
        "current_implied_prob": _external_market_reason(
            reasons,
            "current_implied_prob",
            "missing_current_implied_prob",
        ),
        "line_movement_score": _external_market_reason(
            reasons,
            "line_movement_score",
            "missing_line_movement_score",
        ),
        "consensus_strength": _external_market_reason(
            reasons,
            "consensus_strength",
            "missing_consensus_strength",
        ),
    }


def _external_market_reason(
    reasons: object,
    field: str,
    default: str,
) -> str:
    if isinstance(reasons, dict) and reasons.get(field) is not None:
        return str(reasons[field])
    return default


def _external_market_note(
    *,
    field_availability: dict[str, bool],
    reasons: dict[str, str],
) -> str:
    for score_field in ("line_movement_score", "consensus_strength", "current_implied_prob"):
        if field_availability.get(score_field, False):
            return reasons[score_field]
    return "missing_external_market"


def _extract_structured_context_component(
    *,
    item: EvidenceItem,
    code: str,
) -> StructuredContextComponent | None:
    payload = normalize_structured_context_payload(item.metadata_json)
    if payload is None:
        return None

    availability = payload.get("availability")
    if not isinstance(availability, dict) or not bool(availability.get(code, False)):
        return None

    value = parse_structured_context_decimal(payload.get(code))
    if value is None:
        return None

    reasons = payload.get("reasons")
    note = (
        str(reasons.get(code))
        if isinstance(reasons, dict) and reasons.get(code) is not None
        else "provided_structured_context"
    )
    return StructuredContextComponent(
        code=code,
        value=_quantize_signed(value),
        available=True,
        source=f"{item.provider}:{item.evidence_type}:metadata_json",
        note=note,
    )


def _compute_structured_context_adjustment(
    components: dict[str, StructuredContextComponent],
) -> Decimal:
    total = sum(
        (component.value for component in components.values() if component.available),
        start=ZERO,
    )
    lower_bound = ZERO - STRUCTURED_CONTEXT_TOTAL_CAP
    clamped = max(min(total, STRUCTURED_CONTEXT_TOTAL_CAP), lower_bound)
    return _quantize_signed(clamped)


def _build_summary(
    *,
    odds_implied_prob: Decimal | None,
    edge_class: str,
    confidence_score: Decimal,
) -> str:
    if odds_implied_prob is None:
        return "Insufficient evidence, defaulting close to market"
    confidence_label = _confidence_label(confidence_score)
    if edge_class == "no_signal":
        return "Model agrees with market, low edge"
    if edge_class == "moderate":
        return f"Model differs from market, moderate edge, {confidence_label} confidence"
    if edge_class == "strong":
        return f"Model differs from market, strong edge, {confidence_label} confidence"
    return "Model differs from market, large edge flagged for review"


def _confidence_label(value: Decimal) -> str:
    if value > Decimal("0.80"):
        return "high"
    if value >= Decimal("0.40"):
        return "medium"
    return "low"


def _classify_edge(edge_magnitude: Decimal) -> str:
    if edge_magnitude < Decimal("0.05"):
        return "no_signal"
    if edge_magnitude <= Decimal("0.12"):
        return "moderate"
    if edge_magnitude <= Decimal("0.25"):
        return "strong"
    return "review"


def _resolve_evidence_timestamp(item: EvidenceItem) -> datetime | None:
    if item.evidence_type == "news":
        timestamp = item.source.published_at or item.source.fetched_at or item.source.created_at
        return _ensure_aware_datetime(timestamp)
    if item.evidence_type == "odds":
        timestamp = item.source.fetched_at or item.source.published_at or item.source.created_at
        return _ensure_aware_datetime(timestamp)
    timestamp = item.source.fetched_at or item.source.published_at or item.created_at
    return _ensure_aware_datetime(timestamp)


def _quantize_probability(value: Decimal | None) -> Decimal:
    if value is None:
        return ZERO
    clamped = max(min(value, ONE), ZERO)
    return clamped.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _quantize_signed(value: Decimal) -> Decimal:
    return value.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _serialize_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP))


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return _ensure_aware_datetime(value).isoformat()


def _ensure_aware_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value
