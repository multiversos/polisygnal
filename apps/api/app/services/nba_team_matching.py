from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import re

from app.clients.the_odds_api import parse_iso_datetime


def _normalize_text(value: str) -> str:
    lowered = value.lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", lowered)
    return " ".join(normalized.split())


def _as_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)

NBA_TEAM_VARIANTS: dict[str, tuple[str, ...]] = {
    "Atlanta Hawks": ("atlanta hawks", "hawks", "atl"),
    "Boston Celtics": ("boston celtics", "celtics", "bos"),
    "Brooklyn Nets": ("brooklyn nets", "nets", "bkn"),
    "Charlotte Hornets": ("charlotte hornets", "hornets", "cha"),
    "Chicago Bulls": ("chicago bulls", "bulls", "chi"),
    "Cleveland Cavaliers": ("cleveland cavaliers", "cavaliers", "cavs", "cle"),
    "Dallas Mavericks": ("dallas mavericks", "mavericks", "mavs", "dal"),
    "Denver Nuggets": ("denver nuggets", "nuggets", "den"),
    "Detroit Pistons": ("detroit pistons", "pistons", "det"),
    "Golden State Warriors": ("golden state warriors", "warriors", "gsw"),
    "Houston Rockets": ("houston rockets", "rockets", "hou"),
    "Indiana Pacers": ("indiana pacers", "pacers", "ind"),
    "Los Angeles Clippers": ("los angeles clippers", "la clippers", "clippers", "lac"),
    "Los Angeles Lakers": ("los angeles lakers", "la lakers", "lakers", "lal"),
    "Memphis Grizzlies": ("memphis grizzlies", "grizzlies", "griz", "mem"),
    "Miami Heat": ("miami heat", "heat", "mia"),
    "Milwaukee Bucks": ("milwaukee bucks", "bucks", "mil"),
    "Minnesota Timberwolves": (
        "minnesota timberwolves",
        "timberwolves",
        "wolves",
        "min",
    ),
    "New Orleans Pelicans": ("new orleans pelicans", "pelicans", "pels", "nop"),
    "New York Knicks": ("new york knicks", "knicks", "ny knicks", "nyk"),
    "Oklahoma City Thunder": (
        "oklahoma city thunder",
        "okc thunder",
        "thunder",
        "okc",
    ),
    "Orlando Magic": ("orlando magic", "magic", "orl"),
    "Philadelphia 76ers": ("philadelphia 76ers", "76ers", "sixers", "phi"),
    "Phoenix Suns": ("phoenix suns", "suns", "phx"),
    "Portland Trail Blazers": (
        "portland trail blazers",
        "trail blazers",
        "blazers",
        "por",
    ),
    "Sacramento Kings": ("sacramento kings", "kings", "sac"),
    "San Antonio Spurs": ("san antonio spurs", "spurs", "sas"),
    "Toronto Raptors": ("toronto raptors", "raptors", "tor"),
    "Utah Jazz": ("utah jazz", "jazz", "uta"),
    "Washington Wizards": ("washington wizards", "wizards", "was"),
}

NORMALIZED_TEAM_LOOKUP = {
    _normalize_text(alias): canonical_team
    for canonical_team, aliases in NBA_TEAM_VARIANTS.items()
    for alias in (canonical_team, *aliases)
}

FUTURES_HINTS = (
    "nba finals",
    "champion",
    "championship",
    "who will win series",
    "win series",
    "conference winner",
    "division winner",
    "season winner",
    "make the playoffs",
    "title",
)

UNSUPPORTED_HINTS = (
    "most valuable player",
    "mvp",
    "defensive player of the year",
    "rookie of the year",
    "most improved player",
    "sixth man of the year",
    "coach of the year",
    "clutch player of the year",
    "all star",
)


@dataclass(slots=True)
class OddsEventMatch:
    target_team: str
    mentioned_teams: list[str]
    matched_event: dict[str, object]
    match_reason: str


@dataclass(slots=True)
class EvidenceMarketAssessment:
    shape: str
    teams: list[str]
    eligible: bool
    skip_reason: str | None = None


def extract_nba_teams(text: str | None) -> list[str]:
    normalized_text = _normalize_text(text or "")
    if not normalized_text:
        return []

    padded = f" {normalized_text} "
    found_positions: list[tuple[int, str]] = []
    seen: set[str] = set()

    for canonical_team, aliases in NBA_TEAM_VARIANTS.items():
        best_position: int | None = None
        for alias in (canonical_team, *aliases):
            normalized_alias = _normalize_text(alias)
            token = f" {normalized_alias} "
            position = padded.find(token)
            if position >= 0 and (best_position is None or position < best_position):
                best_position = position

        if best_position is not None and canonical_team not in seen:
            seen.add(canonical_team)
            found_positions.append((best_position, canonical_team))

    found_positions.sort(key=lambda item: item[0])
    return [team for _, team in found_positions]


def assess_market_for_evidence(question: str | None) -> EvidenceMarketAssessment:
    teams = extract_nba_teams(question)
    normalized_question = _normalize_text(question or "")

    if len(teams) == 2:
        return EvidenceMarketAssessment(
            shape="matchup",
            teams=teams,
            eligible=True,
        )

    if len(teams) == 1:
        return EvidenceMarketAssessment(
            shape="futures",
            teams=teams,
            eligible=False,
            skip_reason="single_team_market",
        )

    if _contains_hint(normalized_question, UNSUPPORTED_HINTS):
        return EvidenceMarketAssessment(
            shape="ambiguous",
            teams=[],
            eligible=False,
            skip_reason="unsupported_award_or_person_market",
        )

    if _contains_hint(normalized_question, FUTURES_HINTS):
        return EvidenceMarketAssessment(
            shape="futures",
            teams=[],
            eligible=False,
            skip_reason="non_matchable_futures_market",
        )

    return EvidenceMarketAssessment(
        shape="ambiguous",
        teams=[],
        eligible=False,
        skip_reason="non_parseable_market_shape",
    )


def canonicalize_nba_team_name(value: str | None) -> str | None:
    normalized = _normalize_text(value or "")
    if not normalized:
        return None
    return NORMALIZED_TEAM_LOOKUP.get(normalized)


def is_relevant_news_item(raw_text: str, teams: list[str]) -> bool:
    if not teams:
        return False
    normalized_text = _normalize_text(raw_text)
    padded = f" {normalized_text} "
    for team in teams:
        for alias in (team, *NBA_TEAM_VARIANTS.get(team, ())):
            token = f" {_normalize_text(alias)} "
            if token in padded:
                return True
    return False


def match_market_to_odds_event(
    question: str,
    odds_events: list[dict[str, object]],
    *,
    now: datetime | None = None,
) -> OddsEventMatch | None:
    mentioned_teams = extract_nba_teams(question)
    if not mentioned_teams:
        return None

    target_team = mentioned_teams[0]
    current_time = now or datetime.now(tz=UTC)

    if len(mentioned_teams) >= 2:
        mentioned_set = set(mentioned_teams[:2])
        for raw_event in odds_events:
            teams = _event_team_set(raw_event)
            if teams == mentioned_set:
                return OddsEventMatch(
                    target_team=target_team,
                    mentioned_teams=mentioned_teams[:2],
                    matched_event=raw_event,
                    match_reason="exact_two_team_match",
                )
        return None

    matching_events = [
        raw_event
        for raw_event in odds_events
        if target_team in _event_team_set(raw_event)
    ]
    if not matching_events:
        return None

    matching_events.sort(key=lambda raw_event: _event_distance_seconds(raw_event, current_time))
    return OddsEventMatch(
        target_team=target_team,
        mentioned_teams=mentioned_teams,
        matched_event=matching_events[0],
        match_reason="closest_single_team_match",
    )


def _event_team_set(raw_event: dict[str, object]) -> set[str]:
    home_team = canonicalize_nba_team_name(_as_text(raw_event.get("home_team")))
    away_team = canonicalize_nba_team_name(_as_text(raw_event.get("away_team")))
    return {team for team in [home_team, away_team] if team}


def _event_distance_seconds(raw_event: dict[str, object], current_time: datetime) -> float:
    commence_time = parse_iso_datetime(raw_event.get("commence_time"))
    if commence_time is None:
        return float("inf")
    return abs((commence_time - current_time).total_seconds())


def _contains_hint(normalized_question: str, hints: tuple[str, ...]) -> bool:
    return any(_normalize_text(hint) in normalized_question for hint in hints)
