from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.schemas.status import (
    ComponentStatusSummary,
    DashboardStatusSummary,
    FreshnessStatus,
    FreshnessThresholds,
    OperationalStatusHistoryCompareResponse,
    OperationalStatusHistoryComponentTrend,
    OperationalStatusHistoryCompareWindow,
    OperationalStatusHistoryComparison,
    OperationalStatusHistoryFilters,
    OperationalStatusHistoryItem,
    OperationalStatusHistoryResponse,
    OperationalStatusHistorySummaryResponse,
    OperationalStatusResponse,
    RecentNonOkComponent,
    StatusCountBreakdown,
    StatusCountDelta,
    StatusComparisonSignal,
    StatusHistoryComponent,
    StatusHistorySummaryComponent,
    StatusTrendSignal,
)
from app.services.briefing_artifacts import list_briefing_runs, read_latest_briefing_artifact
from app.services.diff_artifacts import list_diff_runs, read_latest_diff_artifact
from app.services.pipeline_artifacts import (
    PipelineRunNotFoundError,
    list_pipeline_runs,
    read_latest_pipeline_artifact,
    read_pipeline_run_artifact,
)
from app.services.report_artifacts import list_report_runs, read_latest_report_artifact
from app.services.stage_artifacts import (
    EVIDENCE_STAGE,
    SCORING_STAGE,
    SNAPSHOTS_STAGE,
    list_stage_runs,
    read_latest_stage_artifact,
)

FRESH_MAX_AGE_SECONDS = 3 * 60 * 60
AGING_MAX_AGE_SECONDS = 6 * 60 * 60
RECENT_NON_OK_LIMIT = 5
RUN_SCAN_LIMIT = 50
STATUS_HISTORY_DEFAULT_LIMIT = 10
CRITICAL_COMPONENTS = ("pipeline", "snapshots", "evidence", "scoring")
ALL_STATUS_COMPONENTS: tuple[StatusHistoryComponent, ...] = (
    "pipeline",
    "snapshots",
    "evidence",
    "scoring",
    "reports",
    "briefing",
    "diff",
)


def build_operational_status(*, repo_root: Path | None = None) -> OperationalStatusResponse:
    root = repo_root or REPO_ROOT
    now = datetime.now(UTC)

    pipeline_artifact = read_latest_pipeline_artifact(repo_root=root)
    pipeline_runs = list_pipeline_runs(repo_root=root, limit=RUN_SCAN_LIMIT)
    snapshots_artifact = read_latest_stage_artifact(SNAPSHOTS_STAGE, repo_root=root)
    snapshots_runs = list_stage_runs(SNAPSHOTS_STAGE, repo_root=root, limit=RUN_SCAN_LIMIT)
    evidence_artifact = read_latest_stage_artifact(EVIDENCE_STAGE, repo_root=root)
    evidence_runs = list_stage_runs(EVIDENCE_STAGE, repo_root=root, limit=RUN_SCAN_LIMIT)
    scoring_artifact = read_latest_stage_artifact(SCORING_STAGE, repo_root=root)
    scoring_runs = list_stage_runs(SCORING_STAGE, repo_root=root, limit=RUN_SCAN_LIMIT)
    report_artifact = read_latest_report_artifact(repo_root=root)
    report_runs = list_report_runs(repo_root=root, limit=RUN_SCAN_LIMIT)
    briefing_artifact = read_latest_briefing_artifact(repo_root=root)
    briefing_runs = list_briefing_runs(repo_root=root, limit=RUN_SCAN_LIMIT)
    diff_artifact = read_latest_diff_artifact(repo_root=root)
    diff_runs = list_diff_runs(repo_root=root, limit=RUN_SCAN_LIMIT)

    pipeline = _build_pipeline_component(
        artifact=pipeline_artifact,
        latest_run_item=_first_item(pipeline_runs.items),
        now=now,
    )
    snapshots = _build_stage_component(
        artifact=snapshots_artifact,
        latest_run_item=_first_item(snapshots_runs.items),
        now=now,
    )
    evidence = _build_stage_component(
        artifact=evidence_artifact,
        latest_run_item=_first_item(evidence_runs.items),
        now=now,
    )
    scoring = _build_stage_component(
        artifact=scoring_artifact,
        latest_run_item=_first_item(scoring_runs.items),
        now=now,
    )
    reports = _build_report_component(
        artifact=report_artifact,
        latest_run_item=_first_item(report_runs.items),
        now=now,
    )
    briefing = _build_briefing_component(
        artifact=briefing_artifact,
        latest_run_item=_first_item(briefing_runs.items),
        now=now,
    )
    diff = _build_diff_component(
        artifact=diff_artifact,
        latest_run_item=_first_item(diff_runs.items),
        now=now,
    )
    dashboard = _build_dashboard_component(artifact=pipeline_artifact)

    components = {
        "pipeline": pipeline,
        "snapshots": snapshots,
        "evidence": evidence,
        "scoring": scoring,
        "reports": reports,
        "briefing": briefing,
        "diff": diff,
    }
    counts = _count_component_health(components)

    recent_non_ok_components = _collect_recent_non_ok_components(
        pipeline_artifact,
        pipeline_runs.items,
        snapshots_runs.items,
        evidence_runs.items,
        scoring_runs.items,
        report_runs.items,
        briefing_runs.items,
        diff_runs.items,
    )

    return OperationalStatusResponse(
        overall_status=_derive_overall_status(components),
        generated_at=now,
        components_ok=counts["ok"],
        components_warning=counts["warning"],
        components_error=counts["error"],
        components_missing=counts["missing"],
        freshness_thresholds=FreshnessThresholds(
            fresh_max_age_seconds=FRESH_MAX_AGE_SECONDS,
            aging_max_age_seconds=AGING_MAX_AGE_SECONDS,
        ),
        pipeline=pipeline,
        snapshots=snapshots,
        evidence=evidence,
        scoring=scoring,
        reports=reports,
        briefing=briefing,
        diff=diff,
        dashboard=dashboard,
        recent_non_ok_components=recent_non_ok_components,
    )


def build_operational_status_history(
    *,
    limit: int = STATUS_HISTORY_DEFAULT_LIMIT,
    status: str | None = None,
    component: StatusHistoryComponent | None = None,
    repo_root: Path | None = None,
) -> OperationalStatusHistoryResponse:
    normalized_limit = _normalize_history_limit(limit)
    history_dataset = _load_operational_status_history_dataset(
        status=status,
        component=component,
        repo_root=repo_root,
    )
    return OperationalStatusHistoryResponse(
        generated_at=history_dataset["generated_at"],
        available_count=history_dataset["available_count"],
        scanned_count=history_dataset["scanned_count"],
        matched_count=history_dataset["matched_count"],
        filters=OperationalStatusHistoryFilters(
            limit=normalized_limit,
            status=history_dataset["normalized_status"],
            component=component,
        ),
        items=history_dataset["items"][:normalized_limit],
    )


def build_operational_status_history_summary(
    *,
    limit: int = STATUS_HISTORY_DEFAULT_LIMIT,
    status: str | None = None,
    component: StatusHistoryComponent | None = None,
    repo_root: Path | None = None,
) -> OperationalStatusHistorySummaryResponse:
    normalized_limit = _normalize_history_limit(limit)
    history_dataset = _load_operational_status_history_dataset(
        status=status,
        component=component,
        repo_root=repo_root,
    )
    window_items = history_dataset["items"][:normalized_limit]
    history_window = _build_history_compare_window(
        window_items,
        expected_window_size=normalized_limit,
    )

    return OperationalStatusHistorySummaryResponse(
        generated_at=history_dataset["generated_at"],
        window_size=history_window.window_size,
        matched_count=history_dataset["matched_count"],
        filters=OperationalStatusHistoryFilters(
            limit=normalized_limit,
            status=history_dataset["normalized_status"],
            component=component,
        ),
        dashboard_available_count=history_window.dashboard_available_count,
        overall_status_counts=history_window.overall_status_counts,
        trend_signal=_derive_history_summary_trend(
            window_size=history_window.window_size,
            overall_status_counts=history_window.overall_status_counts,
            component_summaries=history_window.components,
        ),
        most_problematic_components=history_window.most_problematic_components,
        components=history_window.components,
    )


def build_operational_status_history_compare(
    *,
    limit: int = STATUS_HISTORY_DEFAULT_LIMIT,
    status: str | None = None,
    component: StatusHistoryComponent | None = None,
    repo_root: Path | None = None,
) -> OperationalStatusHistoryCompareResponse:
    normalized_limit = _normalize_history_limit(limit)
    history_dataset = _load_operational_status_history_dataset(
        status=status,
        component=component,
        repo_root=repo_root,
    )
    filtered_items = history_dataset["items"]
    current_items = filtered_items[:normalized_limit]
    previous_items = filtered_items[normalized_limit : normalized_limit * 2]
    current_window = _build_history_compare_window(
        current_items,
        expected_window_size=normalized_limit,
    )
    previous_window = _build_history_compare_window(
        previous_items,
        expected_window_size=normalized_limit,
    )

    comparison_ready = current_window.complete and previous_window.complete
    comparison_summary: StatusComparisonSignal = "insufficient_history"
    comparison_message: str | None = None
    dashboard_available_delta = 0
    overall_status_counts_delta = StatusCountDelta()
    component_deltas = {
        component_name: StatusCountDelta()
        for component_name in ALL_STATUS_COMPONENTS
    }

    if comparison_ready:
        comparison_summary = _derive_history_compare_summary(
            current_window.overall_status_counts,
            previous_window.overall_status_counts,
        )
        overall_status_counts_delta = _build_status_count_delta(
            current_window.overall_status_counts,
            previous_window.overall_status_counts,
        )
        dashboard_available_delta = (
            current_window.dashboard_available_count
            - previous_window.dashboard_available_count
        )
        component_deltas = {
            component_name: _build_status_count_delta(
                current_window.components[component_name],
                previous_window.components[component_name],
            )
            for component_name in ALL_STATUS_COMPONENTS
        }
    else:
        comparison_message = _history_compare_insufficient_message(
            requested_window_size=normalized_limit,
            current_window=current_window,
            previous_window=previous_window,
        )

    comparison = OperationalStatusHistoryComparison(
        comparison_ready=comparison_ready,
        summary=comparison_summary,
        message=comparison_message,
        dashboard_available_delta=dashboard_available_delta,
        overall_status_counts_delta=overall_status_counts_delta,
        components=component_deltas,
    )
    component_trends = _build_component_trends(
        current_items=current_items,
        current_window=current_window,
        previous_items=previous_items,
        previous_window=previous_window,
        comparison_ready=comparison_ready,
    )

    return OperationalStatusHistoryCompareResponse(
        generated_at=history_dataset["generated_at"],
        window_size=current_window.window_size,
        matched_count=history_dataset["matched_count"],
        filters=OperationalStatusHistoryFilters(
            limit=normalized_limit,
            status=history_dataset["normalized_status"],
            component=component,
        ),
        current_window=current_window,
        previous_window=previous_window,
        comparison=comparison,
        component_trends=component_trends,
        most_degraded_components=_most_degraded_components(component_trends),
        most_improved_components=_most_improved_components(component_trends),
        top_attention_components=_top_attention_components(current_window.components),
        trend_signal=comparison.summary,
    )


def _load_operational_status_history_dataset(
    *,
    status: str | None,
    component: StatusHistoryComponent | None,
    repo_root: Path | None,
) -> dict[str, Any]:
    root = repo_root or REPO_ROOT
    now = datetime.now(UTC)
    pipeline_runs = list_pipeline_runs(repo_root=root, limit=RUN_SCAN_LIMIT)
    raw_items = [
        _build_status_history_item(
            run_id=item.run_id,
            fallback_item=item,
            repo_root=root,
        )
        for item in pipeline_runs.items
    ]
    _apply_history_freshness(raw_items, now=now)

    normalized_status = _normalize_status(status)
    filtered_items = raw_items
    if normalized_status is not None:
        filtered_items = [
            item
            for item in filtered_items
            if item.overall_status == normalized_status
        ]
    if component is not None:
        filtered_items = [
            item
            for item in filtered_items
            if item.components.get(component) in {"warning", "error", "missing"}
        ]

    return {
        "generated_at": now,
        "available_count": pipeline_runs.total_count,
        "scanned_count": len(raw_items),
        "matched_count": len(filtered_items),
        "normalized_status": normalized_status,
        "items": filtered_items,
    }


def _build_history_compare_window(
    items: list[OperationalStatusHistoryItem],
    *,
    expected_window_size: int,
) -> OperationalStatusHistoryCompareWindow:
    (
        overall_status_counts,
        component_summaries,
        dashboard_available_count,
    ) = _summarize_history_items(items)
    return OperationalStatusHistoryCompareWindow(
        available=bool(items),
        complete=expected_window_size > 0 and len(items) == expected_window_size,
        window_size=len(items),
        newest_run_id=items[0].run_id if items else None,
        oldest_run_id=items[-1].run_id if items else None,
        dashboard_available_count=dashboard_available_count,
        overall_status_counts=overall_status_counts,
        most_problematic_components=_most_problematic_components(component_summaries),
        components=component_summaries,
    )


def _summarize_history_items(
    items: list[OperationalStatusHistoryItem],
) -> tuple[
    StatusCountBreakdown,
    dict[StatusHistoryComponent, StatusHistorySummaryComponent],
    int,
]:
    component_summaries = {
        component_name: StatusHistorySummaryComponent()
        for component_name in ALL_STATUS_COMPONENTS
    }
    overall_status_counts = StatusCountBreakdown()
    dashboard_available_count = 0

    for item in items:
        _increment_status_count_breakdown(overall_status_counts, item.overall_status)
        if item.dashboard_available:
            dashboard_available_count += 1
        for component_name in ALL_STATUS_COMPONENTS:
            health_status = item.components.get(component_name, "missing")
            component_summary = component_summaries[component_name]
            _increment_status_history_summary_component(component_summary, health_status)
            if health_status != "ok" and component_summary.latest_non_ok_run_id is None:
                component_summary.latest_non_ok_run_id = item.run_id
                component_summary.latest_non_ok_generated_at = item.generated_at

    return overall_status_counts, component_summaries, dashboard_available_count


def _build_component_trends(
    *,
    current_items: list[OperationalStatusHistoryItem],
    current_window: OperationalStatusHistoryCompareWindow,
    previous_items: list[OperationalStatusHistoryItem],
    previous_window: OperationalStatusHistoryCompareWindow,
    comparison_ready: bool,
) -> list[OperationalStatusHistoryComponentTrend]:
    trends: list[OperationalStatusHistoryComponentTrend] = []
    for component_name in ALL_STATUS_COMPONENTS:
        current_component = current_window.components[component_name]
        previous_component = previous_window.components[component_name]
        current_non_ok_count = current_component.non_ok_count
        previous_non_ok_count = previous_component.non_ok_count
        delta_non_ok = current_non_ok_count - previous_non_ok_count

        if comparison_ready:
            if delta_non_ok < 0:
                trend: StatusComparisonSignal = "improved"
            elif delta_non_ok > 0:
                trend = "degraded"
            else:
                trend = "stable"
        else:
            trend = "insufficient_history"

        changed_item = None
        previous_changed_item = None
        if trend == "improved":
            changed_item = _oldest_history_item(current_items)
            previous_changed_item = _newest_non_ok_history_item_for_component(
                previous_items,
                component_name,
            ) or _first_item(previous_items)
            change_reason = "first_current_window_run_after_improvement"
        elif trend == "degraded":
            changed_item = _latest_non_ok_history_item_for_component(current_items, component_name)
            previous_changed_item = _newest_ok_history_item_for_component(
                previous_items,
                component_name,
            ) or _first_item(previous_items)
            change_reason = "latest_current_window_non_ok_run"
        elif trend == "stable":
            change_reason = "stable"
        else:
            change_reason = "insufficient_history"

        if trend == "degraded" and changed_item is None:
            changed_item = _first_item(current_items)

        trends.append(
            OperationalStatusHistoryComponentTrend(
                component=component_name,
                current_non_ok_count=current_non_ok_count,
                previous_non_ok_count=previous_non_ok_count,
                delta_non_ok=delta_non_ok,
                trend=trend,
                changed_from=_history_component_transition_state(
                    previous_changed_item,
                    component_name,
                ),
                changed_to=_history_component_transition_state(
                    changed_item,
                    component_name,
                ),
                latest_changed_run_id=_value_or_none(changed_item, "run_id"),
                latest_changed_generated_at=_value_or_none(changed_item, "generated_at"),
                latest_changed_summary_path=_history_summary_path_or_none(changed_item),
                latest_changed_artifact_available=_history_summary_artifact_available(changed_item),
                previous_changed_run_id=_value_or_none(previous_changed_item, "run_id"),
                previous_changed_generated_at=_value_or_none(
                    previous_changed_item,
                    "generated_at",
                ),
                previous_changed_summary_path=_history_summary_path_or_none(previous_changed_item),
                previous_changed_artifact_available=_history_summary_artifact_available(
                    previous_changed_item
                ),
                change_reason=change_reason,
                current_status_counts=_status_count_breakdown_from_component(current_component),
                previous_status_counts=_status_count_breakdown_from_component(previous_component),
            )
        )
    return trends


def _build_pipeline_component(
    *,
    artifact,
    latest_run_item,
    now: datetime,
) -> ComponentStatusSummary:
    paths = _build_paths(
        summary_path=artifact.summary_path,
        run_summary_path=_path_or_none(latest_run_item, "summary_path"),
    )
    details: dict[str, Any] = {
        "component_statuses": artifact.component_statuses.model_dump(exclude_none=True),
    }
    if artifact.limit is not None:
        details["limit"] = artifact.limit
    if artifact.frequency_recommendation_minutes is not None:
        details["frequency_recommendation_minutes"] = artifact.frequency_recommendation_minutes
    if artifact.subset:
        details["subset"] = artifact.subset

    return _build_component_summary(
        component="pipeline",
        artifact_available=artifact.artifact_available,
        status=artifact.status,
        generated_at=artifact.generated_at,
        run_id=artifact.run_id or _value_or_none(latest_run_item, "run_id"),
        partial_error_count=artifact.partial_error_count,
        message=artifact.message,
        paths=paths,
        details=details,
        now=now,
    )


def _build_status_history_item(
    *,
    run_id: str,
    fallback_item,
    repo_root: Path,
) -> OperationalStatusHistoryItem:
    try:
        artifact = read_pipeline_run_artifact(run_id, repo_root=repo_root)
        return _build_status_history_item_from_artifact(artifact)
    except PipelineRunNotFoundError:
        return _build_status_history_item_from_fallback(fallback_item)


def _build_status_history_item_from_artifact(
    artifact,
) -> OperationalStatusHistoryItem:
    pipeline_summary_path = artifact.summary_path
    pipeline_health = _derive_history_component_health(
        status=artifact.status,
        partial_error_count=artifact.partial_error_count,
        artifact_available=artifact.artifact_available,
        artifact_incomplete=bool(
            artifact.artifact_available
            and (artifact.generated_at is None or artifact.status is None or artifact.summary_path is None)
        ),
    )

    pipeline_steps = artifact.pipeline.steps if artifact.pipeline is not None else {}
    snapshots_health = _derive_history_component_health(
        status=_step_status(pipeline_steps, "snapshots") or artifact.component_statuses.snapshots,
        partial_error_count=_step_partial_error_count(pipeline_steps, "snapshots"),
        artifact_available="snapshots" in pipeline_steps or artifact.component_statuses.snapshots is not None,
        artifact_incomplete=(
            ("snapshots" in pipeline_steps and _step_status(pipeline_steps, "snapshots") is None)
            or ("snapshots" not in pipeline_steps and artifact.component_statuses.snapshots is None)
        ),
    )
    evidence_health = _derive_history_component_health(
        status=_step_status(pipeline_steps, "evidence") or artifact.component_statuses.evidence,
        partial_error_count=_step_partial_error_count(pipeline_steps, "evidence"),
        artifact_available="evidence" in pipeline_steps or artifact.component_statuses.evidence is not None,
        artifact_incomplete=(
            ("evidence" in pipeline_steps and _step_status(pipeline_steps, "evidence") is None)
            or ("evidence" not in pipeline_steps and artifact.component_statuses.evidence is None)
        ),
    )
    scoring_health = _derive_history_component_health(
        status=_step_status(pipeline_steps, "scoring") or artifact.component_statuses.scoring,
        partial_error_count=_step_partial_error_count(pipeline_steps, "scoring"),
        artifact_available="scoring" in pipeline_steps or artifact.component_statuses.scoring is not None,
        artifact_incomplete=(
            ("scoring" in pipeline_steps and _step_status(pipeline_steps, "scoring") is None)
            or ("scoring" not in pipeline_steps and artifact.component_statuses.scoring is None)
        ),
    )
    reports_health = _derive_history_component_health(
        status=_linked_status(artifact.reports) or artifact.component_statuses.reports,
        partial_error_count=_linked_partial_error_count(artifact.reports),
        artifact_available=artifact.reports is not None or artifact.component_statuses.reports is not None,
        artifact_incomplete=(
            artifact.reports is None and artifact.component_statuses.reports is None
        ),
    )
    briefing_health = _derive_history_component_health(
        status=_linked_status(artifact.briefing) or artifact.component_statuses.briefing,
        partial_error_count=_linked_partial_error_count(artifact.briefing),
        artifact_available=artifact.briefing is not None or artifact.component_statuses.briefing is not None,
        artifact_incomplete=(
            artifact.briefing is None and artifact.component_statuses.briefing is None
        ),
    )
    diff_health = _derive_history_component_health(
        status=_linked_status(artifact.diff) or artifact.component_statuses.diff,
        partial_error_count=_linked_partial_error_count(artifact.diff),
        artifact_available=artifact.diff is not None or artifact.component_statuses.diff is not None,
        artifact_incomplete=(
            artifact.diff is None and artifact.component_statuses.diff is None
        ),
        extra_warning=_diff_comparison_not_ready(artifact.diff),
    )

    components = {
        "pipeline": pipeline_health,
        "snapshots": snapshots_health,
        "evidence": evidence_health,
        "scoring": scoring_health,
        "reports": reports_health,
        "briefing": briefing_health,
        "diff": diff_health,
    }
    non_ok_components = [
        component_name
        for component_name in ALL_STATUS_COMPONENTS
        if components[component_name] != "ok"
    ]

    return OperationalStatusHistoryItem(
        run_id=artifact.run_id or "unknown",
        generated_at=artifact.generated_at,
        overall_status=_derive_overall_status_from_healths(components),
        components=components,
        non_ok_components=non_ok_components,
        dashboard_available=_dashboard_available(artifact.dashboard),
        dashboard_status=_linked_status(artifact.dashboard),
        pipeline_status=artifact.status,
        reports_status=_linked_status(artifact.reports),
        briefing_status=_linked_status(artifact.briefing),
        diff_status=_linked_status(artifact.diff),
        partial_error_count=artifact.partial_error_count,
        run_gap_seconds=None,
        freshness_status="unknown",
        summary_path=pipeline_summary_path,
    )


def _build_status_history_item_from_fallback(
    fallback_item,
) -> OperationalStatusHistoryItem:
    components = {
        "pipeline": _derive_history_component_health(
            status=fallback_item.status,
            partial_error_count=fallback_item.partial_error_count,
            artifact_available=True,
            artifact_incomplete=fallback_item.generated_at is None or fallback_item.status is None,
        ),
        "snapshots": _history_component_from_raw_status(fallback_item.component_statuses.snapshots),
        "evidence": _history_component_from_raw_status(fallback_item.component_statuses.evidence),
        "scoring": _history_component_from_raw_status(fallback_item.component_statuses.scoring),
        "reports": _history_component_from_raw_status(fallback_item.component_statuses.reports),
        "briefing": _history_component_from_raw_status(fallback_item.component_statuses.briefing),
        "diff": _history_component_from_raw_status(fallback_item.component_statuses.diff),
    }
    non_ok_components = [
        component_name
        for component_name in ALL_STATUS_COMPONENTS
        if components[component_name] != "ok"
    ]
    return OperationalStatusHistoryItem(
        run_id=fallback_item.run_id,
        generated_at=fallback_item.generated_at,
        overall_status=_derive_overall_status_from_healths(components),
        components=components,
        non_ok_components=non_ok_components,
        dashboard_available=_dashboard_available(fallback_item.dashboard),
        dashboard_status=_linked_status(fallback_item.dashboard),
        pipeline_status=fallback_item.status,
        reports_status=fallback_item.component_statuses.reports,
        briefing_status=fallback_item.component_statuses.briefing,
        diff_status=fallback_item.component_statuses.diff,
        partial_error_count=fallback_item.partial_error_count,
        run_gap_seconds=None,
        freshness_status="unknown",
        summary_path=fallback_item.summary_path,
    )


def _build_stage_component(
    *,
    artifact,
    latest_run_item,
    now: datetime,
) -> ComponentStatusSummary:
    paths = _build_paths(
        summary_path=artifact.summary_path,
        run_summary_path=_path_or_none(latest_run_item, "summary_path"),
        raw_output_path=artifact.raw_output_path,
    )
    details: dict[str, Any] = {}
    if artifact.metrics:
        details["metrics"] = artifact.metrics
    if artifact.metadata:
        details["metadata"] = artifact.metadata

    return _build_component_summary(
        component=artifact.stage,
        artifact_available=artifact.artifact_available,
        status=artifact.status,
        generated_at=artifact.generated_at,
        run_id=artifact.run_id or _value_or_none(latest_run_item, "run_id"),
        partial_error_count=artifact.partial_error_count,
        message=artifact.message,
        paths=paths,
        details=details,
        now=now,
    )


def _build_report_component(
    *,
    artifact,
    latest_run_item,
    now: datetime,
) -> ComponentStatusSummary:
    paths = _build_paths(
        summary_path=artifact.summary_path,
        run_summary_path=_path_or_none(latest_run_item, "summary_path"),
    )
    details = {
        "preset_count": artifact.preset_count,
        "total_items_exported": artifact.total_items_exported,
        "presets": artifact.presets,
        "formats": artifact.formats,
    }
    if artifact.limit is not None:
        details["limit"] = artifact.limit
    if artifact.frequency_recommendation_minutes is not None:
        details["frequency_recommendation_minutes"] = artifact.frequency_recommendation_minutes

    return _build_component_summary(
        component="reports",
        artifact_available=artifact.artifact_available,
        status=artifact.status,
        generated_at=artifact.generated_at,
        run_id=artifact.run_id or _value_or_none(latest_run_item, "run_id"),
        partial_error_count=artifact.partial_error_count,
        message=artifact.message,
        paths=paths,
        details=details,
        now=now,
    )


def _build_briefing_component(
    *,
    artifact,
    latest_run_item,
    now: datetime,
) -> ComponentStatusSummary:
    paths = _build_paths(
        summary_path=artifact.summary_path,
        run_summary_path=_path_or_none(latest_run_item, "summary_path"),
        json_path=artifact.json_path,
        txt_path=artifact.txt_path,
        raw_output_path=artifact.raw_output_path,
    )
    details = {
        "top_opportunities_count": artifact.top_opportunities_count,
        "watchlist_count": artifact.watchlist_count,
        "review_flags_count": artifact.review_flags_count,
        "total_markets": artifact.total_markets,
    }

    return _build_component_summary(
        component="briefing",
        artifact_available=artifact.artifact_available,
        status=artifact.status,
        generated_at=artifact.generated_at,
        run_id=artifact.run_id or _value_or_none(latest_run_item, "run_id"),
        partial_error_count=0,
        message=artifact.message,
        paths=paths,
        details=details,
        now=now,
    )


def _build_diff_component(
    *,
    artifact,
    latest_run_item,
    now: datetime,
) -> ComponentStatusSummary:
    status = _value_or_none(latest_run_item, "status")
    paths = _build_paths(
        summary_path=_path_or_none(latest_run_item, "summary_path"),
        json_path=_path_or_none(latest_run_item, "json_path"),
        txt_path=_path_or_none(latest_run_item, "txt_path"),
    )
    details = {
        "comparison_ready": artifact.comparison_ready,
        "current_run_id": _value_or_none(artifact.current_run, "run_id"),
        "previous_run_id": _value_or_none(artifact.previous_run, "run_id"),
        "top_opportunities_entered_count": artifact.summary.top_opportunities_entered_count,
        "top_opportunities_exited_count": artifact.summary.top_opportunities_exited_count,
        "bucket_changes_count": artifact.summary.bucket_changes_count,
        "material_score_changes_count": artifact.summary.material_score_changes_count,
    }

    return _build_component_summary(
        component="diff",
        artifact_available=artifact.artifact_available,
        status=status,
        generated_at=artifact.generated_at or _value_or_none(latest_run_item, "generated_at"),
        run_id=_value_or_none(latest_run_item, "run_id"),
        partial_error_count=0,
        message=(
            artifact.summary.text
            if not artifact.artifact_available or not artifact.comparison_ready
            else None
        ),
        paths=paths,
        details=details,
        now=now,
        extra_warning=artifact.artifact_available and not artifact.comparison_ready,
    )


def _build_dashboard_component(
    *,
    artifact,
) -> DashboardStatusSummary:
    dashboard_artifact = _value_or_none(artifact, "dashboard")
    artifact_available = dashboard_artifact is not None
    return DashboardStatusSummary(
        artifact_available=artifact_available,
        dashboard_available=_dashboard_available(dashboard_artifact),
        status=_linked_status(dashboard_artifact),
        generated_at=artifact.generated_at if artifact_available else None,
        dashboard_path=_path_or_none(dashboard_artifact, "dashboard_path"),
        overall_status=_value_or_none(dashboard_artifact, "overall_status"),
        total_top_opportunities=_value_or_none(dashboard_artifact, "total_top_opportunities"),
        total_watchlist=_value_or_none(dashboard_artifact, "total_watchlist"),
        warning_reason=_value_or_none(dashboard_artifact, "warning_reason"),
    )


def _build_component_summary(
    *,
    component: str,
    artifact_available: bool,
    status: str | None,
    generated_at: datetime | None,
    run_id: str | None,
    partial_error_count: int,
    message: str | None,
    paths: dict[str, str],
    details: dict[str, Any],
    now: datetime,
    extra_warning: bool = False,
) -> ComponentStatusSummary:
    age_seconds, freshness_status = _compute_freshness(generated_at, now)
    artifact_incomplete = bool(
        artifact_available and (generated_at is None or status is None or not paths)
    )
    health_status = _derive_health_status(
        artifact_available=artifact_available,
        status=status,
        partial_error_count=partial_error_count,
        freshness_status=freshness_status,
        artifact_incomplete=artifact_incomplete,
        extra_warning=extra_warning,
    )
    resolved_message = message
    if not artifact_available and not resolved_message:
        resolved_message = f"No {component} artifact available yet."
    elif artifact_incomplete and not resolved_message:
        resolved_message = f"{component.capitalize()} artifact is available but incomplete."

    return ComponentStatusSummary(
        artifact_available=artifact_available,
        health_status=health_status,
        status=status,
        generated_at=generated_at,
        run_id=run_id,
        age_seconds=age_seconds,
        freshness_status=freshness_status,
        partial_error_count=partial_error_count,
        artifact_incomplete=artifact_incomplete,
        message=resolved_message,
        paths=paths,
        details=details,
    )


def _count_component_health(components: dict[str, ComponentStatusSummary]) -> dict[str, int]:
    counts = {"ok": 0, "warning": 0, "error": 0, "missing": 0}
    for component in components.values():
        counts[component.health_status] += 1
    return counts


def _derive_overall_status(components: dict[str, ComponentStatusSummary]) -> str:
    return _derive_overall_status_from_healths(
        {name: component.health_status for name, component in components.items()}
    )


def _derive_overall_status_from_healths(components: dict[str, str]) -> str:
    if all(component == "missing" for component in components.values()):
        return "missing"
    if any(component == "error" for component in components.values()):
        return "error"
    if any(
        components.get(name) == "missing"
        for name in CRITICAL_COMPONENTS
    ):
        return "missing"
    if any(component in {"warning", "missing"} for component in components.values()):
        return "warning"
    return "ok"


def _increment_status_count_breakdown(
    target: StatusCountBreakdown,
    status: str | None,
) -> None:
    normalized_status = _normalize_status(status) or "missing"
    if normalized_status == "ok":
        target.ok_count += 1
    elif normalized_status == "warning":
        target.warning_count += 1
    elif normalized_status == "error":
        target.error_count += 1
    else:
        target.missing_count += 1


def _increment_status_history_summary_component(
    target: StatusHistorySummaryComponent,
    status: str | None,
) -> None:
    normalized_status = _normalize_status(status) or "missing"
    if normalized_status == "ok":
        target.ok_count += 1
    elif normalized_status == "warning":
        target.warning_count += 1
    elif normalized_status == "error":
        target.error_count += 1
    else:
        target.missing_count += 1
    target.non_ok_count = target.warning_count + target.error_count + target.missing_count


def _most_problematic_components(
    component_summaries: dict[StatusHistoryComponent, StatusHistorySummaryComponent],
) -> list[StatusHistoryComponent]:
    highest_non_ok_count = max(
        (summary.non_ok_count for summary in component_summaries.values()),
        default=0,
    )
    if highest_non_ok_count <= 0:
        return []
    return [
        component_name
        for component_name in ALL_STATUS_COMPONENTS
        if component_summaries[component_name].non_ok_count == highest_non_ok_count
    ]


def _derive_history_summary_trend(
    *,
    window_size: int,
    overall_status_counts: StatusCountBreakdown,
    component_summaries: dict[StatusHistoryComponent, StatusHistorySummaryComponent],
) -> StatusTrendSignal:
    if window_size <= 0:
        return "no_data"

    total_non_ok = (
        overall_status_counts.warning_count
        + overall_status_counts.error_count
        + overall_status_counts.missing_count
    )
    if total_non_ok == 0:
        return "stable"

    dominant_component_non_ok_count = max(
        (summary.non_ok_count for summary in component_summaries.values()),
        default=0,
    )
    attention_threshold = max(2, (window_size + 1) // 2)
    if (
        overall_status_counts.error_count > 0
        or overall_status_counts.missing_count > 0
        or dominant_component_non_ok_count >= attention_threshold
    ):
        return "attention_needed"
    return "degraded"


def _build_status_count_delta(
    current,
    previous,
) -> StatusCountDelta:
    return StatusCountDelta(
        ok_delta=_safe_int(_value_or_none(current, "ok_count")) - _safe_int(_value_or_none(previous, "ok_count")),
        warning_delta=(
            _safe_int(_value_or_none(current, "warning_count"))
            - _safe_int(_value_or_none(previous, "warning_count"))
        ),
        error_delta=_safe_int(_value_or_none(current, "error_count")) - _safe_int(_value_or_none(previous, "error_count")),
        missing_delta=(
            _safe_int(_value_or_none(current, "missing_count"))
            - _safe_int(_value_or_none(previous, "missing_count"))
        ),
        non_ok_delta=_count_non_ok_statuses(current) - _count_non_ok_statuses(previous),
    )


def _derive_history_compare_summary(
    current: StatusCountBreakdown,
    previous: StatusCountBreakdown,
) -> StatusComparisonSignal:
    current_severe_non_ok = _safe_int(current.error_count) + _safe_int(current.missing_count)
    previous_severe_non_ok = _safe_int(previous.error_count) + _safe_int(previous.missing_count)
    if current_severe_non_ok < previous_severe_non_ok:
        return "improved"
    if current_severe_non_ok > previous_severe_non_ok:
        return "degraded"

    current_total_non_ok = _count_non_ok_statuses(current)
    previous_total_non_ok = _count_non_ok_statuses(previous)
    if current_total_non_ok < previous_total_non_ok:
        return "improved"
    if current_total_non_ok > previous_total_non_ok:
        return "degraded"
    return "stable"


def _status_count_breakdown_from_component(
    component: StatusHistorySummaryComponent,
) -> StatusCountBreakdown:
    return StatusCountBreakdown(
        ok_count=component.ok_count,
        warning_count=component.warning_count,
        error_count=component.error_count,
        missing_count=component.missing_count,
    )


def _most_degraded_components(
    component_trends: list[OperationalStatusHistoryComponentTrend],
) -> list[StatusHistoryComponent]:
    degraded_trends = [trend for trend in component_trends if trend.trend == "degraded"]
    if not degraded_trends:
        return []
    worst_delta = max(trend.delta_non_ok for trend in degraded_trends)
    return [
        trend.component
        for trend in degraded_trends
        if trend.delta_non_ok == worst_delta
    ]


def _most_improved_components(
    component_trends: list[OperationalStatusHistoryComponentTrend],
) -> list[StatusHistoryComponent]:
    improved_trends = [trend for trend in component_trends if trend.trend == "improved"]
    if not improved_trends:
        return []
    best_delta = min(trend.delta_non_ok for trend in improved_trends)
    return [
        trend.component
        for trend in improved_trends
        if trend.delta_non_ok == best_delta
    ]


def _top_attention_components(
    components: dict[StatusHistoryComponent, StatusHistorySummaryComponent],
) -> list[StatusHistoryComponent]:
    highest_non_ok_count = max(
        (component.non_ok_count for component in components.values()),
        default=0,
    )
    if highest_non_ok_count <= 0:
        return []
    return [
        component_name
        for component_name in ALL_STATUS_COMPONENTS
        if components[component_name].non_ok_count == highest_non_ok_count
    ]


def _oldest_history_item(
    items: list[OperationalStatusHistoryItem],
) -> OperationalStatusHistoryItem | None:
    if not items:
        return None
    return items[-1]


def _history_summary_path_or_none(
    item: OperationalStatusHistoryItem | None,
) -> str | None:
    summary_path = _path_or_none(item, "summary_path")
    if summary_path is None:
        return None
    summary_file = Path(summary_path)
    if not summary_file.is_file():
        return None
    return str(summary_file)


def _history_summary_artifact_available(
    item: OperationalStatusHistoryItem | None,
) -> bool:
    return _history_summary_path_or_none(item) is not None


def _history_component_transition_state(
    item: OperationalStatusHistoryItem | None,
    component: StatusHistoryComponent,
) -> str | None:
    if item is None:
        return None
    state = item.components.get(component)
    normalized_state = _normalize_status(state)
    if normalized_state in {"ok", "warning", "error", "missing"}:
        return normalized_state
    return "unknown"


def _latest_non_ok_history_item_for_component(
    items: list[OperationalStatusHistoryItem],
    component: StatusHistoryComponent,
) -> OperationalStatusHistoryItem | None:
    for item in items:
        if item.components.get(component) in {"warning", "error", "missing"}:
            return item
    return None


def _newest_non_ok_history_item_for_component(
    items: list[OperationalStatusHistoryItem],
    component: StatusHistoryComponent,
) -> OperationalStatusHistoryItem | None:
    for item in items:
        if item.components.get(component) in {"warning", "error", "missing"}:
            return item
    return None


def _newest_ok_history_item_for_component(
    items: list[OperationalStatusHistoryItem],
    component: StatusHistoryComponent,
) -> OperationalStatusHistoryItem | None:
    for item in items:
        if item.components.get(component) == "ok":
            return item
    return None


def _history_compare_insufficient_message(
    *,
    requested_window_size: int,
    current_window: OperationalStatusHistoryCompareWindow,
    previous_window: OperationalStatusHistoryCompareWindow,
) -> str:
    if not current_window.available:
        return "No matching history runs are available for comparison."
    if not current_window.complete:
        return (
            f"Current window is partial ({current_window.window_size}/{requested_window_size}) "
            "so comparison is not ready."
        )
    if not previous_window.available:
        return (
            f"Need {requested_window_size} earlier matching runs to build the previous window."
        )
    return (
        f"Previous window is partial ({previous_window.window_size}/{requested_window_size}) "
        "so comparison is not ready."
    )


def _derive_health_status(
    *,
    artifact_available: bool,
    status: str | None,
    partial_error_count: int,
    freshness_status: FreshnessStatus,
    artifact_incomplete: bool,
    extra_warning: bool,
) -> str:
    if not artifact_available:
        return "missing"
    normalized_status = _normalize_status(status)
    if normalized_status in {"error", "failed", "failure"}:
        return "error"
    if (
        normalized_status == "warning"
        or partial_error_count > 0
        or artifact_incomplete
        or freshness_status == "stale"
        or extra_warning
    ):
        return "warning"
    return "ok"


def _compute_freshness(
    generated_at: datetime | None,
    now: datetime,
) -> tuple[int | None, FreshnessStatus]:
    if generated_at is None:
        return None, "unknown"
    timestamp = _to_utc(generated_at)
    age_seconds = max(0, int((now - timestamp).total_seconds()))
    return age_seconds, _freshness_status_from_seconds(age_seconds)


def _freshness_status_from_seconds(value: int | None) -> FreshnessStatus:
    if value is None:
        return "unknown"
    if value <= FRESH_MAX_AGE_SECONDS:
        return "fresh"
    if value <= AGING_MAX_AGE_SECONDS:
        return "aging"
    return "stale"


def _apply_history_freshness(
    items: list[OperationalStatusHistoryItem],
    *,
    now: datetime,
) -> None:
    previous_generated_at: datetime | None = None
    for index, item in enumerate(items):
        if item.generated_at is None:
            item.run_gap_seconds = None
            item.freshness_status = "unknown"
            previous_generated_at = item.generated_at
            continue

        current_generated_at = _to_utc(item.generated_at)
        if index == 0 or previous_generated_at is None:
            gap_seconds = max(0, int((now - current_generated_at).total_seconds()))
        else:
            gap_seconds = max(0, int((previous_generated_at - current_generated_at).total_seconds()))
        item.run_gap_seconds = gap_seconds
        item.freshness_status = _freshness_status_from_seconds(gap_seconds)
        previous_generated_at = current_generated_at


def _derive_history_component_health(
    *,
    status: str | None,
    partial_error_count: int,
    artifact_available: bool,
    artifact_incomplete: bool,
    extra_warning: bool = False,
) -> str:
    if not artifact_available:
        return "missing"
    normalized_status = _normalize_status(status)
    if normalized_status in {"error", "failed", "failure"}:
        return "error"
    if (
        normalized_status == "warning"
        or partial_error_count > 0
        or artifact_incomplete
        or extra_warning
    ):
        return "warning"
    return "ok"


def _history_component_from_raw_status(status: str | None) -> str:
    return _derive_history_component_health(
        status=status,
        partial_error_count=0,
        artifact_available=status is not None,
        artifact_incomplete=status is None,
    )


def _collect_recent_non_ok_components(
    pipeline_artifact,
    pipeline_items,
    snapshots_items,
    evidence_items,
    scoring_items,
    report_items,
    briefing_items,
    diff_items,
) -> list[RecentNonOkComponent]:
    issues = [
        _latest_dashboard_non_ok_run(pipeline_artifact),
        _latest_non_ok_run("pipeline", pipeline_items),
        _latest_non_ok_run("snapshots", snapshots_items),
        _latest_non_ok_run("evidence", evidence_items),
        _latest_non_ok_run("scoring", scoring_items),
        _latest_non_ok_run("reports", report_items),
        _latest_non_ok_run("briefing", briefing_items),
        _latest_non_ok_run("diff", diff_items),
    ]
    resolved = [issue for issue in issues if issue is not None]
    resolved.sort(
        key=lambda item: _to_utc(item.generated_at) if item.generated_at is not None else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return resolved[:RECENT_NON_OK_LIMIT]


def _latest_dashboard_non_ok_run(pipeline_artifact) -> RecentNonOkComponent | None:
    dashboard = _value_or_none(pipeline_artifact, "dashboard")
    status = _linked_status(dashboard)
    normalized_status = _normalize_status(status)
    if normalized_status in {"error", "failed", "failure"}:
        health_status = "error"
    elif normalized_status == "warning":
        health_status = "warning"
    else:
        return None

    return RecentNonOkComponent(
        component="dashboard",
        health_status=health_status,
        run_id=_value_or_none(pipeline_artifact, "run_id"),
        generated_at=_value_or_none(pipeline_artifact, "generated_at"),
        status=status,
        partial_error_count=_linked_partial_error_count(dashboard),
        summary_path=_path_or_none(dashboard, "summary_path")
        or _path_or_none(pipeline_artifact, "summary_path"),
        message=_value_or_none(dashboard, "warning_reason"),
    )


def _latest_non_ok_run(component: str, items) -> RecentNonOkComponent | None:
    for item in items:
        partial_error_count = _safe_int(_value_or_none(item, "partial_error_count"))
        status = _value_or_none(item, "status")
        normalized_status = _normalize_status(status)
        comparison_ready = getattr(item, "comparison_ready", True)
        if normalized_status in {"error", "failed", "failure"}:
            health_status = "error"
            message = None
        elif normalized_status == "warning" or partial_error_count > 0:
            health_status = "warning"
            message = None
        elif component == "diff" and comparison_ready is False:
            health_status = "warning"
            message = "Diff comparison was not ready for this run."
        else:
            continue

        return RecentNonOkComponent(
            component=component,
            health_status=health_status,
            run_id=_value_or_none(item, "run_id"),
            generated_at=_value_or_none(item, "generated_at"),
            status=status,
            partial_error_count=partial_error_count,
            summary_path=_path_or_none(item, "summary_path"),
            message=message,
        )
    return None


def _step_status(steps: dict[str, Any], step_name: str) -> str | None:
    step = steps.get(step_name)
    return _value_or_none(step, "status")


def _step_partial_error_count(steps: dict[str, Any], step_name: str) -> int:
    step = steps.get(step_name)
    return _safe_int(_value_or_none(step, "partial_error_count"))


def _linked_status(value) -> str | None:
    return _value_or_none(value, "status")


def _linked_partial_error_count(value) -> int:
    return _safe_int(_value_or_none(value, "partial_error_count"))


def _dashboard_available(value) -> bool:
    return (
        _value_or_none(value, "ran") is True
        and _normalize_status(_linked_status(value)) == "ok"
        and _path_or_none(value, "dashboard_path") is not None
    )


def _diff_comparison_not_ready(value) -> bool:
    metadata = _value_or_none(value, "metadata")
    return isinstance(metadata, dict) and metadata.get("comparison_ready") is False


def _build_paths(**values: object) -> dict[str, str]:
    paths: dict[str, str] = {}
    for key, value in values.items():
        if not isinstance(value, str) or not value.strip():
            continue
        if key == "run_summary_path" and value == paths.get("summary_path"):
            continue
        paths[key] = value
    return paths


def _first_item(items):
    return items[0] if items else None


def _normalize_history_limit(limit: int) -> int:
    return max(1, min(limit, RUN_SCAN_LIMIT))


def _path_or_none(obj, field_name: str) -> str | None:
    value = _value_or_none(obj, field_name)
    if isinstance(value, str) and value.strip():
        return value
    return None


def _value_or_none(obj, field_name: str):
    if obj is None:
        return None
    return getattr(obj, field_name, None)


def _normalize_status(status: str | None) -> str | None:
    if not isinstance(status, str):
        return None
    normalized = status.strip().lower()
    return normalized or None


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


def _count_non_ok_statuses(value) -> int:
    return (
        _safe_int(_value_or_none(value, "warning_count"))
        + _safe_int(_value_or_none(value, "error_count"))
        + _safe_int(_value_or_none(value, "missing_count"))
    )


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
