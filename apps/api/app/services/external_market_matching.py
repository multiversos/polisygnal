from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import re

from app.services.nba_team_matching import extract_nba_teams


@dataclass(slots=True)
class ExternalMarketMatchEstimate:
    match_confidence: Decimal
    match_reason: str
    warnings: list[str]


def normalize_title_for_matching(text: str | None) -> str:
    lowered = (text or "").lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", lowered)
    return " ".join(normalized.split())


def extract_years(text: str | None) -> set[str]:
    return set(re.findall(r"\b20\d{2}\b", text or ""))


def simple_title_similarity(a: str | None, b: str | None) -> Decimal:
    tokens_a = _token_set(a)
    tokens_b = _token_set(b)
    if not tokens_a or not tokens_b:
        return Decimal("0.0000")
    overlap = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return _quantize(Decimal(overlap) / Decimal(union))


def estimate_match_confidence(
    polymarket_market: object,
    external_signal: object,
) -> ExternalMarketMatchEstimate:
    polymarket_title = _read_text(polymarket_market, "question") or _read_text(
        polymarket_market,
        "title",
    )
    external_title = _read_text(external_signal, "title")
    warnings: list[str] = []

    title_similarity = simple_title_similarity(polymarket_title, external_title)
    score = title_similarity * Decimal("0.3500")
    reasons = [f"title_similarity={title_similarity}"]

    years_a = extract_years(polymarket_title)
    years_b = extract_years(external_title)
    if years_a and years_b:
        if years_a & years_b:
            score += Decimal("0.2000")
            reasons.append("year_overlap")
        else:
            score -= Decimal("0.2000")
            warnings.append("year_mismatch")
            reasons.append("year_mismatch")
    elif years_a or years_b:
        warnings.append("missing_year_on_one_side")
        reasons.append("partial_year_context")
    else:
        warnings.append("missing_year_context")

    teams_a = set(extract_nba_teams(polymarket_title))
    teams_b = set(extract_nba_teams(external_title))
    if teams_a and teams_b:
        if teams_a == teams_b:
            score += Decimal("0.3500")
            reasons.append("same_nba_participants")
        elif teams_a & teams_b:
            score += Decimal("0.2200")
            warnings.append("partial_participant_overlap")
            reasons.append("partial_nba_participant_overlap")
        else:
            score -= Decimal("0.2000")
            warnings.append("participant_mismatch")
            reasons.append("participant_mismatch")
    elif teams_a or teams_b:
        warnings.append("missing_participants_on_one_side")
        reasons.append("partial_participant_context")
    else:
        warnings.append("participants_not_detected")

    shape_bonus = _shape_bonus(polymarket_title, external_title, warnings)
    score += shape_bonus
    if shape_bonus > 0:
        reasons.append("compatible_market_shape_hints")

    score = max(Decimal("0.0000"), min(score, Decimal("1.0000")))
    score = _quantize(score)
    if score < Decimal("0.6000"):
        warnings.append("weak_match_confidence")

    return ExternalMarketMatchEstimate(
        match_confidence=score,
        match_reason=", ".join(reasons),
        warnings=_unique(warnings),
    )


def _shape_bonus(
    polymarket_title: str | None,
    external_title: str | None,
    warnings: list[str],
) -> Decimal:
    shape_a = _infer_shape_hint(polymarket_title)
    shape_b = _infer_shape_hint(external_title)
    if shape_a == "unknown" or shape_b == "unknown":
        warnings.append("market_shape_unclear")
        return Decimal("0.0000")
    if shape_a == shape_b:
        return Decimal("0.1000")
    warnings.append("market_shape_mismatch")
    return Decimal("-0.1000")


def _infer_shape_hint(text: str | None) -> str:
    normalized = normalize_title_for_matching(text)
    if not normalized:
        return "unknown"
    if "beat" in normalized or "vs" in normalized or " versus " in f" {normalized} ":
        return "match_winner"
    if "finals" in normalized or "championship" in normalized or "champion" in normalized:
        return "championship"
    return "unknown"


def _token_set(text: str | None) -> set[str]:
    stop_words = {
        "a",
        "an",
        "and",
        "be",
        "the",
        "to",
        "who",
        "will",
        "win",
        "beat",
        "vs",
        "versus",
    }
    return {
        token
        for token in normalize_title_for_matching(text).split()
        if token and token not in stop_words
    }


def _read_text(obj: object, key: str) -> str | None:
    if isinstance(obj, dict):
        value = obj.get(key)
    else:
        value = getattr(obj, key, None)
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value).strip() or None


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
