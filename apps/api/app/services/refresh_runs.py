from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.refresh_run import RefreshRun

ALLOWED_REFRESH_TYPES = {"snapshot", "metadata"}
ALLOWED_MODES = {"dry_run", "apply"}
ALLOWED_STATUSES = {"success", "partial", "failed"}
SENSITIVE_TERMS = ("token", "secret", "credential", "password", "api_key")


def record_refresh_run(
    db: Session,
    *,
    refresh_type: str,
    mode: str,
    status: str,
    markets_checked: int,
    markets_updated: int,
    errors_count: int,
    started_at: datetime,
    finished_at: datetime,
    summary_json: dict[str, Any] | None = None,
) -> RefreshRun:
    if refresh_type not in ALLOWED_REFRESH_TYPES:
        raise ValueError(f"refresh_type invalido: {refresh_type}")
    if mode not in ALLOWED_MODES:
        raise ValueError(f"mode invalido: {mode}")
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"status invalido: {status}")

    refresh_run = RefreshRun(
        refresh_type=refresh_type,
        mode=mode,
        status=status,
        markets_checked=max(markets_checked, 0),
        markets_updated=max(markets_updated, 0),
        errors_count=max(errors_count, 0),
        summary_json=sanitize_refresh_summary(summary_json) if summary_json else None,
        started_at=started_at,
        finished_at=finished_at,
    )
    db.add(refresh_run)
    db.flush()
    return refresh_run


def list_refresh_runs(
    db: Session,
    *,
    refresh_type: str | None = None,
    limit: int = 20,
) -> list[RefreshRun]:
    safe_limit = max(min(limit, 100), 0)
    statement = select(RefreshRun).order_by(RefreshRun.started_at.desc(), RefreshRun.id.desc()).limit(safe_limit)
    if refresh_type:
        statement = statement.where(RefreshRun.refresh_type == refresh_type)
    return list(db.scalars(statement).all())


def build_refresh_audit_summary(
    payload: dict[str, Any],
    *,
    refresh_type: str,
    market_id: int | None,
    sport: str | None,
    days: int,
    limit: int,
) -> dict[str, Any]:
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    action_counts = Counter(
        str(item.get("action", "unknown"))
        for item in items
        if isinstance(item, dict)
    )
    market_ids = [
        item.get("market_id")
        for item in items
        if isinstance(item, dict) and item.get("market_id") is not None
    ][:20]
    partial_errors = [
        _compact_error(item)
        for item in items
        if isinstance(item, dict) and item.get("error")
    ][:5]
    return sanitize_refresh_summary(
        {
            "refresh_type": refresh_type,
            "dry_run": bool(payload.get("dry_run")),
            "apply": bool(payload.get("apply")),
            "market_id": market_id,
            "sport": sport,
            "days": days,
            "limit": limit,
            "markets_checked": payload.get("markets_checked", 0),
            "markets_updated": _markets_updated_from_payload(refresh_type, payload),
            "partial_error_count": payload.get("partial_error_count", 0),
            "action_counts": dict(action_counts),
            "market_ids": market_ids,
            "partial_errors": partial_errors,
        }
    )


def sanitize_refresh_summary(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            lower_key = key_text.lower()
            if _is_sensitive_text(lower_key):
                continue
            if lower_key == "field" and isinstance(item, str) and _is_sensitive_text(item.lower()):
                sanitized[key_text] = "[redacted]"
                sanitized["redacted"] = True
                continue
            sanitized[key_text] = sanitize_refresh_summary(item)
        return sanitized
    if isinstance(value, list):
        sanitized_items: list[Any] = []
        for item in value[:20]:
            sanitized_item = sanitize_refresh_summary(item)
            if sanitized_item is not None:
                sanitized_items.append(sanitized_item)
        return sanitized_items
    if isinstance(value, str):
        if _is_sensitive_text(value.lower()):
            return "[redacted]"
        return value[:500]
    return value


def _markets_updated_from_payload(refresh_type: str, payload: dict[str, Any]) -> int:
    if refresh_type == "snapshot":
        return int(payload.get("snapshots_created") or 0)
    return int(payload.get("markets_updated") or 0)


def _compact_error(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "market_id": item.get("market_id"),
        "action": item.get("action"),
        "error": str(item.get("error", ""))[:300],
    }


def _is_sensitive_text(text: str) -> bool:
    return any(term in text for term in SENSITIVE_TERMS)
