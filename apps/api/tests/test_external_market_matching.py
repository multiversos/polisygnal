from __future__ import annotations

from decimal import Decimal

from app.services.external_market_matching import (
    estimate_match_confidence,
    extract_years,
    normalize_title_for_matching,
    simple_title_similarity,
)


def test_normalize_title_and_extract_years() -> None:
    assert normalize_title_for_matching("Will OKC win the 2026 NBA Finals?") == (
        "will okc win the 2026 nba finals"
    )
    assert extract_years("NBA Finals 2026 and 2027") == {"2026", "2027"}


def test_title_similarity_scores_token_overlap() -> None:
    assert simple_title_similarity(
        "Will the Lakers beat the Warriors?",
        "Lakers vs Warriors",
    ) > Decimal("0.3000")


def test_match_confidence_reasonable_for_same_nba_finals_team_and_year() -> None:
    result = estimate_match_confidence(
        {"question": "Will the Oklahoma City Thunder win the 2026 NBA Finals?"},
        {"title": "Oklahoma City Thunder NBA Championship 2026"},
    )

    assert result.match_confidence >= Decimal("0.6000")
    assert "year_overlap" in result.match_reason
    assert "same_nba_participants" in result.match_reason


def test_match_confidence_high_for_same_match_winner_participants() -> None:
    result = estimate_match_confidence(
        {"question": "Will the Lakers beat the Warriors?"},
        {"title": "Lakers vs Warriors"},
    )

    assert result.match_confidence >= Decimal("0.7000")
    assert "same_nba_participants" in result.match_reason


def test_match_confidence_low_for_different_markets() -> None:
    result = estimate_match_confidence(
        {"question": "Will the Lakers beat the Warriors?"},
        {"title": "Will the Boston Celtics win the 2026 NBA Finals?"},
    )

    assert result.match_confidence < Decimal("0.5000")
    assert "participant_mismatch" in result.warnings


def test_match_confidence_penalizes_year_mismatch() -> None:
    result = estimate_match_confidence(
        {"question": "Will the Denver Nuggets win the 2026 NBA Championship?"},
        {"title": "Will the Denver Nuggets win the 2027 NBA Championship?"},
    )

    assert result.match_confidence < Decimal("0.7000")
    assert "year_mismatch" in result.warnings


def test_match_confidence_low_when_participants_unclear() -> None:
    result = estimate_match_confidence(
        {"question": "Will a major sports team win this season?"},
        {"title": "Sports championship market"},
    )

    assert result.match_confidence < Decimal("0.4000")
    assert "participants_not_detected" in result.warnings
