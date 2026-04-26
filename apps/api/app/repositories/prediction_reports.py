from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.prediction_report import PredictionReport


def create_prediction_report(
    db: Session,
    *,
    market_id: int,
    prediction_id: int | None,
    research_run_id: int | None,
    thesis: str,
    evidence_for: dict[str, object] | list[object],
    evidence_against: dict[str, object] | list[object],
    risks: dict[str, object] | list[object],
    final_reasoning: str,
    recommendation: str,
    metadata_json: dict[str, object] | list[object] | None,
) -> PredictionReport:
    report = PredictionReport(
        market_id=market_id,
        prediction_id=prediction_id,
        research_run_id=research_run_id,
        thesis=thesis,
        evidence_for=evidence_for,
        evidence_against=evidence_against,
        risks=risks,
        final_reasoning=final_reasoning,
        recommendation=recommendation,
        metadata_json=metadata_json,
    )
    db.add(report)
    db.flush()
    return report


def get_latest_prediction_report_for_market(
    db: Session,
    market_id: int,
) -> PredictionReport | None:
    stmt = (
        select(PredictionReport)
        .where(PredictionReport.market_id == market_id)
        .options(
            joinedload(PredictionReport.prediction),
            joinedload(PredictionReport.research_run),
        )
        .order_by(PredictionReport.created_at.desc(), PredictionReport.id.desc())
        .limit(1)
    )
    return db.scalar(stmt)
