from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ResearchPromptTemplate:
    name: str
    vertical: str
    sport: str | None
    market_shape: str
    trusted_domains: tuple[str, ...]
    instructions: str
