from __future__ import annotations

from dataclasses import dataclass

from app.models.market import Market
from app.services.nba_team_matching import assess_market_for_evidence
from app.services.research.classification import classify_market_research_context


@dataclass(slots=True)
class ResearchScreeningDecision:
    vertical: str
    subvertical: str | None
    market_shape: str
    should_research: bool
    skip_reason: str | None


def screen_market_for_research(market: Market) -> ResearchScreeningDecision:
    assessment = assess_market_for_evidence(market.question)
    classification = classify_market_research_context(market=market)

    if market.closed:
        return ResearchScreeningDecision(
            vertical=classification.vertical,
            subvertical=classification.sport,
            market_shape=classification.market_shape,
            should_research=False,
            skip_reason="market_closed",
        )
    if not market.active:
        return ResearchScreeningDecision(
            vertical=classification.vertical,
            subvertical=classification.sport,
            market_shape=classification.market_shape,
            should_research=False,
            skip_reason="market_inactive",
        )

    return ResearchScreeningDecision(
        vertical=classification.vertical,
        subvertical=classification.sport,
        market_shape=classification.market_shape,
        should_research=True,
        skip_reason=assessment.skip_reason,
    )
