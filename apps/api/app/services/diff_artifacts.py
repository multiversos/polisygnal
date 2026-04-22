from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.diff import (
    DiffRunDetailResponse,
    DiffRunListItem,
    DiffRunMetadata,
    DiffRunsResponse,
    DiffSummaryResponse,
    LatestDiffResponse,
)

DEFAULT_DIFF_RUNS_LIMIT = 10
MAX_DIFF_RUNS_LIMIT = 50


class DiffRunNotFoundError(FileNotFoundError):
    """Raised when a timestamped diff run artifact cannot be found."""


def read_latest_diff_artifact(*, repo_root: Path | None = None) -> LatestDiffResponse:
    root = repo_root or REPO_ROOT
    diff_dir = root / "logs" / "diffs"
    latest_diff_path = diff_dir / "latest-diff.json"
    latest_summary_path = diff_dir / "latest-summary.json"

    latest_diff_payload = _read_json_payload(latest_diff_path)
    if latest_diff_payload is not None:
        return _build_response_from_diff_payload(latest_diff_payload)

    latest_summary_payload = _read_json_payload(latest_summary_path)
    if latest_summary_payload is not None:
        return _build_response_from_summary_payload(latest_summary_payload)

    return LatestDiffResponse(
        artifact_available=False,
        generated_at=None,
        comparison_ready=False,
        current_run=None,
        previous_run=None,
        summary=DiffSummaryResponse(
            comparison_ready=False,
            text="No diff artifact available yet. Run the market pipeline or run_market_diff first.",
        ),
    )


def list_diff_runs(
    *,
    repo_root: Path | None = None,
    limit: int = DEFAULT_DIFF_RUNS_LIMIT,
) -> DiffRunsResponse:
    root = repo_root or REPO_ROOT
    diff_dir = root / "logs" / "diffs"
    normalized_limit = max(1, min(limit, MAX_DIFF_RUNS_LIMIT))
    items = [
        _build_run_list_item(summary_path, payload)
        for summary_path, payload in _load_run_summary_payloads(diff_dir)
    ]
    return DiffRunsResponse(
        total_count=len(items),
        limit=normalized_limit,
        items=items[:normalized_limit],
    )


def read_diff_run_artifact(
    run_id: str,
    *,
    repo_root: Path | None = None,
) -> DiffRunDetailResponse:
    root = repo_root or REPO_ROOT
    diff_dir = root / "logs" / "diffs"
    summary_path = diff_dir / f"{run_id}.summary.json"
    summary_payload = _read_json_payload(summary_path)
    if summary_payload is None:
        raise DiffRunNotFoundError(run_id)

    diff_path = _path_from_payload(summary_payload.get("json_output_path"))
    diff_payload = _read_json_payload(diff_path) if diff_path is not None else None
    base_response = (
        _build_response_from_diff_payload(diff_payload)
        if diff_payload is not None
        else _build_response_from_summary_payload(summary_payload)
    )
    return DiffRunDetailResponse(
        **base_response.model_dump(),
        run_id=run_id,
        summary_path=str(summary_path),
        json_path=_string_or_none(summary_payload.get("json_output_path")),
        txt_path=_string_or_none(summary_payload.get("text_output_path")),
    )


def _build_response_from_diff_payload(payload: dict[str, Any]) -> LatestDiffResponse:
    summary_payload = payload.get("summary")
    summary = (
        DiffSummaryResponse.model_validate(summary_payload)
        if isinstance(summary_payload, dict)
        else DiffSummaryResponse(
            comparison_ready=False,
            text="Diff artifact is present but summary block is missing.",
        )
    )
    return LatestDiffResponse(
        artifact_available=True,
        generated_at=payload.get("generated_at"),
        comparison_ready=summary.comparison_ready,
        current_run=(
            DiffRunMetadata.model_validate(payload["current_run"])
            if isinstance(payload.get("current_run"), dict)
            else None
        ),
        previous_run=(
            DiffRunMetadata.model_validate(payload["previous_run"])
            if isinstance(payload.get("previous_run"), dict)
            else None
        ),
        top_opportunities_entered=list(payload.get("top_opportunities_entered") or []),
        top_opportunities_exited=list(payload.get("top_opportunities_exited") or []),
        bucket_changes=list(payload.get("bucket_changes") or []),
        material_score_changes=list(payload.get("material_score_changes") or []),
        summary=summary,
    )


def _build_response_from_summary_payload(payload: dict[str, Any]) -> LatestDiffResponse:
    comparison_ready = bool(payload.get("comparison_ready", False))
    current_run = _load_snapshot_metadata(
        payload.get("current_snapshot_path") or payload.get("latest_snapshot_path")
    )
    previous_run = _load_snapshot_metadata(payload.get("previous_snapshot_path"))
    return LatestDiffResponse(
        artifact_available=True,
        generated_at=payload.get("generated_at"),
        comparison_ready=comparison_ready,
        current_run=current_run,
        previous_run=previous_run,
        summary=DiffSummaryResponse(
            comparison_ready=comparison_ready,
            top_opportunities_entered_count=_safe_int(payload.get("top_opportunities_entered_count")),
            top_opportunities_exited_count=_safe_int(payload.get("top_opportunities_exited_count")),
            bucket_changes_count=_safe_int(payload.get("bucket_changes_count")),
            material_score_changes_count=_safe_int(payload.get("material_score_changes_count")),
            text=str(
                payload.get("summary_text")
                or "Diff summary artifact is available, but latest-diff.json is missing."
            ),
        ),
    )


def _load_run_summary_payloads(diff_dir: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not diff_dir.exists():
        return []
    items: list[tuple[Path, dict[str, Any]]] = []
    for summary_path in sorted(
        diff_dir.glob("*.summary.json"),
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


def _build_run_list_item(summary_path: Path, payload: dict[str, Any]) -> DiffRunListItem:
    current_run = _load_snapshot_metadata(
        payload.get("current_snapshot_path") or payload.get("latest_snapshot_path")
    )
    previous_run = _load_snapshot_metadata(payload.get("previous_snapshot_path"))
    return DiffRunListItem(
        run_id=_extract_run_id(summary_path),
        generated_at=payload.get("generated_at"),
        comparison_ready=bool(payload.get("comparison_ready", False)),
        status=_string_or_none(payload.get("status")),
        current_run_id=current_run.run_id if current_run is not None else None,
        previous_run_id=previous_run.run_id if previous_run is not None else None,
        top_opportunities_entered_count=_safe_int(payload.get("top_opportunities_entered_count")),
        top_opportunities_exited_count=_safe_int(payload.get("top_opportunities_exited_count")),
        bucket_changes_count=_safe_int(payload.get("bucket_changes_count")),
        material_score_changes_count=_safe_int(payload.get("material_score_changes_count")),
        summary_text=_string_or_none(payload.get("summary_text")),
        summary_path=str(summary_path),
        json_path=_string_or_none(payload.get("json_output_path")),
        txt_path=_string_or_none(payload.get("text_output_path")),
    )


def _load_snapshot_metadata(path_value: object | None) -> DiffRunMetadata | None:
    snapshot_path = _path_from_payload(path_value)
    if snapshot_path is None:
        return None
    payload = _read_json_payload(snapshot_path)
    if payload is None:
        return None
    run_payload = payload.get("run")
    if not isinstance(run_payload, dict):
        run_payload = {}
    return DiffRunMetadata(
        generated_at=payload.get("generated_at"),
        run_id=run_payload.get("run_id"),
        pipeline_summary_path=run_payload.get("pipeline_summary_path"),
        total_markets=payload.get("total_markets"),
        top_opportunities_count=payload.get("top_opportunities_count"),
        watchlist_count=payload.get("watchlist_count"),
        snapshot_path=str(snapshot_path),
        latest_snapshot_path=None,
    )


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
