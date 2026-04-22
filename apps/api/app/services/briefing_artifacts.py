from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.briefing import (
    BriefingArtifactResponse,
    BriefingRunListItem,
    BriefingRunsResponse,
    OperationalBriefingResponse,
)

DEFAULT_BRIEFING_RUNS_LIMIT = 10
MAX_BRIEFING_RUNS_LIMIT = 50


class BriefingRunNotFoundError(FileNotFoundError):
    """Raised when a timestamped briefing artifact cannot be found."""


def read_latest_briefing_artifact(*, repo_root: Path | None = None) -> BriefingArtifactResponse:
    root = repo_root or REPO_ROOT
    briefing_dir = root / "logs" / "briefings"
    latest_summary_path = briefing_dir / "latest-summary.json"
    latest_json_path = briefing_dir / "latest-briefing.json"
    latest_txt_path = briefing_dir / "latest-briefing.txt"

    summary_payload = _read_json_payload(latest_summary_path)
    briefing_payload = _read_json_payload(latest_json_path)
    latest_run_id = _latest_run_id(briefing_dir)

    if summary_payload is None and briefing_payload is None:
        return BriefingArtifactResponse(
            artifact_available=False,
            message="No briefing artifact available yet. Run the market pipeline or run_market_briefing first.",
            summary_text="No briefing artifact available yet.",
        )

    return _build_briefing_artifact_response(
        run_id=latest_run_id,
        summary_path=str(latest_summary_path) if latest_summary_path.exists() else None,
        json_path=_existing_path_str(latest_json_path) or _string_or_none(_value(summary_payload, "json_output_path")),
        txt_path=_existing_path_str(latest_txt_path) or _string_or_none(_value(summary_payload, "text_output_path")),
        raw_output_path=_string_or_none(_value(summary_payload, "raw_output_path")),
        summary_payload=summary_payload,
        briefing_payload=briefing_payload,
    )


def list_briefing_runs(
    *,
    repo_root: Path | None = None,
    limit: int = DEFAULT_BRIEFING_RUNS_LIMIT,
) -> BriefingRunsResponse:
    root = repo_root or REPO_ROOT
    briefing_dir = root / "logs" / "briefings"
    normalized_limit = max(1, min(limit, MAX_BRIEFING_RUNS_LIMIT))
    items = [
        _build_briefing_run_list_item(summary_path, payload)
        for summary_path, payload in _load_run_summary_payloads(briefing_dir)
    ]
    return BriefingRunsResponse(
        total_count=len(items),
        limit=normalized_limit,
        items=items[:normalized_limit],
    )


def read_briefing_run_artifact(
    run_id: str,
    *,
    repo_root: Path | None = None,
) -> BriefingArtifactResponse:
    root = repo_root or REPO_ROOT
    briefing_dir = root / "logs" / "briefings"
    summary_path = briefing_dir / f"{run_id}.summary.json"
    summary_payload = _read_json_payload(summary_path)
    if summary_payload is None:
        raise BriefingRunNotFoundError(run_id)

    json_path = _path_from_payload(summary_payload.get("json_output_path"))
    briefing_payload = _read_json_payload(json_path)
    return _build_briefing_artifact_response(
        run_id=run_id,
        summary_path=str(summary_path),
        json_path=_string_or_none(summary_payload.get("json_output_path")),
        txt_path=_string_or_none(summary_payload.get("text_output_path")),
        raw_output_path=_string_or_none(summary_payload.get("raw_output_path")),
        summary_payload=summary_payload,
        briefing_payload=briefing_payload,
    )


def _build_briefing_run_list_item(
    summary_path: Path,
    payload: dict[str, Any],
) -> BriefingRunListItem:
    return BriefingRunListItem(
        run_id=_extract_run_id(summary_path),
        generated_at=payload.get("generated_at"),
        status=_string_or_none(payload.get("status")),
        summary_text=_string_or_none(payload.get("summary_text")),
        top_opportunities_count=_safe_int(payload.get("top_opportunities_count")),
        watchlist_count=_safe_int(payload.get("watchlist_count")),
        review_flags_count=_safe_int(payload.get("review_flags_count")),
        total_markets=_safe_int(payload.get("total_markets")),
        summary_path=str(summary_path),
        json_path=_string_or_none(payload.get("json_output_path")),
        txt_path=_string_or_none(payload.get("text_output_path")),
    )


def _build_briefing_artifact_response(
    *,
    run_id: str | None,
    summary_path: str | None,
    json_path: str | None,
    txt_path: str | None,
    raw_output_path: str | None,
    summary_payload: dict[str, Any] | None,
    briefing_payload: dict[str, Any] | None,
) -> BriefingArtifactResponse:
    briefing = (
        OperationalBriefingResponse.model_validate(briefing_payload)
        if isinstance(briefing_payload, dict)
        else None
    )
    return BriefingArtifactResponse(
        artifact_available=summary_payload is not None or briefing is not None,
        run_id=run_id,
        generated_at=_value(summary_payload, "generated_at") or _value(briefing_payload, "generated_at"),
        status=_string_or_none(_value(summary_payload, "status")),
        message=None,
        summary_text=(
            _string_or_none(_value(summary_payload, "summary_text"))
            or _string_or_none(_value(briefing_payload, "summary"))
        ),
        top_opportunities_count=(
            _safe_int(_value(summary_payload, "top_opportunities_count"))
            or _safe_list_length(_value(briefing_payload, "top_opportunities"))
        ),
        watchlist_count=(
            _safe_int(_value(summary_payload, "watchlist_count"))
            or _safe_list_length(_value(briefing_payload, "watchlist"))
        ),
        review_flags_count=(
            _safe_int(_value(summary_payload, "review_flags_count"))
            or _safe_list_length(_value(briefing_payload, "review_flags"))
        ),
        total_markets=(
            _safe_int(_value(summary_payload, "total_markets"))
            or _safe_nested_int(briefing_payload, "operational_counts", "total_markets")
        ),
        summary_path=summary_path,
        json_path=json_path,
        txt_path=txt_path,
        raw_output_path=raw_output_path,
        briefing=briefing,
    )


def _latest_run_id(briefing_dir: Path) -> str | None:
    summaries = _load_run_summary_payloads(briefing_dir)
    if not summaries:
        return None
    return _extract_run_id(summaries[0][0])


def _load_run_summary_payloads(briefing_dir: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not briefing_dir.exists():
        return []
    items: list[tuple[Path, dict[str, Any]]] = []
    for summary_path in sorted(
        briefing_dir.glob("*.summary.json"),
        key=_summary_sort_key,
        reverse=True,
    ):
        if summary_path.name == "latest-summary.json":
            continue
        payload = _read_json_payload(summary_path)
        if payload is None:
            continue
        items.append((summary_path, payload))
    return items


def _read_json_payload(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _extract_run_id(summary_path: Path) -> str:
    return summary_path.name.removesuffix(".summary.json")


def _summary_sort_key(summary_path: Path) -> tuple[str, float]:
    try:
        mtime = summary_path.stat().st_mtime
    except OSError:
        mtime = 0.0
    return (_extract_run_id(summary_path), mtime)


def _path_from_payload(value: object | None) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return Path(value)


def _string_or_none(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None


def _existing_path_str(path: Path) -> str | None:
    return str(path) if path.exists() else None


def _value(payload: dict[str, Any] | None, key: str) -> Any:
    if payload is None:
        return None
    return payload.get(key)


def _safe_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0


def _safe_list_length(value: object) -> int:
    if isinstance(value, list):
        return len(value)
    return 0


def _safe_nested_int(payload: dict[str, Any] | None, container_key: str, value_key: str) -> int:
    if not isinstance(payload, dict):
        return 0
    nested = payload.get(container_key)
    if not isinstance(nested, dict):
        return 0
    return _safe_int(nested.get(value_key))
