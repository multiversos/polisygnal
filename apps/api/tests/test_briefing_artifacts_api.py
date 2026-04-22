from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import briefing_artifacts


def test_get_latest_briefing_returns_missing_response_when_artifact_absent(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(briefing_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/briefing/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is False
    assert payload["run_id"] is None
    assert payload["briefing"] is None
    assert "No briefing artifact available yet" in payload["message"]


def test_get_briefing_runs_returns_ordered_runs(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(briefing_artifacts, "REPO_ROOT", tmp_path)
    briefing_dir = tmp_path / "logs" / "briefings"
    briefing_dir.mkdir(parents=True, exist_ok=True)

    _write_summary(
        briefing_dir / "20260421_160928.summary.json",
        generated_at="2026-04-21T21:09:30+00:00",
        summary_text="6 top opportunities, 2 watchlist, 0 review flags.",
        top_opportunities_count=5,
        watchlist_count=2,
        review_flags_count=0,
        total_markets=141,
        json_output_path=briefing_dir / "20260421_210930.briefing.json",
        text_output_path=briefing_dir / "20260421_210930.briefing.txt",
    )
    _write_summary(
        briefing_dir / "20260421_161034.summary.json",
        generated_at="2026-04-21T21:10:36+00:00",
        summary_text="6 top opportunities, 2 watchlist, 0 review flags.",
        top_opportunities_count=5,
        watchlist_count=2,
        review_flags_count=0,
        total_markets=141,
        json_output_path=briefing_dir / "20260421_211036.briefing.json",
        text_output_path=briefing_dir / "20260421_211036.briefing.txt",
    )

    response = client.get("/briefing/runs?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 2
    assert payload["limit"] == 2
    assert [item["run_id"] for item in payload["items"]] == [
        "20260421_161034",
        "20260421_160928",
    ]
    assert payload["items"][0]["json_path"].endswith("20260421_211036.briefing.json")


def test_get_latest_briefing_returns_summary_and_payload_when_present(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(briefing_artifacts, "REPO_ROOT", tmp_path)
    briefing_dir = tmp_path / "logs" / "briefings"
    briefing_dir.mkdir(parents=True, exist_ok=True)

    _write_summary(
        briefing_dir / "20260421_161034.summary.json",
        generated_at="2026-04-21T21:10:36+00:00",
        summary_text="6 top opportunities, 2 watchlist, 0 review flags.",
        top_opportunities_count=5,
        watchlist_count=2,
        review_flags_count=0,
        total_markets=141,
        json_output_path=briefing_dir / "20260421_211036.briefing.json",
        text_output_path=briefing_dir / "20260421_211036.briefing.txt",
    )
    _write_summary(
        briefing_dir / "latest-summary.json",
        generated_at="2026-04-21T21:10:36+00:00",
        summary_text="6 top opportunities, 2 watchlist, 0 review flags.",
        top_opportunities_count=5,
        watchlist_count=2,
        review_flags_count=0,
        total_markets=141,
        json_output_path=briefing_dir / "20260421_211036.briefing.json",
        text_output_path=briefing_dir / "20260421_211036.briefing.txt",
    )
    _write_briefing_json(briefing_dir / "latest-briefing.json")

    response = client.get("/briefing/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_161034"
    assert payload["summary_text"] == "6 top opportunities, 2 watchlist, 0 review flags."
    assert payload["briefing"]["summary"] == "6 top opportunities, 2 watchlist, 0 review flags."
    assert payload["json_path"].endswith("latest-briefing.json")


def test_get_briefing_run_returns_partial_payload_when_json_missing(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(briefing_artifacts, "REPO_ROOT", tmp_path)
    briefing_dir = tmp_path / "logs" / "briefings"
    briefing_dir.mkdir(parents=True, exist_ok=True)

    _write_summary(
        briefing_dir / "20260421_161034.summary.json",
        generated_at="2026-04-21T21:10:36+00:00",
        summary_text="6 top opportunities, 2 watchlist, 0 review flags.",
        top_opportunities_count=5,
        watchlist_count=2,
        review_flags_count=0,
        total_markets=141,
        json_output_path=briefing_dir / "20260421_211036.briefing.json",
        text_output_path=briefing_dir / "20260421_211036.briefing.txt",
    )

    response = client.get("/briefing/20260421_161034")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_161034"
    assert payload["briefing"] is None
    assert payload["json_path"].endswith("20260421_211036.briefing.json")
    assert payload["summary_text"] == "6 top opportunities, 2 watchlist, 0 review flags."


def test_get_briefing_run_returns_404_for_unknown_run(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(briefing_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/briefing/20260421_999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Briefing run 20260421_999999 no encontrado."}


def _write_summary(
    path,
    *,
    generated_at: str,
    summary_text: str,
    top_opportunities_count: int,
    watchlist_count: int,
    review_flags_count: int,
    total_markets: int,
    json_output_path,
    text_output_path,
) -> None:
    _write_json(
        path,
        {
            "status": "ok",
            "generated_at": generated_at,
            "summary_text": summary_text,
            "top_opportunities_count": top_opportunities_count,
            "watchlist_count": watchlist_count,
            "review_flags_count": review_flags_count,
            "total_markets": total_markets,
            "json_output_path": str(json_output_path),
            "text_output_path": str(text_output_path),
            "raw_output_path": str(path.with_suffix(".command-output.txt")),
        },
    )


def _write_briefing_json(path) -> None:
    _write_json(
        path,
        {
            "generated_at": "2026-04-21T21:10:36+00:00",
            "summary": "6 top opportunities, 2 watchlist, 0 review flags.",
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
                "opportunity_count": 6,
                "watchlist_count": 2,
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
                "pipeline_started_at": "2026-04-21T16:10:00-05:00",
                "pipeline_finished_at": "2026-04-21T16:10:30-05:00",
                "reports_status": "ok",
                "reports_started_at": "2026-04-21T16:10:31-05:00",
                "reports_finished_at": "2026-04-21T16:10:33-05:00",
                "latest_snapshot_at": "2026-04-21T16:10:16-05:00",
                "latest_prediction_at": "2026-04-21T16:10:21-05:00",
                "latest_evidence_at": "2026-04-21T16:10:10-05:00",
            },
        },
    )


def _write_json(path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
