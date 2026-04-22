from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class DashboardLatestMetaResponse(BaseModel):
    artifact_available: bool = False
    path: str | None = None
    generated_at: datetime | None = None


class AppMetaResponse(BaseModel):
    dashboard_available: bool = False
    dashboard_path: str = "/dashboard/latest"
    app_path: str = "/app"
    root_path: str = "/"
