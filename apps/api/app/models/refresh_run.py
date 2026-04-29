from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshRun(Base):
    __tablename__ = "refresh_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    refresh_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    markets_checked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    markets_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
