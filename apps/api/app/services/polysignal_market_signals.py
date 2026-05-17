from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.polysignal_market_signal import PolySignalMarketSignal
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob
from app.schemas.wallet_analysis import PolySignalMarketSignalList, PolySignalMarketSignalRead


class PolySignalMarketSignalNotFoundError(Exception):
    pass


def create_market_signal_from_analysis_result(
    db: Session,
    *,
    job: WalletAnalysisJob,
    candidates: list[WalletAnalysisCandidate],
    result_summary: dict[str, object] | None,
) -> PolySignalMarketSignal:
    side_scores = _build_side_scores(candidates)
    total_score = sum(side_scores.values(), Decimal("0"))
    predicted_side, predicted_outcome, polysignal_score, signal_status = _derive_signal(side_scores, total_score)

    signal = PolySignalMarketSignal(
        job_id=job.id,
        source_url=job.source_url,
        market_slug=job.market_slug,
        event_slug=job.event_slug,
        condition_id=job.condition_id,
        market_title=job.market_title,
        outcomes_json=job.outcomes_json,
        token_ids_json=job.token_ids_json,
        predicted_side=predicted_side,
        predicted_outcome=predicted_outcome,
        polysignal_score=polysignal_score,
        confidence=_derive_confidence(job, candidates),
        yes_score=side_scores.get("YES"),
        no_score=side_scores.get("NO"),
        outcome_scores_json={key: str(value) for key, value in side_scores.items()},
        wallets_analyzed=job.wallets_analyzed,
        wallets_with_sufficient_history=job.wallets_with_sufficient_history,
        top_wallets_json=_top_wallets(candidates),
        warnings_json=_signal_warnings(job, candidates, signal_status),
        signal_status=signal_status,
    )
    db.add(signal)
    db.flush()
    db.refresh(signal)
    return signal


def get_market_signal(db: Session, signal_id: str) -> PolySignalMarketSignal:
    signal = db.get(PolySignalMarketSignal, signal_id)
    if signal is None:
        raise PolySignalMarketSignalNotFoundError(signal_id)
    return signal


def get_latest_market_signal_for_job(db: Session, job_id: str) -> PolySignalMarketSignal | None:
    return db.scalar(
        select(PolySignalMarketSignal)
        .where(PolySignalMarketSignal.job_id == job_id)
        .order_by(PolySignalMarketSignal.created_at.desc())
        .limit(1)
    )


def list_market_signals(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
    job_id: str | None = None,
    market_slug: str | None = None,
    signal_status: str | None = None,
) -> PolySignalMarketSignalList:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = select(PolySignalMarketSignal)
    count_stmt = select(func.count()).select_from(PolySignalMarketSignal)
    if job_id:
        stmt = stmt.where(PolySignalMarketSignal.job_id == job_id)
        count_stmt = count_stmt.where(PolySignalMarketSignal.job_id == job_id)
    if market_slug:
        stmt = stmt.where(PolySignalMarketSignal.market_slug == market_slug)
        count_stmt = count_stmt.where(PolySignalMarketSignal.market_slug == market_slug)
    if signal_status:
        stmt = stmt.where(PolySignalMarketSignal.signal_status == signal_status)
        count_stmt = count_stmt.where(PolySignalMarketSignal.signal_status == signal_status)
    stmt = stmt.order_by(PolySignalMarketSignal.created_at.desc())
    items = list(db.scalars(stmt.offset(safe_offset).limit(safe_limit)).all())
    total = int(db.scalar(count_stmt) or 0)
    return PolySignalMarketSignalList(
        items=[serialize_market_signal(item) for item in items],
        total=total,
    )


def mark_market_signal_resolved(
    db: Session,
    *,
    signal_id: str,
    final_outcome: str,
    resolution_source: str,
    resolved_at: datetime | None = None,
) -> PolySignalMarketSignal:
    signal = get_market_signal(db, signal_id)
    signal.final_outcome = final_outcome.strip()[:160]
    signal.final_resolution_source = resolution_source.strip()[:160]
    signal.resolved_at = resolved_at or datetime.now(tz=UTC)
    if signal.predicted_outcome and _same_outcome(signal.predicted_outcome, signal.final_outcome):
        signal.signal_status = "resolved_hit"
    elif signal.predicted_outcome:
        signal.signal_status = "resolved_miss"
    else:
        signal.signal_status = "unknown"
    db.add(signal)
    db.flush()
    db.refresh(signal)
    return signal


def serialize_market_signal(signal: PolySignalMarketSignal) -> PolySignalMarketSignalRead:
    return PolySignalMarketSignalRead(
        id=signal.id,
        job_id=signal.job_id,
        source_url=signal.source_url,
        market_slug=signal.market_slug,
        event_slug=signal.event_slug,
        condition_id=signal.condition_id,
        market_title=signal.market_title,
        outcomes_json=signal.outcomes_json or [],
        token_ids_json=signal.token_ids_json or [],
        predicted_side=signal.predicted_side,
        predicted_outcome=signal.predicted_outcome,
        polysignal_score=signal.polysignal_score,
        confidence=signal.confidence,
        yes_score=signal.yes_score,
        no_score=signal.no_score,
        outcome_scores_json=signal.outcome_scores_json,
        wallets_analyzed=signal.wallets_analyzed,
        wallets_with_sufficient_history=signal.wallets_with_sufficient_history,
        top_wallets_json=signal.top_wallets_json or [],
        warnings_json=signal.warnings_json or [],
        signal_status=signal.signal_status,
        final_outcome=signal.final_outcome,
        final_resolution_source=signal.final_resolution_source,
        resolved_at=signal.resolved_at,
        created_at=signal.created_at,
        updated_at=signal.updated_at,
    )


def _build_side_scores(candidates: Iterable[WalletAnalysisCandidate]) -> dict[str, Decimal]:
    scores: dict[str, Decimal] = {}
    for candidate in candidates:
        side_key = (candidate.side or candidate.outcome or "UNKNOWN").strip()[:160]
        if not side_key:
            side_key = "UNKNOWN"
        score = candidate.score or Decimal("0")
        if candidate.confidence == "medium":
            score *= Decimal("0.85")
        elif candidate.confidence == "low":
            score *= Decimal("0.65")
        scores[side_key] = scores.get(side_key, Decimal("0")) + score
    return scores


def _derive_signal(
    side_scores: dict[str, Decimal],
    total_score: Decimal,
) -> tuple[str | None, str | None, Decimal | None, str]:
    if total_score <= Decimal("0") or not side_scores:
        return None, None, None, "no_clear_signal"
    winner = max(side_scores.items(), key=lambda item: item[1])
    winner_score = winner[1]
    share = winner_score / total_score if total_score > 0 else Decimal("0")
    if share < Decimal("0.55"):
        return None, None, share.quantize(Decimal("0.0001")), "no_clear_signal"
    return winner[0], winner[0], share.quantize(Decimal("0.0001")), "pending_resolution"


def _derive_confidence(job: WalletAnalysisJob, candidates: list[WalletAnalysisCandidate]) -> str:
    if job.wallets_with_sufficient_history >= 10 and len(candidates) >= 10:
        return "high"
    if job.wallets_with_sufficient_history >= 4 and len(candidates) >= 4:
        return "medium"
    return "low"


def _top_wallets(candidates: list[WalletAnalysisCandidate]) -> list[dict[str, object]]:
    ranked = sorted(
        candidates,
        key=lambda item: (
            item.score or Decimal("0"),
            item.observed_market_position_usd or Decimal("0"),
        ),
        reverse=True,
    )[:10]
    return [
        {
            "wallet_address": candidate.wallet_address,
            "side": candidate.side,
            "outcome": candidate.outcome,
            "score": str(candidate.score) if candidate.score is not None else None,
            "confidence": candidate.confidence,
            "observed_market_position_usd": (
                str(candidate.observed_market_position_usd)
                if candidate.observed_market_position_usd is not None
                else None
            ),
        }
        for candidate in ranked
    ]


def _signal_warnings(
    job: WalletAnalysisJob,
    candidates: list[WalletAnalysisCandidate],
    signal_status: str,
) -> list[str]:
    inherited_warnings = [str(item) for item in (job.warnings_json or []) if isinstance(item, str)]
    warnings: list[str] = [
        "Esta no es una probabilidad garantizada de victoria; es una balanza estadistica basada en wallets analizadas.",
        *inherited_warnings,
    ]
    if job.status == "partial":
        warnings.append("El analisis fue parcial por limites de lote o tiempo.")
    if job.wallets_with_sufficient_history == 0:
        warnings.append("No hubo wallets con historial suficiente para una senal fuerte.")
    if signal_status == "no_clear_signal":
        warnings.append("No hay una balanza suficientemente clara para fijar una senal principal.")
    if any(candidate.confidence == "low" for candidate in candidates):
        warnings.append("Parte del score depende de wallets con confianza baja o muestra limitada.")
    return _dedupe(warnings)


def _same_outcome(left: str, right: str) -> bool:
    return left.strip().lower() == right.strip().lower()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result
