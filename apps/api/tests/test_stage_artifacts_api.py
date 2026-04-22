from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.services import stage_artifacts


STAGE_CASES = (
    {
        "stage": "snapshots",
        "latest_path": "/snapshots/latest",
        "runs_path": "/snapshots/runs",
        "detail_path": "/snapshots/{run_id}",
        "log_subdir": "snapshots",
        "missing_message": "No snapshot artifact available yet",
        "not_found_detail": "Snapshots run {run_id} no encontrado.",
    },
    {
        "stage": "evidence",
        "latest_path": "/evidence/latest-run",
        "runs_path": "/evidence/runs",
        "detail_path": "/evidence/{run_id}",
        "log_subdir": "evidence",
        "missing_message": "No evidence artifact available yet",
        "not_found_detail": "Evidence run {run_id} no encontrado.",
    },
    {
        "stage": "scoring",
        "latest_path": "/scoring/latest",
        "runs_path": "/scoring/runs",
        "detail_path": "/scoring/{run_id}",
        "log_subdir": "scoring",
        "missing_message": "No scoring artifact available yet",
        "not_found_detail": "Scoring run {run_id} no encontrado.",
    },
)


@pytest.mark.parametrize("case", STAGE_CASES, ids=lambda case: case["stage"])
def test_get_latest_stage_returns_missing_response_when_artifact_absent(
    client: TestClient,
    tmp_path,
    monkeypatch,
    case,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)

    response = client.get(case["latest_path"])

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is False
    assert payload["stage"] == case["stage"]
    assert payload["run_id"] is None
    assert payload["metrics"] == {}
    assert case["missing_message"] in payload["message"]


@pytest.mark.parametrize("case", STAGE_CASES, ids=lambda case: case["stage"])
def test_get_stage_runs_returns_empty_list_when_no_runs_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
    case,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)

    response = client.get(case["runs_path"])

    assert response.status_code == 200
    assert response.json() == {
        "stage": case["stage"],
        "total_count": 0,
        "limit": 10,
        "items": [],
    }


@pytest.mark.parametrize("case", STAGE_CASES, ids=lambda case: case["stage"])
def test_get_stage_runs_returns_ordered_compact_items(
    client: TestClient,
    tmp_path,
    monkeypatch,
    case,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)
    stage_dir = _ensure_stage_dir(tmp_path, case["log_subdir"])

    _write_stage_summary(stage_dir / "20260421_160832.summary.json", stage=case["stage"], newer=False)
    _write_stage_summary(stage_dir / "20260421_160938.summary.json", stage=case["stage"], newer=True)

    response = client.get(f"{case['runs_path']}?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["stage"] == case["stage"]
    assert payload["total_count"] == 2
    assert [item["run_id"] for item in payload["items"]] == [
        "20260421_160938",
        "20260421_160832",
    ]
    assert payload["items"][0]["summary_path"].endswith("20260421_160938.summary.json")
    assert payload["items"][0]["status"] == "ok"
    assert payload["items"][0]["partial_error_count"] == 0
    assert payload["items"][0]["metrics"]


def test_get_latest_and_detail_stage_artifacts_return_compact_payloads(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)

    snapshots_dir = _ensure_stage_dir(tmp_path, "snapshots")
    evidence_dir = _ensure_stage_dir(tmp_path, "evidence")
    scoring_dir = _ensure_stage_dir(tmp_path, "scoring")

    snapshots_payload = _write_stage_summary(
        snapshots_dir / "20260421_160938.summary.json",
        stage="snapshots",
        newer=True,
    )
    evidence_payload = _write_stage_summary(
        evidence_dir / "20260421_161017.summary.json",
        stage="evidence",
        newer=True,
    )
    scoring_payload = _write_stage_summary(
        scoring_dir / "20260421_161020.summary.json",
        stage="scoring",
        newer=True,
    )

    _write_json(snapshots_dir / "latest-summary.json", snapshots_payload)
    _write_json(evidence_dir / "latest-summary.json", evidence_payload)
    _write_json(scoring_dir / "latest-summary.json", scoring_payload)

    snapshots_latest = client.get("/snapshots/latest")
    evidence_detail = client.get("/evidence/20260421_161017")
    scoring_detail = client.get("/scoring/20260421_161020")

    assert snapshots_latest.status_code == 200
    snapshots_body = snapshots_latest.json()
    assert snapshots_body["artifact_available"] is True
    assert snapshots_body["run_id"] == "20260421_160938"
    assert snapshots_body["summary_path"].endswith("latest-summary.json")
    assert snapshots_body["metrics"] == {
        "markets_considered": 141,
        "snapshots_created": 141,
        "snapshots_skipped": 0,
        "partial_error_count": 0,
    }
    assert snapshots_body["metadata"] == {
        "discovery_scope": "nba",
        "market_type": "winner",
        "exit_code": 0,
    }

    assert evidence_detail.status_code == 200
    evidence_body = evidence_detail.json()
    assert evidence_body["artifact_available"] is True
    assert evidence_body["stage"] == "evidence"
    assert evidence_body["run_id"] == "20260421_161017"
    assert evidence_body["metrics"]["markets_eligible_for_evidence"] == 8
    assert evidence_body["metrics"]["markets_with_news_match"] == 5
    assert "skipped_markets" not in evidence_body["metrics"]
    assert evidence_body["metadata"] == {"exit_code": 0}

    assert scoring_detail.status_code == 200
    scoring_body = scoring_detail.json()
    assert scoring_body["artifact_available"] is True
    assert scoring_body["stage"] == "scoring"
    assert scoring_body["run_id"] == "20260421_161020"
    assert scoring_body["metrics"]["markets_scored"] == 141
    assert scoring_body["metrics"]["markets_scored_with_snapshot_fallback"] == 133
    assert scoring_body["metrics"]["used_odds_count"] == 8


def test_get_evidence_run_returns_partial_payload_when_summary_is_incomplete(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)
    evidence_dir = _ensure_stage_dir(tmp_path, "evidence")

    _write_json(
        evidence_dir / "20260421_112220.summary.json",
        {
            "status": "warning",
            "started_at": "2026-04-21T11:22:59-05:00",
            "duration_seconds": 3.0,
            "log_dir": str(evidence_dir),
            "parse_error": "partial payload",
            "command_payload": {
                "markets_considered": 141,
                "markets_eligible_for_evidence": 8,
                "markets_processed": 0,
                "markets_skipped_non_matchable": 47,
                "markets_skipped_unsupported_shape": 86,
                "partial_error_count": 101,
                "skipped_markets": [{"market_id": 155}],
            },
        },
    )

    response = client.get("/evidence/20260421_112220")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_112220"
    assert payload["status"] == "warning"
    assert payload["partial_error_count"] == 101
    assert payload["generated_at"] == "2026-04-21T11:22:59-05:00"
    assert payload["raw_output_path"] is None
    assert payload["metrics"]["markets_processed"] == 0
    assert payload["metadata"]["parse_error"] == "partial payload"
    assert "skipped_markets" not in payload["metrics"]


@pytest.mark.parametrize("case", STAGE_CASES, ids=lambda case: case["stage"])
def test_get_stage_run_returns_404_for_unknown_run(
    client: TestClient,
    tmp_path,
    monkeypatch,
    case,
) -> None:
    monkeypatch.setattr(stage_artifacts, "REPO_ROOT", tmp_path)
    run_id = "20260421_999999"

    response = client.get(case["detail_path"].format(run_id=run_id))

    assert response.status_code == 404
    assert response.json() == {"detail": case["not_found_detail"].format(run_id=run_id)}


def _ensure_stage_dir(tmp_path, log_subdir: str):
    stage_dir = tmp_path / "logs" / "market_pipeline" / log_subdir
    stage_dir.mkdir(parents=True, exist_ok=True)
    return stage_dir


def _write_stage_summary(path, *, stage: str, newer: bool) -> dict[str, object]:
    if stage == "snapshots":
        payload = {
            "status": "ok",
            "started_at": "2026-04-21T16:09:38-05:00" if newer else "2026-04-21T16:08:33-05:00",
            "finished_at": "2026-04-21T16:10:17-05:00" if newer else "2026-04-21T16:09:12-05:00",
            "duration_seconds": 38.451 if newer else 38.886,
            "log_dir": str(path.parent),
            "raw_output_path": str(path.parent / f"{path.stem.removesuffix('.summary')}.command-output.txt"),
            "discovery_scope": "nba",
            "market_type": "winner",
            "exit_code": 0,
            "command_payload": {
                "markets_considered": 141,
                "snapshots_created": 141,
                "snapshots_skipped": 0,
                "partial_error_count": 0,
            },
        }
    elif stage == "evidence":
        payload = {
            "status": "ok",
            "started_at": "2026-04-21T16:10:17-05:00" if newer else "2026-04-21T16:09:12-05:00",
            "finished_at": "2026-04-21T16:10:20-05:00" if newer else "2026-04-21T16:09:14-05:00",
            "duration_seconds": 2.066 if newer else 2.168,
            "log_dir": str(path.parent),
            "raw_output_path": str(path.parent / f"{path.stem.removesuffix('.summary')}.command-output.txt"),
            "exit_code": 0,
            "command_payload": {
                "markets_considered": 141,
                "markets_eligible_for_evidence": 8,
                "markets_processed": 8,
                "markets_matchup_shape": 8,
                "markets_futures_shape": 47,
                "markets_ambiguous_shape": 86,
                "markets_skipped_non_matchable": 47,
                "markets_skipped_unsupported_shape": 86,
                "sources_created": 0,
                "sources_updated": 16,
                "evidence_created": 0,
                "evidence_updated": 16,
                "markets_with_odds_match": 8,
                "markets_with_news_match": 5,
                "odds_matches": 8,
                "odds_missing_api_key": 0,
                "odds_no_match": 0,
                "news_items_matched": 8,
                "partial_error_count": 0,
                "skipped_markets": [{"market_id": 155}],
            },
        }
    else:
        payload = {
            "status": "ok",
            "started_at": "2026-04-21T16:10:20-05:00" if newer else "2026-04-21T16:09:15-05:00",
            "finished_at": "2026-04-21T16:10:22-05:00" if newer else "2026-04-21T16:09:16-05:00",
            "duration_seconds": 1.578 if newer else 1.366,
            "log_dir": str(path.parent),
            "raw_output_path": str(path.parent / f"{path.stem.removesuffix('.summary')}.command-output.txt"),
            "exit_code": 0,
            "command_payload": {
                "markets_considered": 141,
                "markets_scored": 141,
                "predictions_created": 141,
                "predictions_updated": 0,
                "markets_scored_with_any_evidence": 8,
                "markets_scored_with_odds_evidence": 8,
                "markets_scored_with_news_evidence": 5,
                "markets_scored_with_snapshot_fallback": 133,
                "used_odds_count": 8,
                "used_news_count": 9,
                "partial_error_count": 0,
            },
        }

    _write_json(path, payload)
    return payload


def _write_json(path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
