from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routes_backtesting import router as backtesting_router
from app.api.routes_data_health import router as data_health_router
from app.api.routes_external_signals import router as external_signals_router
from app.api.routes_investigation_status import router as investigation_status_router
from app.api.routes_research import router as research_router
from app.api.routes_smart_alerts import router as smart_alerts_router
from app.api.routes_sources import router as sources_router
from app.api.routes_tags import router as tags_router
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
app.include_router(backtesting_router)
app.include_router(data_health_router)
app.include_router(research_router)
app.include_router(external_signals_router)
app.include_router(watchlist_router)
app.include_router(investigation_status_router)
app.include_router(smart_alerts_router)
app.include_router(tags_router)
app.include_router(sources_router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "environment": settings.environment,
    }
