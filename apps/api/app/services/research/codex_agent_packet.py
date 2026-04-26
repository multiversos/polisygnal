from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from app.core.config import REPO_ROOT
from app.schemas.codex_agent_research import CodexAgentResearchRequest

DEFAULT_PACKET_DIR = REPO_ROOT / "logs" / "research-agent" / "packets"


@dataclass(frozen=True, slots=True)
class CodexAgentResearchPacket:
    packet_path: Path
    expected_response_path: Path
    ingest_command: str
    markdown: str


def write_codex_agent_research_packet(
    *,
    request_payload: CodexAgentResearchRequest,
    request_path: Path,
    packet_dir: Path | str = DEFAULT_PACKET_DIR,
) -> CodexAgentResearchPacket:
    packet_path = _resolve_packet_path(packet_dir, request_payload.run_id)
    expected_response_path = _expected_response_path(request_path, request_payload.run_id)
    ingest_command = (
        f"python -m app.commands.ingest_codex_research --run-id {request_payload.run_id}"
    )
    markdown = render_codex_agent_research_packet(
        request_payload=request_payload,
        request_path=request_path,
        expected_response_path=expected_response_path,
        ingest_command=ingest_command,
    )
    packet_path.parent.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(markdown, encoding="utf-8")
    return CodexAgentResearchPacket(
        packet_path=packet_path,
        expected_response_path=expected_response_path,
        ingest_command=ingest_command,
        markdown=markdown,
    )


def render_codex_agent_research_packet(
    *,
    request_payload: CodexAgentResearchRequest,
    request_path: Path,
    expected_response_path: Path,
    ingest_command: str,
) -> str:
    yes_price = _format_decimal(request_payload.current_market_yes_price)
    no_price = _format_decimal(request_payload.current_market_no_price)
    return "\n".join(
        [
            f"# Codex Agent Research Packet - Run {request_payload.run_id}",
            "",
            "## Market",
            "",
            f"- market_id: {request_payload.market_id}",
            f"- question: {request_payload.market_question}",
            f"- event_title: {request_payload.event_title or 'unknown'}",
            f"- vertical: {request_payload.vertical}",
            f"- sport: {request_payload.sport or 'other'}",
            f"- market_shape: {request_payload.market_shape}",
            f"- research_template_name: {request_payload.research_template_name}",
            f"- market_yes_price: {yes_price}",
            f"- market_no_price: {no_price}",
            "",
            "## Files",
            "",
            f"- request_json: {request_path}",
            f"- expected_response_json: {expected_response_path}",
            "",
            "## Ingest Command",
            "",
            "Run from `N:\\projects\\polimarket\\apps\\api`:",
            "",
            "```powershell",
            ingest_command,
            "```",
            "",
            "## Instructions For Codex Or ChatGPT",
            "",
            "1. Read the full request JSON before producing an answer.",
            "2. If web access is available, research with public sources and cite real URLs.",
            "3. If web access is not available, return a structural mock and clearly mark it as mock in reasoning.",
            "4. Do not invent sources, citations, claims, statistics, or URLs.",
            "5. Include evidence_for_yes and evidence_against_yes.",
            "6. Include risks.",
            "7. Separate facts from inferences in each claim.",
            "8. Keep recommended_probability_adjustment between -0.12 and 0.12.",
            "9. Treat confidence_score as evidence quality, not win probability.",
            "10. Do not recommend automatic betting, trading, or execution.",
            "11. Return ONLY valid JSON following the response schema.",
            "",
            "## Expected Response Schema Summary",
            "",
            "Top-level fields:",
            "",
            "- run_id",
            "- market_id",
            "- output_schema_version",
            "- market_summary",
            "- participants",
            "- evidence_for_yes",
            "- evidence_against_yes",
            "- risks",
            "- confidence_score",
            "- recommended_probability_adjustment",
            "- final_reasoning",
            "- recommendation",
            "",
            "Each evidence item must include:",
            "",
            "- claim",
            "- factor_type",
            "- stance",
            "- impact_score",
            "- freshness_score",
            "- credibility_score",
            "- source_name",
            "- citation_url",
            "- published_at",
            "- reasoning",
            "",
            "## Security And Operations",
            "",
            "- Do not include secrets in the response JSON.",
            "- Do not use, copy, read, or expose credentials.",
            "- Do not touch `.env`, auth files, API keys, or private tokens.",
            "- Do not execute trades or automatic betting actions.",
            "- This packet helps operate research; it is not a betting recommendation.",
            "",
            "## Human Review Checklist",
            "",
            "- Review the JSON before ingesting.",
            "- Confirm citation_url values are real when the response claims real research.",
            "- Confirm sources were not invented.",
            "- Confirm evidence exists both for and against YES.",
            "- Confirm recommendation is not treated as an order to bet.",
            "- Confirm recommended_probability_adjustment stays within +/- 0.12.",
            "",
        ]
    )


def _resolve_packet_path(packet_dir: Path | str, run_id: int) -> Path:
    resolved = Path(packet_dir)
    if not resolved.is_absolute():
        resolved = REPO_ROOT / resolved
    if resolved.suffix.lower() == ".md":
        return resolved
    return resolved / f"{run_id}.md"


def _expected_response_path(request_path: Path, run_id: int) -> Path:
    return request_path.parents[1] / "responses" / f"{run_id}.json"


def _format_decimal(value: Decimal | None) -> str:
    return str(value) if value is not None else "unknown"
