from __future__ import annotations

from app.services.research.templates.base import ResearchPromptTemplate

NBA_TRUSTED_DOMAINS = (
    "nba.com",
    "espn.com",
    "basketball-reference.com",
    "statmuse.com",
    "apnews.com",
    "reuters.com",
)

NBA_MATCH_WINNER_RESEARCH_INSTRUCTIONS = (
    "Research this NBA match winner or head-to-head series market using external "
    "evidence beyond Polymarket price. Prioritize injuries, available lineups, recent "
    "team form, home/away context, rest, schedule difficulty, external odds, recent "
    "news, and offensive/defensive statistics. Include both pro-YES and anti-YES "
    "evidence. Separate factual observations from inferences. If sources are unclear, "
    "lower credibility_score. Keep recommended_probability_adjustment between -0.12 "
    "and 0.12. If evidence is thin, keep the adjustment small and explain the "
    "uncertainty."
)

SPORTS_NBA_MATCH_WINNER_TEMPLATE = ResearchPromptTemplate(
    name="sports_nba_match_winner",
    vertical="sports",
    sport="nba",
    market_shape="match_winner",
    trusted_domains=NBA_TRUSTED_DOMAINS,
    instructions=NBA_MATCH_WINNER_RESEARCH_INSTRUCTIONS,
)
