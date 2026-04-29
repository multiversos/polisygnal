from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.models.market import Market
from app.repositories.markets import get_market_by_id
from app.schemas.research_packet import ResearchPacketCreate, ResearchPacketRead
from app.services.research.codex_agent_adapter import (
    DEFAULT_REQUEST_DIR,
    prepare_codex_agent_research_request,
)
from app.services.research.codex_agent_packet import (
    DEFAULT_PACKET_DIR,
    write_codex_agent_research_packet,
)

REQUEST_DIR: Path = DEFAULT_REQUEST_DIR
PACKET_DIR: Path = DEFAULT_PACKET_DIR


def generate_market_research_packet(
    db: Session,
    *,
    market_id: int,
    payload: ResearchPacketCreate,
    request_dir: Path | str | None = None,
    packet_dir: Path | str | None = None,
) -> ResearchPacketRead:
    market = get_market_by_id(db, market_id)
    if market is None:
        raise ResearchPacketMarketNotFoundError(market_id)
    return _generate_codex_agent_packet(
        db,
        market=market,
        notes=payload.notes,
        request_dir=Path(request_dir) if request_dir is not None else REQUEST_DIR,
        packet_dir=Path(packet_dir) if packet_dir is not None else PACKET_DIR,
    )


def _generate_codex_agent_packet(
    db: Session,
    *,
    market: Market,
    notes: str | None,
    request_dir: Path,
    packet_dir: Path,
) -> ResearchPacketRead:
    prepared = prepare_codex_agent_research_request(
        db,
        market=market,
        output_dir=request_dir,
    )
    packet = write_codex_agent_research_packet(
        request_payload=prepared.request_payload,
        request_path=prepared.request_path,
        packet_dir=packet_dir,
    )
    prepared.research_run.metadata_json = {
        **_metadata_dict(prepared.research_run.metadata_json),
        "packet_path": str(packet.packet_path),
        "expected_response_path": str(packet.expected_response_path),
        "ingest_command": packet.ingest_command,
        "generated_from": "ui_research_packet_endpoint",
        "operator_notes": notes,
    }
    db.flush()
    return ResearchPacketRead(
        status="prepared",
        market_id=market.id,
        research_run_id=prepared.research_run.id,
        mode="codex_agent",
        research_status=prepared.research_run.status,
        request_path=str(prepared.request_path),
        packet_path=str(packet.packet_path),
        expected_response_path=str(packet.expected_response_path),
        ingest_command=packet.ingest_command,
        ingest_dry_run_command=f"{packet.ingest_command} --dry-run",
        notes=notes,
    )


def _metadata_dict(value: dict[str, object] | list[object] | None) -> dict[str, object]:
    if isinstance(value, dict):
        return dict(value)
    return {}


class ResearchPacketMarketNotFoundError(Exception):
    def __init__(self, market_id: int) -> None:
        super().__init__(f"Market {market_id} no encontrado.")
        self.market_id = market_id
