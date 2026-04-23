from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

STRUCTURED_CONTEXT_KEY = "structured_context"
STRUCTURED_CONTEXT_VERSION = "sports_context_v1"
STRUCTURED_CONTEXT_COMPONENTS = (
    "injury_score",
    "form_score",
    "rest_score",
    "home_advantage_score",
)
STRUCTURED_CONTEXT_SCALE = Decimal("0.0001")
STRUCTURED_CONTEXT_COMPONENT_CAP = Decimal("0.0150")
STRUCTURED_CONTEXT_TOTAL_CAP = Decimal("0.0300")
ZERO = Decimal("0")


def parse_structured_context_decimal(value: object) -> Decimal | None:
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


def clamp_structured_context_value(value: Decimal) -> Decimal:
    lower_bound = ZERO - STRUCTURED_CONTEXT_COMPONENT_CAP
    clamped = max(min(value, STRUCTURED_CONTEXT_COMPONENT_CAP), lower_bound)
    return clamped.quantize(STRUCTURED_CONTEXT_SCALE, rounding=ROUND_HALF_UP)


def serialize_structured_context_value(value: Decimal) -> str:
    return str(clamp_structured_context_value(value))


def build_structured_context_payload(
    values: Mapping[str, object] | None = None,
    availability: Mapping[str, bool] | None = None,
    reasons: Mapping[str, str] | None = None,
    *,
    version: str = STRUCTURED_CONTEXT_VERSION,
) -> dict[str, object]:
    payload: dict[str, object] = {"version": version}
    availability_map: dict[str, bool] = {}
    reasons_map: dict[str, str] = {}

    values = values or {}
    availability = availability or {}
    reasons = reasons or {}

    for code in STRUCTURED_CONTEXT_COMPONENTS:
        parsed_value = parse_structured_context_decimal(values.get(code))
        payload[code] = serialize_structured_context_value(parsed_value or ZERO)

        is_available = bool(availability.get(code, parsed_value is not None))
        availability_map[code] = is_available

        default_reason = "provided_structured_context" if is_available else f"missing_{code}"
        reasons_map[code] = str(reasons.get(code) or default_reason)

    payload["availability"] = availability_map
    payload["reasons"] = reasons_map
    return payload


def normalize_structured_context_record(record: object) -> dict[str, object] | None:
    if not isinstance(record, Mapping):
        return None

    explicit_values_present = any(code in record for code in STRUCTURED_CONTEXT_COMPONENTS)
    availability = record.get("availability")
    reasons = record.get("reasons")

    if not explicit_values_present and not isinstance(availability, Mapping) and not isinstance(reasons, Mapping):
        return None

    return build_structured_context_payload(
        values=record,
        availability=availability if isinstance(availability, Mapping) else None,
        reasons=reasons if isinstance(reasons, Mapping) else None,
        version=str(record.get("version") or STRUCTURED_CONTEXT_VERSION),
    )


def normalize_structured_context_payload(payload: object) -> dict[str, object] | None:
    if not isinstance(payload, Mapping):
        return None
    return normalize_structured_context_record(payload.get(STRUCTURED_CONTEXT_KEY))


def merge_structured_context_records(
    *records: dict[str, object] | None,
) -> dict[str, object]:
    normalized_records = [record for record in records if record is not None]
    if not normalized_records:
        return build_structured_context_payload()

    merged_values: dict[str, object] = {}
    merged_availability: dict[str, bool] = {}
    merged_reasons: dict[str, str] = {}

    for code in STRUCTURED_CONTEXT_COMPONENTS:
        selected_record = None
        for record in normalized_records:
            availability = record.get("availability")
            if isinstance(availability, Mapping) and bool(availability.get(code, False)):
                selected_record = record
                break
        if selected_record is None:
            selected_record = normalized_records[0]

        merged_values[code] = selected_record.get(code)
        availability = selected_record.get("availability")
        reasons = selected_record.get("reasons")
        merged_availability[code] = bool(
            availability.get(code, False) if isinstance(availability, Mapping) else False
        )
        merged_reasons[code] = str(
            reasons.get(code)
            if isinstance(reasons, Mapping) and reasons.get(code) is not None
            else f"missing_{code}"
        )

    return build_structured_context_payload(
        values=merged_values,
        availability=merged_availability,
        reasons=merged_reasons,
        version=str(normalized_records[0].get("version") or STRUCTURED_CONTEXT_VERSION),
    )
