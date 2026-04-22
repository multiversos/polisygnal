from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.services import operational_status


def test_get_status_returns_missing_summary_when_no_artifacts_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_status"] == "missing"
    assert payload["components_ok"] == 0
    assert payload["components_warning"] == 0
    assert payload["components_error"] == 0
    assert payload["components_missing"] == 7
    assert payload["freshness_thresholds"] == {
        "fresh_max_age_seconds": 10800,
        "aging_max_age_seconds": 21600,
    }
    assert payload["pipeline"]["health_status"] == "missing"
    assert payload["snapshots"]["health_status"] == "missing"
    assert payload["evidence"]["health_status"] == "missing"
    assert payload["scoring"]["health_status"] == "missing"
    assert payload["reports"]["health_status"] == "missing"
    assert payload["briefing"]["health_status"] == "missing"
    assert payload["diff"]["health_status"] == "missing"
    assert payload["dashboard"] == {
        "artifact_available": False,
        "dashboard_available": False,
        "status": None,
        "generated_at": None,
        "dashboard_path": None,
        "overall_status": None,
        "total_top_opportunities": None,
        "total_watchlist": None,
        "warning_reason": None,
    }
    assert payload["recent_non_ok_components"] == []


def test_get_status_returns_mixed_component_health_and_recent_non_ok_items(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)
    now = datetime.now(UTC)

    pipeline_run_id = "20260421_200903"
    snapshots_run_id = "20260421_200903"
    evidence_warning_run_id = "20260421_112300"
    evidence_latest_run_id = "20260421_201014"
    scoring_run_id = "20260421_201018"
    diff_run_id = "20260421_201035"

    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    _write_json(
        pipeline_dir / f"{pipeline_run_id}.summary.json",
        {
            "status": "ok",
            "started_at": _iso(now - timedelta(hours=1, minutes=2)),
            "finished_at": _iso(now - timedelta(hours=1)),
            "partial_error_count": 0,
            "steps": {
                "snapshots": {"status": "ok"},
                "evidence": {"status": "ok"},
                "scoring": {"status": "ok"},
            },
            "reports": {"status": "ok"},
            "briefing": {"status": "ok"},
            "diff": {"status": "ok"},
        },
    )
    _write_json(
        pipeline_dir / "latest-summary.json",
        {
            "status": "ok",
            "started_at": _iso(now - timedelta(hours=1, minutes=2)),
            "finished_at": _iso(now - timedelta(hours=1)),
            "partial_error_count": 0,
            "steps": {
                "snapshots": {"status": "ok"},
                "evidence": {"status": "ok"},
                "scoring": {"status": "ok"},
            },
            "reports": {"status": "ok"},
            "briefing": {"status": "ok"},
            "diff": {"status": "ok"},
        },
    )

    snapshots_dir = pipeline_dir / "snapshots"
    _write_stage_summary(
        snapshots_dir / f"{snapshots_run_id}.summary.json",
        stage="snapshots",
        started_at=now - timedelta(hours=1, minutes=2),
        finished_at=now - timedelta(hours=1, minutes=1),
        status="ok",
        partial_error_count=0,
    )
    _write_stage_summary(
        snapshots_dir / "latest-summary.json",
        stage="snapshots",
        started_at=now - timedelta(hours=1, minutes=2),
        finished_at=now - timedelta(hours=1, minutes=1),
        status="ok",
        partial_error_count=0,
    )

    evidence_dir = pipeline_dir / "evidence"
    _write_stage_summary(
        evidence_dir / f"{evidence_warning_run_id}.summary.json",
        stage="evidence",
        started_at=now - timedelta(hours=9, minutes=5),
        finished_at=now - timedelta(hours=9),
        status="warning",
        partial_error_count=101,
    )
    _write_stage_summary(
        evidence_dir / f"{evidence_latest_run_id}.summary.json",
        stage="evidence",
        started_at=now - timedelta(hours=1, minutes=3),
        finished_at=now - timedelta(hours=1, minutes=1),
        status="ok",
        partial_error_count=0,
    )
    _write_stage_summary(
        evidence_dir / "latest-summary.json",
        stage="evidence",
        started_at=now - timedelta(hours=1, minutes=3),
        finished_at=now - timedelta(hours=1, minutes=1),
        status="ok",
        partial_error_count=0,
    )

    scoring_dir = pipeline_dir / "scoring"
    _write_stage_summary(
        scoring_dir / f"{scoring_run_id}.summary.json",
        stage="scoring",
        started_at=now - timedelta(hours=8, minutes=2),
        finished_at=now - timedelta(hours=8),
        status="ok",
        partial_error_count=0,
    )
    _write_stage_summary(
        scoring_dir / "latest-summary.json",
        stage="scoring",
        started_at=now - timedelta(hours=8, minutes=2),
        finished_at=now - timedelta(hours=8),
        status="ok",
        partial_error_count=0,
    )

    briefings_dir = tmp_path / "logs" / "briefings"
    _write_json(
        briefings_dir / "latest-briefing.json",
        {
            "generated_at": _iso(now - timedelta(hours=1)),
            "summary": "Briefing payload exists, but summary metadata is missing.",
            "filters": {
                "sport_type": "nba",
                "market_type": "winner",
                "active": True,
                "top_limit": 5,
                "watchlist_limit": 5,
                "review_limit": 5,
            },
            "top_opportunities": [],
            "watchlist": [],
            "review_flags": [],
            "operational_counts": {
                "total_markets": 141,
                "opportunity_count": 0,
                "watchlist_count": 0,
                "review_flag_count": 0,
                "review_edge_count": 0,
                "review_confidence_count": 0,
                "evidence_backed_count": 8,
                "fallback_only_count": 133,
                "no_prediction_count": 0,
                "evidence_eligible_count": 8,
                "evidence_non_eligible_count": 133,
            },
            "freshness": {
                "pipeline_status": "ok",
                "pipeline_started_at": _iso(now - timedelta(hours=1, minutes=2)),
                "pipeline_finished_at": _iso(now - timedelta(hours=1)),
                "reports_status": "missing",
                "reports_started_at": None,
                "reports_finished_at": None,
                "latest_snapshot_at": _iso(now - timedelta(hours=1, minutes=1)),
                "latest_prediction_at": _iso(now - timedelta(hours=8)),
                "latest_evidence_at": _iso(now - timedelta(hours=1, minutes=1)),
            },
        },
    )

    diffs_dir = tmp_path / "logs" / "diffs"
    diff_summary_path = diffs_dir / f"{diff_run_id}.summary.json"
    diff_json_path = diffs_dir / f"{diff_run_id}.json"
    diff_txt_path = diffs_dir / f"{diff_run_id}.txt"
    _write_json(
        diff_summary_path,
        {
            "status": "ok",
            "generated_at": _iso(now - timedelta(minutes=30)),
            "comparison_ready": True,
            "top_opportunities_entered_count": 0,
            "top_opportunities_exited_count": 0,
            "bucket_changes_count": 0,
            "material_score_changes_count": 2,
            "summary_text": "Latest diff looks healthy.",
            "json_output_path": str(diff_json_path),
            "text_output_path": str(diff_txt_path),
        },
    )
    _write_json(
        diffs_dir / "latest-summary.json",
        {
            "status": "ok",
            "generated_at": _iso(now - timedelta(minutes=30)),
            "comparison_ready": True,
            "top_opportunities_entered_count": 0,
            "top_opportunities_exited_count": 0,
            "bucket_changes_count": 0,
            "material_score_changes_count": 2,
            "summary_text": "Latest diff looks healthy.",
            "json_output_path": str(diff_json_path),
            "text_output_path": str(diff_txt_path),
        },
    )
    _write_json(
        diffs_dir / "latest-diff.json",
        {
            "generated_at": _iso(now - timedelta(minutes=30)),
            "current_run": {
                "generated_at": _iso(now - timedelta(minutes=31)),
                "run_id": scoring_run_id,
                "pipeline_summary_path": str(pipeline_dir / "latest-summary.json"),
                "total_markets": 141,
                "top_opportunities_count": 6,
                "watchlist_count": 2,
                "snapshot_path": str(diff_json_path),
            },
            "previous_run": {
                "generated_at": _iso(now - timedelta(hours=2, minutes=30)),
                "run_id": "20260421_180943",
                "pipeline_summary_path": str(pipeline_dir / f"{pipeline_run_id}.summary.json"),
                "total_markets": 141,
                "top_opportunities_count": 6,
                "watchlist_count": 2,
                "snapshot_path": str(diff_json_path),
            },
            "summary": {
                "comparison_ready": True,
                "top_opportunities_entered_count": 0,
                "top_opportunities_exited_count": 0,
                "bucket_changes_count": 0,
                "material_score_changes_count": 2,
                "text": "Latest diff looks healthy.",
            },
            "top_opportunities_entered": [],
            "top_opportunities_exited": [],
            "bucket_changes": [],
            "material_score_changes": [],
        },
    )

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()

    assert payload["overall_status"] == "warning"
    assert payload["components_ok"] == 4
    assert payload["components_warning"] == 2
    assert payload["components_error"] == 0
    assert payload["components_missing"] == 1

    assert payload["pipeline"]["health_status"] == "ok"
    assert payload["pipeline"]["run_id"] == pipeline_run_id
    assert payload["pipeline"]["freshness_status"] == "fresh"

    assert payload["snapshots"]["health_status"] == "ok"
    assert payload["snapshots"]["run_id"] == snapshots_run_id
    assert payload["snapshots"]["details"]["metrics"]["snapshots_created"] == 141

    assert payload["evidence"]["health_status"] == "ok"
    assert payload["evidence"]["run_id"] == evidence_latest_run_id
    assert payload["evidence"]["details"]["metrics"]["markets_eligible_for_evidence"] == 8

    assert payload["scoring"]["health_status"] == "warning"
    assert payload["scoring"]["freshness_status"] == "stale"
    assert payload["scoring"]["run_id"] == scoring_run_id
    assert payload["scoring"]["age_seconds"] >= 21600

    assert payload["reports"]["health_status"] == "missing"
    assert payload["reports"]["artifact_available"] is False

    assert payload["briefing"]["artifact_available"] is True
    assert payload["briefing"]["health_status"] == "warning"
    assert payload["briefing"]["artifact_incomplete"] is True
    assert payload["briefing"]["run_id"] is None
    assert payload["briefing"]["paths"]["json_path"].endswith("latest-briefing.json")

    assert payload["diff"]["health_status"] == "ok"
    assert payload["diff"]["run_id"] == diff_run_id
    assert payload["diff"]["details"]["comparison_ready"] is True
    assert payload["dashboard"] == {
        "artifact_available": False,
        "dashboard_available": False,
        "status": None,
        "generated_at": None,
        "dashboard_path": None,
        "overall_status": None,
        "total_top_opportunities": None,
        "total_watchlist": None,
        "warning_reason": None,
    }

    recent_non_ok = payload["recent_non_ok_components"]
    assert len(recent_non_ok) == 1
    assert recent_non_ok[0]["component"] == "evidence"
    assert recent_non_ok[0]["health_status"] == "warning"
    assert recent_non_ok[0]["run_id"] == evidence_warning_run_id
    assert recent_non_ok[0]["partial_error_count"] == 101


def test_get_status_exposes_dashboard_block_from_latest_pipeline_summary(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)
    now = datetime.now(UTC)

    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    pipeline_payload = {
        "status": "ok",
        "started_at": _iso(now - timedelta(minutes=20)),
        "finished_at": _iso(now - timedelta(minutes=15)),
        "partial_error_count": 0,
        "steps": {
            "snapshots": {"status": "ok"},
            "evidence": {"status": "ok"},
            "scoring": {"status": "ok"},
        },
        "reports": {"status": "ok"},
        "briefing": {"status": "ok"},
        "diff": {"status": "ok"},
        "dashboard": {
            "ran": True,
            "status": "ok",
            "dashboard_path": str(dashboard_path),
            "overall_status": "ok",
            "total_top_opportunities": 4,
            "total_watchlist": 7,
            "warning_reason": None,
        },
    }
    _write_json(
        pipeline_dir / "20260422_115706.summary.json",
        pipeline_payload,
    )
    _write_json(
        pipeline_dir / "latest-summary.json",
        pipeline_payload,
    )

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["dashboard"] == {
        "artifact_available": True,
        "dashboard_available": True,
        "status": "ok",
        "generated_at": payload["dashboard"]["generated_at"],
        "dashboard_path": str(dashboard_path),
        "overall_status": "ok",
        "total_top_opportunities": 4,
        "total_watchlist": 7,
        "warning_reason": None,
    }
    assert payload["dashboard"]["generated_at"] is not None
    assert payload["pipeline"]["health_status"] == "ok"
    assert payload["snapshots"]["health_status"] == "missing"
    assert payload["evidence"]["health_status"] == "missing"
    assert payload["scoring"]["health_status"] == "missing"
    assert payload["recent_non_ok_components"] == []


def test_get_status_includes_dashboard_in_recent_non_ok_components_without_affecting_global_status(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(operational_status, "REPO_ROOT", tmp_path)
    now = datetime.now(UTC)

    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    run_id = "20260422_120001"
    pipeline_payload = {
        "status": "ok",
        "started_at": _iso(now - timedelta(minutes=20)),
        "finished_at": _iso(now - timedelta(minutes=15)),
        "partial_error_count": 0,
        "pipeline": {
            "wrapper_run_id": run_id,
        },
        "steps": {
            "snapshots": {"status": "ok"},
            "evidence": {"status": "ok"},
            "scoring": {"status": "ok"},
        },
        "reports": {"status": "ok"},
        "briefing": {"status": "ok"},
        "diff": {"status": "ok"},
        "dashboard": {
            "ran": True,
            "status": "warning",
            "dashboard_path": str(dashboard_path),
            "overall_status": "warning",
            "total_top_opportunities": 2,
            "total_watchlist": 3,
            "warning_reason": "Dashboard HTML was generated with partial data.",
            "partial_error_count": 1,
            "summary_path": str(pipeline_dir / f"{run_id}.summary.json"),
        },
    }
    _write_json(
        pipeline_dir / f"{run_id}.summary.json",
        pipeline_payload,
    )
    _write_json(
        pipeline_dir / "latest-summary.json",
        pipeline_payload,
    )

    response = client.get("/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_status"] == "missing"
    assert payload["components_ok"] == 1
    assert payload["components_warning"] == 0
    assert payload["components_error"] == 0
    assert payload["components_missing"] == 6
    assert payload["dashboard"] == {
        "artifact_available": True,
        "dashboard_available": False,
        "status": "warning",
        "generated_at": payload["dashboard"]["generated_at"],
        "dashboard_path": str(dashboard_path),
        "overall_status": "warning",
        "total_top_opportunities": 2,
        "total_watchlist": 3,
        "warning_reason": "Dashboard HTML was generated with partial data.",
    }
    assert payload["dashboard"]["generated_at"] is not None
    assert payload["pipeline"]["health_status"] == "ok"
    assert payload["snapshots"]["health_status"] == "missing"
    assert payload["evidence"]["health_status"] == "missing"
    assert payload["scoring"]["health_status"] == "missing"
    assert payload["reports"]["health_status"] == "missing"
    assert payload["briefing"]["health_status"] == "missing"
    assert payload["diff"]["health_status"] == "missing"

    recent_non_ok = payload["recent_non_ok_components"]
    assert len(recent_non_ok) == 1
    assert recent_non_ok[0]["component"] == "dashboard"
    assert recent_non_ok[0]["health_status"] == "warning"
    assert recent_non_ok[0]["run_id"] == run_id
    assert recent_non_ok[0]["generated_at"] is not None
    assert recent_non_ok[0]["status"] == "warning"
    assert recent_non_ok[0]["partial_error_count"] == 1


def _write_stage_summary(
    path,
    *,
    stage: str,
    started_at: datetime,
    finished_at: datetime,
    status: str,
    partial_error_count: int,
) -> None:
    payload = {
        "status": status,
        "started_at": _iso(started_at),
        "finished_at": _iso(finished_at),
        "duration_seconds": max(1.0, (finished_at - started_at).total_seconds()),
        "log_dir": str(path.parent),
        "raw_output_path": str(path.parent / f"{path.stem.removesuffix('.summary')}.command-output.txt"),
        "exit_code": 0,
        "partial_error_count": partial_error_count,
        "parse_error": None,
        "command_payload": {},
    }
    if stage == "snapshots":
        payload["discovery_scope"] = "nba"
        payload["market_type"] = "winner"
        payload["command_payload"] = {
            "markets_considered": 141,
            "snapshots_created": 141,
            "snapshots_skipped": 0,
            "partial_error_count": partial_error_count,
        }
    elif stage == "evidence":
        payload["command_payload"] = {
            "markets_considered": 141,
            "markets_eligible_for_evidence": 8,
            "markets_processed": 8 if partial_error_count == 0 else 0,
            "markets_with_odds_match": 8,
            "markets_with_news_match": 7,
            "sources_created": 3,
            "sources_updated": 16,
            "evidence_created": 3,
            "evidence_updated": 16,
            "partial_error_count": partial_error_count,
        }
    else:
        payload["command_payload"] = {
            "markets_considered": 141,
            "markets_scored": 141,
            "predictions_created": 141,
            "predictions_updated": 0,
            "markets_scored_with_any_evidence": 8,
            "markets_scored_with_snapshot_fallback": 133,
            "used_odds_count": 8,
            "used_news_count": 13,
            "partial_error_count": partial_error_count,
        }
    _write_json(path, payload)


def _write_json(path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()
