from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PredictionReport(Base):
    __tablename__ = "prediction_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    prediction_id: Mapped[int | None] = mapped_column(
        ForeignKey("predictions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    research_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("research_runs.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    thesis: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_for: Mapped[dict[str, object] | list[object]] = mapped_column(JSON, nullable=False)
    evidence_against: Mapped[dict[str, object] | list[object]] = mapped_column(
        JSON,
        nullable=False,
    )
    risks: Mapped[dict[str, object] | list[object]] = mapped_column(JSON, nullable=False)
    final_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    metadata_json: Mapped[dict[str, object] | list[object] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    market = relationship("Market", back_populates="prediction_reports")
    prediction = relationship("Prediction", back_populates="reports")
    research_run = relationship("ResearchRun", back_populates="reports")
