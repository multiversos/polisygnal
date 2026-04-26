from __future__ import annotations

from decimal import Decimal

from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.services.research.prompts import build_cheap_research_prompt, select_research_template
from app.services.research.screener import ResearchScreeningDecision


def test_select_research_template_uses_nba_winner_adapter() -> None:
    screening = ResearchScreeningDecision(
        vertical="sports",
        subvertical="nba",
        market_shape="matchup",
        should_research=True,
        skip_reason=None,
    )

    template = select_research_template(screening=screening)

    assert template.name == "sports_nba_match_winner"
    assert template.vertical == "sports"
    assert template.sport == "nba"
    assert template.market_shape == "match_winner"
    assert "nba.com" in template.trusted_domains
    assert "injuries" in template.instructions


def test_select_research_template_uses_generic_sports_fallback() -> None:
    screening = ResearchScreeningDecision(
        vertical="sports",
        subvertical="horse racing",
        market_shape="race_winner",
        should_research=True,
        skip_reason=None,
    )

    template = select_research_template(screening=screening)

    assert template.name == "sports_generic"
    assert template.vertical == "sports"
    assert template.sport == "horse_racing"
    assert template.market_shape == "race_winner"
    assert "sports market" in template.instructions


def test_build_cheap_research_prompt_is_template_routed() -> None:
    screening = ResearchScreeningDecision(
        vertical="sports",
        subvertical="nba",
        market_shape="winner",
        should_research=True,
        skip_reason=None,
    )
    market = Market(
        id=123,
        polymarket_market_id="market-template",
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        slug="market-template",
        sport_type="nba",
        market_type="winner",
        active=True,
        closed=False,
    )
    snapshot = MarketSnapshot(
        market_id=123,
        yes_price=Decimal("0.5400"),
        no_price=Decimal("0.4600"),
        liquidity=Decimal("250000.0000"),
        volume=Decimal("1500.0000"),
    )

    prompt = build_cheap_research_prompt(market, screening, snapshot=snapshot)

    assert prompt["research_template"] == "sports_nba_match_winner"
    assert "Sport: nba" in prompt["user"]
    assert "Market shape: match_winner" in prompt["user"]
    assert "Classification reason:" in prompt["user"]
    assert "offensive/defensive statistics" in prompt["user"]
