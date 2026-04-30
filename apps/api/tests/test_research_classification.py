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
            "Lakers vs Warriors",
            "nba",
            "match_winner",
            "sports_nba_match_winner",
        ),
        (
            "Lakers v Warriors",
            "nba",
            "match_winner",
            "sports_nba_match_winner",
        ),
        (
            "Will Lakers defeat Warriors?",
            "nba",
            "match_winner",
            "sports_nba_match_winner",
        ),
        (
            "Will Lakers win against Warriors?",
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
            "Real Madrid vs Barcelona",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Manchester City vs Liverpool",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Inter Miami vs LAFC",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Champions League: Arsenal vs Bayern",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "UFC 300: Jones vs. Aspinall",
            "mma",
            "match_winner",
            "sports_generic",
        ),
        (
            "UFC Fight Night main event: Pereira vs Ankalaev",
            "mma",
            "match_winner",
            "sports_generic",
        ),
        (
            "NHL: Rangers vs Bruins",
            "nhl",
            "match_winner",
            "sports_generic",
        ),
        (
            "Alcaraz vs Djokovic",
            "tennis",
            "match_winner",
            "sports_generic",
        ),
        (
            "WTA: Swiatek vs Sabalenka",
            "tennis",
            "match_winner",
            "sports_generic",
        ),
        (
            "T20 World Cup: India vs Australia",
            "cricket",
            "match_winner",
            "sports_generic",
        ),
        (
            "IPL: Mumbai Indians vs Chennai Super Kings",
            "cricket",
            "match_winner",
            "sports_generic",
        ),
        (
            "KBO: SSG Landers vs. Samsung Lions",
            "mlb",
            "match_winner",
            "sports_generic",
        ),
        (
            "AFC Wimbledon vs Huddersfield Town AFC",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Will Vissel Kobe win on 2026-04-29?",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Yokohama F. Marinos vs Urawa Reds",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "FC Tokyo vs Kawasaki Frontale",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Manchester United vs Chelsea",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Boca Juniors vs River Plate",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Flamengo vs Palmeiras",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Pohang Steelers FC vs Ulsan HD FC",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Club Alianza Atlético vs CSyD Macará",
            "soccer",
            "match_winner",
            "sports_generic",
        ),
        (
            "Yankees vs Dodgers",
            "mlb",
            "match_winner",
            "sports_generic",
        ),
        (
            "New York Yankees vs. Boston Red Sox",
            "mlb",
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
        (
            "World Series winner",
            "mlb",
            "championship",
            "sports_generic",
        ),
        (
            "NBA Playoffs: Suns vs. Thunder Total Games O/U 4.5",
            "nba",
            "team_prop",
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


def test_ambiguous_city_does_not_force_soccer() -> None:
    classification = classify_market_research_context(question="Will City win on 2026-04-29?")

    assert classification.sport == "other"
    assert classification.vertical == "other"


def test_euroleague_slug_overrides_soccer_club_name_collision() -> None:
    classification = classify_market_research_context(
        question="Valencia vs. Panathinaikos",
        event_title="euroleague-valencia-panathin-2026-04-30",
        event_category="sports",
    )

    assert classification.sport == "nba"
    assert classification.market_shape == "match_winner"


def test_public_inference_helpers() -> None:
    assert infer_sport(question="Will the Chiefs beat the Bills?") == "nfl"
    assert infer_sport(question="Will the Kansas City Chiefs win on 2026-04-29?") == "nfl"
    assert (
        infer_sport(
            question="Will Pohang Steelers FC win?",
            event_title="Pohang Steelers FC vs Ulsan HD FC",
            sport_type="nba",
        )
        == "soccer"
    )
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


def test_non_winner_sports_markets_are_not_match_winner_focus() -> None:
    assert (
        infer_market_shape(
            question="Pakistan Super League: Lahore Qalandars vs Quetta Gladiators - Who wins the toss?",
            sport="cricket",
        )
        == "team_prop"
    )
    assert (
        infer_market_shape(
            question="JEF United Ichihara Chiba vs. Yokohama F. Marinos: Both Teams to Score",
            sport="soccer",
        )
        == "yes_no_generic"
    )
    assert (
        infer_market_shape(
            question="Will Jack Della Maddalena win by KO or TKO?",
            sport="mma",
        )
        == "team_prop"
    )
