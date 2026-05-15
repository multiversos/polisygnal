from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    EvidenceItem,
    Event,
    ExternalMarketSignal,
    HighlightedWalletProfile,
    Market,
    MarketInvestigationStatus,
    MarketOutcome,
    MarketTag,
    MarketTagLink,
    MarketSnapshot,
    Prediction,
    PredictionReport,
    RefreshRun,
    ResearchFinding,
    ResearchRun,
    Source,
    WatchlistItem,
)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    _ = (
        EvidenceItem,
        Event,
        ExternalMarketSignal,
        HighlightedWalletProfile,
        Market,
        MarketInvestigationStatus,
        MarketOutcome,
        MarketTag,
        MarketTagLink,
        MarketSnapshot,
        Prediction,
        PredictionReport,
        RefreshRun,
        ResearchFinding,
        ResearchRun,
        Source,
        WatchlistItem,
    )
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
