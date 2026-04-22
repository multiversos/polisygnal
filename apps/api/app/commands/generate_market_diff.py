from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from app.core.config import REPO_ROOT
from app.db.session import SessionLocal
from app.services.market_diff import (
    MaterialChangeThresholds,
    build_market_diff_payload,
    build_market_diff_snapshot,
    render_market_diff_text,
)

ActiveFilter = Literal["true", "false", "any"]
OutputFormat = Literal["json", "txt", "both"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera un diff compacto entre la corrida actual y la corrida previa del MVP."
    )
    parser.add_argument("--sport-type", type=str, default="nba")
    parser.add_argument("--market-type", type=str, default="winner")
    parser.add_argument(
        "--active",
        choices=["true", "false", "any"],
        default="true",
        help="Filtro por estado activo. Default: true.",
    )
    parser.add_argument(
        "--format",
        choices=["json", "txt", "both"],
        default="both",
        help="Formato de salida de archivos.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(REPO_ROOT / "logs" / "diffs"),
        help="Directorio donde se escriben snapshots y diff timestamped/latest.",
    )
    parser.add_argument(
        "--yes-probability-threshold",
        type=Decimal,
        default=Decimal("0.05"),
    )
    parser.add_argument(
        "--confidence-threshold",
        type=Decimal,
        default=Decimal("0.10"),
    )
    parser.add_argument(
        "--edge-threshold",
        type=Decimal,
        default=Decimal("0.05"),
    )
    parser.add_argument("--run-id", type=str, default=None)
    parser.add_argument("--pipeline-summary-path", type=str, default=None)
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    active = _parse_active_filter(args.active)
    generated_at = datetime.now(tz=UTC)
    run_id = generated_at.strftime("%Y%m%d_%H%M%S")

    previous_snapshot_path = _find_previous_snapshot_path(output_dir)
    previous_snapshot = _read_json_payload(previous_snapshot_path) if previous_snapshot_path is not None else None

    thresholds = MaterialChangeThresholds(
        yes_probability=args.yes_probability_threshold,
        confidence_score=args.confidence_threshold,
        edge_magnitude=args.edge_threshold,
    )

    try:
        with SessionLocal() as db:
            current_snapshot = build_market_diff_snapshot(
                db,
                sport_type=args.sport_type,
                market_type=args.market_type,
                active=active,
                generated_at=generated_at,
                run_id=args.run_id,
                pipeline_summary_path=args.pipeline_summary_path,
            )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                indent=2,
                ensure_ascii=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

    current_snapshot_path = output_dir / f"{run_id}.snapshot.json"
    latest_snapshot_path = output_dir / "latest-snapshot.json"
    _write_json(current_snapshot_path, current_snapshot)
    _write_json(latest_snapshot_path, current_snapshot)

    diff_payload = build_market_diff_payload(
        current_snapshot=current_snapshot,
        previous_snapshot=previous_snapshot,
        thresholds=thresholds,
        generated_at=generated_at,
    )
    diff_payload["current_run"]["snapshot_path"] = str(current_snapshot_path)
    diff_payload["current_run"]["latest_snapshot_path"] = str(latest_snapshot_path)
    if previous_snapshot_path is not None and diff_payload["previous_run"] is not None:
        diff_payload["previous_run"]["snapshot_path"] = str(previous_snapshot_path)

    json_output_path: Path | None = None
    latest_json_path: Path | None = None
    text_output_path: Path | None = None
    latest_text_path: Path | None = None

    if args.format in {"json", "both"}:
        json_output_path = output_dir / f"{run_id}.diff.json"
        latest_json_path = output_dir / "latest-diff.json"
        _write_json(json_output_path, diff_payload)
        _write_json(latest_json_path, diff_payload)

    if args.format in {"txt", "both"}:
        text_output_path = output_dir / f"{run_id}.diff.txt"
        latest_text_path = output_dir / "latest-diff.txt"
        text_output_path.write_text(render_market_diff_text(diff_payload), encoding="utf-8")
        latest_text_path.write_text(render_market_diff_text(diff_payload), encoding="utf-8")

    summary = {
        "status": "ok",
        "generated_at": diff_payload["generated_at"],
        "comparison_ready": diff_payload["summary"]["comparison_ready"],
        "output_dir": str(output_dir),
        "current_snapshot_path": str(current_snapshot_path),
        "latest_snapshot_path": str(latest_snapshot_path),
        "previous_snapshot_path": str(previous_snapshot_path) if previous_snapshot_path is not None else None,
        "json_output_path": str(json_output_path) if json_output_path is not None else None,
        "latest_json_path": str(latest_json_path) if latest_json_path is not None else None,
        "text_output_path": str(text_output_path) if text_output_path is not None else None,
        "latest_text_path": str(latest_text_path) if latest_text_path is not None else None,
        "top_opportunities_entered_count": diff_payload["summary"]["top_opportunities_entered_count"],
        "top_opportunities_exited_count": diff_payload["summary"]["top_opportunities_exited_count"],
        "bucket_changes_count": diff_payload["summary"]["bucket_changes_count"],
        "material_score_changes_count": diff_payload["summary"]["material_score_changes_count"],
        "summary_text": diff_payload["summary"]["text"],
        "thresholds": diff_payload["thresholds"],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


def _parse_active_filter(value: ActiveFilter) -> bool | None:
    if value == "true":
        return True
    if value == "false":
        return False
    return None


def _find_previous_snapshot_path(output_dir: Path) -> Path | None:
    snapshot_paths = sorted(
        (
            path
            for path in output_dir.glob("*.snapshot.json")
            if not path.name.startswith("latest-")
        ),
        key=lambda path: path.name,
    )
    if not snapshot_paths:
        return None
    return snapshot_paths[-1]


def _read_json_payload(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


if __name__ == "__main__":
    main()
