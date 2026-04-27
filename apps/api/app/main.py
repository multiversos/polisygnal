from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routes_external_signals import router as external_signals_router
from app.api.routes_research import router as research_router
from app.api.routes_watchlist import router as watchlist_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="PolySignal API",
    version="0.1.0",
    description="API base para análisis de mercados de Polymarket.",
)
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(router)
app.include_router(research_router)
app.include_router(external_signals_router)
app.include_router(watchlist_router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "environment": settings.environment,
    }
