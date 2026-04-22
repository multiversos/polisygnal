from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
        nullable=False,
    )
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    yes_probability: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    no_probability: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    edge_signed: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    edge_magnitude: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    edge_class: Mapped[str] = mapped_column(String(32), nullable=False)
    opportunity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_confidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_edge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    explanation_json: Mapped[dict[str, object] | list[object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    market = relationship("Market", back_populates="predictions")

    @property
    def used_odds_count(self) -> int:
        return _extract_prediction_count(self.explanation_json, "odds_count")

    @property
    def used_news_count(self) -> int:
        return _extract_prediction_count(self.explanation_json, "news_count")

    @property
    def used_evidence_in_scoring(self) -> bool:
        return (self.used_odds_count + self.used_news_count) > 0


def _extract_prediction_count(payload: dict[str, object] | list[object], key: str) -> int:
    if not isinstance(payload, dict):
        return 0
    counts = payload.get("counts")
    if not isinstance(counts, dict):
        return 0
    value = counts.get(key)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0
