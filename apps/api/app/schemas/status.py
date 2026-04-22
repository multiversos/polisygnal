from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


HealthStatus = Literal["ok", "warning", "error", "missing"]
FreshnessStatus = Literal["fresh", "aging", "stale", "unknown"]
StatusTrendSignal = Literal["stable", "degraded", "attention_needed", "no_data"]
StatusComparisonSignal = Literal["improved", "degraded", "stable", "insufficient_history"]
StatusComponentTransitionState = Literal["ok", "warning", "error", "missing", "unknown"]
StatusComponentChangeReason = Literal[
    "stable",
    "insufficient_history",
    "first_current_window_run_after_improvement",
    "latest_current_window_non_ok_run",
]
StatusHistoryComponent = Literal[
    "pipeline",
    "snapshots",
    "evidence",
    "scoring",
    "reports",
    "briefing",
    "diff",
]


class FreshnessThresholds(BaseModel):
    fresh_max_age_seconds: int
    aging_max_age_seconds: int


class ComponentStatusSummary(BaseModel):
    artifact_available: bool = False
    health_status: HealthStatus = "missing"
    status: str | None = None
    generated_at: datetime | None = None
    run_id: str | None = None
    age_seconds: int | None = None
    freshness_status: FreshnessStatus = "unknown"
    partial_error_count: int = 0
    artifact_incomplete: bool = False
    message: str | None = None
    paths: dict[str, str] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)


class DashboardStatusSummary(BaseModel):
    artifact_available: bool = False
    dashboard_available: bool = False
    status: str | None = None
    generated_at: datetime | None = None
    dashboard_path: str | None = None
    overall_status: str | None = None
    total_top_opportunities: int | None = None
    total_watchlist: int | None = None
    warning_reason: str | None = None


class RecentNonOkComponent(BaseModel):
    component: str
    health_status: Literal["warning", "error", "missing"]
    run_id: str | None = None
    generated_at: datetime | None = None
    status: str | None = None
    partial_error_count: int = 0
    summary_path: str | None = None
    message: str | None = None


class OperationalStatusResponse(BaseModel):
    overall_status: HealthStatus
    generated_at: datetime
    components_ok: int = 0
    components_warning: int = 0
    components_error: int = 0
    components_missing: int = 0
    freshness_thresholds: FreshnessThresholds
    pipeline: ComponentStatusSummary
    snapshots: ComponentStatusSummary
    evidence: ComponentStatusSummary
    scoring: ComponentStatusSummary
    reports: ComponentStatusSummary
    briefing: ComponentStatusSummary
    diff: ComponentStatusSummary
    dashboard: DashboardStatusSummary
    recent_non_ok_components: list[RecentNonOkComponent] = Field(default_factory=list)


class OperationalStatusHistoryFilters(BaseModel):
    limit: int = 10
    status: HealthStatus | None = None
    component: StatusHistoryComponent | None = None


class OperationalStatusHistoryItem(BaseModel):
    run_id: str
    generated_at: datetime | None = None
    overall_status: HealthStatus
    components: dict[str, HealthStatus] = Field(default_factory=dict)
    non_ok_components: list[StatusHistoryComponent] = Field(default_factory=list)
    dashboard_available: bool = False
    dashboard_status: str | None = None
    pipeline_status: str | None = None
    reports_status: str | None = None
    briefing_status: str | None = None
    diff_status: str | None = None
    partial_error_count: int = 0
    run_gap_seconds: int | None = None
    freshness_status: FreshnessStatus = "unknown"
    summary_path: str | None = None


class OperationalStatusHistoryResponse(BaseModel):
    generated_at: datetime
    available_count: int = 0
    scanned_count: int = 0
    matched_count: int = 0
    filters: OperationalStatusHistoryFilters
    items: list[OperationalStatusHistoryItem] = Field(default_factory=list)


class StatusCountBreakdown(BaseModel):
    ok_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    missing_count: int = 0


class StatusHistorySummaryComponent(BaseModel):
    ok_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    missing_count: int = 0
    non_ok_count: int = 0
    latest_non_ok_run_id: str | None = None
    latest_non_ok_generated_at: datetime | None = None


class OperationalStatusHistorySummaryResponse(BaseModel):
    generated_at: datetime
    window_size: int = 0
    matched_count: int = 0
    filters: OperationalStatusHistoryFilters
    dashboard_available_count: int = 0
    overall_status_counts: StatusCountBreakdown = Field(default_factory=StatusCountBreakdown)
    trend_signal: StatusTrendSignal = "no_data"
    most_problematic_components: list[StatusHistoryComponent] = Field(default_factory=list)
    components: dict[StatusHistoryComponent, StatusHistorySummaryComponent] = Field(default_factory=dict)


class StatusCountDelta(BaseModel):
    ok_delta: int = 0
    warning_delta: int = 0
    error_delta: int = 0
    missing_delta: int = 0
    non_ok_delta: int = 0


class OperationalStatusHistoryCompareWindow(BaseModel):
    available: bool = False
    complete: bool = False
    window_size: int = 0
    newest_run_id: str | None = None
    oldest_run_id: str | None = None
    dashboard_available_count: int = 0
    overall_status_counts: StatusCountBreakdown = Field(default_factory=StatusCountBreakdown)
    most_problematic_components: list[StatusHistoryComponent] = Field(default_factory=list)
    components: dict[StatusHistoryComponent, StatusHistorySummaryComponent] = Field(default_factory=dict)


class OperationalStatusHistoryComparison(BaseModel):
    comparison_ready: bool = False
    summary: StatusComparisonSignal = "insufficient_history"
    message: str | None = None
    dashboard_available_delta: int = 0
    overall_status_counts_delta: StatusCountDelta = Field(default_factory=StatusCountDelta)
    components: dict[StatusHistoryComponent, StatusCountDelta] = Field(default_factory=dict)


class OperationalStatusHistoryComponentTrend(BaseModel):
    component: StatusHistoryComponent
    current_non_ok_count: int = 0
    previous_non_ok_count: int = 0
    delta_non_ok: int = 0
    trend: StatusComparisonSignal = "insufficient_history"
    changed_from: StatusComponentTransitionState | None = None
    changed_to: StatusComponentTransitionState | None = None
    latest_changed_run_id: str | None = None
    latest_changed_generated_at: datetime | None = None
    latest_changed_summary_path: str | None = None
    latest_changed_artifact_available: bool = False
    previous_changed_run_id: str | None = None
    previous_changed_generated_at: datetime | None = None
    previous_changed_summary_path: str | None = None
    previous_changed_artifact_available: bool = False
    change_reason: StatusComponentChangeReason = "insufficient_history"
    current_status_counts: StatusCountBreakdown = Field(default_factory=StatusCountBreakdown)
    previous_status_counts: StatusCountBreakdown = Field(default_factory=StatusCountBreakdown)


class OperationalStatusHistoryCompareResponse(BaseModel):
    generated_at: datetime
    window_size: int = 0
    matched_count: int = 0
    filters: OperationalStatusHistoryFilters
    current_window: OperationalStatusHistoryCompareWindow = Field(
        default_factory=OperationalStatusHistoryCompareWindow
    )
    previous_window: OperationalStatusHistoryCompareWindow = Field(
        default_factory=OperationalStatusHistoryCompareWindow
    )
    comparison: OperationalStatusHistoryComparison = Field(
        default_factory=OperationalStatusHistoryComparison
    )
    component_trends: list[OperationalStatusHistoryComponentTrend] = Field(default_factory=list)
    most_degraded_components: list[StatusHistoryComponent] = Field(default_factory=list)
    most_improved_components: list[StatusHistoryComponent] = Field(default_factory=list)
    top_attention_components: list[StatusHistoryComponent] = Field(default_factory=list)
    trend_signal: StatusComparisonSignal = "insufficient_history"
