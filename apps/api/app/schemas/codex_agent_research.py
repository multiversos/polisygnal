from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CODEX_AGENT_OUTPUT_SCHEMA_VERSION = "codex_agent_research_v1"


class CodexAgentResearchConstraints(BaseModel):
    return_valid_json_only: bool = True
    do_not_invent_sources: bool = True
    include_evidence_for_and_against: bool = True
    separate_facts_from_inferences: bool = True
    include_risks: bool = True
    cite_sources_when_available: bool = True
    max_recommended_probability_adjustment: Decimal = Decimal("0.1200")
    no_automatic_betting: bool = True

    model_config = ConfigDict(extra="forbid")


class CodexAgentSnapshotPayload(BaseModel):
    id: int | None = None
    captured_at: datetime | None = None
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    midpoint: Decimal | None = None
    last_trade_price: Decimal | None = None
    spread: Decimal | None = None
    volume: Decimal | None = None
    liquidity: Decimal | None = None

    model_config = ConfigDict(extra="forbid")


class CodexAgentExistingEvidencePayload(BaseModel):
    evidence_type: str
    stance: str
    strength: Decimal | None = None
    confidence: Decimal | None = None
    summary: str
    source_name: str | None = None
    citation_url: str | None = None
    published_at: datetime | None = None

    model_config = ConfigDict(extra="forbid")


class CodexAgentResearchRequest(BaseModel):
    run_id: int
    market_id: int
    market_question: str
    market_slug: str | None = None
    event_title: str | None = None
    vertical: str
    sport: str | None = None
    market_shape: str
    current_market_yes_price: Decimal | None = None
    current_market_no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    close_time: datetime | None = None
    latest_snapshot: CodexAgentSnapshotPayload | None = None
    existing_evidence: list[CodexAgentExistingEvidencePayload] = Field(default_factory=list)
    research_template_name: str
    classification_reason: str | None = None
    classification_metadata: dict[str, str] = Field(default_factory=dict)
    instructions: str
    output_schema_version: str = CODEX_AGENT_OUTPUT_SCHEMA_VERSION
    constraints: CodexAgentResearchConstraints = Field(default_factory=CodexAgentResearchConstraints)

    model_config = ConfigDict(extra="forbid")


class CodexAgentEvidenceResponse(BaseModel):
    claim: str
    factor_type: str
    stance: Literal["favor", "against", "neutral"]
    impact_score: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    freshness_score: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    credibility_score: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    source_name: str | None = None
    citation_url: str | None = None
    published_at: datetime | None = None
    reasoning: str | None = None
    evidence_summary: str | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("claim", "factor_type")
    @classmethod
    def require_text(cls, value: str) -> str:
        parsed = value.strip()
        if not parsed:
            raise ValueError("El campo de texto no puede estar vacio.")
        return parsed

    @field_validator("reasoning", "evidence_summary")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = value.strip()
        return parsed or None

    @model_validator(mode="after")
    def require_reasoning_or_summary(self) -> "CodexAgentEvidenceResponse":
        if not self.reasoning and not self.evidence_summary:
            raise ValueError("Cada evidencia debe incluir reasoning o evidence_summary.")
        return self


class CodexAgentRiskResponse(BaseModel):
    code: str = "risk"
    summary: str

    model_config = ConfigDict(extra="forbid")


class CodexAgentResearchResponse(BaseModel):
    run_id: int
    market_id: int
    output_schema_version: str = CODEX_AGENT_OUTPUT_SCHEMA_VERSION
    research_mode: Literal["real_web", "mock_structural", "manual"] = "real_web"
    source_review_required: bool = False
    metadata: dict[str, object] = Field(default_factory=dict)
    market_summary: str
    participants: list[str] = Field(default_factory=list)
    evidence_for_yes: list[CodexAgentEvidenceResponse] = Field(default_factory=list)
    evidence_against_yes: list[CodexAgentEvidenceResponse] = Field(default_factory=list)
    risks: list[CodexAgentRiskResponse] = Field(default_factory=list)
    confidence_score: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    recommended_probability_adjustment: Decimal = Field(
        ge=Decimal("-0.1200"),
        le=Decimal("0.1200"),
    )
    final_reasoning: str
    recommendation: Literal["hold", "lean_yes", "lean_no", "avoid"]

    model_config = ConfigDict(extra="forbid")

    @field_validator("output_schema_version")
    @classmethod
    def validate_schema_version(cls, value: str) -> str:
        if value != CODEX_AGENT_OUTPUT_SCHEMA_VERSION:
            raise ValueError(
                f"output_schema_version debe ser {CODEX_AGENT_OUTPUT_SCHEMA_VERSION}."
            )
        return value

    @field_validator("market_summary", "final_reasoning")
    @classmethod
    def require_text(cls, value: str) -> str:
        parsed = value.strip()
        if not parsed:
            raise ValueError("El campo de texto no puede estar vacio.")
        return parsed
