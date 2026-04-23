from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

EXTERNAL_MARKET_KEY = "external_market"
EXTERNAL_MARKET_VERSION = "external_market_v1"
EXTERNAL_MARKET_SCALE = Decimal("0.0001")
LINE_MOVEMENT_SCORE_CAP = Decimal("0.0150")
CONSENSUS_STRENGTH_CAP = Decimal("1.0000")
ZERO = Decimal("0")
ONE = Decimal("1")

EXTERNAL_MARKET_FIELDS = (
    "opening_implied_prob",
    "current_implied_prob",
    "line_movement_score",
    "consensus_strength",
)


def parse_external_market_decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float | str):
        try:
            return Decimal(str(value))
        except InvalidOperation:
            return None
    return None


def quantize_external_probability(value: object) -> Decimal | None:
    parsed_value = parse_external_market_decimal(value)
    if parsed_value is None:
        return None
    clamped = max(min(parsed_value, ONE), ZERO)
    return clamped.quantize(EXTERNAL_MARKET_SCALE, rounding=ROUND_HALF_UP)


def quantize_line_movement_score(value: object) -> Decimal:
    parsed_value = parse_external_market_decimal(value)
    if parsed_value is None:
        return ZERO.quantize(EXTERNAL_MARKET_SCALE, rounding=ROUND_HALF_UP)
    lower_bound = ZERO - LINE_MOVEMENT_SCORE_CAP
    clamped = max(min(parsed_value, LINE_MOVEMENT_SCORE_CAP), lower_bound)
    return clamped.quantize(EXTERNAL_MARKET_SCALE, rounding=ROUND_HALF_UP)


def quantize_consensus_strength(value: object) -> Decimal:
    parsed_value = parse_external_market_decimal(value)
    if parsed_value is None:
        return ZERO.quantize(EXTERNAL_MARKET_SCALE, rounding=ROUND_HALF_UP)
    clamped = max(min(parsed_value, CONSENSUS_STRENGTH_CAP), ZERO)
    return clamped.quantize(EXTERNAL_MARKET_SCALE, rounding=ROUND_HALF_UP)


def serialize_external_probability(value: Decimal | None) -> str | None:
    quantized = quantize_external_probability(value)
    return str(quantized) if quantized is not None else None


def serialize_external_score(value: Decimal | None) -> str:
    return str(quantize_line_movement_score(value))


def serialize_consensus_strength(value: Decimal | None) -> str:
    return str(quantize_consensus_strength(value))


def build_external_market_payload(
    *,
    opening_implied_prob: object | None = None,
    current_implied_prob: object | None = None,
    line_movement_score: object | None = None,
    consensus_strength: object | None = None,
    availability: Mapping[str, bool] | None = None,
    reasons: Mapping[str, str] | None = None,
    version: str = EXTERNAL_MARKET_VERSION,
) -> dict[str, object]:
    availability = availability or {}
    reasons = reasons or {}

    opening_prob = quantize_external_probability(
        parse_external_market_decimal(opening_implied_prob)
    )
    current_prob = quantize_external_probability(
        parse_external_market_decimal(current_implied_prob)
    )
    explicit_line_score = parse_external_market_decimal(line_movement_score)
    if explicit_line_score is None and opening_prob is not None and current_prob is not None:
        explicit_line_score = current_prob - opening_prob

    consensus = parse_external_market_decimal(consensus_strength)

    opening_available = bool(availability.get("opening_implied_prob", opening_prob is not None))
    current_available = bool(availability.get("current_implied_prob", current_prob is not None))
    line_available = bool(
        availability.get(
            "line_movement_score",
            explicit_line_score is not None and opening_prob is not None and current_prob is not None,
        )
    )
    consensus_available = bool(
        availability.get("consensus_strength", consensus is not None)
    )

    payload = {
        "version": version,
        "opening_implied_prob": str(opening_prob) if opening_prob is not None else None,
        "current_implied_prob": str(current_prob) if current_prob is not None else None,
        "line_movement_score": serialize_external_score(explicit_line_score),
        "consensus_strength": serialize_consensus_strength(consensus),
        "availability": {
            "opening_implied_prob": opening_available,
            "current_implied_prob": current_available,
            "line_movement_score": line_available,
            "consensus_strength": consensus_available,
        },
        "reasons": {
            "opening_implied_prob": _reason_for(
                reasons,
                "opening_implied_prob",
                opening_available,
            ),
            "current_implied_prob": _reason_for(
                reasons,
                "current_implied_prob",
                current_available,
            ),
            "line_movement_score": _reason_for(
                reasons,
                "line_movement_score",
                line_available,
            ),
            "consensus_strength": _reason_for(
                reasons,
                "consensus_strength",
                consensus_available,
            ),
        },
    }
    return payload


def normalize_external_market_record(record: object) -> dict[str, object] | None:
    if not isinstance(record, Mapping):
        return None

    explicit_values_present = any(field in record for field in EXTERNAL_MARKET_FIELDS)
    availability = record.get("availability")
    reasons = record.get("reasons")
    if not explicit_values_present and not isinstance(availability, Mapping):
        return None

    return build_external_market_payload(
        opening_implied_prob=record.get("opening_implied_prob"),
        current_implied_prob=record.get("current_implied_prob"),
        line_movement_score=record.get("line_movement_score"),
        consensus_strength=record.get("consensus_strength"),
        availability=availability if isinstance(availability, Mapping) else None,
        reasons=reasons if isinstance(reasons, Mapping) else None,
        version=str(record.get("version") or EXTERNAL_MARKET_VERSION),
    )


def normalize_external_market_payload(payload: object) -> dict[str, object] | None:
    if not isinstance(payload, Mapping):
        return None
    return normalize_external_market_record(payload.get(EXTERNAL_MARKET_KEY))


def _reason_for(
    reasons: Mapping[str, str],
    field: str,
    available: bool,
) -> str:
    explicit_reason = reasons.get(field)
    if explicit_reason:
        return str(explicit_reason)
    if available:
        return f"provided_{field}"
    return f"missing_{field}"
