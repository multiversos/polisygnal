from __future__ import annotations

from app.services.research.templates.base import ResearchPromptTemplate

SPORTS_TRUSTED_DOMAINS = (
    "espn.com",
    "apnews.com",
    "reuters.com",
)

SPORTS_GENERIC_RESEARCH_INSTRUCTIONS = (
    "Research this sports market using external evidence beyond Polymarket price. "
    "Adapt factors to the sport and market shape instead of assuming NBA. Include both "
    "pro-YES and anti-YES evidence, cite reliable sources, separate factual observations "
    "from inferences, state uncertainty, and keep recommended_probability_adjustment "
    "between -0.12 and 0.12. If the sport or market shape is ambiguous, keep the "
    "adjustment small and lower credibility_score."
)

SPORTS_GENERIC_TEMPLATE = ResearchPromptTemplate(
    name="sports_generic",
    vertical="sports",
    sport="other",
    market_shape="other",
    trusted_domains=SPORTS_TRUSTED_DOMAINS,
    instructions=SPORTS_GENERIC_RESEARCH_INSTRUCTIONS,
)
