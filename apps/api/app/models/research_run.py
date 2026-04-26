from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResearchRun(Base):
    __tablename__ = "research_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    vertical: Mapped[str] = mapped_column(String(64), nullable=False)
    subvertical: Mapped[str | None] = mapped_column(String(64), nullable=True)
    market_shape: Mapped[str] = mapped_column(String(64), nullable=False)
    research_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    web_search_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    degraded_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_sources_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_sources_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, object] | list[object] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    market = relationship("Market", back_populates="research_runs")
    findings = relationship(
        "ResearchFinding",
        back_populates="research_run",
        cascade="all, delete-orphan",
        order_by="ResearchFinding.id.asc()",
    )
    predictions = relationship(
        "Prediction",
        back_populates="research_run",
        order_by="Prediction.run_at.desc()",
    )
    reports = relationship(
        "PredictionReport",
        back_populates="research_run",
        cascade="all, delete-orphan",
        order_by="PredictionReport.created_at.desc()",
    )
