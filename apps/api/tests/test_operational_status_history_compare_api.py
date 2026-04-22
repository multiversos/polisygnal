from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.services import operational_status


def test_get_status_history_compare_returns_empty_payload_when_no_pipeline_runs_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)

    response = client.get("/status/history/compare")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_size"] == 0
    assert payload["matched_count"] == 0
    assert payload["filters"] == {
        "limit": 10,
        "status": None,
        "component": None,
    }
    assert payload["current_window"]["available"] is False
    assert payload["previous_window"]["available"] is False
    assert payload["current_window"]["dashboard_available_count"] == 0
    assert payload["previous_window"]["dashboard_available_count"] == 0
    assert payload["comparison"]["comparison_ready"] is False
    assert payload["comparison"]["summary"] == "insufficient_history"
    assert payload["comparison"]["dashboard_available_delta"] == 0
    assert all(
        item["change_reason"] == "insufficient_history"
        and item["changed_from"] is None
        and item["changed_to"] is None
        and item["latest_changed_run_id"] is None
        and item["latest_changed_generated_at"] is None
        and item["latest_changed_summary_path"] is None
        and item["latest_changed_artifact_available"] is False
        and item["previous_changed_run_id"] is None
        and item["previous_changed_generated_at"] is None
        and item["previous_changed_summary_path"] is None
        and item["previous_changed_artifact_available"] is False
        for item in payload["component_trends"]
    )
    assert payload["trend_signal"] == "insufficient_history"


def test_get_status_history_compare_compares_complete_windows_and_handles_partial_previous(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)
    now = datetime.now(UTC)
    pipeline_dir = tmp_path / "logs" / "market_pipeline"

    newest_ok_run_id = "20260421_220902"
    second_ok_run_id = "20260421_200903"
    diff_warning_run_id = "20260421_180901"
    evidence_warning_run_id = "20260421_160938"
    older_evidence_warning_run_id = "20260421_160832"
    second_ok_summary_path = str(pipeline_dir / f"{second_ok_run_id}.summary.json")
    diff_warning_summary_path = str(pipeline_dir / f"{diff_warning_run_id}.summary.json")
    evidence_warning_summary_path = str(pipeline_dir / f"{evidence_warning_run_id}.summary.json")
    older_evidence_warning_summary_path = str(
        pipeline_dir / f"{older_evidence_warning_run_id}.summary.json"
    )

    _write_pipeline_summary(
        pipeline_dir / f"{newest_ok_run_id}.summary.json",
        run_id=newest_ok_run_id,
        started_at=now - timedelta(hours=1, minutes=5),
        finished_at=now - timedelta(hours=1),
        status="ok",
        partial_error_count=0,
        snapshots_status="ok",
        evidence_status="ok",
        scoring_status="ok",
        reports_status="ok",
        briefing_status="ok",
        diff_status="ok",
        diff_comparison_ready=True,
        dashboard_status="ok",
        dashboard_ran=True,
        dashboard_path=str(tmp_path / "logs" / "dashboard" / "latest-dashboard.html"),
    )
    _write_pipeline_summary(
        pipeline_dir / f"{second_ok_run_id}.summary.json",
        run_id=second_ok_run_id,
        started_at=now - timedelta(hours=3, minutes=5),
        finished_at=now - timedelta(hours=3),
        status="ok",
        partial_error_count=0,
        snapshots_status="ok",
        evidence_status="ok",
        scoring_status="ok",
        reports_status="ok",
        briefing_status="ok",
        diff_status="ok",
        diff_comparison_ready=True,
        dashboard_status="ok",
        dashboard_ran=True,
        dashboard_path=str(tmp_path / "logs" / "dashboard" / f"{second_ok_run_id}.html"),
    )
    _write_pipeline_summary(
        pipeline_dir / f"{diff_warning_run_id}.summary.json",
        run_id=diff_warning_run_id,
        started_at=now - timedelta(hours=5, minutes=5),
        finished_at=now - timedelta(hours=5),
        status="ok",
        partial_error_count=0,
        snapshots_status="ok",
        evidence_status="ok",
        scoring_status="ok",
        reports_status="ok",
        briefing_status="ok",
        diff_status="ok",
        diff_comparison_ready=False,
        dashboard_status="warning",
        dashboard_ran=True,
        dashboard_path=str(tmp_path / "logs" / "dashboard" / f"{diff_warning_run_id}.html"),
    )
    _write_pipeline_summary(
        pipeline_dir / f"{evidence_warning_run_id}.summary.json",
        run_id=evidence_warning_run_id,
        started_at=now - timedelta(hours=7, minutes=5),
        finished_at=now - timedelta(hours=7),
        status="warning",
        partial_error_count=101,
        snapshots_status="ok",
        evidence_status="warning",
        scoring_status="ok",
        reports_status=None,
        briefing_status=None,
        diff_status=None,
        diff_comparison_ready=None,
    )
    _write_pipeline_summary(
        pipeline_dir / f"{older_evidence_warning_run_id}.summary.json",
        run_id=older_evidence_warning_run_id,
        started_at=now - timedelta(hours=9, minutes=5),
        finished_at=now - timedelta(hours=9),
        status="warning",
        partial_error_count=7,
        snapshots_status="ok",
        evidence_status="warning",
        scoring_status="ok",
        reports_status="ok",
        briefing_status="ok",
        diff_status="ok",
        diff_comparison_ready=True,
    )

    response = client.get("/status/history/compare?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_size"] == 2
    assert payload["matched_count"] == 5
    assert payload["filters"] == {
        "limit": 2,
        "status": None,
        "component": None,
    }

    current_window = payload["current_window"]
    assert current_window["available"] is True
    assert current_window["complete"] is True
    assert current_window["window_size"] == 2
    assert current_window["newest_run_id"] == newest_ok_run_id
    assert current_window["oldest_run_id"] == second_ok_run_id
    assert current_window["dashboard_available_count"] == 2
    assert current_window["overall_status_counts"] == {
        "ok_count": 2,
        "warning_count": 0,
        "error_count": 0,
        "missing_count": 0,
    }
    assert current_window["most_problematic_components"] == []

    previous_window = payload["previous_window"]
    assert previous_window["available"] is True
    assert previous_window["complete"] is True
    assert previous_window["window_size"] == 2
    assert previous_window["newest_run_id"] == diff_warning_run_id
    assert previous_window["oldest_run_id"] == evidence_warning_run_id
    assert previous_window["dashboard_available_count"] == 0
    assert previous_window["overall_status_counts"] == {
        "ok_count": 0,
        "warning_count": 2,
        "error_count": 0,
        "missing_count": 0,
    }
    assert previous_window["most_problematic_components"] == ["diff"]

    comparison = payload["comparison"]
    assert comparison["comparison_ready"] is True
    assert comparison["summary"] == "improved"
    assert comparison["message"] is None
    assert comparison["dashboard_available_delta"] == 2
    assert comparison["overall_status_counts_delta"] == {
        "ok_delta": 2,
        "warning_delta": -2,
        "error_delta": 0,
        "missing_delta": 0,
        "non_ok_delta": -2,
    }
    assert comparison["components"]["evidence"] == {
        "ok_delta": 1,
        "warning_delta": -1,
        "error_delta": 0,
        "missing_delta": 0,
        "non_ok_delta": -1,
    }
    assert comparison["components"]["diff"] == {
        "ok_delta": 2,
        "warning_delta": -1,
        "error_delta": 0,
        "missing_delta": -1,
        "non_ok_delta": -2,
    }
    assert payload["trend_signal"] == "improved"
    component_trends = {item["component"]: item for item in payload["component_trends"]}
    assert component_trends["pipeline"]["current_non_ok_count"] == 0
    assert component_trends["pipeline"]["previous_non_ok_count"] == 1
    assert component_trends["pipeline"]["delta_non_ok"] == -1
    assert component_trends["pipeline"]["trend"] == "improved"
    assert component_trends["pipeline"]["changed_from"] == "warning"
    assert component_trends["pipeline"]["changed_to"] == "ok"
    assert component_trends["pipeline"]["latest_changed_run_id"] == second_ok_run_id
    assert component_trends["pipeline"]["latest_changed_generated_at"] is not None
    assert component_trends["pipeline"]["latest_changed_summary_path"] == second_ok_summary_path
    assert component_trends["pipeline"]["latest_changed_artifact_available"] is True
    assert component_trends["pipeline"]["previous_changed_run_id"] == evidence_warning_run_id
    assert component_trends["pipeline"]["previous_changed_generated_at"] is not None
    assert (
        component_trends["pipeline"]["previous_changed_summary_path"]
        == evidence_warning_summary_path
    )
    assert component_trends["pipeline"]["previous_changed_artifact_available"] is True
    assert component_trends["pipeline"]["change_reason"] == "first_current_window_run_after_improvement"
    assert component_trends["snapshots"]["current_non_ok_count"] == 0
    assert component_trends["snapshots"]["previous_non_ok_count"] == 0
    assert component_trends["snapshots"]["delta_non_ok"] == 0
    assert component_trends["snapshots"]["trend"] == "stable"
    assert component_trends["snapshots"]["changed_from"] is None
    assert component_trends["snapshots"]["changed_to"] is None
    assert component_trends["snapshots"]["latest_changed_run_id"] is None
    assert component_trends["snapshots"]["latest_changed_generated_at"] is None
    assert component_trends["snapshots"]["latest_changed_summary_path"] is None
    assert component_trends["snapshots"]["latest_changed_artifact_available"] is False
    assert component_trends["snapshots"]["previous_changed_run_id"] is None
    assert component_trends["snapshots"]["previous_changed_generated_at"] is None
    assert component_trends["snapshots"]["previous_changed_summary_path"] is None
    assert component_trends["snapshots"]["previous_changed_artifact_available"] is False
    assert component_trends["snapshots"]["change_reason"] == "stable"
    assert component_trends["evidence"]["current_non_ok_count"] == 0
    assert component_trends["evidence"]["previous_non_ok_count"] == 1
    assert component_trends["evidence"]["delta_non_ok"] == -1
    assert component_trends["evidence"]["trend"] == "improved"
    assert component_trends["evidence"]["changed_from"] == "warning"
    assert component_trends["evidence"]["changed_to"] == "ok"
    assert component_trends["evidence"]["latest_changed_run_id"] == second_ok_run_id
    assert component_trends["evidence"]["latest_changed_summary_path"] == second_ok_summary_path
    assert component_trends["evidence"]["latest_changed_artifact_available"] is True
    assert component_trends["evidence"]["previous_changed_run_id"] == evidence_warning_run_id
    assert component_trends["evidence"]["previous_changed_generated_at"] is not None
    assert (
        component_trends["evidence"]["previous_changed_summary_path"]
        == evidence_warning_summary_path
    )
    assert component_trends["evidence"]["previous_changed_artifact_available"] is True
    assert component_trends["evidence"]["change_reason"] == "first_current_window_run_after_improvement"
    assert component_trends["diff"]["current_non_ok_count"] == 0
    assert component_trends["diff"]["previous_non_ok_count"] == 2
    assert component_trends["diff"]["delta_non_ok"] == -2
    assert component_trends["diff"]["trend"] == "improved"
    assert component_trends["diff"]["changed_from"] == "warning"
    assert component_trends["diff"]["changed_to"] == "ok"
    assert component_trends["diff"]["latest_changed_run_id"] == second_ok_run_id
    assert component_trends["diff"]["latest_changed_summary_path"] == second_ok_summary_path
    assert component_trends["diff"]["latest_changed_artifact_available"] is True
    assert component_trends["diff"]["previous_changed_run_id"] == diff_warning_run_id
    assert component_trends["diff"]["previous_changed_generated_at"] is not None
    assert component_trends["diff"]["previous_changed_summary_path"] == diff_warning_summary_path
    assert component_trends["diff"]["previous_changed_artifact_available"] is True
    assert component_trends["diff"]["change_reason"] == "first_current_window_run_after_improvement"
    assert payload["most_degraded_components"] == []
    assert payload["most_improved_components"] == ["diff"]
    assert payload["top_attention_components"] == []

    filtered_response = client.get("/status/history/compare?component=evidence&limit=1")
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert filtered_payload["matched_count"] == 2
    assert filtered_payload["current_window"]["newest_run_id"] == evidence_warning_run_id
    assert filtered_payload["previous_window"]["newest_run_id"] == older_evidence_warning_run_id
    assert filtered_payload["comparison"]["comparison_ready"] is True
    assert filtered_payload["comparison"]["summary"] == "stable"
    filtered_component_trends = {
        item["component"]: item for item in filtered_payload["component_trends"]
    }
    assert filtered_component_trends["pipeline"]["trend"] == "stable"
    assert filtered_component_trends["evidence"]["trend"] == "stable"
    assert filtered_component_trends["pipeline"]["changed_from"] is None
    assert filtered_component_trends["pipeline"]["changed_to"] is None
    assert filtered_component_trends["pipeline"]["latest_changed_run_id"] is None
    assert filtered_component_trends["pipeline"]["latest_changed_summary_path"] is None
    assert filtered_component_trends["pipeline"]["latest_changed_artifact_available"] is False
    assert filtered_component_trends["pipeline"]["previous_changed_run_id"] is None
    assert filtered_component_trends["pipeline"]["previous_changed_summary_path"] is None
    assert filtered_component_trends["pipeline"]["previous_changed_artifact_available"] is False
    assert filtered_component_trends["pipeline"]["change_reason"] == "stable"
    assert filtered_component_trends["evidence"]["changed_from"] is None
    assert filtered_component_trends["evidence"]["changed_to"] is None
    assert filtered_component_trends["evidence"]["latest_changed_run_id"] is None
    assert filtered_component_trends["evidence"]["latest_changed_summary_path"] is None
    assert filtered_component_trends["evidence"]["latest_changed_artifact_available"] is False
    assert filtered_component_trends["evidence"]["previous_changed_run_id"] is None
    assert filtered_component_trends["evidence"]["previous_changed_summary_path"] is None
    assert filtered_component_trends["evidence"]["previous_changed_artifact_available"] is False
    assert filtered_component_trends["evidence"]["change_reason"] == "stable"
    assert filtered_component_trends["reports"]["trend"] == "degraded"
    assert filtered_component_trends["briefing"]["trend"] == "degraded"
    assert filtered_component_trends["diff"]["trend"] == "degraded"
    assert filtered_component_trends["reports"]["changed_from"] == "ok"
    assert filtered_component_trends["reports"]["changed_to"] == "missing"
    assert filtered_component_trends["briefing"]["changed_from"] == "ok"
    assert filtered_component_trends["briefing"]["changed_to"] == "missing"
    assert filtered_component_trends["diff"]["changed_from"] == "ok"
    assert filtered_component_trends["diff"]["changed_to"] == "missing"
    assert filtered_component_trends["reports"]["latest_changed_run_id"] == evidence_warning_run_id
    assert filtered_component_trends["reports"]["latest_changed_generated_at"] is not None
    assert (
        filtered_component_trends["reports"]["latest_changed_summary_path"]
        == evidence_warning_summary_path
    )
    assert filtered_component_trends["reports"]["latest_changed_artifact_available"] is True
    assert filtered_component_trends["reports"]["previous_changed_run_id"] == older_evidence_warning_run_id
    assert filtered_component_trends["reports"]["previous_changed_generated_at"] is not None
    assert (
        filtered_component_trends["reports"]["previous_changed_summary_path"]
        == older_evidence_warning_summary_path
    )
    assert filtered_component_trends["reports"]["previous_changed_artifact_available"] is True
    assert filtered_component_trends["reports"]["change_reason"] == "latest_current_window_non_ok_run"
    assert filtered_component_trends["briefing"]["latest_changed_run_id"] == evidence_warning_run_id
    assert (
        filtered_component_trends["briefing"]["latest_changed_summary_path"]
        == evidence_warning_summary_path
    )
    assert filtered_component_trends["briefing"]["latest_changed_artifact_available"] is True
    assert filtered_component_trends["briefing"]["previous_changed_run_id"] == older_evidence_warning_run_id
    assert (
        filtered_component_trends["briefing"]["previous_changed_summary_path"]
        == older_evidence_warning_summary_path
    )
    assert filtered_component_trends["briefing"]["previous_changed_artifact_available"] is True
    assert filtered_component_trends["briefing"]["change_reason"] == "latest_current_window_non_ok_run"
    assert filtered_component_trends["diff"]["latest_changed_run_id"] == evidence_warning_run_id
    assert filtered_component_trends["diff"]["latest_changed_summary_path"] == evidence_warning_summary_path
    assert filtered_component_trends["diff"]["latest_changed_artifact_available"] is True
    assert filtered_component_trends["diff"]["previous_changed_run_id"] == older_evidence_warning_run_id
    assert (
        filtered_component_trends["diff"]["previous_changed_summary_path"]
        == older_evidence_warning_summary_path
    )
    assert filtered_component_trends["diff"]["previous_changed_artifact_available"] is True
    assert filtered_component_trends["diff"]["change_reason"] == "latest_current_window_non_ok_run"
    assert filtered_payload["most_degraded_components"] == [
        "reports",
        "briefing",
        "diff",
    ]

    partial_response = client.get("/status/history/compare?limit=3")
    assert partial_response.status_code == 200
    partial_payload = partial_response.json()
    assert partial_payload["window_size"] == 3
    assert partial_payload["matched_count"] == 5
    assert partial_payload["current_window"]["complete"] is True
    assert partial_payload["previous_window"]["available"] is True
    assert partial_payload["previous_window"]["complete"] is False
    assert partial_payload["previous_window"]["window_size"] == 2
    assert partial_payload["current_window"]["dashboard_available_count"] == 2
    assert partial_payload["previous_window"]["dashboard_available_count"] == 0
    assert partial_payload["comparison"]["comparison_ready"] is False
    assert partial_payload["comparison"]["summary"] == "insufficient_history"
    assert partial_payload["comparison"]["dashboard_available_delta"] == 0
    assert "Previous window is partial (2/3)" in partial_payload["comparison"]["message"]
    assert all(
        item["trend"] == "insufficient_history"
        and item["changed_from"] is None
        and item["changed_to"] is None
        and item["latest_changed_run_id"] is None
        and item["latest_changed_generated_at"] is None
        and item["latest_changed_summary_path"] is None
        and item["latest_changed_artifact_available"] is False
        and item["previous_changed_run_id"] is None
        and item["previous_changed_generated_at"] is None
        and item["previous_changed_summary_path"] is None
        and item["previous_changed_artifact_available"] is False
        and item["change_reason"] == "insufficient_history"
        for item in partial_payload["component_trends"]
    )
    assert partial_payload["trend_signal"] == "insufficient_history"


def test_build_component_trends_returns_null_summary_paths_when_selected_history_file_is_missing(
    tmp_path,
) -> None:
    now = datetime.now(UTC)
    missing_current_summary_path = str(tmp_path / "missing-current.summary.json")
    missing_previous_summary_path = str(tmp_path / "missing-previous.summary.json")

    current_items = [
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_220902",
            generated_at=now - timedelta(hours=1),
            overall_status="ok",
            components={name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS},
            non_ok_components=[],
            pipeline_status="ok",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=0,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=str(tmp_path / "latest-current.summary.json"),
        ),
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_200903",
            generated_at=now - timedelta(hours=3),
            overall_status="ok",
            components={name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS},
            non_ok_components=[],
            pipeline_status="ok",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=0,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=missing_current_summary_path,
        ),
    ]
    previous_items = [
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_180901",
            generated_at=now - timedelta(hours=5),
            overall_status="warning",
            components={
                **{name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS},
                "pipeline": "warning",
            },
            non_ok_components=["pipeline"],
            pipeline_status="warning",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=1,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=missing_previous_summary_path,
        ),
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_160938",
            generated_at=now - timedelta(hours=7),
            overall_status="ok",
            components={name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS},
            non_ok_components=[],
            pipeline_status="ok",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=0,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=str(tmp_path / "older-previous.summary.json"),
        ),
    ]

    current_window = operational_status._build_history_compare_window(
        current_items,
        expected_window_size=2,
    )
    previous_window = operational_status._build_history_compare_window(
        previous_items,
        expected_window_size=2,
    )

    trends = operational_status._build_component_trends(
        current_items=current_items,
        current_window=current_window,
        previous_items=previous_items,
        previous_window=previous_window,
        comparison_ready=True,
    )
    pipeline_trend = next(item for item in trends if item.component == "pipeline")

    assert pipeline_trend.trend == "improved"
    assert pipeline_trend.changed_from == "warning"
    assert pipeline_trend.changed_to == "ok"
    assert pipeline_trend.latest_changed_run_id == "20260421_200903"
    assert pipeline_trend.latest_changed_summary_path is None
    assert pipeline_trend.latest_changed_artifact_available is False
    assert pipeline_trend.previous_changed_run_id == "20260421_180901"
    assert pipeline_trend.previous_changed_summary_path is None
    assert pipeline_trend.previous_changed_artifact_available is False
    assert pipeline_trend.change_reason == "first_current_window_run_after_improvement"


def test_build_component_trends_returns_unknown_transition_state_when_component_status_is_missing(
    tmp_path,
) -> None:
    now = datetime.now(UTC)

    current_items = [
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_200903",
            generated_at=now - timedelta(hours=1),
            overall_status="ok",
            components={name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS},
            non_ok_components=[],
            pipeline_status="ok",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=0,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=str(tmp_path / "current.summary.json"),
        ),
    ]
    previous_components = {
        name: "ok" for name in operational_status.ALL_STATUS_COMPONENTS if name != "pipeline"
    }
    previous_items = [
        operational_status.OperationalStatusHistoryItem(
            run_id="20260421_180901",
            generated_at=now - timedelta(hours=3),
            overall_status="warning",
            components=previous_components,
            non_ok_components=["pipeline"],
            pipeline_status="warning",
            reports_status="ok",
            briefing_status="ok",
            diff_status="ok",
            partial_error_count=1,
            run_gap_seconds=None,
            freshness_status="unknown",
            summary_path=str(tmp_path / "previous.summary.json"),
        ),
    ]

    current_window = operational_status._build_history_compare_window(
        current_items,
        expected_window_size=1,
    )
    previous_window = operational_status._build_history_compare_window(
        previous_items,
        expected_window_size=1,
    )

    trends = operational_status._build_component_trends(
        current_items=current_items,
        current_window=current_window,
        previous_items=previous_items,
        previous_window=previous_window,
        comparison_ready=True,
    )
    pipeline_trend = next(item for item in trends if item.component == "pipeline")

    assert pipeline_trend.trend == "improved"
    assert pipeline_trend.changed_from == "unknown"
    assert pipeline_trend.changed_to == "ok"


def _write_pipeline_summary(
    path,
    *,
    run_id: str,
    started_at: datetime,
    finished_at: datetime,
    status: str,
    partial_error_count: int,
    snapshots_status: str | None,
    evidence_status: str | None,
    scoring_status: str | None,
    reports_status: str | None,
    briefing_status: str | None,
    diff_status: str | None,
    diff_comparison_ready: bool | None,
    dashboard_status: str | None = None,
    dashboard_ran: bool | None = None,
    dashboard_path: str | None = None,
) -> None:
    payload: dict[str, object] = {
        "status": status,
        "started_at": _iso(started_at),
        "finished_at": _iso(finished_at),
        "duration_seconds": max(1.0, (finished_at - started_at).total_seconds()),
        "log_dir": str(path.parent),
        "partial_error_count": partial_error_count,
        "pipeline": {
            "status": status,
            "log_dir": str(path.parent),
            "summary_path": str(path),
            "wrapper_run_id": run_id,
        },
        "steps": {},
    }
    steps = payload["steps"]
    assert isinstance(steps, dict)
    if snapshots_status is not None:
        steps["snapshots"] = {
            "status": snapshots_status,
            "partial_error_count": 0,
        }
    if evidence_status is not None:
        steps["evidence"] = {
            "status": evidence_status,
            "partial_error_count": partial_error_count if evidence_status == "warning" else 0,
        }
    if scoring_status is not None:
        steps["scoring"] = {
            "status": scoring_status,
            "partial_error_count": 0,
        }
    if reports_status is not None:
        payload["reports"] = {
            "ran": True,
            "status": reports_status,
            "partial_error_count": 0,
            "summary_path": str(path.parent / ".." / "reports" / f"{run_id}.summary.json"),
        }
    if briefing_status is not None:
        payload["briefing"] = {
            "ran": True,
            "status": briefing_status,
            "partial_error_count": 0,
            "summary_path": str(path.parent / ".." / "briefings" / f"{run_id}.summary.json"),
        }
    if diff_status is not None:
        diff_block: dict[str, object] = {
            "ran": True,
            "status": diff_status,
            "partial_error_count": 0,
            "summary_path": str(path.parent / ".." / "diffs" / f"{run_id}.summary.json"),
        }
        if diff_comparison_ready is not None:
            diff_block["comparison_ready"] = diff_comparison_ready
        payload["diff"] = diff_block
    if (
        dashboard_status is not None
        or dashboard_ran is not None
        or dashboard_path is not None
    ):
        payload["dashboard"] = {
            "ran": dashboard_ran,
            "status": dashboard_status,
            "dashboard_path": dashboard_path,
        }

    _write_json(path, payload)


def _write_json(path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()
