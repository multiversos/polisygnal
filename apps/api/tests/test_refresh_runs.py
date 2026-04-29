from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.prediction import Prediction
from app.models.refresh_run import RefreshRun
from app.models.research_run import ResearchRun
from app.services.refresh_runs import (
    build_refresh_audit_summary,
    list_refresh_runs,
    record_refresh_run,
)


def test_record_refresh_run_persists_dry_run_audit(db_session: Session) -> None:
    started_at = datetime.now(tz=UTC)
    finished_at = started_at + timedelta(seconds=2)
    before_predictions = db_session.scalar(select(func.count()).select_from(Prediction))
    before_research_runs = db_session.scalar(select(func.count()).select_from(ResearchRun))

    refresh_run = record_refresh_run(
        db_session,
        refresh_type="snapshot",
        mode="dry_run",
        status="success",
        markets_checked=3,
        markets_updated=0,
        errors_count=0,
        started_at=started_at,
        finished_at=finished_at,
        summary_json={"market_ids": [101, 102, 103], "token_id": "public-token"},
    )
    db_session.commit()

    stored = db_session.get(RefreshRun, refresh_run.id)
    assert stored is not None
    assert stored.refresh_type == "snapshot"
    assert stored.mode == "dry_run"
    assert stored.markets_checked == 3
    assert stored.markets_updated == 0
    assert stored.summary_json == {"market_ids": [101, 102, 103]}
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == before_predictions
    assert db_session.scalar(select(func.count()).select_from(ResearchRun)) == before_research_runs


def test_record_refresh_run_persists_apply_audit(db_session: Session) -> None:
    started_at = datetime.now(tz=UTC)
    refresh_run = record_refresh_run(
        db_session,
        refresh_type="metadata",
        mode="apply",
        status="partial",
        markets_checked=4,
        markets_updated=2,
        errors_count=1,
        started_at=started_at,
        finished_at=started_at + timedelta(seconds=1),
        summary_json={"action_counts": {"updated": 2}, "partial_errors": [{"market_id": 7}]},
    )
    db_session.commit()

    stored = db_session.get(RefreshRun, refresh_run.id)
    assert stored is not None
    assert stored.refresh_type == "metadata"
    assert stored.mode == "apply"
    assert stored.status == "partial"
    assert stored.markets_checked == 4
    assert stored.markets_updated == 2
    assert stored.errors_count == 1


def test_list_refresh_runs_filters_by_type(db_session: Session) -> None:
    started_at = datetime.now(tz=UTC)
    record_refresh_run(
        db_session,
        refresh_type="snapshot",
        mode="dry_run",
        status="success",
        markets_checked=1,
        markets_updated=0,
        errors_count=0,
        started_at=started_at,
        finished_at=started_at,
    )
    record_refresh_run(
        db_session,
        refresh_type="metadata",
        mode="dry_run",
        status="success",
        markets_checked=1,
        markets_updated=0,
        errors_count=0,
        started_at=started_at + timedelta(seconds=1),
        finished_at=started_at + timedelta(seconds=1),
    )
    db_session.commit()

    runs = list_refresh_runs(db_session, refresh_type="metadata", limit=20)

    assert len(runs) == 1
    assert runs[0].refresh_type == "metadata"


def test_refresh_runs_endpoint_lists_audits(client: TestClient, db_session: Session) -> None:
    started_at = datetime.now(tz=UTC)
    record_refresh_run(
        db_session,
        refresh_type="snapshot",
        mode="dry_run",
        status="success",
        markets_checked=2,
        markets_updated=0,
        errors_count=0,
        started_at=started_at,
        finished_at=started_at + timedelta(seconds=1),
        summary_json={"market_ids": [201, 202]},
    )
    db_session.commit()

    response = client.get("/data-health/refresh-runs?refresh_type=snapshot&limit=5")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    item = payload["items"][0]
    assert item["refresh_type"] == "snapshot"
    assert item["mode"] == "dry_run"
    assert item["markets_checked"] == 2
    assert item["summary_json"]["market_ids"] == [201, 202]


def test_build_refresh_audit_summary_is_compact_and_redacts_tokens() -> None:
    payload = {
        "dry_run": False,
        "apply": True,
        "markets_checked": 1,
        "markets_updated": 1,
        "partial_error_count": 0,
        "items": [
            {
                "market_id": 55,
                "action": "updated",
                "changes": [
                    {"field": "yes_token_id", "local_value": "a", "remote_value": "b"},
                    {"field": "question", "local_value": "Old", "remote_value": "New"},
                ],
            }
        ],
    }

    summary = build_refresh_audit_summary(
        payload,
        refresh_type="metadata",
        market_id=55,
        sport="mlb",
        days=7,
        limit=1,
    )

    assert summary["market_ids"] == [55]
    assert summary["action_counts"] == {"updated": 1}
    assert "token" not in str(summary).lower()
