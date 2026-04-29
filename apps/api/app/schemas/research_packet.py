from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ResearchPacketCreate(BaseModel):
    mode: Literal["codex_agent"] = "codex_agent"
    notes: str | None = Field(default=None, max_length=4000)


class ResearchPacketRead(BaseModel):
    status: str
    market_id: int
    research_run_id: int
    mode: str
    research_status: str
    request_path: str
    packet_path: str
    expected_response_path: str
    ingest_command: str
    ingest_dry_run_command: str
    notes: str | None = None
