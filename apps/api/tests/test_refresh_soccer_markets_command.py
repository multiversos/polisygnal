from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands import refresh_soccer_markets as command
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction


class DummyClient:
    pass


class DummyScoringSummary:
    def __init__(self, *, apply: bool) -> None:
        self.apply = apply

    def to_payload(self) -> dict[str, object]:
        return {
            "status": "ok",
            "dry_run": not self.apply,
            "apply": self.apply,
            "sport_type": "soccer",
            "limit": 30,
            "candidates_checked": 4,
            "candidates_without_prediction": 4,
            "candidates_with_snapshot": 2,
            "scored": 0,
            "skipped": 4,
            "skipped_reasons": {"dry_run": 4} if not self.apply else {},
            "errors": [],
            "prediction_ids_created": [],
            "market_ids_scored": [],
            "partial_error_count": 0,
            "predictions_created": 0,
            "predictions_updated": 0,
            "markets_considered": 4,
            "markets_scored": 0,
        }


def test_refresh_soccer_markets_parser_defaults_to_dry_run() -> None:
    args = command.build_parser().parse_args([])

    assert args.apply is False
    assert args.dry_run is False
    assert args.yes_i_understand_this_writes_data is False
    assert args.days == 7
    assert args.pages == 5
    assert args.max_events == 10
    assert args.max_import == 30
    assert args.max_snapshots == 30
    assert args.score_limit == 30
    command.validate_args(args)


def test_refresh_soccer_markets_dry_run_does_not_write_and_propagates_flags(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, dict[str, object]] = {}
    _patch_pipeline(monkeypatch, calls)
    before = _counts(db_session)

    payload = command.run_refresh_soccer_markets(
        db_session,
        client=DummyClient(),  # type: ignore[arg-type]
        settings=_settings(),
        days=5,
        pages=4,
        limit=77,
        max_events=3,
        max_import=9,
        max_snapshots=8,
        score_limit=7,
        debug_skips=True,
    )

    assert payload["dry_run"] is True
    assert payload["apply"] is False
    assert payload["read_only"] is True
    assert payload["delete_existing_executed"] is False
    assert payload["requested_days"] == 5
    assert payload["requested_pages"] == 4
    assert payload["max_events"] == 3
    assert payload["import_would_import"] == 3
    assert payload["snapshot_would_create"] == 2
    assert payload["scoring_candidates"] == 4
    assert payload["candidate_events"] == [
        {
            "event_slug": "ucl-ars-atm1-2026-05-05",
            "title": "Arsenal FC vs Club Atletico de Madrid",
            "teams": ["Arsenal FC", "Club Atletico de Madrid"],
            "close_time": "2026-05-05T19:00:00Z",
            "has_draw_market": True,
            "would_import_markets_count": 3,
            "primary_markets": [{"title": "Arsenal win"}],
        }
    ]
    assert "dry_run_default_no_writes" in payload["warnings"]
    assert "--apply" in payload["next_command_to_apply"]
    assert "--yes-i-understand-this-writes-data" in payload["next_command_to_apply"]

    assert calls["import"]["dry_run"] is True
    assert calls["import"]["sport"] == "soccer"
    assert calls["import"]["days"] == 5
    assert calls["import"]["pages"] == 4
    assert calls["import"]["limit"] == 77
    assert calls["import"]["max_events"] == 3
    assert calls["import"]["max_import"] == 9
    assert calls["import"]["include_skip_reasons"] is True
    assert calls["snapshots"]["dry_run"] is True
    assert calls["snapshots"]["max_snapshots"] == 8
    assert calls["scoring"]["apply"] is False
    assert calls["scoring"]["limit"] == 7
    assert calls["scoring"]["sport_type"] == "soccer"
    assert _counts(db_session) == before
    assert json.dumps(payload, ensure_ascii=True, default=str)


def test_refresh_soccer_markets_apply_is_required_for_writes_and_propagates_apply(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, dict[str, object]] = {}
    _patch_pipeline(monkeypatch, calls)

    payload = command.run_refresh_soccer_markets(
        db_session,
        client=DummyClient(),  # type: ignore[arg-type]
        settings=_settings(),
        apply=True,
    )

    assert payload["dry_run"] is False
    assert payload["apply"] is True
    assert calls["import"]["dry_run"] is False
    assert calls["snapshots"]["dry_run"] is False
    assert calls["scoring"]["apply"] is True


def test_refresh_soccer_markets_apply_requires_explicit_write_confirmation() -> None:
    args = command.build_parser().parse_args(["--apply"])

    with pytest.raises(ValueError, match="--yes-i-understand-this-writes-data"):
        command.validate_args(args)


def test_refresh_soccer_markets_delete_existing_is_blocked_without_apply() -> None:
    args = command.build_parser().parse_args(["--delete-existing"])

    with pytest.raises(ValueError, match="requiere --apply"):
        command.validate_args(args)


def test_refresh_soccer_markets_delete_existing_is_not_implemented_even_with_apply() -> None:
    args = command.build_parser().parse_args(
        ["--apply", "--yes-i-understand-this-writes-data", "--delete-existing"]
    )

    with pytest.raises(ValueError, match="todavia no esta implementado"):
        command.validate_args(args)


def test_refresh_soccer_markets_rejects_non_positive_limits() -> None:
    args = command.build_parser().parse_args(["--max-import", "0"])

    with pytest.raises(ValueError, match="--max-import"):
        command.validate_args(args)


def _patch_pipeline(monkeypatch: pytest.MonkeyPatch, calls: dict[str, dict[str, object]]) -> None:
    def fake_import(db, **kwargs):
        calls["import"] = kwargs
        return {
            "status": "ok",
            "dry_run": kwargs["dry_run"],
            "would_import": 3 if kwargs["dry_run"] else 0,
            "imported": 0 if kwargs["dry_run"] else 3,
            "event_groups": [
                {
                    "event_slug": "ucl-ars-atm1-2026-05-05",
                    "title": "Arsenal FC vs Club Atletico de Madrid",
                    "teams": ["Arsenal FC", "Club Atletico de Madrid"],
                    "close_time": "2026-05-05T19:00:00Z",
                    "has_draw_market": True,
                    "would_import_markets_count": 3,
                    "primary_markets": [{"title": "Arsenal win"}],
                }
            ],
            "items": [{"action": "would_import"} for _ in range(3)],
        }

    def fake_snapshots(db, **kwargs):
        calls["snapshots"] = kwargs
        return {
            "status": "ok",
            "dry_run": kwargs["dry_run"],
            "would_create": 2 if kwargs["dry_run"] else 0,
            "snapshots_created": 0 if kwargs["dry_run"] else 2,
            "items": [],
        }

    def fake_scoring(db, **kwargs):
        calls["scoring"] = kwargs
        return DummyScoringSummary(apply=bool(kwargs["apply"]))

    monkeypatch.setattr(command, "run_live_import", fake_import)
    monkeypatch.setattr(command, "run_discovery_snapshots", fake_snapshots)
    monkeypatch.setattr(command, "score_missing_markets", fake_scoring)


def _settings():
    return SimpleNamespace(polymarket_sports_tag_id="sports")


def _counts(db_session: Session) -> dict[str, int]:
    return {
        "markets": db_session.scalar(select(func.count()).select_from(Market)) or 0,
        "snapshots": db_session.scalar(select(func.count()).select_from(MarketSnapshot)) or 0,
        "predictions": db_session.scalar(select(func.count()).select_from(Prediction)) or 0,
    }
