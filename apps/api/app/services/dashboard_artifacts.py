from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.core.config import REPO_ROOT
from app.schemas.dashboard_artifacts import DashboardLatestMetaResponse


class LatestDashboardArtifactNotFoundError(FileNotFoundError):
    """Raised when the latest dashboard HTML artifact is not available."""


def read_latest_dashboard_html_path(*, repo_root: Path | None = None) -> Path:
    root = repo_root or REPO_ROOT
    dashboard_path = root / "logs" / "dashboard" / "latest-dashboard.html"
    if not dashboard_path.is_file():
        raise LatestDashboardArtifactNotFoundError(dashboard_path)
    return dashboard_path


def read_latest_dashboard_meta(*, repo_root: Path | None = None) -> DashboardLatestMetaResponse:
    try:
        dashboard_path = read_latest_dashboard_html_path(repo_root=repo_root)
    except LatestDashboardArtifactNotFoundError:
        return DashboardLatestMetaResponse()

    generated_at = datetime.fromtimestamp(dashboard_path.stat().st_mtime, tz=UTC)
    return DashboardLatestMetaResponse(
        artifact_available=True,
        path=str(dashboard_path),
        generated_at=generated_at,
    )
