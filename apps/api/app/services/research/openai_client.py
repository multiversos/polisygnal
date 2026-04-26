from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

import httpx

from app.core.config import Settings
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.services.research.prompts import build_cheap_research_prompt, trusted_domains_for_market
from app.services.research.screener import ResearchScreeningDecision

ZERO = Decimal("0")
ONE = Decimal("1")
MAX_ADJUSTMENT = Decimal("0.1200")
PROBABILITY_SCALE = Decimal("0.0001")


@dataclass(slots=True)
class CheapResearchEvidence:
    claim: str
    factor_type: str
    impact_score: Decimal
    freshness_score: Decimal
    credibility_score: Decimal
    source_name: str | None
    citation_url: str | None
    published_at: datetime | None
    evidence_summary: str
    stance: str


@dataclass(slots=True)
class CheapResearchOutput:
    market_summary: str
    participants: list[str]
    evidence_for_yes: list[CheapResearchEvidence]
    evidence_against_yes: list[CheapResearchEvidence]
    risks: list[dict[str, object]]
    confidence_score: Decimal
    recommended_probability_adjustment: Decimal
    final_reasoning: str
    recommendation: str
    raw_json: dict[str, object]


@dataclass(slots=True)
class CheapResearchResult:
    ok: bool
    model_used: str | None = None
    web_search_used: bool = False
    request_preview: dict[str, object] | None = None
    output: CheapResearchOutput | None = None
    error_message: str | None = None
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
                timeout=settings.openai_research_timeout_seconds,
            )

    @property
    def is_enabled(self) -> bool:
        return self._settings.openai_research_enabled

    @property
    def is_configured(self) -> bool:
        return self.is_enabled and bool(self._settings.openai_api_key)

    def run_cheap_research(
        self,
        *,
        market: Market,
        snapshot: MarketSnapshot,
        screening: ResearchScreeningDecision,
    ) -> CheapResearchResult:
        allowed_domains = _resolve_allowed_domains(
            configured_domains=self._settings.openai_research_allowed_domains,
            blocked_domains=self._settings.openai_research_blocked_domains,
            screening=screening,
        )
        blocked_domains = self._settings.openai_research_blocked_domains
        prompt = build_cheap_research_prompt(
            market,
            screening,
            snapshot=snapshot,
            allowed_domains=allowed_domains,
            blocked_domains=blocked_domains,
            max_sources=self._settings.openai_research_max_sources,
        )
        payload = _build_responses_payload(
            model=self._settings.openai_research_model,
            prompt=prompt,
            allowed_domains=allowed_domains,
        )
        request_preview = {
            "model": self._settings.openai_research_model,
            "tooling": "responses_api_web_search",
            "allowed_domains": allowed_domains,
            "blocked_domains": blocked_domains,
            "max_sources": self._settings.openai_research_max_sources,
            "research_template": prompt["research_template"],
            "system_prompt": prompt["system"],
            "user_prompt": prompt["user"],
        }

        if not self.is_enabled:
            return CheapResearchResult(
                ok=False,
                model_used=self._settings.openai_research_model,
                request_preview=request_preview,
                error_message="OPENAI_RESEARCH_ENABLED=false; cheap_research cae a local_only.",
            )
        if not self._settings.openai_api_key:
            return CheapResearchResult(
                ok=False,
                model_used=self._settings.openai_research_model,
                request_preview=request_preview,
                error_message="OPENAI_API_KEY ausente; cheap_research cae automaticamente a local_only.",
            )

        try:
            assert self._client is not None
            response = self._client.post(
                "/responses",
                headers={
                    "Authorization": f"Bearer {self._settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
            output_text = _extract_output_text(body)
            parsed = json.loads(output_text)
            normalized = _normalize_research_output(parsed)
            return CheapResearchResult(
                ok=True,
                model_used=self._settings.openai_research_model,
                web_search_used=True,
                request_preview=request_preview,
                output=normalized,
            )
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.HTTPError) as exc:
            return CheapResearchResult(
                ok=False,
                model_used=self._settings.openai_research_model,
                request_preview=request_preview,
                error_message=f"OpenAI cheap_research fallo: {type(exc).__name__}: {exc}",
            )
        except (json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
            return CheapResearchResult(
                ok=False,
                model_used=self._settings.openai_research_model,
                request_preview=request_preview,
                error_message=f"OpenAI cheap_research devolvio schema invalido: {exc}",
            )
        except Exception as exc:
            return CheapResearchResult(
                ok=False,
                model_used=self._settings.openai_research_model,
                request_preview=request_preview,
                error_message=f"OpenAI cheap_research fallo inesperadamente: {type(exc).__name__}: {exc}",
            )

    def close(self) -> None:
        if self._owns_client and self._client is not None:
            self._client.close()


def _resolve_allowed_domains(
    *,
    configured_domains: list[str],
    blocked_domains: list[str],
    screening: ResearchScreeningDecision,
) -> list[str]:
    domains = configured_domains or trusted_domains_for_market(screening)
    blocked = {domain.lower() for domain in blocked_domains}
    return [domain for domain in domains if domain.lower() not in blocked]


def _build_responses_payload(
    *,
    model: str,
    prompt: dict[str, str],
    allowed_domains: list[str],
) -> dict[str, object]:
    web_search_tool: dict[str, object] = {
        "type": "web_search",
        "search_context_size": "low",
    }
    if allowed_domains:
        web_search_tool["filters"] = {"allowed_domains": allowed_domains[:100]}
    return {
        "model": model,
        "tools": [web_search_tool],
        "tool_choice": "auto",
        "include": ["web_search_call.action.sources"],
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": prompt["system"]}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": prompt["user"]}],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "polysignal_cheap_research",
                "strict": True,
                "schema": _research_output_schema(),
            }
        },
    }


def _research_output_schema() -> dict[str, object]:
    evidence_schema: dict[str, object] = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "claim": {"type": "string"},
            "factor_type": {"type": "string"},
            "impact_score": {"type": "number", "minimum": 0, "maximum": 1},
            "freshness_score": {"type": "number", "minimum": 0, "maximum": 1},
            "credibility_score": {"type": "number", "minimum": 0, "maximum": 1},
            "source_name": {"type": "string"},
            "citation_url": {"type": "string"},
            "published_at": {"type": "string"},
        },
        "required": [
            "claim",
            "factor_type",
            "impact_score",
            "freshness_score",
            "credibility_score",
            "source_name",
            "citation_url",
            "published_at",
        ],
    }
    risk_schema: dict[str, object] = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "code": {"type": "string"},
            "summary": {"type": "string"},
        },
        "required": ["code", "summary"],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "market_summary": {"type": "string"},
            "participants": {"type": "array", "items": {"type": "string"}},
            "evidence_for_yes": {"type": "array", "items": evidence_schema},
            "evidence_against_yes": {"type": "array", "items": evidence_schema},
            "risks": {"type": "array", "items": risk_schema},
            "confidence_score": {"type": "number", "minimum": 0, "maximum": 1},
            "recommended_probability_adjustment": {
                "type": "number",
                "minimum": -0.12,
                "maximum": 0.12,
            },
            "final_reasoning": {"type": "string"},
            "recommendation": {
                "type": "string",
                "enum": ["hold", "lean_yes", "lean_no", "avoid"],
            },
        },
        "required": [
            "market_summary",
            "participants",
            "evidence_for_yes",
            "evidence_against_yes",
            "risks",
            "confidence_score",
            "recommended_probability_adjustment",
            "final_reasoning",
            "recommendation",
        ],
    }


def _extract_output_text(body: dict[str, Any]) -> str:
    output_text = body.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    chunks: list[str] = []
    for item in body.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    joined = "".join(chunks).strip()
    if not joined:
        raise ValueError("La respuesta de OpenAI no contiene output_text.")
    return joined


def _normalize_research_output(raw: object) -> CheapResearchOutput:
    if not isinstance(raw, dict):
        raise ValueError("La salida estructurada debe ser un objeto JSON.")

    evidence_for = [
        _normalize_evidence(item, stance="favor")
        for item in _as_list(raw.get("evidence_for_yes"))
    ]
    evidence_against = [
        _normalize_evidence(item, stance="against")
        for item in _as_list(raw.get("evidence_against_yes"))
    ]
    if not evidence_for and not evidence_against:
        raise ValueError("La salida no incluye evidencia a favor ni en contra.")

    confidence_score = _clamp_probability(_decimal_from_value(raw.get("confidence_score")))
    adjustment = _clamp_adjustment(
        _decimal_from_value(raw.get("recommended_probability_adjustment"))
    )
    return CheapResearchOutput(
        market_summary=_required_str(raw, "market_summary"),
        participants=[str(item).strip() for item in _as_list(raw.get("participants")) if str(item).strip()],
        evidence_for_yes=evidence_for,
        evidence_against_yes=evidence_against,
        risks=[_normalize_risk(item) for item in _as_list(raw.get("risks"))],
        confidence_score=confidence_score,
        recommended_probability_adjustment=adjustment,
        final_reasoning=_required_str(raw, "final_reasoning"),
        recommendation=_normalize_recommendation(raw.get("recommendation")),
        raw_json=dict(raw),
    )


def _normalize_evidence(raw: object, *, stance: str) -> CheapResearchEvidence:
    if not isinstance(raw, dict):
        raise ValueError("Cada evidencia debe ser un objeto JSON.")
    claim = _required_str(raw, "claim")
    source_name = _optional_str(raw.get("source_name"))
    citation_url = _optional_str(raw.get("citation_url"))
    credibility = _clamp_probability(_decimal_from_value(raw.get("credibility_score")))
    if not source_name or not citation_url:
        credibility = min(credibility, Decimal("0.3500"))
    return CheapResearchEvidence(
        claim=claim,
        factor_type=_required_str(raw, "factor_type"),
        impact_score=_clamp_probability(_decimal_from_value(raw.get("impact_score"))),
        freshness_score=_clamp_probability(_decimal_from_value(raw.get("freshness_score"))),
        credibility_score=credibility.quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP),
        source_name=source_name,
        citation_url=citation_url,
        published_at=_parse_datetime(raw.get("published_at")),
        evidence_summary=claim,
        stance=stance,
    )


def _normalize_risk(raw: object) -> dict[str, object]:
    if isinstance(raw, str):
        return {"code": "risk", "summary": raw}
    if not isinstance(raw, dict):
        return {"code": "risk", "summary": str(raw)}
    return {
        "code": _optional_str(raw.get("code")) or "risk",
        "summary": _optional_str(raw.get("summary")) or str(raw),
    }


def _normalize_recommendation(value: object) -> str:
    recommendation = str(value or "hold").strip().lower()
    if recommendation not in {"hold", "lean_yes", "lean_no", "avoid"}:
        return "hold"
    return recommendation


def _as_list(value: object) -> list[object]:
    if isinstance(value, list):
        return value
    return []


def _required_str(raw: dict[str, object], key: str) -> str:
    value = _optional_str(raw.get(key))
    if not value:
        raise ValueError(f"Campo requerido ausente o vacio: {key}")
    return value


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    parsed = str(value).strip()
    return parsed or None


def _decimal_from_value(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return ZERO


def _clamp_probability(value: Decimal) -> Decimal:
    return max(min(value, ONE), ZERO).quantize(PROBABILITY_SCALE, rounding=ROUND_HALF_UP)


def _clamp_adjustment(value: Decimal) -> Decimal:
    return max(min(value, MAX_ADJUSTMENT), ZERO - MAX_ADJUSTMENT).quantize(
        PROBABILITY_SCALE,
        rounding=ROUND_HALF_UP,
    )


def _parse_datetime(value: object) -> datetime | None:
    text = _optional_str(value)
    if not text or text.lower() in {"unknown", "n/a", "none"}:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
