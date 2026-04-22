from __future__ import annotations

from datetime import UTC, datetime

from app.services.nba_team_matching import (
    assess_market_for_evidence,
    extract_nba_teams,
    match_market_to_odds_event,
)


def test_extract_nba_teams_preserves_order_of_mention() -> None:
    teams = extract_nba_teams("Will the New York Knicks beat the Boston Celtics tonight?")

    assert teams == ["New York Knicks", "Boston Celtics"]


def test_match_market_to_odds_event_uses_exact_two_team_match() -> None:
    match = match_market_to_odds_event(
        "Will the New York Knicks beat the Boston Celtics tonight?",
        [
            {
                "id": "event-a",
                "home_team": "Boston Celtics",
                "away_team": "New York Knicks",
                "commence_time": "2026-04-21T00:00:00Z",
            }
        ],
        now=datetime(2026, 4, 20, 18, 0, tzinfo=UTC),
    )

    assert match is not None
    assert match.target_team == "New York Knicks"
    assert match.match_reason == "exact_two_team_match"
    assert match.matched_event["id"] == "event-a"


def test_match_market_to_odds_event_uses_closest_single_team_match() -> None:
    match = match_market_to_odds_event(
        "Will the New York Knicks win the 2026 NBA Finals?",
        [
            {
                "id": "event-far",
                "home_team": "Miami Heat",
                "away_team": "New York Knicks",
                "commence_time": "2026-04-23T00:00:00Z",
            },
            {
                "id": "event-near",
                "home_team": "New York Knicks",
                "away_team": "Chicago Bulls",
                "commence_time": "2026-04-20T23:00:00Z",
            },
        ],
        now=datetime(2026, 4, 20, 18, 0, tzinfo=UTC),
    )

    assert match is not None
    assert match.target_team == "New York Knicks"
    assert match.match_reason == "closest_single_team_match"
    assert match.matched_event["id"] == "event-near"


def test_assess_market_for_evidence_marks_two_team_market_as_eligible() -> None:
    assessment = assess_market_for_evidence(
        "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks"
    )

    assert assessment.shape == "matchup"
    assert assessment.eligible is True
    assert assessment.teams == ["New York Knicks", "Atlanta Hawks"]


def test_assess_market_for_evidence_skips_single_team_futures_market() -> None:
    assessment = assess_market_for_evidence(
        "Will the Sacramento Kings win the 2026 NBA Finals?"
    )

    assert assessment.shape == "futures"
    assert assessment.eligible is False
    assert assessment.skip_reason == "single_team_market"
    assert assessment.teams == ["Sacramento Kings"]


def test_assess_market_for_evidence_skips_unsupported_award_market() -> None:
    assessment = assess_market_for_evidence(
        "Will Victor Wembanyama win the 2025-2026 NBA Defensive Player of the Year?"
    )

    assert assessment.shape == "ambiguous"
    assert assessment.eligible is False
    assert assessment.skip_reason == "unsupported_award_or_person_market"
    assert assessment.teams == []
