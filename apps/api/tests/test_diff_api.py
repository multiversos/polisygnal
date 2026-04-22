from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import diff_artifacts


def test_get_latest_diff_returns_missing_response_when_artifact_absent(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/diff/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is False
    assert payload["comparison_ready"] is False
    assert payload["generated_at"] is None
    assert payload["current_run"] is None
    assert payload["previous_run"] is None
    assert payload["top_opportunities_entered"] == []
    assert payload["top_opportunities_exited"] == []
    assert payload["bucket_changes"] == []
    assert payload["material_score_changes"] == []
    assert payload["summary"]["comparison_ready"] is False
    assert "No diff artifact available yet" in payload["summary"]["text"]


def test_get_latest_diff_returns_baseline_response_when_only_summary_exists(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)
    diff_dir = tmp_path / "logs" / "diffs"
    diff_dir.mkdir(parents=True, exist_ok=True)

    current_snapshot_path = diff_dir / "current.snapshot.json"
    _write_snapshot(
        current_snapshot_path,
        generated_at="2026-04-21T21:00:00+00:00",
        run_id="20260421_160000",
        pipeline_summary_path="run-1.summary.json",
        total_markets=141,
        top_opportunities_count=6,
        watchlist_count=2,
    )
    _write_summary(
        diff_dir / "latest-summary.json",
        generated_at="2026-04-21T21:00:01+00:00",
        comparison_ready=False,
        summary_text="No previous diff snapshot available. Baseline snapshot created.",
        current_snapshot_path=current_snapshot_path,
    )

    response = client.get("/diff/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["comparison_ready"] is False
    assert payload["generated_at"].startswith("2026-04-21T21:00:01")
    assert payload["current_run"]["run_id"] == "20260421_160000"
    assert payload["previous_run"] is None
    assert payload["top_opportunities_entered"] == []
    assert payload["bucket_changes"] == []
    assert payload["summary"]["comparison_ready"] is False
    assert payload["summary"]["text"] == "No previous diff snapshot available. Baseline snapshot created."


def test_get_latest_diff_returns_complete_payload_when_diff_exists(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)
    diff_dir = tmp_path / "logs" / "diffs"
    diff_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        diff_dir / "latest-diff.json",
        {
            "generated_at": "2026-04-21T21:10:37+00:00",
            "thresholds": {
                "yes_probability": "0.05",
                "confidence_score": "0.1",
                "edge_magnitude": "0.05",
            },
            "current_run": {
                "generated_at": "2026-04-21T21:10:37+00:00",
                "run_id": "20260421_160938",
                "pipeline_summary_path": "run-2.summary.json",
                "total_markets": 141,
                "top_opportunities_count": 6,
                "watchlist_count": 2,
                "snapshot_path": "current.snapshot.json",
                "latest_snapshot_path": "latest-snapshot.json",
            },
            "previous_run": {
                "generated_at": "2026-04-21T21:09:31+00:00",
                "run_id": "20260421_160832",
                "pipeline_summary_path": "run-1.summary.json",
                "total_markets": 141,
                "top_opportunities_count": 6,
                "watchlist_count": 2,
                "snapshot_path": "previous.snapshot.json",
            },
            "top_opportunities_entered": [
                {
                    "market_id": 54983,
                    "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                    "priority_bucket": "priority",
                    "opportunity": True,
                    "yes_probability": "0.5692",
                    "confidence_score": "0.8000",
                    "edge_magnitude": "0.0758",
                    "previous_bucket": "watchlist",
                }
            ],
            "top_opportunities_exited": [],
            "bucket_changes": [
                {
                    "market_id": 54983,
                    "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                    "previous_bucket": "watchlist",
                    "current_bucket": "priority",
                    "previous_opportunity": False,
                    "current_opportunity": True,
                }
            ],
            "material_score_changes": [
                {
                    "market_id": 54983,
                    "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                    "previous_bucket": "watchlist",
                    "current_bucket": "priority",
                    "previous_yes_probability": "0.5000",
                    "current_yes_probability": "0.5692",
                    "delta_yes_probability": "0.0692",
                    "previous_confidence_score": "0.7000",
                    "current_confidence_score": "0.8000",
                    "delta_confidence_score": "0.1000",
                    "previous_edge_magnitude": "0.0100",
                    "current_edge_magnitude": "0.0758",
                    "delta_edge_magnitude": "0.0658",
                    "max_delta": "0.1000",
                }
            ],
            "summary": {
                "comparison_ready": True,
                "top_opportunities_entered_count": 1,
                "top_opportunities_exited_count": 0,
                "bucket_changes_count": 1,
                "material_score_changes_count": 1,
                "text": "1 markets entered top opportunities, 0 exited, 1 changed bucket, 1 had material score changes.",
            },
        },
    )

    response = client.get("/diff/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["comparison_ready"] is True
    assert payload["current_run"]["run_id"] == "20260421_160938"
    assert payload["previous_run"]["run_id"] == "20260421_160832"
    assert payload["top_opportunities_entered"][0]["market_id"] == 54983
    assert payload["bucket_changes"][0]["current_bucket"] == "priority"
    assert payload["material_score_changes"][0]["delta_yes_probability"] == "0.0692"
    assert payload["summary"]["text"].startswith("1 markets entered top opportunities")


def test_get_diff_runs_returns_empty_list_when_no_runs_exist(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/diff/runs")

    assert response.status_code == 200
    assert response.json() == {
        "total_count": 0,
        "limit": 10,
        "items": [],
    }


def test_get_diff_runs_returns_recent_runs_sorted_desc_and_limited(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)
    diff_dir = tmp_path / "logs" / "diffs"
    diff_dir.mkdir(parents=True, exist_ok=True)

    older_snapshot_path = diff_dir / "20260421_210827.snapshot.json"
    newer_snapshot_path = diff_dir / "20260421_210931.snapshot.json"
    _write_snapshot(
        older_snapshot_path,
        generated_at="2026-04-21T21:08:27+00:00",
        run_id="20260421_160832",
        pipeline_summary_path="run-1.summary.json",
        total_markets=141,
        top_opportunities_count=5,
        watchlist_count=3,
    )
    _write_snapshot(
        newer_snapshot_path,
        generated_at="2026-04-21T21:09:31+00:00",
        run_id="20260421_160938",
        pipeline_summary_path="run-2.summary.json",
        total_markets=141,
        top_opportunities_count=6,
        watchlist_count=2,
    )
    _write_summary(
        diff_dir / "20260421_160827.summary.json",
        generated_at="2026-04-21T21:08:28+00:00",
        comparison_ready=False,
        summary_text="No previous diff snapshot available. Baseline snapshot created.",
        current_snapshot_path=older_snapshot_path,
        status="ok",
    )
    _write_summary(
        diff_dir / "20260421_160930.summary.json",
        generated_at="2026-04-21T21:09:32+00:00",
        comparison_ready=True,
        summary_text="0 markets entered top opportunities, 0 exited, 0 changed bucket, 0 had material score changes.",
        current_snapshot_path=newer_snapshot_path,
        previous_snapshot_path=older_snapshot_path,
        json_output_path=diff_dir / "20260421_210931.diff.json",
        text_output_path=diff_dir / "20260421_210931.diff.txt",
        status="ok",
    )

    response = client.get("/diff/runs?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 2
    assert payload["limit"] == 2
    assert [item["run_id"] for item in payload["items"]] == [
        "20260421_160930",
        "20260421_160827",
    ]
    assert payload["items"][0]["comparison_ready"] is True
    assert payload["items"][0]["current_run_id"] == "20260421_160938"
    assert payload["items"][0]["previous_run_id"] == "20260421_160832"
    assert payload["items"][0]["json_path"] == str(diff_dir / "20260421_210931.diff.json")
    assert payload["items"][1]["comparison_ready"] is False
    assert payload["items"][1]["current_run_id"] == "20260421_160832"


def test_get_diff_run_returns_baseline_payload_when_only_summary_exists(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)
    diff_dir = tmp_path / "logs" / "diffs"
    diff_dir.mkdir(parents=True, exist_ok=True)

    current_snapshot_path = diff_dir / "20260421_210827.snapshot.json"
    _write_snapshot(
        current_snapshot_path,
        generated_at="2026-04-21T21:08:27+00:00",
        run_id="20260421_160832",
        pipeline_summary_path="run-1.summary.json",
        total_markets=141,
        top_opportunities_count=5,
        watchlist_count=3,
    )
    _write_summary(
        diff_dir / "20260421_160827.summary.json",
        generated_at="2026-04-21T21:08:28+00:00",
        comparison_ready=False,
        summary_text="No previous diff snapshot available. Baseline snapshot created.",
        current_snapshot_path=current_snapshot_path,
        status="ok",
    )

    response = client.get("/diff/20260421_160827")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "20260421_160827"
    assert payload["artifact_available"] is True
    assert payload["comparison_ready"] is False
    assert payload["current_run"]["run_id"] == "20260421_160832"
    assert payload["previous_run"] is None
    assert payload["json_path"] is None
    assert payload["summary_path"].endswith("20260421_160827.summary.json")
    assert payload["summary"]["text"] == "No previous diff snapshot available. Baseline snapshot created."


def test_get_diff_run_returns_complete_payload_when_diff_exists(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)
    diff_dir = tmp_path / "logs" / "diffs"
    diff_dir.mkdir(parents=True, exist_ok=True)

    current_snapshot_path = diff_dir / "20260421_211037.snapshot.json"
    previous_snapshot_path = diff_dir / "20260421_210931.snapshot.json"
    _write_snapshot(
        current_snapshot_path,
        generated_at="2026-04-21T21:10:37+00:00",
        run_id="20260421_160938",
        pipeline_summary_path="run-2.summary.json",
        total_markets=141,
        top_opportunities_count=6,
        watchlist_count=2,
    )
    _write_snapshot(
        previous_snapshot_path,
        generated_at="2026-04-21T21:09:31+00:00",
        run_id="20260421_160832",
        pipeline_summary_path="run-1.summary.json",
        total_markets=141,
        top_opportunities_count=5,
        watchlist_count=3,
    )
    _write_summary(
        diff_dir / "20260421_161036.summary.json",
        generated_at="2026-04-21T21:10:37.572258+00:00",
        comparison_ready=True,
        summary_text="0 markets entered top opportunities, 0 exited, 0 changed bucket, 0 had material score changes.",
        current_snapshot_path=current_snapshot_path,
        previous_snapshot_path=previous_snapshot_path,
        json_output_path=diff_dir / "20260421_211037.diff.json",
        text_output_path=diff_dir / "20260421_211037.diff.txt",
        status="ok",
    )
    _write_json(
        diff_dir / "20260421_211037.diff.json",
        {
            "generated_at": "2026-04-21T21:10:37.572258+00:00",
            "current_run": {
                "generated_at": "2026-04-21T21:10:37.572258+00:00",
                "run_id": "20260421_160938",
                "pipeline_summary_path": "run-2.summary.json",
                "total_markets": 141,
                "top_opportunities_count": 6,
                "watchlist_count": 2,
                "snapshot_path": str(current_snapshot_path),
                "latest_snapshot_path": str(diff_dir / "latest-snapshot.json"),
            },
            "previous_run": {
                "generated_at": "2026-04-21T21:09:31+00:00",
                "run_id": "20260421_160832",
                "pipeline_summary_path": "run-1.summary.json",
                "total_markets": 141,
                "top_opportunities_count": 5,
                "watchlist_count": 3,
                "snapshot_path": str(previous_snapshot_path),
            },
            "top_opportunities_entered": [
                {
                    "market_id": 54983,
                    "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                    "priority_bucket": "priority",
                    "opportunity": True,
                    "yes_probability": "0.5712",
                    "confidence_score": "0.8000",
                    "edge_magnitude": "0.0788",
                    "previous_bucket": "watchlist",
                }
            ],
            "top_opportunities_exited": [],
            "bucket_changes": [],
            "material_score_changes": [],
            "summary": {
                "comparison_ready": True,
                "top_opportunities_entered_count": 1,
                "top_opportunities_exited_count": 0,
                "bucket_changes_count": 0,
                "material_score_changes_count": 0,
                "text": "1 markets entered top opportunities, 0 exited, 0 changed bucket, 0 had material score changes.",
            },
        },
    )

    response = client.get("/diff/20260421_161036")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "20260421_161036"
    assert payload["artifact_available"] is True
    assert payload["comparison_ready"] is True
    assert payload["current_run"]["run_id"] == "20260421_160938"
    assert payload["previous_run"]["run_id"] == "20260421_160832"
    assert payload["top_opportunities_entered"][0]["market_id"] == 54983
    assert payload["summary"]["top_opportunities_entered_count"] == 1
    assert payload["summary_path"].endswith("20260421_161036.summary.json")
    assert payload["json_path"] == str(diff_dir / "20260421_211037.diff.json")
    assert payload["txt_path"] == str(diff_dir / "20260421_211037.diff.txt")


def test_get_diff_run_returns_404_for_unknown_run(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(diff_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/diff/20260421_999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Diff run 20260421_999999 no encontrado."}


def _write_snapshot(
    path,
    *,
    generated_at: str,
    run_id: str,
    pipeline_summary_path: str,
    total_markets: int,
    top_opportunities_count: int,
    watchlist_count: int,
) -> None:
    _write_json(
        path,
        {
            "generated_at": generated_at,
            "run": {
                "run_id": run_id,
                "pipeline_summary_path": pipeline_summary_path,
            },
            "total_markets": total_markets,
            "top_opportunities_count": top_opportunities_count,
            "watchlist_count": watchlist_count,
        },
    )


def _write_summary(
    path,
    *,
    generated_at: str,
    comparison_ready: bool,
    summary_text: str,
    current_snapshot_path,
    previous_snapshot_path=None,
    json_output_path=None,
    text_output_path=None,
    status: str = "ok",
) -> None:
    _write_json(
        path,
        {
            "status": status,
            "generated_at": generated_at,
            "comparison_ready": comparison_ready,
            "summary_text": summary_text,
            "current_snapshot_path": str(current_snapshot_path),
            "latest_snapshot_path": str(current_snapshot_path),
            "previous_snapshot_path": (
                str(previous_snapshot_path) if previous_snapshot_path is not None else None
            ),
            "json_output_path": str(json_output_path) if json_output_path is not None else None,
            "text_output_path": str(text_output_path) if text_output_path is not None else None,
            "top_opportunities_entered_count": 1 if comparison_ready else 0,
            "top_opportunities_exited_count": 0,
            "bucket_changes_count": 0,
            "material_score_changes_count": 0,
        },
    )


def _write_json(path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
