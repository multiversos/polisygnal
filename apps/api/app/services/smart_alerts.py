from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.research_run import ResearchRun
from app.schemas.smart_alerts import SmartAlertRead, SmartAlertsResponse, SmartAlertSeverity
from app.services.external_market_signal_matching import list_unlinked_external_signals
from app.services.research.upcoming_data_quality import list_upcoming_data_quality
from app.services.research.upcoming_market_selector import list_upcoming_sports_markets
from app.services.watchlist import list_watchlist_items


def build_smart_alerts(
    db: Session,
    *,
    limit: int = 20,
    sport: str | None = None,
    severity: SmartAlertSeverity | None = None,
    now: datetime | None = None,
) -> SmartAlertsResponse:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_limit = max(limit, 0)
    alerts: list[SmartAlertRead] = []
    alerts.extend(_build_upcoming_data_alerts(db, sport=sport, now=current_time))
    alerts.extend(_build_close_soon_alerts(db, sport=sport, now=current_time))
    alerts.extend(_build_watchlist_alerts(db, sport=sport))
    alerts.extend(_build_external_signal_alerts(db))

    if severity is not None:
        alerts = [alert for alert in alerts if alert.severity == severity]
    alerts.sort(key=_alert_sort_key)
    limited_alerts = alerts[:safe_limit]
    return SmartAlertsResponse(
        generated_at=current_time,
        alerts=limited_alerts,
        counts=_build_counts(alerts),
    )


def _build_upcoming_data_alerts(
    db: Session,
    *,
    sport: str | None,
    now: datetime,
) -> list[SmartAlertRead]:
    quality = list_upcoming_data_quality(db, sport=sport, days=7, limit=80, now=now)
    alerts: list[SmartAlertRead] = []
    for item in quality.items:
        missing_price = not item.has_yes_price or not item.has_no_price
        if missing_price:
            alerts.append(
                _market_alert(
                    alert_type="missing_data",
                    severity="warning",
                    market_id=item.market_id,
                    title="Faltan precios en mercado próximo",
                    description="No hay precio SÍ/NO suficiente para estimar PolySignal Score.",
                    reason="missing_price",
                    created_from="upcoming_data_quality",
                    data={"missing_fields": item.missing_fields, "quality_label": item.quality_label},
                )
            )
        if not item.has_snapshot:
            alerts.append(
                _market_alert(
                    alert_type="missing_data",
                    severity="warning",
                    market_id=item.market_id,
                    title="Mercado próximo sin snapshot",
                    description="Sin snapshot guardado, el score queda limitado o pendiente.",
                    reason="missing_snapshot",
                    created_from="upcoming_data_quality",
                    data={"missing_fields": item.missing_fields, "quality_label": item.quality_label},
                )
            )
        if item.quality_label == "Insuficiente":
            alerts.append(
                _market_alert(
                    alert_type="low_data_quality",
                    severity="critical",
                    market_id=item.market_id,
                    title="Calidad de datos insuficiente",
                    description="El mercado necesita datos mínimos antes de análisis operativo.",
                    reason="low_data_quality",
                    created_from="upcoming_data_quality",
                    data={"quality_score": item.quality_score, "warnings": item.warnings},
                )
            )
        if not item.has_polysignal_score:
            alerts.append(
                _market_alert(
                    alert_type="missing_data",
                    severity="info",
                    market_id=item.market_id,
                    title="PolySignal Score pendiente",
                    description="El score no se calcula porque faltan datos disponibles.",
                    reason="polysignal_score_pending",
                    created_from="upcoming_data_quality",
                    data={"missing_fields": item.missing_fields, "warnings": item.warnings},
                )
            )
    return alerts


def _build_close_soon_alerts(
    db: Session,
    *,
    sport: str | None,
    now: datetime,
) -> list[SmartAlertRead]:
    selection = list_upcoming_sports_markets(db, sport=sport, days=1, limit=60, now=now)
    cutoff = now + timedelta(hours=24)
    alerts: list[SmartAlertRead] = []
    for item in selection.items:
        close_time = _normalize_datetime(item.close_time) if item.close_time is not None else None
        if close_time is None or close_time > cutoff:
            continue
        alerts.append(
            _market_alert(
                alert_type="upcoming_close_soon",
                severity="warning",
                market_id=item.market_id,
                title="Mercado cierra dentro de 24h",
                description="Revisar pronto si está en el flujo de análisis.",
                reason="close_time_within_24h",
                created_from="upcoming_sports",
                data={"close_time": close_time.isoformat(), "sport": item.sport},
            )
        )
    return alerts


def _build_watchlist_alerts(db: Session, *, sport: str | None) -> list[SmartAlertRead]:
    watchlist_items = list_watchlist_items(db)
    if sport:
        normalized = sport.lower()
        watchlist_items = [
            item for item in watchlist_items if (item.sport or "").lower() == normalized
        ]
    market_ids = [item.market_id for item in watchlist_items]
    researched_market_ids = set(
        db.scalars(select(ResearchRun.market_id).where(ResearchRun.market_id.in_(market_ids))).all()
    ) if market_ids else set()

    alerts: list[SmartAlertRead] = []
    for item in watchlist_items:
        if item.market_id in researched_market_ids:
            continue
        alerts.append(
            _market_alert(
                alert_type="watchlist_needs_review",
                severity="info",
                market_id=item.market_id,
                title="Watchlist sin research",
                description="Este mercado está guardado, pero no tiene research_runs.",
                reason="no_research",
                created_from="watchlist",
                data={"status": item.status, "note": item.note},
            )
        )
    return alerts


def _build_external_signal_alerts(db: Session) -> list[SmartAlertRead]:
    signals = list_unlinked_external_signals(db, source="kalshi", limit=25)
    alerts: list[SmartAlertRead] = []
    for signal in signals:
        alerts.append(
            SmartAlertRead(
                id=f"external_signal_unmatched:{signal.id}",
                type="external_signal_unmatched",
                severity="info",
                market_id=None,
                title="Señal externa pendiente de vincular",
                description="Hay una señal externa guardada sin mercado Polymarket conectado.",
                reason="unmatched_external_signal",
                created_from="external_market_signals",
                action_label="Revisar coincidencias",
                action_url="/external-signals/matches",
                data={
                    "signal_id": signal.id,
                    "source": signal.source,
                    "source_ticker": signal.source_ticker,
                    "title": signal.title,
                },
            )
        )
    return alerts


def _market_alert(
    *,
    alert_type: str,
    severity: SmartAlertSeverity,
    market_id: int,
    title: str,
    description: str,
    reason: str,
    created_from: str,
    data: dict[str, object],
) -> SmartAlertRead:
    return SmartAlertRead(
        id=f"{alert_type}:{reason}:{market_id}",
        type=alert_type,
        severity=severity,
        market_id=market_id,
        title=title,
        description=description,
        reason=reason,
        created_from=created_from,
        action_label="Ver análisis",
        action_url=f"/markets/{market_id}",
        data=data,
    )


def _build_counts(alerts: list[SmartAlertRead]) -> dict[str, int]:
    counts = {
        "total": len(alerts),
        "info": 0,
        "warning": 0,
        "critical": 0,
    }
    for alert in alerts:
        counts[alert.severity] = counts.get(alert.severity, 0) + 1
        counts[alert.type] = counts.get(alert.type, 0) + 1
    return counts


def _alert_sort_key(alert: SmartAlertRead) -> tuple[int, str]:
    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    return severity_rank.get(alert.severity, 3), alert.id


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
