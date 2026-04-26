from __future__ import annotations

from dataclasses import dataclass

from app.models.market import Market
from app.services.nba_team_matching import assess_market_for_evidence


@dataclass(slots=True)
class ResearchScreeningDecision:
    vertical: str
    subvertical: str | None
    market_shape: str
    should_research: bool
    skip_reason: str | None


def screen_market_for_research(market: Market) -> ResearchScreeningDecision:
    assessment = assess_market_for_evidence(market.question)
    vertical = (market.event.category if market.event is not None else None) or (
        "sports" if market.sport_type else "general"
    )
    subvertical = market.sport_type
    market_shape = assessment.shape if assessment.shape else (market.market_type or "unknown")

    if market.closed:
        return ResearchScreeningDecision(
            vertical=vertical,
            subvertical=subvertical,
            market_shape=market_shape,
            should_research=False,
            skip_reason="market_closed",
        )
    if not market.active:
        return ResearchScreeningDecision(
            vertical=vertical,
            subvertical=subvertical,
            market_shape=market_shape,
            should_research=False,
            skip_reason="market_inactive",
        )

    return ResearchScreeningDecision(
        vertical=vertical,
        subvertical=subvertical,
        market_shape=market_shape,
        should_research=True,
        skip_reason=assessment.skip_reason,
    )
