from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.services import operational_status


def test_get_status_history_summary_returns_empty_payload_when_no_pipeline_runs_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)

    response = client.get("/status/history/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_size"] == 0
    assert payload["matched_count"] == 0
    assert payload["filters"] == {
        "limit": 10,
        "status": None,
        "component": None,
    }
    assert payload["dashboard_available_count"] == 0
    assert payload["overall_status_counts"] == {
        "ok_count": 0,
        "warning_count": 0,
        "error_count": 0,
        "missing_count": 0,
    }
    assert payload["trend_signal"] == "no_data"
    assert payload["most_problematic_components"] == []

    expected_components = {
        "pipeline",
        "snapshots",
        "evidence",
        "scoring",
        "reports",
        "briefing",
        "diff",
    }
    assert set(payload["components"]) == expected_components
    for component_payload in payload["components"].values():
        assert component_payload == {
            "ok_count": 0,
            "warning_count": 0,
            "error_count": 0,
            "missing_count": 0,
            "non_ok_count": 0,
            "latest_non_ok_run_id": None,
            "latest_non_ok_generated_at": None,
        }


def test_get_status_history_summary_aggregates_window_and_supports_filters(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)
    now = datetime.now(UTC)
    pipeline_dir = tmp_path / "logs" / "market_pipeline"

    ok_run_id = "20260421_200903"
    diff_warning_run_id = "20260421_160832"
    warning_run_id = "20260421_112220"

    _write_pipeline_summary(
        pipeline_dir / f"{ok_run_id}.summary.json",
        run_id=ok_run_id,
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
        dashboard_path=str(tmp_path / "logs" / "dashboard" / "warning-dashboard.html"),
    )
    _write_pipeline_summary(
        pipeline_dir / f"{warning_run_id}.summary.json",
        run_id=warning_run_id,
        started_at=now - timedelta(hours=9, minutes=5),
        finished_at=now - timedelta(hours=9),
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

    response = client.get("/status/history/summary?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_size"] == 2
    assert payload["matched_count"] == 3
    assert payload["filters"] == {
        "limit": 2,
        "status": None,
        "component": None,
    }
    assert payload["dashboard_available_count"] == 1
    assert payload["overall_status_counts"] == {
        "ok_count": 1,
        "warning_count": 1,
        "error_count": 0,
        "missing_count": 0,
    }
    assert payload["trend_signal"] == "degraded"
    assert payload["most_problematic_components"] == ["diff"]

    pipeline_component = payload["components"]["pipeline"]
    assert pipeline_component["ok_count"] == 2
    assert pipeline_component["non_ok_count"] == 0

    diff_component = payload["components"]["diff"]
    assert diff_component == {
        "ok_count": 1,
        "warning_count": 1,
        "error_count": 0,
        "missing_count": 0,
        "non_ok_count": 1,
        "latest_non_ok_run_id": diff_warning_run_id,
        "latest_non_ok_generated_at": diff_component["latest_non_ok_generated_at"],
    }
    assert diff_component["latest_non_ok_generated_at"] is not None

    evidence_filter_response = client.get("/status/history/summary?component=evidence")
    assert evidence_filter_response.status_code == 200
    evidence_filter_payload = evidence_filter_response.json()
    assert evidence_filter_payload["window_size"] == 1
    assert evidence_filter_payload["matched_count"] == 1
    assert evidence_filter_payload["filters"] == {
        "limit": 10,
        "status": None,
        "component": "evidence",
    }
    assert evidence_filter_payload["dashboard_available_count"] == 0
    assert evidence_filter_payload["overall_status_counts"] == {
        "ok_count": 0,
        "warning_count": 1,
        "error_count": 0,
        "missing_count": 0,
    }
    assert evidence_filter_payload["trend_signal"] == "degraded"
    assert evidence_filter_payload["components"]["evidence"]["warning_count"] == 1
    assert evidence_filter_payload["components"]["evidence"]["latest_non_ok_run_id"] == warning_run_id
    assert "evidence" in evidence_filter_payload["most_problematic_components"]


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
