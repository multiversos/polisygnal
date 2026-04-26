from __future__ import annotations

from app.models.market import Market
from app.services.research.screener import ResearchScreeningDecision

DEFAULT_TRUSTED_SPORTS_DOMAINS = (
    "nba.com",
    "espn.com",
    "basketball-reference.com",
    "statmuse.com",
    "apnews.com",
    "reuters.com",
)

CHEAP_RESEARCH_SYSTEM_PROMPT = (
    "You are PolySignal research. Gather external evidence, separate evidence for and "
    "against, and avoid drifting away from the market baseline without support."
)


def trusted_domains_for_market(screening: ResearchScreeningDecision) -> list[str]:
    if screening.vertical == "sports":
        return list(DEFAULT_TRUSTED_SPORTS_DOMAINS)
    return ["reuters.com", "apnews.com"]


def build_cheap_research_prompt(
    market: Market,
    screening: ResearchScreeningDecision,
) -> dict[str, str]:
    return {
        "system": CHEAP_RESEARCH_SYSTEM_PROMPT,
        "user": (
            "Market question: "
            f"{market.question}\n"
            f"Vertical: {screening.vertical}\n"
            f"Subvertical: {screening.subvertical or 'unknown'}\n"
            f"Market shape: {screening.market_shape}\n"
            "Return evidence for, evidence against, risks, and a calibrated probability "
            "adjustment from the current Polymarket baseline."
        ),
    }
