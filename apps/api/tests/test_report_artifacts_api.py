from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import report_artifacts


def test_get_latest_reports_returns_missing_response_when_artifact_absent(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(report_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/reports/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is False
    assert payload["reports"] == []
    assert "No report artifact available yet" in payload["message"]


def test_get_reports_runs_returns_ordered_runs(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(report_artifacts, "REPO_ROOT", tmp_path)
    report_dir = tmp_path / "logs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    _write_report_summary(report_dir / "20260421_161022.summary.json", generated_at="2026-04-21T21:10:34+00:00")
    _write_report_summary(report_dir / "20260421_161302.summary.json", generated_at="2026-04-21T21:13:13+00:00")

    response = client.get("/reports/runs?limit=2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 2
    assert [item["run_id"] for item in payload["items"]] == [
        "20260421_161302",
        "20260421_161022",
    ]
    assert payload["items"][0]["preset_count"] == 2
    assert payload["items"][0]["presets"] == ["top_opportunities", "watchlist"]


def test_get_latest_reports_returns_summary_and_latest_payloads(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(report_artifacts, "REPO_ROOT", tmp_path)
    report_dir = tmp_path / "logs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    _write_report_summary(report_dir / "20260421_161302.summary.json", generated_at="2026-04-21T21:13:13+00:00")
    _write_report_summary(
        report_dir / "latest-summary.json",
        generated_at="2026-04-21T21:13:13+00:00",
        latest_paths=True,
    )
    _write_report_json(report_dir / "latest-top-opportunities.json", preset="top_opportunities", total_count=6)
    _write_report_json(report_dir / "latest-watchlist.json", preset="watchlist", total_count=2)

    response = client.get("/reports/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_161302"
    assert payload["preset_count"] == 2
    assert payload["reports"][0]["json_path"].endswith("latest-top-opportunities.json")
    assert payload["reports"][0]["json_payload"]["preset"] == "top_opportunities"
    assert payload["reports"][1]["json_payload"]["total_count"] == 2


def test_get_report_run_returns_partial_payload_when_one_json_missing(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(report_artifacts, "REPO_ROOT", tmp_path)
    report_dir = tmp_path / "logs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    _write_report_summary(report_dir / "20260421_161302.summary.json", generated_at="2026-04-21T21:13:13+00:00")
    _write_report_json(
        report_dir / "20260421_161302.top-opportunities.json",
        preset="top_opportunities",
        total_count=6,
    )

    response = client.get("/reports/20260421_161302")

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact_available"] is True
    assert payload["run_id"] == "20260421_161302"
    assert payload["reports"][0]["json_payload"]["preset"] == "top_opportunities"
    assert payload["reports"][1]["json_payload"] is None
    assert payload["reports"][1]["json_path"].endswith("20260421_161302.watchlist.json")


def test_get_report_run_returns_404_for_unknown_run(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(report_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/reports/20260421_999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Report run 20260421_999999 no encontrado."}


def _write_report_summary(path, *, generated_at: str, latest_paths: bool = False) -> None:
    report_dir = path.parent
    _write_json(
        path,
        {
            "status": "ok",
            "generated_at": generated_at,
            "finished_at": generated_at,
            "partial_error_count": 0,
            "presets": ["top_opportunities", "watchlist"],
            "formats": ["json", "csv"],
            "limit": 50,
            "frequency_recommendation_minutes": 120,
            "generated_presets": [
                {
                    "preset": "top_opportunities",
                    "status": "ok",
                    "item_count": 6,
                    "items_exported": 6,
                    "json_output_path": str(report_dir / "20260421_161302.top-opportunities.json"),
                    "latest_json_path": str(report_dir / "latest-top-opportunities.json") if latest_paths else None,
                    "csv_output_path": str(report_dir / "20260421_161302.top-opportunities.csv"),
                    "latest_csv_path": str(report_dir / "latest-top-opportunities.csv") if latest_paths else None,
                },
                {
                    "preset": "watchlist",
                    "status": "ok",
                    "item_count": 2,
                    "items_exported": 2,
                    "json_output_path": str(report_dir / "20260421_161302.watchlist.json"),
                    "latest_json_path": str(report_dir / "latest-watchlist.json") if latest_paths else None,
                    "csv_output_path": str(report_dir / "20260421_161302.watchlist.csv"),
                    "latest_csv_path": str(report_dir / "latest-watchlist.csv") if latest_paths else None,
                },
            ],
        },
    )


def _write_report_json(path, *, preset: str, total_count: int) -> None:
    _write_json(
        path,
        {
            "exported_at": "2026-04-21T21:13:03+00:00",
            "preset": preset,
            "filters": {
                "sport_type": "nba",
                "market_type": "winner",
                "active": None,
                "opportunity_only": preset == "top_opportunities",
                "evidence_eligible_only": False,
                "evidence_only": False,
                "fallback_only": False,
                "bucket": None,
                "edge_class": None,
                "sort_by": "priority",
            },
            "total_count": total_count,
            "limit": 50,
            "offset": 0,
            "items": [],
        },
    )


def _write_json(path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
