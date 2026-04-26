from __future__ import annotations

from decimal import Decimal

from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.services.research.screener import ResearchScreeningDecision
from app.services.research.templates.base import ResearchPromptTemplate
from app.services.research.templates.sports_nba_winner import SPORTS_NBA_WINNER_TEMPLATE

DEFAULT_TRUSTED_GENERAL_DOMAINS = (
    "reuters.com",
    "apnews.com",
)

DEFAULT_TRUSTED_SPORTS_DOMAINS = (
    "espn.com",
    "apnews.com",
    "reuters.com",
)

SUPPORTED_SPORTS = {
    "nba",
    "nfl",
    "soccer",
    "horse_racing",
    "mlb",
    "tennis",
    "mma",
    "other",
}

CHEAP_RESEARCH_SYSTEM_PROMPT = (
    "You are PolySignal research. Use cheap web-backed research, not Deep Research. "
    "Produce strict JSON only. Separate facts from inferences, include evidence for and "
    "against the YES outcome, cite real sources, and never invent a source or URL. "
    "The confidence_score is evidence quality, not win probability. Do not recommend "
    "automatic betting or execution."
)

GENERIC_RESEARCH_INSTRUCTIONS = (
    "Research this Polymarket market using external evidence beyond Polymarket price. "
    "Use the market's vertical, sport, and market shape to choose relevant factors. "
    "Include both pro-YES and anti-YES evidence, cite reliable sources, explicitly state "
    "uncertainty, and keep recommended_probability_adjustment between -0.12 and 0.12. "
    "If evidence is thin or sources are unclear, keep the adjustment small and lower "
    "credibility_score."
)


GENERIC_RESEARCH_TEMPLATE = ResearchPromptTemplate(
    name="generic_market",
    vertical="general",
    sport=None,
    market_shape="other",
    trusted_domains=DEFAULT_TRUSTED_GENERAL_DOMAINS,
    instructions=GENERIC_RESEARCH_INSTRUCTIONS,
)


def trusted_domains_for_market(screening: ResearchScreeningDecision) -> list[str]:
    template = select_research_template(screening=screening)
    return list(template.trusted_domains)


def select_research_template(
    *,
    screening: ResearchScreeningDecision,
) -> ResearchPromptTemplate:
    vertical = _normalize_vertical(screening.vertical)
    sport = _normalize_sport(screening.subvertical)
    market_shape = _normalize_market_shape(screening.market_shape)

    if (
        vertical == "sports"
        and sport == "nba"
        and market_shape in {"winner", "championship", "match_winner"}
    ):
        return SPORTS_NBA_WINNER_TEMPLATE

    if vertical == "sports":
        return ResearchPromptTemplate(
            name=f"sports_{sport or 'other'}_{market_shape}",
            vertical="sports",
            sport=sport or "other",
            market_shape=market_shape,
            trusted_domains=DEFAULT_TRUSTED_SPORTS_DOMAINS,
            instructions=GENERIC_RESEARCH_INSTRUCTIONS,
        )

    return GENERIC_RESEARCH_TEMPLATE


def build_cheap_research_prompt(
    market: Market,
    screening: ResearchScreeningDecision,
    *,
    snapshot: MarketSnapshot | None = None,
    allowed_domains: list[str] | None = None,
    blocked_domains: list[str] | None = None,
    max_sources: int = 6,
) -> dict[str, str]:
    template = select_research_template(screening=screening)
    baseline = _format_decimal(snapshot.yes_price) if snapshot is not None else "unknown"
    no_price = _format_decimal(snapshot.no_price) if snapshot is not None else "unknown"
    liquidity = _format_decimal(snapshot.liquidity) if snapshot is not None else "unknown"
    volume = _format_decimal(snapshot.volume) if snapshot is not None else "unknown"
    allowed = ", ".join(allowed_domains or list(template.trusted_domains))
    blocked = ", ".join(blocked_domains or []) or "none"
    sport = _normalize_sport(screening.subvertical) or "other"
    market_shape = _normalize_market_shape(screening.market_shape)

    user_prompt = (
        f"Research template: {template.name}\n"
        f"Market question: {market.question}\n"
        f"Vertical: {_normalize_vertical(screening.vertical)}\n"
        f"Sport: {sport}\n"
        f"Market shape: {market_shape}\n"
        f"Raw sport_type: {market.sport_type or 'unknown'}\n"
        f"Raw market_type: {market.market_type or 'unknown'}\n"
        f"Current Polymarket YES baseline: {baseline}\n"
        f"Current Polymarket NO price: {no_price}\n"
        f"Liquidity: {liquidity}\n"
        f"Volume: {volume}\n"
        f"Preferred source domains: {allowed}\n"
        f"Blocked source domains: {blocked}\n"
        f"Maximum cited sources to use: {max_sources}\n\n"
        f"{template.instructions}\n\n"
        "Return JSON with exactly these top-level fields: market_summary, participants, "
        "evidence_for_yes, evidence_against_yes, risks, confidence_score, "
        "recommended_probability_adjustment, final_reasoning, recommendation. "
        "Each evidence item must include claim, factor_type, impact_score, freshness_score, "
        "credibility_score, source_name, citation_url, and published_at. Claims should state "
        "whether they are factual observations or inferences."
    )
    return {
        "system": CHEAP_RESEARCH_SYSTEM_PROMPT,
        "user": user_prompt,
        "research_template": template.name,
    }


def _normalize_vertical(value: str | None) -> str:
    parsed = (value or "").strip().lower()
    if parsed in {"sports", "sport"}:
        return "sports"
    return parsed or "general"


def _normalize_sport(value: str | None) -> str | None:
    parsed = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "football": "soccer",
        "ufc": "mma",
        "mixed_martial_arts": "mma",
        "horse": "horse_racing",
        "horse_race": "horse_racing",
        "horses": "horse_racing",
    }
    parsed = aliases.get(parsed, parsed)
    if not parsed:
        return None
    if parsed in SUPPORTED_SPORTS:
        return parsed
    return "other"


def _normalize_market_shape(value: str | None) -> str:
    parsed = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "matchup": "match_winner",
        "winner": "winner",
        "champion": "championship",
        "championship_winner": "championship",
        "race": "race_winner",
    }
    return aliases.get(parsed, parsed or "other")


def _format_decimal(value: Decimal | None) -> str:
    if value is None:
        return "unknown"
    return str(value)
