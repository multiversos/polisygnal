from __future__ import annotations

from app.services.research.templates.base import ResearchPromptTemplate
from app.services.research.templates.sports_nba_match_winner import NBA_TRUSTED_DOMAINS

NBA_FUTURES_RESEARCH_INSTRUCTIONS = (
    "Research this NBA championship or futures market using external evidence beyond "
    "Polymarket price. Prioritize roster health, playoff path, standings, seeding, "
    "schedule difficulty, recent form, power ratings, external odds, tiebreakers, and "
    "recent news. Include both pro-YES and anti-YES evidence. Separate factual "
    "observations from inferences, cite real sources, state uncertainty, and keep "
    "recommended_probability_adjustment between -0.12 and 0.12. Futures markets are "
    "high variance, so use smaller adjustments when evidence is thin."
)

SPORTS_NBA_FUTURES_TEMPLATE = ResearchPromptTemplate(
    name="sports_nba_futures",
    vertical="sports",
    sport="nba",
    market_shape="futures",
    trusted_domains=NBA_TRUSTED_DOMAINS,
    instructions=NBA_FUTURES_RESEARCH_INSTRUCTIONS,
)
