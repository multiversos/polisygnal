from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient, PolymarketMarketDetailsPayload
from app.models import Market, MarketOutcome
from app.models.polysignal_market_signal import PolySignalMarketSignal
from app.models.wallet_analysis import WalletAnalysisCandidate, WalletAnalysisJob
from app.schemas.wallet_analysis import (
    PolySignalMarketResolutionRead,
    PolySignalMarketSignalList,
    PolySignalMarketSignalMetricsBucketRead,
    PolySignalMarketSignalMetricsRead,
    PolySignalMarketSignalRead,
    PolySignalMarketSignalSettlementRead,
    PolySignalMarketSignalSettlePendingResponse,
)


class PolySignalMarketSignalNotFoundError(Exception):
    pass


@dataclass(slots=True)
class ResolvedMarketOutcome:
    status: str
    final_outcome: str | None
    source: str
    confidence: str
    reason: str
    checked_at: datetime


def create_market_signal_from_analysis_result(
    db: Session,
    *,
    job: WalletAnalysisJob,
    candidates: list[WalletAnalysisCandidate],
    result_summary: dict[str, object] | None,
) -> PolySignalMarketSignal:
    side_scores = _build_side_scores(candidates)
    total_score = sum(side_scores.values(), Decimal("0"))
    predicted_side, predicted_outcome, polysignal_score, signal_status, signal_margin = _derive_signal(side_scores, total_score)
    data_confidence = _derive_confidence(job, candidates)

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
        confidence=data_confidence,
        yes_score=side_scores.get("YES"),
        no_score=side_scores.get("NO"),
        outcome_scores_json={key: str(value) for key, value in side_scores.items()},
        wallets_analyzed=job.wallets_analyzed,
        wallets_with_sufficient_history=job.wallets_with_sufficient_history,
        top_wallets_json=_top_wallets(candidates),
        warnings_json=_signal_warnings(
            job,
            candidates,
            signal_status,
            signal_margin=signal_margin,
            data_confidence=data_confidence,
        ),
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
    predicted_side: str | None = None,
    confidence: str | None = None,
) -> PolySignalMarketSignalList:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = select(PolySignalMarketSignal)
    count_stmt = select(func.count()).select_from(PolySignalMarketSignal)
    metrics_stmt = select(PolySignalMarketSignal)
    if job_id:
        stmt = stmt.where(PolySignalMarketSignal.job_id == job_id)
        count_stmt = count_stmt.where(PolySignalMarketSignal.job_id == job_id)
        metrics_stmt = metrics_stmt.where(PolySignalMarketSignal.job_id == job_id)
    if market_slug:
        stmt = stmt.where(PolySignalMarketSignal.market_slug == market_slug)
        count_stmt = count_stmt.where(PolySignalMarketSignal.market_slug == market_slug)
        metrics_stmt = metrics_stmt.where(PolySignalMarketSignal.market_slug == market_slug)
    if signal_status:
        stmt = stmt.where(PolySignalMarketSignal.signal_status == signal_status)
        count_stmt = count_stmt.where(PolySignalMarketSignal.signal_status == signal_status)
        metrics_stmt = metrics_stmt.where(PolySignalMarketSignal.signal_status == signal_status)
    if predicted_side:
        stmt = stmt.where(PolySignalMarketSignal.predicted_side == predicted_side)
        count_stmt = count_stmt.where(PolySignalMarketSignal.predicted_side == predicted_side)
        metrics_stmt = metrics_stmt.where(PolySignalMarketSignal.predicted_side == predicted_side)
    if confidence:
        stmt = stmt.where(PolySignalMarketSignal.confidence == confidence)
        count_stmt = count_stmt.where(PolySignalMarketSignal.confidence == confidence)
        metrics_stmt = metrics_stmt.where(PolySignalMarketSignal.confidence == confidence)
    stmt = stmt.order_by(PolySignalMarketSignal.created_at.desc())
    items = list(db.scalars(stmt.offset(safe_offset).limit(safe_limit)).all())
    metric_items = list(db.scalars(metrics_stmt).all())
    total = int(db.scalar(count_stmt) or 0)
    return PolySignalMarketSignalList(
        items=[serialize_market_signal(item) for item in items],
        total=total,
        metrics=build_market_signal_metrics(metric_items),
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
    _apply_terminal_resolution(
        signal,
        final_outcome=final_outcome.strip()[:160],
        resolution_source=resolution_source.strip()[:160],
        resolved_at=resolved_at or datetime.now(tz=UTC),
    )
    db.add(signal)
    db.flush()
    db.refresh(signal)
    return signal


def settle_market_signal(
    db: Session,
    *,
    signal_id: str,
    gamma_client: PolymarketGammaClient,
    now: datetime | None = None,
) -> PolySignalMarketSignalSettlementRead:
    signal = get_market_signal(db, signal_id)
    checked_at = now or datetime.now(tz=UTC)
    resolution = resolve_market_signal_outcome(
        db,
        signal=signal,
        gamma_client=gamma_client,
        checked_at=checked_at,
    )
    changed = False
    if signal.signal_status == "pending_resolution":
        if resolution.status == "resolved":
            _apply_terminal_resolution(
                signal,
                final_outcome=resolution.final_outcome,
                resolution_source=resolution.source,
                resolved_at=checked_at,
            )
            changed = True
        elif resolution.status == "cancelled":
            signal.final_outcome = resolution.final_outcome or "cancelled"
            signal.final_resolution_source = resolution.source[:160]
            signal.resolved_at = checked_at
            signal.signal_status = "cancelled"
            changed = True
        elif resolution.status == "unknown":
            signal.final_outcome = resolution.final_outcome
            signal.final_resolution_source = resolution.source[:160]
            signal.resolved_at = checked_at
            signal.signal_status = "unknown"
            changed = True
    elif signal.signal_status == "no_clear_signal" and resolution.status in {"resolved", "cancelled", "unknown"}:
        signal.final_outcome = resolution.final_outcome
        signal.final_resolution_source = resolution.source[:160]
        signal.resolved_at = checked_at
        changed = True
    if changed:
        db.add(signal)
        db.flush()
        db.refresh(signal)
    return PolySignalMarketSignalSettlementRead(
        signal=serialize_market_signal(signal),
        resolution=serialize_market_resolution(resolution),
        changed=changed,
    )


def settle_pending_market_signals(
    db: Session,
    *,
    gamma_client: PolymarketGammaClient,
    limit: int = 10,
    job_id: str | None = None,
    market_slug: str | None = None,
    now: datetime | None = None,
) -> PolySignalMarketSignalSettlePendingResponse:
    safe_limit = max(1, min(limit, 50))
    checked_at = now or datetime.now(tz=UTC)
    stmt = (
        select(PolySignalMarketSignal)
        .where(PolySignalMarketSignal.signal_status == "pending_resolution")
        .order_by(PolySignalMarketSignal.created_at.asc())
    )
    if job_id:
        stmt = stmt.where(PolySignalMarketSignal.job_id == job_id)
    if market_slug:
        stmt = stmt.where(PolySignalMarketSignal.market_slug == market_slug)
    signals = list(db.scalars(stmt.limit(safe_limit)).all())
    summary = PolySignalMarketSignalSettlePendingResponse()
    for signal in signals:
        summary.checked += 1
        try:
            settled = settle_market_signal(
                db,
                signal_id=signal.id,
                gamma_client=gamma_client,
                now=checked_at,
            )
        except Exception:
            summary.errors += 1
            continue
        summary.items.append(settled)
        status = settled.signal.signal_status
        if settled.resolution.status == "open":
            summary.still_pending += 1
        elif status == "resolved_hit":
            summary.resolved_hit += 1
        elif status == "resolved_miss":
            summary.resolved_miss += 1
        elif status == "cancelled":
            summary.cancelled += 1
        elif status == "unknown":
            summary.unknown += 1
    return summary


def serialize_market_signal(signal: PolySignalMarketSignal) -> PolySignalMarketSignalRead:
    signal_margin = _derive_signal_margin(signal.outcome_scores_json)
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
        data_confidence=signal.confidence,
        signal_strength=_signal_strength_from_margin(signal_margin),
        signal_margin=signal_margin,
        yes_score=signal.yes_score,
        no_score=signal.no_score,
        outcome_scores_json=signal.outcome_scores_json,
        outcome_wallet_counts_json=_coerce_int_dict(_top_wallet_counts(signal.top_wallets_json)),
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


def serialize_market_resolution(resolution: ResolvedMarketOutcome) -> PolySignalMarketResolutionRead:
    return PolySignalMarketResolutionRead(
        status=resolution.status,
        final_outcome=resolution.final_outcome,
        source=resolution.source,
        confidence=resolution.confidence,
        reason=resolution.reason,
        checked_at=resolution.checked_at,
    )


def build_market_signal_metrics(signals: list[PolySignalMarketSignal]) -> PolySignalMarketSignalMetricsRead:
    counts = {
        "pending_resolution": 0,
        "resolved_hit": 0,
        "resolved_miss": 0,
        "cancelled": 0,
        "unknown": 0,
        "no_clear_signal": 0,
    }
    by_confidence: dict[str, dict[str, int]] = {
        "high": {"total": 0, "resolved_hit": 0, "resolved_miss": 0},
        "medium": {"total": 0, "resolved_hit": 0, "resolved_miss": 0},
        "low": {"total": 0, "resolved_hit": 0, "resolved_miss": 0},
    }
    hit_scores: list[Decimal] = []
    miss_scores: list[Decimal] = []
    for signal in signals:
        status = signal.signal_status if signal.signal_status in counts else "unknown"
        counts[status] += 1
        bucket = by_confidence.setdefault(signal.confidence, {"total": 0, "resolved_hit": 0, "resolved_miss": 0})
        bucket["total"] += 1
        if status == "resolved_hit":
            bucket["resolved_hit"] += 1
            if signal.polysignal_score is not None:
                hit_scores.append(signal.polysignal_score)
        elif status == "resolved_miss":
            bucket["resolved_miss"] += 1
            if signal.polysignal_score is not None:
                miss_scores.append(signal.polysignal_score)
    resolved_total = counts["resolved_hit"] + counts["resolved_miss"]
    return PolySignalMarketSignalMetricsRead(
        total=len(signals),
        pending_resolution=counts["pending_resolution"],
        resolved_hit=counts["resolved_hit"],
        resolved_miss=counts["resolved_miss"],
        cancelled=counts["cancelled"],
        unknown=counts["unknown"],
        no_clear_signal=counts["no_clear_signal"],
        win_rate=_safe_rate(counts["resolved_hit"], resolved_total),
        avg_score_resolved_hit=_average_decimals(hit_scores),
        avg_score_resolved_miss=_average_decimals(miss_scores),
        by_confidence={
            label: PolySignalMarketSignalMetricsBucketRead(
                total=data["total"],
                resolved_hit=data["resolved_hit"],
                resolved_miss=data["resolved_miss"],
                win_rate=_safe_rate(data["resolved_hit"], data["resolved_hit"] + data["resolved_miss"]),
            )
            for label, data in by_confidence.items()
        },
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


def resolve_market_signal_outcome(
    db: Session,
    *,
    signal: PolySignalMarketSignal,
    gamma_client: PolymarketGammaClient,
    checked_at: datetime,
) -> ResolvedMarketOutcome:
    local_resolution = _resolve_from_local_market_outcome(db, signal=signal, checked_at=checked_at)
    if local_resolution is not None:
        return local_resolution
    remote_market = _fetch_remote_market_for_signal(signal=signal, gamma_client=gamma_client)
    if remote_market is None:
        return ResolvedMarketOutcome(
            status="unknown",
            final_outcome=None,
            source="unknown",
            confidence="low",
            reason="No pudimos encontrar este mercado en las fuentes publicas de Polymarket.",
            checked_at=checked_at,
        )
    if not bool(remote_market.closed):
        return ResolvedMarketOutcome(
            status="open",
            final_outcome=None,
            source="gamma",
            confidence="high",
            reason="El mercado sigue abierto segun Gamma.",
            checked_at=checked_at,
        )
    return _resolve_from_remote_market(signal=signal, market=remote_market, checked_at=checked_at)


def _resolve_from_local_market_outcome(
    db: Session,
    *,
    signal: PolySignalMarketSignal,
    checked_at: datetime,
) -> ResolvedMarketOutcome | None:
    stmt = select(MarketOutcome, Market).join(Market, MarketOutcome.market_id == Market.id)
    if signal.condition_id:
        stmt = stmt.where(Market.condition_id == signal.condition_id)
    elif signal.market_slug:
        stmt = stmt.where(Market.slug == signal.market_slug)
    else:
        return None
    row = db.execute(stmt.order_by(Market.updated_at.desc()).limit(1)).first()
    if row is None:
        return None
    outcome: MarketOutcome = row[0]
    resolved = (outcome.resolved_outcome or "").strip().lower()
    if resolved == "yes":
        return ResolvedMarketOutcome(
            status="resolved",
            final_outcome=_binary_outcome_label(signal, "YES"),
            source=outcome.resolution_source or "local_market_outcome",
            confidence="high",
            reason="Resultado tomado del registro local de market_outcomes.",
            checked_at=checked_at,
        )
    if resolved == "no":
        return ResolvedMarketOutcome(
            status="resolved",
            final_outcome=_binary_outcome_label(signal, "NO"),
            source=outcome.resolution_source or "local_market_outcome",
            confidence="high",
            reason="Resultado tomado del registro local de market_outcomes.",
            checked_at=checked_at,
        )
    if resolved in {"cancelled", "invalid"}:
        return ResolvedMarketOutcome(
            status="cancelled",
            final_outcome="cancelled",
            source=outcome.resolution_source or "local_market_outcome",
            confidence="high",
            reason="El mercado figura cancelado o invalido en market_outcomes.",
            checked_at=checked_at,
        )
    if resolved == "unknown":
        return ResolvedMarketOutcome(
            status="unknown",
            final_outcome=None,
            source=outcome.resolution_source or "local_market_outcome",
            confidence="medium",
            reason="La fuente local marco este mercado con resolucion no confiable.",
            checked_at=checked_at,
        )
    return None


def _fetch_remote_market_for_signal(
    *,
    signal: PolySignalMarketSignal,
    gamma_client: PolymarketGammaClient,
) -> PolymarketMarketDetailsPayload | None:
    try:
        if signal.condition_id:
            market = gamma_client.fetch_market_by_condition_id(signal.condition_id)
            if market is not None:
                return market
        if signal.market_slug:
            market = gamma_client.fetch_market_by_slug(signal.market_slug)
            if market is not None:
                return market
    except Exception:
        return None
    return None


def _resolve_from_remote_market(
    *,
    signal: PolySignalMarketSignal,
    market: PolymarketMarketDetailsPayload,
    checked_at: datetime,
) -> ResolvedMarketOutcome:
    if any(_normalize_resolution_hint(item) == "cancelled" for item in market.uma_resolution_statuses):
        return ResolvedMarketOutcome(
            status="cancelled",
            final_outcome="cancelled",
            source=market.resolution_source or "gamma",
            confidence="medium",
            reason="Gamma marco este mercado con una resolucion cancelada o invalida.",
            checked_at=checked_at,
        )
    winner = _winner_from_outcome_prices(market)
    if winner is not None:
        label, strength = winner
        return ResolvedMarketOutcome(
            status="resolved",
            final_outcome=label,
            source=market.resolution_source or "gamma",
            confidence="high" if strength >= Decimal("0.995") else "medium",
            reason="Resultado inferido desde outcomes y outcomePrices del mercado cerrado en Gamma.",
            checked_at=checked_at,
        )
    return ResolvedMarketOutcome(
        status="unknown",
        final_outcome=None,
        source=market.resolution_source or "gamma",
        confidence="low",
        reason="El mercado aparece cerrado, pero no hay un outcome final lo bastante claro para verificar la senal.",
        checked_at=checked_at,
    )


def _winner_from_outcome_prices(market: PolymarketMarketDetailsPayload) -> tuple[str, Decimal] | None:
    labels = [label.strip() for label in market.outcomes if isinstance(label, str) and label.strip()]
    prices = [price for price in market.outcome_prices if price is not None]
    if not labels or len(labels) != len(prices):
        return None
    ranked = sorted(enumerate(prices), key=lambda item: item[1], reverse=True)
    top_index, top_price = ranked[0]
    second_price = ranked[1][1] if len(ranked) > 1 else Decimal("0")
    if top_price < Decimal("0.97"):
        return None
    if second_price > Decimal("0.03"):
        return None
    return labels[top_index], top_price


def _binary_outcome_label(signal: PolySignalMarketSignal, side: str) -> str:
    normalized_side = side.strip().upper()
    for item in signal.outcomes_json or []:
        if not isinstance(item, dict):
            continue
        candidate_side = str(item.get("side") or "").strip().upper()
        label = str(item.get("label") or "").strip()
        if candidate_side == normalized_side and label:
            return label
    return normalized_side


def _normalize_resolution_hint(value: str) -> str:
    normalized = value.strip().lower()
    if "cancel" in normalized or "invalid" in normalized or "void" in normalized:
        return "cancelled"
    return normalized


def _derive_signal(
    side_scores: dict[str, Decimal],
    total_score: Decimal,
) -> tuple[str | None, str | None, Decimal | None, str, Decimal | None]:
    if total_score <= Decimal("0") or not side_scores:
        return None, None, None, "no_clear_signal", None
    ranked = sorted(side_scores.items(), key=lambda item: item[1], reverse=True)
    winner = ranked[0]
    winner_score = winner[1]
    share = winner_score / total_score if total_score > 0 else Decimal("0")
    second_share = (ranked[1][1] / total_score) if len(ranked) > 1 and total_score > 0 else Decimal("0")
    margin = (share - second_share).quantize(Decimal("0.0001"))
    signal_status = "no_clear_signal" if margin < Decimal("0.0300") else "pending_resolution"
    return winner[0], winner[0], share.quantize(Decimal("0.0001")), signal_status, margin


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
    *,
    signal_margin: Decimal | None,
    data_confidence: str,
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
    if signal_margin is not None and signal_margin < Decimal("0.0300"):
        warnings.append("La balanza quedo muy ajustada entre outcomes.")
    if data_confidence == "high" and signal_margin is not None and signal_margin < Decimal("0.0800"):
        warnings.append("La cobertura de datos puede ser alta aunque la diferencia entre outcomes siga siendo estrecha.")
    if any(candidate.confidence == "low" for candidate in candidates):
        warnings.append("Parte del score depende de wallets con confianza baja o muestra limitada.")
    return _dedupe(warnings)


def _derive_signal_margin(outcome_scores_json: dict[str, object] | None) -> Decimal | None:
    if not isinstance(outcome_scores_json, dict):
        return None
    values: list[Decimal] = []
    for raw_value in outcome_scores_json.values():
        try:
            value = Decimal(str(raw_value))
        except Exception:
            continue
        if value > 0:
            values.append(value)
    if not values:
        return None
    values.sort(reverse=True)
    total = sum(values, Decimal("0"))
    if total <= 0:
        return None
    first = values[0] / total
    second = values[1] / total if len(values) > 1 else Decimal("0")
    return (first - second).quantize(Decimal("0.0001"))


def _signal_strength_from_margin(margin: Decimal | None) -> str | None:
    if margin is None:
        return None
    if margin < Decimal("0.0300"):
        return "weak"
    if margin < Decimal("0.0800"):
        return "moderate"
    return "strong"


def _top_wallet_counts(top_wallets_json: list[dict[str, object]] | None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in top_wallets_json or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("side") or item.get("outcome") or "").strip()[:160]
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
    return counts


def _coerce_int_dict(value: dict[str, int]) -> dict[str, int] | None:
    return value or None


def _same_outcome(left: str, right: str) -> bool:
    return _normalize_outcome_key(left) == _normalize_outcome_key(right)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def _apply_terminal_resolution(
    signal: PolySignalMarketSignal,
    *,
    final_outcome: str | None,
    resolution_source: str,
    resolved_at: datetime,
) -> None:
    signal.final_outcome = final_outcome
    signal.final_resolution_source = resolution_source[:160]
    signal.resolved_at = resolved_at
    comparable_prediction = signal.predicted_outcome or signal.predicted_side
    if comparable_prediction and final_outcome and _same_outcome(comparable_prediction, final_outcome):
        signal.signal_status = "resolved_hit"
    elif comparable_prediction and final_outcome:
        signal.signal_status = "resolved_miss"
    else:
        signal.signal_status = "unknown"


def _normalize_outcome_key(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"yes", "y"}:
        return "yes"
    if normalized in {"no", "n"}:
        return "no"
    return normalized


def _safe_rate(numerator: int, denominator: int) -> Decimal | None:
    if denominator <= 0:
        return None
    return (Decimal(numerator) / Decimal(denominator)).quantize(Decimal("0.0001"))


def _average_decimals(values: list[Decimal]) -> Decimal | None:
    if not values:
        return None
    total = sum(values, Decimal("0"))
    return (total / Decimal(len(values))).quantize(Decimal("0.0001"))
