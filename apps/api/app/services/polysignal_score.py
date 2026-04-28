from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.repositories.market_snapshots import get_latest_market_snapshot
from app.repositories.predictions import get_latest_prediction_for_market
from app.schemas.market_price_history import MarketPriceHistoryRead
from app.schemas.polysignal_score import PolySignalScoreComponent, PolySignalScoreRead
from app.services.external_market_signals import list_external_market_signals
from app.services.market_price_history import build_market_price_history

LOW = Decimal("0.0100")
HIGH = Decimal("0.9900")
HALF = Decimal("0.5000")
ZERO = Decimal("0.0000")
ONE = Decimal("1.0000")
MIN_EXTERNAL_MATCH_CONFIDENCE = Decimal("0.6000")
MAX_EXTERNAL_WEIGHT = Decimal("0.4500")
MAX_MOMENTUM_ADJUSTMENT = Decimal("0.0500")


def build_polysignal_score(
    db: Session,
    *,
    market: Market,
    latest_snapshot: MarketSnapshot | None = None,
    latest_prediction: Prediction | None = None,
    external_signals: list[ExternalMarketSignal] | None = None,
    price_history: MarketPriceHistoryRead | None = None,
    candidate_score: Decimal | None = None,
) -> PolySignalScoreRead:
    resolved_snapshot = latest_snapshot or get_latest_market_snapshot(db, market.id)
    resolved_prediction = latest_prediction or get_latest_prediction_for_market(
        db,
        market.id,
        prediction_family=None,
    )
    resolved_external_signals = (
        external_signals
        if external_signals is not None
        else list_external_market_signals(db, market_id=market.id, limit=20)
    )
    resolved_history = price_history or build_market_price_history(
        db,
        market_id=market.id,
        limit=50,
        order="asc",
    )

    if resolved_prediction is not None:
        return _score_from_prediction(
            prediction=resolved_prediction,
            market_yes_price=_valid_probability(
                resolved_snapshot.yes_price if resolved_snapshot is not None else None
            ),
        )

    return _score_from_components(
        market_yes_price=_valid_probability(
            resolved_snapshot.yes_price if resolved_snapshot is not None else None
        ),
        external_signals=resolved_external_signals,
        price_history=resolved_history,
        candidate_score=candidate_score,
    )


def _score_from_prediction(
    *,
    prediction: Prediction,
    market_yes_price: Decimal | None,
) -> PolySignalScoreRead:
    score = _clamp_probability(prediction.yes_probability)
    confidence = _clamp_unit(prediction.confidence_score)
    warnings: list[str] = []
    if confidence < Decimal("0.4500"):
        warnings.append("low_confidence_prediction")
    edge = _edge(score, market_yes_price)
    label, color_hint = _edge_label(edge=edge, confidence=confidence, score_available=True)
    return PolySignalScoreRead(
        score_probability=_quantize(score),
        score_percent=_percent(score),
        market_yes_price=_quantize(market_yes_price),
        edge_signed=_quantize(edge),
        edge_percent_points=_percent(edge),
        confidence=_quantize(confidence),
        confidence_label=_confidence_label(confidence),
        source="latest_prediction",
        components=[
            PolySignalScoreComponent(
                name="latest_prediction",
                probability=_quantize(score),
                weight=ONE,
                confidence=_quantize(confidence),
                note="Basado en prediccion guardada; no se crea una prediccion nueva.",
            )
        ],
        warnings=warnings,
        label=label,
        color_hint=color_hint,
    )


def _score_from_components(
    *,
    market_yes_price: Decimal | None,
    external_signals: list[ExternalMarketSignal],
    price_history: MarketPriceHistoryRead,
    candidate_score: Decimal | None,
) -> PolySignalScoreRead:
    components: list[PolySignalScoreComponent] = []
    warnings: list[str] = ["preliminary_score"]

    has_market_price = market_yes_price is not None
    base = market_yes_price if market_yes_price is not None else HALF
    if has_market_price:
        components.append(
            PolySignalScoreComponent(
                name="polymarket_baseline",
                probability=_quantize(base),
                weight=ONE,
                confidence=Decimal("0.3500"),
                note="Precio SÍ actual de Polymarket usado como punto de partida.",
            )
        )
    else:
        warnings.append("missing_market_yes_price")

    external_probability, external_weight, external_confidence, external_warnings = (
        _external_signal_component(external_signals)
    )
    warnings.extend(external_warnings)

    score = base
    confidence = Decimal("0.2500") if has_market_price else Decimal("0.1000")
    if external_probability is not None and external_weight is not None:
        score = (score * (ONE - external_weight)) + (external_probability * external_weight)
        confidence += external_confidence * Decimal("0.4500")
        components.append(
            PolySignalScoreComponent(
                name="external_signal",
                probability=_quantize(external_probability),
                weight=_quantize(external_weight),
                confidence=_quantize(external_confidence),
                note="Incluye señal externa vinculada ponderada por confianza de fuente y coincidencia.",
            )
        )

    momentum_adjustment = _momentum_adjustment(price_history)
    if momentum_adjustment is not None:
        score += momentum_adjustment
        confidence += Decimal("0.1500")
        components.append(
            PolySignalScoreComponent(
                name="price_momentum",
                adjustment=_quantize(momentum_adjustment),
                confidence=Decimal("0.5000"),
                note="Ajuste conservador por movimiento reciente del precio SÍ.",
            )
        )
    elif price_history.count < 3:
        warnings.append("few_price_history_points")

    if candidate_score is not None:
        operational_confidence = _clamp_unit(candidate_score / Decimal("100"))
        confidence += operational_confidence * Decimal("0.1000")
        components.append(
            PolySignalScoreComponent(
                name="candidate_context",
                confidence=_quantize(operational_confidence),
                note="El puntaje de candidato solo aumenta confianza operativa; no mueve la probabilidad.",
            )
        )

    if not has_market_price and external_probability is None and momentum_adjustment is None:
        confidence = Decimal("0.1000")
        warnings.extend(["insufficient_data", "low_confidence"])
        return PolySignalScoreRead(
            score_probability=None,
            score_percent=None,
            market_yes_price=None,
            edge_signed=None,
            edge_percent_points=None,
            confidence=_quantize(confidence),
            confidence_label=_confidence_label(confidence),
            source="insufficient_data",
            components=components,
            warnings=_dedupe(warnings),
            label="Faltan datos suficientes para estimar PolySignal SÍ",
            color_hint="warning",
        )

    score = _clamp_probability(score)
    confidence = _clamp_unit(confidence)
    if confidence < Decimal("0.4500"):
        warnings.append("low_confidence")
    edge = _edge(score, market_yes_price)
    label, color_hint = _edge_label(edge=edge, confidence=confidence, score_available=True)
    return PolySignalScoreRead(
        score_probability=_quantize(score),
        score_percent=_percent(score),
        market_yes_price=_quantize(market_yes_price),
        edge_signed=_quantize(edge),
        edge_percent_points=_percent(edge),
        confidence=_quantize(confidence),
        confidence_label=_confidence_label(confidence),
        source="preliminary_composite",
        components=components,
        warnings=_dedupe(warnings),
        label=label,
        color_hint=color_hint,
    )


def _external_signal_component(
    signals: list[ExternalMarketSignal],
) -> tuple[Decimal | None, Decimal | None, Decimal, list[str]]:
    warnings: list[str] = []
    weighted_total = ZERO
    weight_total = ZERO
    best_confidence = ZERO

    for signal in sorted(signals, key=_external_signal_sort_key, reverse=True):
        probability = _valid_probability(signal.yes_probability or signal.mid_price or signal.last_price)
        if probability is None:
            warnings.append("external_signal_missing_probability")
            continue
        source_confidence = _clamp_unit(signal.source_confidence or Decimal("0.5000"))
        match_confidence = _clamp_unit(signal.match_confidence or Decimal("0.5000"))
        if match_confidence < MIN_EXTERNAL_MATCH_CONFIDENCE:
            warnings.append("external_signal_low_match_confidence")
            continue
        confidence = _clamp_unit(source_confidence * match_confidence)
        weight = min(MAX_EXTERNAL_WEIGHT, confidence * Decimal("0.3500"))
        weighted_total += probability * weight
        weight_total += weight
        best_confidence = max(best_confidence, confidence)

    if weight_total == ZERO:
        return None, None, ZERO, warnings
    return weighted_total / weight_total, min(MAX_EXTERNAL_WEIGHT, weight_total), best_confidence, warnings


def _external_signal_sort_key(signal: ExternalMarketSignal) -> tuple[int, Decimal, Decimal]:
    source_priority = 1 if signal.source.lower() == "kalshi" else 0
    source_confidence = _clamp_unit(signal.source_confidence or Decimal("0.5000"))
    match_confidence = _clamp_unit(signal.match_confidence or Decimal("0.5000"))
    return source_priority, match_confidence, source_confidence


def _momentum_adjustment(history: MarketPriceHistoryRead) -> Decimal | None:
    if history.count < 3 or history.change_yes_abs is None:
        return None
    return max(
        -MAX_MOMENTUM_ADJUSTMENT,
        min(MAX_MOMENTUM_ADJUSTMENT, history.change_yes_abs * Decimal("0.5000")),
    )


def _valid_probability(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < ZERO or value > ONE:
        return None
    return value


def _clamp_probability(value: Decimal) -> Decimal:
    return max(LOW, min(HIGH, value))


def _clamp_unit(value: Decimal) -> Decimal:
    return max(ZERO, min(ONE, value))


def _edge(score: Decimal | None, market_yes_price: Decimal | None) -> Decimal | None:
    if score is None or market_yes_price is None:
        return None
    return score - market_yes_price


def _edge_label(
    *,
    edge: Decimal | None,
    confidence: Decimal,
    score_available: bool,
) -> tuple[str, str]:
    if not score_available:
        return "Faltan datos suficientes para estimar PolySignal SÍ", "warning"
    if confidence < Decimal("0.4500"):
        return "Score preliminar con pocos datos disponibles", "warning"
    if edge is None:
        return "PolySignal SÍ preliminar sin comparación de mercado", "neutral"
    if edge >= Decimal("0.0500"):
        return "PolySignal ve SÍ más alto que el mercado", "positive"
    if edge <= Decimal("-0.0500"):
        return "PolySignal ve SÍ más bajo que el mercado", "negative"
    return "PolySignal está alineado con el mercado", "neutral"


def _confidence_label(confidence: Decimal) -> str:
    if confidence >= Decimal("0.7500"):
        return "Alta"
    if confidence >= Decimal("0.4500"):
        return "Media"
    return "Baja"


def _percent(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return (value * Decimal("100")).quantize(Decimal("0.1"))


def _quantize(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(Decimal("0.0001"))


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
