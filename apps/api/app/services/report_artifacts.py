from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.report_artifacts import (
    ReportArtifactResponse,
    ReportPresetArtifact,
    ReportRunListItem,
    ReportRunsResponse,
)

DEFAULT_REPORT_RUNS_LIMIT = 10
MAX_REPORT_RUNS_LIMIT = 50


class ReportRunNotFoundError(FileNotFoundError):
    """Raised when a timestamped report artifact cannot be found."""


def read_latest_report_artifact(*, repo_root: Path | None = None) -> ReportArtifactResponse:
    root = repo_root or REPO_ROOT
    report_dir = root / "logs" / "reports"
    latest_summary_path = report_dir / "latest-summary.json"
    summary_payload = _read_json_payload(latest_summary_path)

    if summary_payload is None:
        return ReportArtifactResponse(
            artifact_available=False,
            message="No report artifact available yet. Run the market pipeline or run_market_reports first.",
        )

    return _build_report_artifact_response(
        run_id=_latest_run_id(report_dir),
        summary_path=str(latest_summary_path),
        summary_payload=summary_payload,
        use_latest_paths=True,
    )


def list_report_runs(
    *,
    repo_root: Path | None = None,
    limit: int = DEFAULT_REPORT_RUNS_LIMIT,
) -> ReportRunsResponse:
    root = repo_root or REPO_ROOT
    report_dir = root / "logs" / "reports"
    normalized_limit = max(1, min(limit, MAX_REPORT_RUNS_LIMIT))
    items = [
        _build_report_run_list_item(summary_path, payload)
        for summary_path, payload in _load_run_summary_payloads(report_dir)
    ]
    return ReportRunsResponse(
        total_count=len(items),
        limit=normalized_limit,
        items=items[:normalized_limit],
    )


def read_report_run_artifact(
    run_id: str,
    *,
    repo_root: Path | None = None,
) -> ReportArtifactResponse:
    root = repo_root or REPO_ROOT
    report_dir = root / "logs" / "reports"
    summary_path = report_dir / f"{run_id}.summary.json"
    summary_payload = _read_json_payload(summary_path)
    if summary_payload is None:
        raise ReportRunNotFoundError(run_id)

    return _build_report_artifact_response(
        run_id=run_id,
        summary_path=str(summary_path),
        summary_payload=summary_payload,
        use_latest_paths=False,
    )


def _build_report_run_list_item(summary_path: Path, payload: dict[str, Any]) -> ReportRunListItem:
    generated_presets = _generated_presets(payload)
    return ReportRunListItem(
        run_id=_extract_run_id(summary_path),
        generated_at=payload.get("finished_at") or payload.get("generated_at"),
        status=_string_or_none(payload.get("status")),
        partial_error_count=_safe_int(payload.get("partial_error_count")),
        preset_count=len(generated_presets),
        total_items_exported=sum(_safe_int(item.get("items_exported")) for item in generated_presets),
        presets=[str(item.get("preset")) for item in generated_presets if item.get("preset")],
        formats=[str(value) for value in payload.get("formats", []) if isinstance(value, str)],
        summary_path=str(summary_path),
    )


def _build_report_artifact_response(
    *,
    run_id: str | None,
    summary_path: str | None,
    summary_payload: dict[str, Any],
    use_latest_paths: bool,
) -> ReportArtifactResponse:
    presets = _generated_presets(summary_payload)
    report_items = [_build_report_preset_item(item, use_latest_paths=use_latest_paths) for item in presets]
    return ReportArtifactResponse(
        artifact_available=True,
        run_id=run_id,
        generated_at=summary_payload.get("finished_at") or summary_payload.get("generated_at"),
        status=_string_or_none(summary_payload.get("status")),
        message=None,
        partial_error_count=_safe_int(summary_payload.get("partial_error_count")),
        preset_count=len(report_items),
        total_items_exported=sum(item.items_exported for item in report_items),
        presets=[item.preset for item in report_items],
        formats=[str(value) for value in summary_payload.get("formats", []) if isinstance(value, str)],
        limit=_optional_int(summary_payload.get("limit")),
        frequency_recommendation_minutes=_optional_int(
            summary_payload.get("frequency_recommendation_minutes")
        ),
        summary_path=summary_path,
        reports=report_items,
    )


def _build_report_preset_item(
    payload: dict[str, Any],
    *,
    use_latest_paths: bool,
) -> ReportPresetArtifact:
    json_path = _preferred_path(
        primary=payload.get("latest_json_path") if use_latest_paths else payload.get("json_output_path"),
        secondary=payload.get("json_output_path") if use_latest_paths else payload.get("latest_json_path"),
    )
    csv_path = _preferred_path(
        primary=payload.get("latest_csv_path") if use_latest_paths else payload.get("csv_output_path"),
        secondary=payload.get("csv_output_path") if use_latest_paths else payload.get("latest_csv_path"),
    )
    return ReportPresetArtifact(
        preset=str(payload.get("preset") or "unknown"),
        status=_string_or_none(payload.get("status")),
        item_count=_safe_int(payload.get("item_count")),
        items_exported=_safe_int(payload.get("items_exported")),
        json_path=str(json_path) if json_path is not None else None,
        csv_path=str(csv_path) if csv_path is not None else None,
        json_payload=_read_json_payload(json_path),
    )


def _generated_presets(payload: dict[str, Any]) -> list[dict[str, Any]]:
    value = payload.get("generated_presets")
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _latest_run_id(report_dir: Path) -> str | None:
    summaries = _load_run_summary_payloads(report_dir)
    if not summaries:
        return None
    return _extract_run_id(summaries[0][0])


def _load_run_summary_payloads(report_dir: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not report_dir.exists():
        return []
    items: list[tuple[Path, dict[str, Any]]] = []
    for summary_path in sorted(
        report_dir.glob("*.summary.json"),
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


def _preferred_path(primary: object | None, secondary: object | None) -> Path | None:
    path = _path_from_payload(primary)
    if path is not None and path.exists():
        return path
    fallback = _path_from_payload(secondary)
    if fallback is not None and fallback.exists():
        return fallback
    return path or fallback


def _path_from_payload(value: object | None) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return Path(value)


def _string_or_none(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None


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


def _optional_int(value: object) -> int | None:
    result = _safe_int(value)
    if result == 0 and value not in (0, "0", 0.0, False):
        return None
    return result
