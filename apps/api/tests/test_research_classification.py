from __future__ import annotations

import pytest

from app.services.research.classification import (
    classify_market_research_context,
    infer_market_shape,
    infer_sport,
    select_research_template,
)


@pytest.mark.parametrize(
    ("question", "sport", "market_shape", "template"),
    [
        (
            "Will the Lakers beat the Warriors?",
            "nba",
            "match_winner",
            "sports_nba_match_winner",
        ),
        (
            "Will the Boston Celtics win the NBA Finals?",
            "nba",
            "championship",
            "sports_nba_futures",
        ),
        (
            "Will the Denver Nuggets win the NBA Championship?",
            "nba",
            "championship",
            "sports_nba_futures",
        ),
        (
            "Will the Chiefs beat the Bills?",
            "nfl",
            "match_winner",
            "sports_generic",
        ),
        (
            "Will Real Madrid beat Barcelona?",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Will Secretariat win the Kentucky Derby?",
            "horse_racing",
            "race_winner",
            "sports_generic",
        ),
        (
            "Will LeBron James score over 25.5 points?",
            "nba",
            "player_prop",
            "sports_generic",
        ),
    ],
)
def test_classify_sports_market_examples(
    question: str,
    sport: str,
    market_shape: str,
    template: str,
) -> None:
    classification = classify_market_research_context(question=question)

    assert classification.vertical == "sports"
    assert classification.sport == sport
    assert classification.market_shape == market_shape
    assert classification.research_template_name == template
    assert classification.classification_reason


def test_classify_ambiguous_sports_yes_no_market() -> None:
    classification = classify_market_research_context(
        question="Will this sports market resolve to Yes?",
        event_category="sports",
    )

    assert classification.vertical == "sports"
    assert classification.sport == "other"
    assert classification.market_shape == "yes_no_generic"
    assert classification.research_template_name == "sports_generic"


def test_public_inference_helpers() -> None:
    assert infer_sport(question="Will the Chiefs beat the Bills?") == "nfl"
    assert (
        infer_market_shape(question="Will Real Madrid beat Barcelona?", sport="soccer")
        == "match_winner"
    )
    assert (
        select_research_template(
            vertical="sports",
            sport="nba",
            market_shape="championship",
        )
        == "sports_nba_futures"
    )
