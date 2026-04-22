from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.pipeline_artifacts import (
    PipelineArtifactResponse,
    PipelineComponentStatuses,
    PipelineDashboardArtifact,
    PipelineExecutionArtifact,
    PipelineLinkedArtifact,
    PipelineRunListItem,
    PipelineRunsResponse,
    PipelineStepArtifact,
)

DEFAULT_PIPELINE_RUNS_LIMIT = 10
MAX_PIPELINE_RUNS_LIMIT = 50

STEP_METRIC_KEYS: dict[str, tuple[str, ...]] = {
    "snapshots": (
        "markets_considered",
        "snapshots_created",
        "snapshots_skipped",
        "partial_error_count",
    ),
    "evidence": (
        "markets_considered",
        "markets_eligible_for_evidence",
        "markets_processed",
        "markets_skipped_non_matchable",
        "markets_skipped_unsupported_shape",
        "markets_with_odds_match",
        "markets_with_news_match",
        "sources_created",
        "sources_updated",
        "evidence_created",
        "evidence_updated",
        "partial_error_count",
    ),
    "scoring": (
        "markets_considered",
        "markets_scored",
        "predictions_created",
        "predictions_updated",
        "markets_scored_with_any_evidence",
        "markets_scored_with_snapshot_fallback",
        "used_odds_count",
        "used_news_count",
        "partial_error_count",
    ),
}


class PipelineRunNotFoundError(FileNotFoundError):
    """Raised when a timestamped pipeline artifact cannot be found."""


def read_latest_pipeline_artifact(*, repo_root: Path | None = None) -> PipelineArtifactResponse:
    root = repo_root or REPO_ROOT
    pipeline_dir = root / "logs" / "market_pipeline"
    latest_summary_path = pipeline_dir / "latest-summary.json"
    summary_payload = _read_json_payload(latest_summary_path)

    if summary_payload is None:
        return PipelineArtifactResponse(
            artifact_available=False,
            message="No pipeline artifact available yet. Run the market pipeline first.",
            component_statuses=PipelineComponentStatuses(),
        )

    return _build_pipeline_artifact_response(
        summary_path=str(latest_summary_path),
        run_id=_resolve_run_id(latest_summary_path, summary_payload, pipeline_dir),
        payload=summary_payload,
    )


def list_pipeline_runs(
    *,
    repo_root: Path | None = None,
    limit: int = DEFAULT_PIPELINE_RUNS_LIMIT,
) -> PipelineRunsResponse:
    root = repo_root or REPO_ROOT
    pipeline_dir = root / "logs" / "market_pipeline"
    normalized_limit = max(1, min(limit, MAX_PIPELINE_RUNS_LIMIT))
    items = [
        _build_pipeline_run_list_item(summary_path, payload, pipeline_dir)
        for summary_path, payload in _load_run_summary_payloads(pipeline_dir)
    ]
    return PipelineRunsResponse(
        total_count=len(items),
        limit=normalized_limit,
        items=items[:normalized_limit],
    )


def read_pipeline_run_artifact(
    run_id: str,
    *,
    repo_root: Path | None = None,
) -> PipelineArtifactResponse:
    root = repo_root or REPO_ROOT
    pipeline_dir = root / "logs" / "market_pipeline"
    summary_path = pipeline_dir / f"{run_id}.summary.json"
    summary_payload = _read_json_payload(summary_path)
    if summary_payload is None:
        raise PipelineRunNotFoundError(run_id)

    return _build_pipeline_artifact_response(
        summary_path=str(summary_path),
        run_id=run_id,
        payload=summary_payload,
    )


def _build_pipeline_run_list_item(
    summary_path: Path,
    payload: dict[str, Any],
    pipeline_dir: Path,
) -> PipelineRunListItem:
    return PipelineRunListItem(
        run_id=_resolve_run_id(summary_path, payload, pipeline_dir),
        generated_at=_generated_at(payload),
        started_at=_parse_datetime(payload.get("started_at")),
        finished_at=_parse_datetime(payload.get("finished_at")),
        duration_seconds=_optional_float(payload.get("duration_seconds")),
        status=_string_or_none(payload.get("status")),
        partial_error_count=_safe_int(payload.get("partial_error_count")),
        component_statuses=_build_component_statuses(payload),
        summary_path=str(summary_path),
        dashboard=_build_dashboard_artifact(payload.get("dashboard")),
    )


def _build_pipeline_artifact_response(
    *,
    summary_path: str,
    run_id: str | None,
    payload: dict[str, Any],
) -> PipelineArtifactResponse:
    return PipelineArtifactResponse(
        artifact_available=True,
        run_id=run_id,
        generated_at=_generated_at(payload),
        started_at=_parse_datetime(payload.get("started_at")),
        finished_at=_parse_datetime(payload.get("finished_at")),
        duration_seconds=_optional_float(payload.get("duration_seconds")),
        status=_string_or_none(payload.get("status")),
        message=None,
        partial_error_count=_safe_int(payload.get("partial_error_count")),
        limit=_optional_int(payload.get("limit")),
        frequency_recommendation_minutes=_optional_int(
            payload.get("frequency_recommendation_minutes")
        ),
        subset=_dict_or_none(payload.get("subset")),
        logs=_dict_or_none(payload.get("logs")),
        summary_path=summary_path,
        component_statuses=_build_component_statuses(payload),
        pipeline=_build_pipeline_execution_block(payload, run_id=run_id, summary_path=summary_path),
        reports=_build_linked_artifact(
            payload.get("reports"),
            metadata_keys=("presets", "formats", "generated_presets"),
        ),
        briefing=_build_linked_artifact(
            payload.get("briefing"),
            metadata_keys=(
                "generated_at",
                "json_path",
                "json_size_bytes",
                "txt_path",
                "txt_size_bytes",
                "top_opportunities_count",
                "watchlist_count",
                "review_flags_count",
            ),
        ),
        diff=_build_linked_artifact(
            payload.get("diff"),
            metadata_keys=(
                "generated_at",
                "comparison_ready",
                "current_snapshot_path",
                "previous_snapshot_path",
                "json_path",
                "json_size_bytes",
                "txt_path",
                "txt_size_bytes",
                "top_opportunities_entered_count",
                "top_opportunities_exited_count",
                "bucket_changes_count",
                "material_score_changes_count",
            ),
        ),
        dashboard=_build_dashboard_artifact(payload.get("dashboard")),
    )


def _build_component_statuses(payload: dict[str, Any]) -> PipelineComponentStatuses:
    steps = _dict_or_none(payload.get("steps")) or {}
    return PipelineComponentStatuses(
        snapshots=_status_from_block(steps.get("snapshots")),
        evidence=_status_from_block(steps.get("evidence")),
        scoring=_status_from_block(steps.get("scoring")),
        reports=_status_from_block(payload.get("reports")),
        briefing=_status_from_block(payload.get("briefing")),
        diff=_status_from_block(payload.get("diff")),
        dashboard=_status_from_block(payload.get("dashboard")),
    )


def _build_pipeline_execution_block(
    payload: dict[str, Any],
    *,
    run_id: str | None,
    summary_path: str,
) -> PipelineExecutionArtifact:
    pipeline_payload = _dict_or_none(payload.get("pipeline")) or {}
    steps_payload = _dict_or_none(payload.get("steps")) or _dict_or_none(pipeline_payload.get("steps")) or {}
    operational_summary = (
        _dict_or_none(pipeline_payload.get("operational_summary"))
        or _dict_or_none(payload.get("operational_summary"))
    )
    return PipelineExecutionArtifact(
        status=_string_or_none(pipeline_payload.get("status")) or _string_or_none(payload.get("status")),
        log_dir=_string_or_none(pipeline_payload.get("log_dir")) or _string_or_none(payload.get("log_dir")),
        summary_path=_string_or_none(pipeline_payload.get("summary_path")) or summary_path,
        wrapper_run_id=_string_or_none(pipeline_payload.get("wrapper_run_id")) or run_id,
        steps={
            step_name: _build_step_artifact(step_name, step_payload)
            for step_name, step_payload in steps_payload.items()
            if isinstance(step_payload, dict)
        },
        operational_summary=operational_summary,
    )


def _build_step_artifact(step_name: str, payload: dict[str, Any]) -> PipelineStepArtifact:
    summary_payload = _dict_or_none(payload.get("summary")) or {}
    command_payload = _dict_or_none(summary_payload.get("command_payload")) or {}
    metrics_source = command_payload or summary_payload
    metric_keys = STEP_METRIC_KEYS.get(step_name, ())
    metrics = {
        key: metrics_source.get(key)
        for key in metric_keys
        if key in metrics_source
    }
    return PipelineStepArtifact(
        name=step_name,
        status=_string_or_none(payload.get("status")),
        started_at=_parse_datetime(payload.get("started_at")),
        finished_at=_parse_datetime(payload.get("finished_at")),
        duration_seconds=_optional_float(payload.get("duration_seconds")),
        exit_code=_optional_int(payload.get("exit_code")),
        summary_path=_string_or_none(payload.get("summary_path")),
        wrapper_output_path=_string_or_none(payload.get("wrapper_output_path")),
        partial_error_count=_safe_int(payload.get("partial_error_count")),
        metrics=metrics,
    )


def _build_linked_artifact(
    payload: object | None,
    *,
    metadata_keys: tuple[str, ...],
) -> PipelineLinkedArtifact | None:
    block = _dict_or_none(payload)
    if block is None:
        return None
    metadata = {
        key: block.get(key)
        for key in metadata_keys
        if key in block
    }
    return PipelineLinkedArtifact(
        ran=_optional_bool(block.get("ran")),
        status=_string_or_none(block.get("status")),
        skip_reason=_string_or_none(block.get("skip_reason")),
        log_dir=_string_or_none(block.get("log_dir")),
        summary_path=_string_or_none(block.get("summary_path")),
        partial_error_count=_safe_int(block.get("partial_error_count")),
        metadata=metadata,
    )


def _build_dashboard_artifact(payload: object | None) -> PipelineDashboardArtifact | None:
    block = _dict_or_none(payload)
    if block is None:
        return None
    return PipelineDashboardArtifact(
        ran=_optional_bool(block.get("ran")),
        status=_string_or_none(block.get("status")),
        skip_reason=_string_or_none(block.get("skip_reason")),
        log_dir=_string_or_none(block.get("log_dir")),
        summary_path=_string_or_none(block.get("summary_path")),
        partial_error_count=_safe_int(block.get("partial_error_count")),
        dashboard_path=_string_or_none(block.get("dashboard_path")),
        overall_status=_string_or_none(block.get("overall_status")),
        total_top_opportunities=_optional_int(block.get("total_top_opportunities")),
        total_watchlist=_optional_int(block.get("total_watchlist")),
        warning_reason=_string_or_none(block.get("warning_reason")),
    )


def _load_run_summary_payloads(pipeline_dir: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not pipeline_dir.exists():
        return []
    items: list[tuple[Path, dict[str, Any]]] = []
    for summary_path in sorted(
        pipeline_dir.glob("*.summary.json"),
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


def _resolve_run_id(summary_path: Path, payload: dict[str, Any], pipeline_dir: Path) -> str | None:
    pipeline_payload = _dict_or_none(payload.get("pipeline")) or {}
    wrapper_run_id = _string_or_none(pipeline_payload.get("wrapper_run_id"))
    if wrapper_run_id is not None:
        return wrapper_run_id
    if summary_path.name != "latest-summary.json":
        return _extract_run_id(summary_path)
    latest_run = _latest_run_id(pipeline_dir)
    return latest_run or None


def _latest_run_id(pipeline_dir: Path) -> str | None:
    summaries = _load_run_summary_payloads(pipeline_dir)
    if not summaries:
        return None
    return _extract_run_id(summaries[0][0])


def _generated_at(payload: dict[str, Any]) -> Any:
    return payload.get("finished_at") or payload.get("started_at")


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


def _dict_or_none(value: object | None) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _status_from_block(value: object | None) -> str | None:
    block = _dict_or_none(value)
    if block is None:
        return None
    return _string_or_none(block.get("status"))


def _string_or_none(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None


def _parse_datetime(value: object | None) -> Any:
    return value


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


def _optional_float(value: object) -> float | None:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _optional_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    return None
