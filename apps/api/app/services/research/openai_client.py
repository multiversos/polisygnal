from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from app.core.config import Settings
from app.models.market import Market
from app.services.research.prompts import build_cheap_research_prompt, trusted_domains_for_market
from app.services.research.screener import ResearchScreeningDecision


@dataclass(slots=True)
class CheapResearchPreparation:
    model_used: str
    web_search_used: bool
    request_preview: dict[str, object]
    notes: list[str] = field(default_factory=list)


class ResearchOpenAIClient:
    def __init__(
        self,
        *,
        settings: Settings,
        client: httpx.Client | None = None,
    ) -> None:
        self._settings = settings
        self._client = client
        self._owns_client = client is None
        if self._client is None:
            self._client = httpx.Client(
                base_url=settings.openai_base_url,
                timeout=settings.research_timeout_seconds,
            )

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.openai_api_key)

    def prepare_cheap_research(
        self,
        *,
        market: Market,
        screening: ResearchScreeningDecision,
    ) -> CheapResearchPreparation:
        prompt = build_cheap_research_prompt(market, screening)
        domains = trusted_domains_for_market(screening)
        return CheapResearchPreparation(
            model_used=self._settings.research_cheap_model,
            web_search_used=False,
            request_preview={
                "model": self._settings.research_cheap_model,
                "tooling": "responses_api_web_search_stub",
                "allowed_domains": domains,
                "system_prompt": prompt["system"],
                "user_prompt": prompt["user"],
            },
            notes=[
                "cheap_research configurado pero todavia en modo stub; se ejecuta fallback local_only.",
            ],
        )

    def close(self) -> None:
        if self._owns_client and self._client is not None:
            self._client.close()
