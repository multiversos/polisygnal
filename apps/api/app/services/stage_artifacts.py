from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.stage_artifacts import (
    StageArtifactResponse,
    StageRunListItem,
    StageRunsResponse,
)

DEFAULT_STAGE_RUNS_LIMIT = 10
MAX_STAGE_RUNS_LIMIT = 50


@dataclass(frozen=True)
class StageArtifactConfig:
    stage: str
    log_subdir: str
    metric_keys: tuple[str, ...]
    metadata_keys: tuple[str, ...]
    missing_message: str


SNAPSHOTS_STAGE = StageArtifactConfig(
    stage="snapshots",
    log_subdir="snapshots",
    metric_keys=(
        "markets_considered",
        "snapshots_created",
        "snapshots_skipped",
        "partial_error_count",
    ),
    metadata_keys=("limit", "discovery_scope", "market_type", "exit_code", "parse_error"),
    missing_message="No snapshot artifact available yet. Run the market pipeline snapshots stage first.",
)

EVIDENCE_STAGE = StageArtifactConfig(
    stage="evidence",
    log_subdir="evidence",
    metric_keys=(
        "markets_considered",
        "markets_eligible_for_evidence",
        "markets_processed",
        "markets_matchup_shape",
        "markets_futures_shape",
        "markets_ambiguous_shape",
        "markets_skipped_non_matchable",
        "markets_skipped_unsupported_shape",
        "sources_created",
        "sources_updated",
        "evidence_created",
        "evidence_updated",
        "markets_with_odds_match",
        "markets_with_news_match",
        "odds_matches",
        "odds_missing_api_key",
        "odds_no_match",
        "news_items_matched",
        "partial_error_count",
    ),
    metadata_keys=("limit", "exit_code", "parse_error"),
    missing_message="No evidence artifact available yet. Run the market pipeline evidence stage first.",
)

SCORING_STAGE = StageArtifactConfig(
    stage="scoring",
    log_subdir="scoring",
    metric_keys=(
        "markets_considered",
        "markets_scored",
        "predictions_created",
        "predictions_updated",
        "markets_scored_with_any_evidence",
        "markets_scored_with_odds_evidence",
        "markets_scored_with_news_evidence",
        "markets_scored_with_snapshot_fallback",
        "used_odds_count",
        "used_news_count",
        "partial_error_count",
    ),
    metadata_keys=("limit", "exit_code", "parse_error"),
    missing_message="No scoring artifact available yet. Run the market pipeline scoring stage first.",
)


class StageRunNotFoundError(FileNotFoundError):
    """Raised when a timestamped stage artifact cannot be found."""


def read_latest_stage_artifact(
    config: StageArtifactConfig,
    *,
    repo_root: Path | None = None,
) -> StageArtifactResponse:
    root = repo_root or REPO_ROOT
    stage_dir = root / "logs" / "market_pipeline" / config.log_subdir
    latest_summary_path = stage_dir / "latest-summary.json"
    summary_payload = _read_json_payload(latest_summary_path)
    resolved_summary_path: Path | None = latest_summary_path if summary_payload is not None else None

    if summary_payload is None:
        runs = _load_run_summary_payloads(stage_dir)
        if runs:
            resolved_summary_path, summary_payload = runs[0]

    if summary_payload is None or resolved_summary_path is None:
        return StageArtifactResponse(
            artifact_available=False,
            stage=config.stage,
            message=config.missing_message,
        )

    return _build_stage_artifact_response(
        config,
        run_id=_resolve_run_id(stage_dir, resolved_summary_path),
        summary_path=resolved_summary_path,
        payload=summary_payload,
    )


def list_stage_runs(
    config: StageArtifactConfig,
    *,
    repo_root: Path | None = None,
    limit: int = DEFAULT_STAGE_RUNS_LIMIT,
) -> StageRunsResponse:
    root = repo_root or REPO_ROOT
    stage_dir = root / "logs" / "market_pipeline" / config.log_subdir
    normalized_limit = max(1, min(limit, MAX_STAGE_RUNS_LIMIT))
    items = [
        _build_stage_run_list_item(config, summary_path, payload)
        for summary_path, payload in _load_run_summary_payloads(stage_dir)
    ]
    return StageRunsResponse(
        stage=config.stage,
        total_count=len(items),
        limit=normalized_limit,
        items=items[:normalized_limit],
    )


def read_stage_run_artifact(
    config: StageArtifactConfig,
    run_id: str,
    *,
    repo_root: Path | None = None,
) -> StageArtifactResponse:
    root = repo_root or REPO_ROOT
    stage_dir = root / "logs" / "market_pipeline" / config.log_subdir
    summary_path = stage_dir / f"{run_id}.summary.json"
    summary_payload = _read_json_payload(summary_path)
    if summary_payload is None:
        raise StageRunNotFoundError(run_id)

    return _build_stage_artifact_response(
        config,
        run_id=run_id,
        summary_path=summary_path,
        payload=summary_payload,
    )


def _build_stage_run_list_item(
    config: StageArtifactConfig,
    summary_path: Path,
    payload: dict[str, Any],
) -> StageRunListItem:
    return StageRunListItem(
        run_id=_extract_run_id(summary_path),
        generated_at=_generated_at(payload),
        started_at=_parse_datetime(payload.get("started_at")),
        finished_at=_parse_datetime(payload.get("finished_at")),
        duration_seconds=_optional_float(payload.get("duration_seconds")),
        status=_string_or_none(payload.get("status")),
        partial_error_count=_safe_int(_metric_value(payload, "partial_error_count")),
        summary_path=str(summary_path),
        metrics=_extract_metrics(config, payload),
        metadata=_extract_metadata(config, payload),
    )


def _build_stage_artifact_response(
    config: StageArtifactConfig,
    *,
    run_id: str,
    summary_path: Path,
    payload: dict[str, Any],
) -> StageArtifactResponse:
    return StageArtifactResponse(
        artifact_available=True,
        stage=config.stage,
        run_id=run_id,
        generated_at=_generated_at(payload),
        started_at=_parse_datetime(payload.get("started_at")),
        finished_at=_parse_datetime(payload.get("finished_at")),
        duration_seconds=_optional_float(payload.get("duration_seconds")),
        status=_string_or_none(payload.get("status")),
        message=None,
        partial_error_count=_safe_int(_metric_value(payload, "partial_error_count")),
        log_dir=_string_or_none(payload.get("log_dir")),
        summary_path=str(summary_path),
        raw_output_path=_string_or_none(payload.get("raw_output_path")),
        metrics=_extract_metrics(config, payload),
        metadata=_extract_metadata(config, payload),
    )


def _extract_metrics(config: StageArtifactConfig, payload: dict[str, Any]) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for key in config.metric_keys:
        value = _metric_value(payload, key)
        if value is not None:
            metrics[key] = value
    return metrics


def _extract_metadata(config: StageArtifactConfig, payload: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for key in config.metadata_keys:
        if key in payload and payload.get(key) is not None:
            metadata[key] = payload.get(key)
            continue
        command_payload = _dict_or_none(payload.get("command_payload"))
        if command_payload is not None and key in command_payload and command_payload.get(key) is not None:
            metadata[key] = command_payload.get(key)
    return metadata


def _metric_value(payload: dict[str, Any], key: str) -> Any:
    if key in payload and payload.get(key) is not None:
        return payload.get(key)
    command_payload = _dict_or_none(payload.get("command_payload"))
    if command_payload is not None and key in command_payload:
        return command_payload.get(key)
    return None


def _load_run_summary_payloads(stage_dir: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not stage_dir.exists():
        return []
    items: list[tuple[Path, dict[str, Any]]] = []
    for summary_path in sorted(
        stage_dir.glob("*.summary.json"),
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


def _resolve_run_id(stage_dir: Path, summary_path: Path) -> str:
    if summary_path.name != "latest-summary.json":
        return _extract_run_id(summary_path)
    latest_run = _latest_run_id(stage_dir)
    return latest_run or "latest"


def _latest_run_id(stage_dir: Path) -> str | None:
    summaries = _load_run_summary_payloads(stage_dir)
    if not summaries:
        return None
    return _extract_run_id(summaries[0][0])


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


def _generated_at(payload: dict[str, Any]) -> Any:
    return payload.get("finished_at") or payload.get("started_at")


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
