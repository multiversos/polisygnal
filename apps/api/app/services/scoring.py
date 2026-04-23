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
class StructuredContextComponent:
    code: str
    value: Decimal
    available: bool
    source: str | None
    note: str


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
    yes_probability = _quantize_probability(base_yes_probability + structured_context_adjustment)
    no_probability = _quantize_probability(ONE - yes_probability)

    edge_signed = _quantize_signed(yes_probability - market_yes_price)
    edge_magnitude = _quantize_probability(abs(edge_signed))
    edge_class = _classify_edge(edge_magnitude)

    bonuses, penalties, confidence_score = _compute_confidence(
        context=context,
        settings=settings,
        current_time=current_time,
    )

    opportunity = edge_magnitude >= Decimal("0.05") and confidence_score >= Decimal("0.40")
    review_confidence = confidence_score > Decimal("0.80")
    review_edge = edge_magnitude > Decimal("0.25")

    explanation_json = _build_explanation(
        market=market,
        context=context,
        settings=settings,
        market_yes_price=market_yes_price,
        odds_implied_prob=odds_implied_prob,
        base_yes_probability=base_yes_probability,
        structured_context_adjustment=structured_context_adjustment,
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
        "computed": {
            "base_yes_probability": str(base_yes_probability),
            "structured_context_adjustment": str(structured_context_adjustment),
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
    return None


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
