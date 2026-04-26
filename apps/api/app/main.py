from __future__ import annotations

from fastapi import FastAPI

from app.api.routes import router
from app.api.routes_research import router as research_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="PolySignal API",
    version="0.1.0",
    description="API base para análisis de mercados de Polymarket.",
)
app.include_router(router)
app.include_router(research_router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "environment": settings.environment,
    }
