from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.market import Market
from app.schemas.market_analysis import MarketAnalysisRead
from app.services.investigation_status import (
    get_investigation_status_by_market,
    serialize_investigation_status,
)
from app.services.market_analysis import build_market_analysis
from app.services.market_price_history import build_market_price_history
from app.services.market_tags import get_market_tags
from app.services.smart_alerts import build_smart_alerts
from app.services.watchlist import get_watchlist_item_by_market, serialize_watchlist_item


def render_market_analysis_markdown(
    db: Session,
    market: Market,
    *,
    analysis: MarketAnalysisRead | None = None,
) -> str:
    payload = analysis or build_market_analysis(db, market)
    price_history = build_market_price_history(db, market_id=market.id, limit=50, order="asc")
    watchlist_item = get_watchlist_item_by_market(db, market.id)
    watchlist = serialize_watchlist_item(db, watchlist_item) if watchlist_item is not None else None
    investigation_item = get_investigation_status_by_market(db, market.id)
    investigation = (
        serialize_investigation_status(db, investigation_item)
        if investigation_item is not None
        else None
    )
    tags = get_market_tags(db, market.id)
    alerts = [
        alert
        for alert in build_smart_alerts(db, limit=100, sport=payload.market.sport_type).alerts
        if alert.market_id == market.id
    ]

    lines = [
        f"# Analisis de mercado #{market.id}",
        "",
        f"Generado: {datetime.now(tz=UTC).isoformat()}",
        f"Pregunta: {_markdown_text(payload.market.question)}",
        f"Evento: {_markdown_text(payload.market.event_title or 'N/D')}",
        f"Deporte: {payload.market.sport_type or 'N/D'}",
        f"Tipo: {payload.market.market_type or payload.market.evidence_shape or 'N/D'}",
        f"Cierre: {_format_datetime(payload.market.end_date)}",
        f"Estado: {'cerrado' if payload.market.closed else 'activo'}",
        "",
        "> PolySignal organiza informacion disponible para revision manual. No es recomendacion de apuesta.",
        "",
        "## Precio de mercado",
    ]
    snapshot = payload.latest_snapshot
    if snapshot is None:
        lines.append("- Sin snapshot guardado.")
    else:
        lines.extend(
            [
                f"- Capturado: {_format_datetime(snapshot.captured_at)}",
                f"- SI: {_format_percent(snapshot.yes_price)}",
                f"- NO: {_format_percent(snapshot.no_price)}",
                f"- Liquidez: {_format_decimal(snapshot.liquidity)}",
                f"- Volumen: {_format_decimal(snapshot.volume)}",
            ]
        )

    lines.extend(["", "## PolySignal Score"])
    score = payload.polysignal_score
    if score is None or score.score_probability is None:
        lines.append("- PolySignal SI: pendiente.")
    else:
        lines.extend(
            [
                f"- PolySignal SI: {_format_percent(score.score_probability)}",
                f"- Mercado SI: {_format_percent(score.market_yes_price)}",
                f"- Diferencia: {_format_points(score.edge_signed)}",
                f"- Confianza: {score.confidence_label} ({_format_percent(score.confidence)})",
                f"- Lectura: {_markdown_text(score.label)}",
                f"- Fuente: {score.source}",
            ]
        )
    if score is not None and score.components:
        lines.append("- Componentes:")
        lines.extend(
            f"  - {component.name}: {_markdown_text(component.note)}"
            for component in score.components
        )
    if score is not None and score.warnings:
        lines.append(f"- Warnings: {', '.join(score.warnings)}")

    lines.extend(["", "## Calidad de datos"])
    quality = payload.data_quality
    if quality is None:
        lines.append("- Sin diagnostico de calidad.")
    else:
        lines.extend(
            [
                f"- Calidad: {quality.quality_label} ({quality.quality_score:.2f})",
                f"- Snapshot: {_yes_no(quality.has_snapshot)}",
                f"- Precio SI: {_yes_no(quality.has_yes_price)}",
                f"- Precio NO: {_yes_no(quality.has_no_price)}",
                f"- Senal externa: {_yes_no(quality.has_external_signal)}",
                f"- Prediccion guardada: {_yes_no(quality.has_prediction)}",
                f"- Research guardado: {_yes_no(quality.has_research)}",
                f"- Faltantes: {', '.join(quality.missing_fields) if quality.missing_fields else 'ninguno'}",
            ]
        )

    lines.extend(["", "## Historial de precio"])
    if price_history.count == 0:
        lines.append("- Sin historial guardado.")
    else:
        lines.extend(
            [
                f"- Snapshots: {price_history.count}",
                f"- Primer SI: {_format_percent(price_history.first.yes_price if price_history.first else None)}",
                f"- Ultimo SI: {_format_percent(price_history.latest.yes_price if price_history.latest else None)}",
                f"- Cambio SI: {_format_points(price_history.change_yes_abs)}",
            ]
        )

    lines.extend(["", "## Watchlist"])
    if watchlist is None:
        lines.append("- No esta en seguimiento.")
    else:
        lines.extend(
            [
                f"- Estado: {watchlist.status}",
                f"- Nota: {_markdown_text(watchlist.note or 'sin nota')}",
                f"- Actualizado: {_format_datetime(watchlist.updated_at)}",
            ]
        )

    lines.extend(["", "## Estado de investigacion"])
    if investigation is None:
        lines.append("- Sin estado de investigacion guardado.")
    else:
        lines.extend(
            [
                f"- Estado: {investigation.status}",
                f"- Prioridad: {investigation.priority if investigation.priority is not None else 'N/D'}",
                f"- Nota: {_markdown_text(investigation.note or 'sin nota')}",
            ]
        )

    lines.extend(["", "## Etiquetas"])
    if not tags.tags and not tags.suggested_tags:
        lines.append("- Sin etiquetas.")
    else:
        if tags.tags:
            lines.append("- Manuales: " + ", ".join(tag.name for tag in tags.tags))
        if tags.suggested_tags:
            lines.append("- Sugeridas: " + ", ".join(tag.name for tag in tags.suggested_tags))

    _append_market_analysis_list(
        lines,
        "Senales externas",
        payload.external_signals,
        "No hay senales externas vinculadas.",
        lambda signal: (
            f"- {signal.source.upper()} {signal.source_ticker or 'sin ticker'} | "
            f"SI {_format_percent(signal.yes_probability)} | match {_format_percent(signal.match_confidence)} | "
            f"{_markdown_text(signal.title or 'sin titulo')}"
        ),
    )
    _append_market_analysis_list(
        lines,
        "Evidencia / findings",
        payload.research_findings,
        "No hay findings guardados.",
        lambda finding: (
            f"- {finding.stance} | impacto {_format_decimal(finding.impact_score)} | "
            f"{_markdown_text(finding.claim)}"
        ),
    )
    _append_market_analysis_list(
        lines,
        "Evidence items",
        payload.evidence_items,
        "No hay evidence items guardados.",
        lambda item: (
            f"- {item.provider} | {item.stance} | confianza {_format_percent(item.confidence)} | "
            f"{_markdown_text(item.summary)}"
        ),
    )
    _append_market_analysis_list(
        lines,
        "Reportes de prediccion",
        payload.prediction_reports,
        "No hay reportes de prediccion guardados.",
        lambda report: (
            f"- {report.recommendation} | {_markdown_text(report.thesis)} | "
            f"{_markdown_text(report.final_reasoning)}"
        ),
    )
    _append_market_analysis_list(
        lines,
        "Alertas inteligentes",
        alerts,
        "No hay alertas inteligentes para este mercado.",
        lambda alert: f"- {alert.severity} | {alert.title} | {_markdown_text(alert.description)}",
    )

    lines.extend(
        [
            "",
            "## Research packet",
            f"- Preparar packet: `python -m app.commands.prepare_codex_research --market-id {market.id}`",
            "- Ingesta segura: `python -m app.commands.ingest_codex_research --run-id <RUN_ID> --dry-run`",
            "",
            "## Aviso",
            "Este documento no ejecuta research, no crea predicciones, no crea ordenes y no recomienda apostar.",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def _append_market_analysis_list(lines: list[str], title: str, items, empty_message: str, renderer) -> None:
    lines.extend(["", f"## {title}"])
    if not items:
        lines.append(f"- {empty_message}")
        return
    lines.extend(renderer(item) for item in items)


def _markdown_text(value: str) -> str:
    return " ".join(value.replace("|", "/").split())


def _yes_no(value: bool) -> str:
    return "si" if value else "no"


def _format_datetime(value: datetime | None) -> str:
    return value.isoformat() if value is not None else "N/D"


def _format_decimal(value: object | None) -> str:
    decimal_value = _to_decimal(value)
    return "N/D" if decimal_value is None else f"{decimal_value:.4f}"


def _format_percent(value: object | None) -> str:
    decimal_value = _to_decimal(value)
    if decimal_value is None:
        return "N/D"
    percent = decimal_value * Decimal("100") if abs(decimal_value) <= Decimal("1") else decimal_value
    return f"{percent:.1f}%"


def _format_points(value: object | None) -> str:
    decimal_value = _to_decimal(value)
    if decimal_value is None:
        return "N/D"
    points = decimal_value * Decimal("100") if abs(decimal_value) <= Decimal("1") else decimal_value
    prefix = "+" if points >= 0 else ""
    return f"{prefix}{points:.1f} pts"


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return None
