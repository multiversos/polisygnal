from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import pipeline_artifacts


def test_get_latest_pipeline_returns_missing_response_when_artifact_absent(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/pipeline/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is False
    assert payload["run_id"] is None
    assert payload["pipeline"] is None
    assert payload["reports"] is None
    assert payload["dashboard"] is None
    assert "No pipeline artifact available yet" in payload["message"]


def test_get_pipeline_runs_returns_empty_list_when_no_runs_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/pipeline/runs")

    assert response.status_code == 200
    assert response.json() == {
        "total_count": 0,
        "limit": 10,
        "items": [],
    }


def test_get_pipeline_runs_returns_ordered_runs_with_component_statuses(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)
    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    pipeline_dir.mkdir(parents=True, exist_ok=True)

    _write_legacy_warning_pipeline_summary(pipeline_dir / "20260421_112220.summary.json")
    _write_full_pipeline_summary(pipeline_dir / "20260421_160938.summary.json")

    response = client.get("/pipeline/runs?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 2
    assert [item["run_id"] for item in payload["items"]] == [
        "20260421_160938",
        "20260421_112220",
    ]
    assert payload["items"][0]["component_statuses"] == {
        "snapshots": "ok",
        "evidence": "ok",
        "scoring": "ok",
        "reports": "ok",
        "briefing": "ok",
        "diff": "ok",
        "dashboard": "ok",
    }
    assert payload["items"][0]["dashboard"] == {
        "ran": True,
        "status": "ok",
        "skip_reason": None,
        "log_dir": "N:\\projects\\polimarket\\logs\\dashboard",
        "summary_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-summary.json",
        "partial_error_count": 0,
        "dashboard_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-dashboard.html",
        "overall_status": "ok",
        "total_top_opportunities": 5,
        "total_watchlist": 2,
        "warning_reason": None,
    }
    assert payload["items"][1]["status"] == "warning"
    assert payload["items"][1]["partial_error_count"] == 101
    assert payload["items"][1]["component_statuses"]["reports"] is None
    assert payload["items"][1]["component_statuses"]["dashboard"] is None
    assert payload["items"][1]["dashboard"] is None


def test_get_latest_pipeline_returns_compact_payload_for_complete_summary(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)
    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    pipeline_dir.mkdir(parents=True, exist_ok=True)

    full_payload = _write_full_pipeline_summary(pipeline_dir / "20260421_160938.summary.json")
    _write_json(pipeline_dir / "latest-summary.json", full_payload)

    response = client.get("/pipeline/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_160938"
    assert payload["status"] == "ok"
    assert payload["pipeline"]["wrapper_run_id"] == "20260421_160938"
    assert payload["pipeline"]["steps"]["snapshots"]["metrics"] == {
        "markets_considered": 141,
        "snapshots_created": 141,
        "snapshots_skipped": 0,
        "partial_error_count": 0,
    }
    assert "skipped_markets" not in payload["pipeline"]["steps"]["evidence"]["metrics"]
    assert payload["reports"]["metadata"]["generated_presets"][0]["preset"] == "top_opportunities"
    assert payload["briefing"]["metadata"]["top_opportunities_count"] == 5
    assert payload["diff"]["metadata"]["comparison_ready"] is True
    assert payload["dashboard"] == {
        "ran": True,
        "status": "ok",
        "skip_reason": None,
        "log_dir": "N:\\projects\\polimarket\\logs\\dashboard",
        "summary_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-summary.json",
        "partial_error_count": 0,
        "dashboard_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-dashboard.html",
        "overall_status": "ok",
        "total_top_opportunities": 5,
        "total_watchlist": 2,
        "warning_reason": None,
    }


def test_get_pipeline_run_returns_partial_payload_for_legacy_warning_summary(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)
    pipeline_dir = tmp_path / "logs" / "market_pipeline"
    pipeline_dir.mkdir(parents=True, exist_ok=True)

    _write_legacy_warning_pipeline_summary(pipeline_dir / "20260421_112220.summary.json")

    response = client.get("/pipeline/20260421_112220")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_112220"
    assert payload["status"] == "warning"
    assert payload["partial_error_count"] == 101
    assert payload["pipeline"]["status"] == "warning"
    assert payload["pipeline"]["wrapper_run_id"] == "20260421_112220"
    assert payload["reports"] is None
    assert payload["briefing"] is None
    assert payload["diff"] is None
    assert payload["dashboard"] is None
    assert payload["component_statuses"]["snapshots"] == "ok"
    assert payload["component_statuses"]["dashboard"] is None


def test_get_pipeline_run_returns_404_for_unknown_run(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(pipeline_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/pipeline/20260421_999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Pipeline run 20260421_999999 no encontrado."}


def _write_full_pipeline_summary(path):
    payload = {
        "status": "ok",
        "started_at": "2026-04-21T16:09:38-05:00",
        "finished_at": "2026-04-21T16:10:38-05:00",
        "duration_seconds": 59.779,
        "repo_root": "N:\\projects\\polimarket",
        "api_dir": "N:\\projects\\polimarket\\apps\\api",
        "python_path": "N:\\projects\\polimarket\\apps\\api\\.venv\\Scripts\\python.exe",
        "log_dir": "N:\\projects\\polimarket\\logs\\market_pipeline",
        "limit": None,
        "frequency_recommendation_minutes": 120,
        "subset": {
            "discovery_scope": "nba",
            "market_type": "winner",
            "active_only": True,
            "closed_only": False,
        },
        "partial_error_count": 0,
        "logs": {
            "master_summary_path": str(path),
            "reports_summary_path": "N:\\projects\\polimarket\\logs\\reports\\latest-summary.json",
            "briefing_summary_path": "N:\\projects\\polimarket\\logs\\briefings\\latest-summary.json",
            "diff_summary_path": "N:\\projects\\polimarket\\logs\\diffs\\latest-summary.json",
        },
        "pipeline": {
            "status": "ok",
            "log_dir": "N:\\projects\\polimarket\\logs\\market_pipeline",
            "summary_path": str(path),
            "wrapper_run_id": "20260421_160938",
            "steps": {
                "snapshots": {
                    "name": "snapshots",
                    "status": "ok",
                    "started_at": "2026-04-21T16:09:38-05:00",
                    "finished_at": "2026-04-21T16:10:17-05:00",
                    "duration_seconds": 38.9,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\snapshots\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.snapshots.wrapper-output.txt",
                    "partial_error_count": 0,
                },
                "evidence": {
                    "name": "evidence",
                    "status": "ok",
                    "started_at": "2026-04-21T16:10:17-05:00",
                    "finished_at": "2026-04-21T16:10:20-05:00",
                    "duration_seconds": 2.4,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\evidence\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.evidence.wrapper-output.txt",
                    "partial_error_count": 0,
                },
                "scoring": {
                    "name": "scoring",
                    "status": "ok",
                    "started_at": "2026-04-21T16:10:20-05:00",
                    "finished_at": "2026-04-21T16:10:22-05:00",
                    "duration_seconds": 1.9,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\scoring\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.scoring.wrapper-output.txt",
                    "partial_error_count": 0,
                },
            },
            "operational_summary": {
                "evidence": {
                    "markets_eligible_for_evidence": 8,
                    "markets_skipped_non_matchable": 47,
                },
                "scoring": {
                    "markets_scored_with_snapshot_fallback": 133,
                    "used_odds_count": 8,
                },
            },
        },
        "reports": {
            "ran": True,
            "status": "ok",
            "skip_reason": None,
            "log_dir": "N:\\projects\\polimarket\\logs\\reports",
            "summary_path": "N:\\projects\\polimarket\\logs\\reports\\latest-summary.json",
            "partial_error_count": 0,
            "presets": ["top_opportunities", "watchlist"],
            "formats": ["json", "csv"],
            "generated_presets": [
                {
                    "preset": "top_opportunities",
                    "status": "ok",
                    "item_count": 6,
                    "items_exported": 6,
                }
            ],
        },
        "briefing": {
            "ran": True,
            "status": "ok",
            "skip_reason": None,
            "log_dir": "N:\\projects\\polimarket\\logs\\briefings",
            "summary_path": "N:\\projects\\polimarket\\logs\\briefings\\latest-summary.json",
            "partial_error_count": 0,
            "generated_at": "2026-04-21T21:10:36.228550+00:00",
            "json_path": "N:\\projects\\polimarket\\logs\\briefings\\latest-briefing.json",
            "json_size_bytes": 6327,
            "txt_path": "N:\\projects\\polimarket\\logs\\briefings\\latest-briefing.txt",
            "txt_size_bytes": 1923,
            "top_opportunities_count": 5,
            "watchlist_count": 2,
            "review_flags_count": 0,
        },
        "diff": {
            "ran": True,
            "status": "ok",
            "skip_reason": None,
            "log_dir": "N:\\projects\\polimarket\\logs\\diffs",
            "summary_path": "N:\\projects\\polimarket\\logs\\diffs\\latest-summary.json",
            "partial_error_count": 0,
            "generated_at": "2026-04-21T21:10:37.572258+00:00",
            "comparison_ready": True,
            "json_path": "N:\\projects\\polimarket\\logs\\diffs\\latest-diff.json",
            "json_size_bytes": 1539,
            "txt_path": "N:\\projects\\polimarket\\logs\\diffs\\latest-diff.txt",
            "txt_size_bytes": 687,
            "top_opportunities_entered_count": 0,
            "top_opportunities_exited_count": 0,
            "bucket_changes_count": 0,
            "material_score_changes_count": 0,
        },
        "dashboard": {
            "ran": True,
            "status": "ok",
            "skip_reason": None,
            "log_dir": "N:\\projects\\polimarket\\logs\\dashboard",
            "summary_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-summary.json",
            "partial_error_count": 0,
            "generated_at": "2026-04-21T21:10:38.228550+00:00",
            "dashboard_path": "N:\\projects\\polimarket\\logs\\dashboard\\latest-dashboard.html",
            "html_size_bytes": 3136,
            "overall_status": "ok",
            "total_top_opportunities": 5,
            "total_watchlist": 2,
            "warning_reason": None,
        },
        "operational_summary": {
            "evidence": {
                "markets_eligible_for_evidence": 8,
                "markets_skipped_non_matchable": 47,
            },
            "scoring": {
                "markets_scored_with_snapshot_fallback": 133,
                "used_odds_count": 8,
            },
        },
        "steps": {
            "snapshots": {
                "name": "snapshots",
                "status": "ok",
                "started_at": "2026-04-21T16:09:38-05:00",
                "finished_at": "2026-04-21T16:10:17-05:00",
                "duration_seconds": 38.9,
                "exit_code": 0,
                "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\snapshots\\latest-summary.json",
                "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.snapshots.wrapper-output.txt",
                "partial_error_count": 0,
                "summary": {
                    "command_payload": {
                        "markets_considered": 141,
                        "snapshots_created": 141,
                        "snapshots_skipped": 0,
                        "partial_error_count": 0,
                    }
                },
            },
            "evidence": {
                "name": "evidence",
                "status": "ok",
                "started_at": "2026-04-21T16:10:17-05:00",
                "finished_at": "2026-04-21T16:10:20-05:00",
                "duration_seconds": 2.4,
                "exit_code": 0,
                "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\evidence\\latest-summary.json",
                "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.evidence.wrapper-output.txt",
                "partial_error_count": 0,
                "summary": {
                    "command_payload": {
                        "markets_considered": 141,
                        "markets_eligible_for_evidence": 8,
                        "markets_processed": 8,
                        "markets_skipped_non_matchable": 47,
                        "markets_skipped_unsupported_shape": 86,
                        "markets_with_odds_match": 8,
                        "markets_with_news_match": 5,
                        "sources_created": 0,
                        "sources_updated": 16,
                        "evidence_created": 0,
                        "evidence_updated": 16,
                        "partial_error_count": 0,
                        "skipped_markets": [{"market_id": 133}],
                    }
                },
            },
            "scoring": {
                "name": "scoring",
                "status": "ok",
                "started_at": "2026-04-21T16:10:20-05:00",
                "finished_at": "2026-04-21T16:10:22-05:00",
                "duration_seconds": 1.9,
                "exit_code": 0,
                "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\scoring\\latest-summary.json",
                "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_160938.scoring.wrapper-output.txt",
                "partial_error_count": 0,
                "summary": {
                    "command_payload": {
                        "markets_considered": 141,
                        "markets_scored": 141,
                        "predictions_created": 141,
                        "predictions_updated": 0,
                        "markets_scored_with_any_evidence": 8,
                        "markets_scored_with_snapshot_fallback": 133,
                        "used_odds_count": 8,
                        "used_news_count": 9,
                        "partial_error_count": 0,
                    }
                },
            },
        },
    }
    _write_json(path, payload)
    return payload


def _write_legacy_warning_pipeline_summary(path) -> None:
    _write_json(
        path,
        {
            "status": "warning",
            "started_at": "2026-04-21T11:22:20-05:00",
            "finished_at": "2026-04-21T11:23:04-05:00",
            "duration_seconds": 44.0,
            "repo_root": "N:\\projects\\polimarket",
            "api_dir": "N:\\projects\\polimarket\\apps\\api",
            "python_path": "N:\\projects\\polimarket\\apps\\api\\.venv\\Scripts\\python.exe",
            "log_dir": "N:\\projects\\polimarket\\logs\\market_pipeline",
            "limit": None,
            "frequency_recommendation_minutes": 120,
            "subset": {
                "discovery_scope": "nba",
                "market_type": "winner",
                "active_only": True,
                "closed_only": False,
            },
            "partial_error_count": 101,
            "steps": {
                "snapshots": {
                    "name": "snapshots",
                    "status": "ok",
                    "started_at": "2026-04-21T11:22:20-05:00",
                    "finished_at": "2026-04-21T11:22:59-05:00",
                    "duration_seconds": 39.0,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\snapshots\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_112220.snapshots.wrapper-output.txt",
                    "partial_error_count": 0,
                    "summary": {
                        "command_payload": {
                            "markets_considered": 141,
                            "snapshots_created": 141,
                            "snapshots_skipped": 0,
                            "partial_error_count": 0,
                        }
                    },
                },
                "evidence": {
                    "name": "evidence",
                    "status": "warning",
                    "started_at": "2026-04-21T11:22:59-05:00",
                    "finished_at": "2026-04-21T11:23:02-05:00",
                    "duration_seconds": 3.0,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\evidence\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_112220.evidence.wrapper-output.txt",
                    "partial_error_count": 101,
                    "summary": {
                        "command_payload": {
                            "markets_considered": 141,
                            "markets_eligible_for_evidence": 8,
                            "markets_processed": 0,
                            "markets_skipped_non_matchable": 47,
                            "markets_skipped_unsupported_shape": 86,
                            "markets_with_odds_match": 0,
                            "markets_with_news_match": 0,
                            "sources_created": 0,
                            "sources_updated": 0,
                            "evidence_created": 0,
                            "evidence_updated": 0,
                            "partial_error_count": 101,
                        }
                    },
                },
                "scoring": {
                    "name": "scoring",
                    "status": "ok",
                    "started_at": "2026-04-21T11:23:02-05:00",
                    "finished_at": "2026-04-21T11:23:04-05:00",
                    "duration_seconds": 2.0,
                    "exit_code": 0,
                    "summary_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\scoring\\latest-summary.json",
                    "wrapper_output_path": "N:\\projects\\polimarket\\logs\\market_pipeline\\20260421_112220.scoring.wrapper-output.txt",
                    "partial_error_count": 0,
                    "summary": {
                        "command_payload": {
                            "markets_considered": 141,
                            "markets_scored": 141,
                            "predictions_created": 141,
                            "predictions_updated": 0,
                            "markets_scored_with_any_evidence": 0,
                            "markets_scored_with_snapshot_fallback": 141,
                            "used_odds_count": 0,
                            "used_news_count": 0,
                            "partial_error_count": 0,
                        }
                    },
                },
            },
        },
    )


def _write_json(path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
