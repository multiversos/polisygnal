from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import re

from app.services.nba_team_matching import extract_nba_teams
from app.services.research.classification import infer_market_shape, infer_sport


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


def extract_sport_terms(text: str | None) -> set[str]:
    normalized = normalize_title_for_matching(text)
    sports: set[str] = set()
    if _contains_any(normalized, ("nba", "basketball")) or extract_nba_teams(text):
        sports.add("nba")
    if _contains_any(normalized, ("nfl", "super bowl", "football")):
        sports.add("nfl")
    if _contains_any(normalized, ("mlb", "baseball", "world series")):
        sports.add("mlb")
    if _contains_any(normalized, ("soccer", "champions league", "premier league")):
        sports.add("soccer")
    if _contains_any(normalized, ("tennis", "wimbledon", "us open", "atp", "wta")):
        sports.add("tennis")
    if _contains_any(normalized, ("mma", "ufc")):
        sports.add("mma")
    if _contains_any(normalized, ("kentucky derby", "horse racing", "preakness")):
        sports.add("horse_racing")
    return sports


def extract_team_like_terms(text: str | None) -> set[str]:
    teams = set(extract_nba_teams(text))
    normalized = normalize_title_for_matching(text)
    if not normalized:
        return teams

    # Keep a conservative fallback for title snippets that use city names only.
    for city, team in {
        "boston": "Boston Celtics",
        "san antonio": "San Antonio Spurs",
        "oklahoma city": "Oklahoma City Thunder",
        "okc": "Oklahoma City Thunder",
        "new york": "New York Knicks",
        "los angeles lakers": "Los Angeles Lakers",
        "la lakers": "Los Angeles Lakers",
        "golden state": "Golden State Warriors",
    }.items():
        if f" {city} " in f" {normalized} ":
            teams.add(team)
    return teams


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
    polymarket_title = _combined_text(
        _read_text(polymarket_market, "question") or _read_text(polymarket_market, "title"),
        _read_related_text(polymarket_market, "event", "title"),
    )
    external_title = _combined_text(
        _read_text(external_signal, "title"),
        _read_text(external_signal, "source_ticker"),
        _read_text(external_signal, "source_event_id"),
    )
    warnings: list[str] = []

    title_similarity = simple_title_similarity(polymarket_title, external_title)
    score = title_similarity * Decimal("0.2000")
    reasons = [f"title_similarity={title_similarity}"]
    caps: list[Decimal] = []

    years_a = extract_years(polymarket_title)
    years_b = extract_years(external_title)
    if years_a and years_b:
        if years_a & years_b:
            score += Decimal("0.1500")
            reasons.append("year_overlap")
        else:
            score -= Decimal("0.3500")
            caps.append(Decimal("0.5500"))
            warnings.append("year_mismatch")
            reasons.append("year_mismatch")
    elif years_a or years_b:
        warnings.append("missing_year_on_one_side")
        reasons.append("partial_year_context")
    else:
        warnings.append("missing_year_context")

    sport_a = _market_sport(polymarket_market, polymarket_title)
    sport_b = _external_sport(external_signal, external_title)
    if sport_a != "other" and sport_b != "other":
        if sport_a == sport_b:
            score += Decimal("0.1500")
            reasons.append(f"same_sport={sport_a}")
        else:
            score -= Decimal("0.3000")
            caps.append(Decimal("0.4500"))
            warnings.append("sport_mismatch")
            reasons.append(f"sport_mismatch={sport_a}_vs_{sport_b}")
    else:
        warnings.append("sport_context_incomplete")
        reasons.append("partial_sport_context")

    teams_a = extract_team_like_terms(polymarket_title)
    teams_b = extract_team_like_terms(external_title)
    if teams_a and teams_b:
        if teams_a == teams_b:
            score += Decimal("0.3500")
            reasons.append("same_nba_participants")
        elif teams_a & teams_b:
            score += Decimal("0.2300")
            warnings.append("partial_participant_overlap")
            reasons.append("partial_nba_participant_overlap")
        else:
            score -= Decimal("0.4000")
            caps.append(Decimal("0.4500"))
            warnings.append("participant_mismatch")
            reasons.append("participant_mismatch")
    elif teams_a or teams_b:
        caps.append(Decimal("0.6500"))
        warnings.append("missing_participants_on_one_side")
        reasons.append("partial_participant_context")
    else:
        caps.append(Decimal("0.5000"))
        warnings.append("participants_not_detected")

    shape_a = _market_shape(polymarket_market, polymarket_title)
    shape_b = _market_shape(external_signal, external_title)
    if shape_a != "other" and shape_b != "other":
        if _compatible_shapes(shape_a, shape_b):
            score += Decimal("0.1500")
            reasons.append(f"compatible_market_shape={shape_a}:{shape_b}")
        else:
            score -= Decimal("0.2500")
            caps.append(Decimal("0.5500"))
            warnings.append("market_shape_mismatch")
            reasons.append(f"market_shape_mismatch={shape_a}_vs_{shape_b}")
    else:
        warnings.append("market_shape_unclear")
        reasons.append("partial_market_shape_context")

    phrase_bonus = _competition_phrase_bonus(polymarket_title, external_title)
    if phrase_bonus > Decimal("0"):
        score += phrase_bonus
        reasons.append("compatible_competition_terms")

    close_time_warning = _compare_close_time(polymarket_market, external_signal)
    if close_time_warning is not None:
        warnings.append(close_time_warning)

    if _looks_multivariate(external_title):
        caps.append(Decimal("0.5900"))
        warnings.append("multivariate_external_market")
        reasons.append("multivariate_external_market_cap")

    if title_similarity < Decimal("0.2000") and not (teams_a and teams_b and teams_a & teams_b):
        caps.append(Decimal("0.5000"))
        warnings.append("weak_title_overlap")

    if caps:
        score = min(score, min(caps))
    score = max(Decimal("0.0000"), min(score, Decimal("1.0000")))
    score = _quantize(score)
    if score < Decimal("0.6000"):
        warnings.append("weak_match_confidence")
    elif score < Decimal("0.8000"):
        warnings.append("review_required")

    return ExternalMarketMatchEstimate(
        match_confidence=score,
        match_reason=explain_match_reason(reasons),
        warnings=_unique(warnings),
    )


def explain_match_reason(reasons: list[str]) -> str:
    return ", ".join(_unique(reasons))


def _market_sport(obj: object, text: str | None) -> str:
    sport = _read_text(obj, "sport_type")
    inferred = infer_sport(
        question=text,
        event_title=_read_related_text(obj, "event", "title"),
        sport_type=sport,
    )
    if inferred != "other":
        return inferred
    sport_terms = extract_sport_terms(text)
    return next(iter(sorted(sport_terms)), "other")


def _external_sport(obj: object, text: str | None) -> str:
    source_hint = _read_text(obj, "source_ticker") or _read_text(obj, "source_event_id")
    combined = _combined_text(text, source_hint)
    return infer_sport(question=combined)


def _market_shape(obj: object, text: str | None) -> str:
    shape_override = _read_text(obj, "evidence_shape")
    market_type = _read_text(obj, "market_type")
    return infer_market_shape(
        question=text,
        event_title=_read_related_text(obj, "event", "title"),
        sport=_market_sport(obj, text),
        market_type=market_type,
        market_shape_override=shape_override,
    )


def _compatible_shapes(a: str, b: str) -> bool:
    if a == b:
        return True
    return {a, b} <= {"championship", "futures", "yes_no_generic"}


def _competition_phrase_bonus(a: str | None, b: str | None) -> Decimal:
    terms_a = _competition_terms(a)
    terms_b = _competition_terms(b)
    if not terms_a or not terms_b:
        return Decimal("0.0000")
    return Decimal("0.0500") if terms_a & terms_b else Decimal("0.0000")


def _competition_terms(text: str | None) -> set[str]:
    normalized = normalize_title_for_matching(text)
    terms: set[str] = set()
    for term in (
        "finals",
        "championship",
        "champion",
        "conference",
        "eastern conference",
        "western conference",
        "super bowl",
        "world series",
        "mvp",
        "rookie of the year",
    ):
        if f" {normalize_title_for_matching(term)} " in f" {normalized} ":
            terms.add(term)
    return terms


def _compare_close_time(polymarket_market: object, external_signal: object) -> str | None:
    market_close = _read_datetime(polymarket_market, "end_date")
    external_close = _read_external_close_time(external_signal)
    if market_close is None or external_close is None:
        return None
    delta_days = abs((market_close - external_close).total_seconds()) / 86400
    return "close_time_far_apart" if delta_days > 45 else None


def _read_external_close_time(obj: object) -> datetime | None:
    raw_json = _read_value(obj, "raw_json")
    if not isinstance(raw_json, dict):
        return None
    normalized = raw_json.get("normalized_market")
    if not isinstance(normalized, dict):
        return None
    value = normalized.get("close_time")
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed


def _looks_multivariate(text: str | None) -> bool:
    normalized = (text or "").lower()
    yes_count = len(re.findall(r"\byes\b", normalized))
    comma_count = normalized.count(",")
    return yes_count >= 3 or comma_count >= 4


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
        "yes",
        "no",
        "market",
        "will",
    }
    return {
        token
        for token in normalize_title_for_matching(text).split()
        if token and token not in stop_words
    }


def _combined_text(*values: str | None) -> str:
    return " ".join(value.strip() for value in values if value and value.strip())


def _contains_any(normalized_text: str, hints: tuple[str, ...]) -> bool:
    padded = f" {normalized_text} "
    return any(f" {normalize_title_for_matching(hint)} " in padded for hint in hints)


def _read_related_text(obj: object, relationship: str, key: str) -> str | None:
    related = None
    if isinstance(obj, dict):
        related = obj.get(relationship)
    else:
        related = getattr(obj, relationship, None)
    if related is None:
        return None
    return _read_text(related, key)


def _read_text(obj: object, key: str) -> str | None:
    value = _read_value(obj, key)
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value).strip() or None


def _read_value(obj: object, key: str) -> object | None:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _read_datetime(obj: object, key: str) -> datetime | None:
    value = _read_value(obj, key)
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


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
