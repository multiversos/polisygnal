from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.services.market_diff import MaterialChangeThresholds, build_market_diff_payload


def test_build_market_diff_payload_detects_top_bucket_and_material_changes() -> None:
    previous_snapshot = {
        "generated_at": datetime(2026, 4, 21, 15, 0, tzinfo=UTC).isoformat(),
        "run": {"run_id": "run-1", "pipeline_summary_path": "run-1.summary.json"},
        "total_markets": 3,
        "top_opportunities_count": 1,
        "watchlist_count": 1,
        "items": [
            {
                "market_id": 101,
                "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                "priority_rank": 1,
                "priority_bucket": "priority",
                "opportunity": True,
                "scoring_mode": "evidence_backed",
                "evidence_eligible": True,
                "run_at": datetime(2026, 4, 21, 15, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.6100",
                "confidence_score": "0.7000",
                "edge_magnitude": "0.0900",
            },
            {
                "market_id": 102,
                "question": "NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
                "priority_rank": 2,
                "priority_bucket": "watchlist",
                "opportunity": False,
                "scoring_mode": "evidence_backed",
                "evidence_eligible": True,
                "run_at": datetime(2026, 4, 21, 15, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.4800",
                "confidence_score": "0.5500",
                "edge_magnitude": "0.0300",
            },
            {
                "market_id": 103,
                "question": "Will the Miami Heat win the 2026 NBA Finals?",
                "priority_rank": 3,
                "priority_bucket": "fallback_only",
                "opportunity": False,
                "scoring_mode": "fallback_only",
                "evidence_eligible": False,
                "run_at": datetime(2026, 4, 21, 15, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.0900",
                "confidence_score": "0.2400",
                "edge_magnitude": "0.0100",
            },
        ],
    }
    current_snapshot = {
        "generated_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
        "run": {"run_id": "run-2", "pipeline_summary_path": "run-2.summary.json"},
        "total_markets": 3,
        "top_opportunities_count": 1,
        "watchlist_count": 1,
        "items": [
            {
                "market_id": 101,
                "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                "priority_rank": 2,
                "priority_bucket": "watchlist",
                "opportunity": False,
                "scoring_mode": "evidence_backed",
                "evidence_eligible": True,
                "run_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.5200",
                "confidence_score": "0.5800",
                "edge_magnitude": "0.0200",
            },
            {
                "market_id": 102,
                "question": "NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
                "priority_rank": 1,
                "priority_bucket": "priority",
                "opportunity": True,
                "scoring_mode": "evidence_backed",
                "evidence_eligible": True,
                "run_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.5600",
                "confidence_score": "0.7000",
                "edge_magnitude": "0.0800",
            },
            {
                "market_id": 103,
                "question": "Will the Miami Heat win the 2026 NBA Finals?",
                "priority_rank": 3,
                "priority_bucket": "fallback_only",
                "opportunity": False,
                "scoring_mode": "fallback_only",
                "evidence_eligible": False,
                "run_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.0900",
                "confidence_score": "0.2400",
                "edge_magnitude": "0.0100",
            },
        ],
    }

    payload = build_market_diff_payload(
        current_snapshot=current_snapshot,
        previous_snapshot=previous_snapshot,
        thresholds=MaterialChangeThresholds(
            yes_probability=Decimal("0.05"),
            confidence_score=Decimal("0.10"),
            edge_magnitude=Decimal("0.05"),
        ),
        generated_at=datetime(2026, 4, 21, 17, 1, tzinfo=UTC),
    )

    assert payload["summary"]["comparison_ready"] is True
    assert payload["summary"]["top_opportunities_entered_count"] == 1
    assert payload["summary"]["top_opportunities_exited_count"] == 1
    assert payload["summary"]["bucket_changes_count"] == 2
    assert payload["summary"]["material_score_changes_count"] == 2

    assert payload["top_opportunities_entered"][0]["market_id"] == 102
    assert payload["top_opportunities_exited"][0]["market_id"] == 101

    bucket_change_ids = [item["market_id"] for item in payload["bucket_changes"]]
    assert bucket_change_ids == [101, 102]

    material_change_ids = [item["market_id"] for item in payload["material_score_changes"]]
    assert material_change_ids == [102, 101]
    assert payload["material_score_changes"][0]["delta_yes_probability"] == "0.0800"
    assert payload["material_score_changes"][0]["delta_confidence_score"] == "0.1500"
    assert payload["material_score_changes"][0]["delta_edge_magnitude"] == "0.0500"


def test_build_market_diff_payload_handles_first_baseline_snapshot() -> None:
    current_snapshot = {
        "generated_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
        "run": {"run_id": "run-1", "pipeline_summary_path": "run-1.summary.json"},
        "total_markets": 1,
        "top_opportunities_count": 1,
        "watchlist_count": 0,
        "items": [
            {
                "market_id": 101,
                "question": "NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                "priority_rank": 1,
                "priority_bucket": "priority",
                "opportunity": True,
                "scoring_mode": "evidence_backed",
                "evidence_eligible": True,
                "run_at": datetime(2026, 4, 21, 17, 0, tzinfo=UTC).isoformat(),
                "yes_probability": "0.5600",
                "confidence_score": "0.7000",
                "edge_magnitude": "0.0800",
            }
        ],
    }

    payload = build_market_diff_payload(
        current_snapshot=current_snapshot,
        previous_snapshot=None,
        thresholds=MaterialChangeThresholds(),
        generated_at=datetime(2026, 4, 21, 17, 1, tzinfo=UTC),
    )

    assert payload["summary"]["comparison_ready"] is False
    assert payload["summary"]["top_opportunities_entered_count"] == 0
    assert payload["summary"]["top_opportunities_exited_count"] == 0
    assert payload["summary"]["bucket_changes_count"] == 0
    assert payload["summary"]["material_score_changes_count"] == 0
    assert payload["summary"]["text"] == "No previous diff snapshot available. Baseline snapshot created."
    assert payload["previous_run"] is None
