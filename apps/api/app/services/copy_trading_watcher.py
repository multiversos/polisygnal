from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import Event, RLock, Thread
from typing import Protocol

from sqlalchemy.orm import Session

from app.clients.polymarket_data import PolymarketDataClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.schemas.copy_trading import (
    CopyTradingTickResponse,
    CopyTradingWatcherLastResult,
    CopyTradingWatcherStatusResponse,
)
from app.services.copy_trading_demo_engine import run_demo_tick
from app.services.copy_trading_service import add_copy_event


class SessionFactory(Protocol):
    def __call__(self) -> Session:
        ...


class DataClientFactory(Protocol):
    def __call__(self) -> PolymarketDataClient:
        ...


class TickRunner(Protocol):
    def __call__(
        self,
        db: Session,
        *,
        data_client: PolymarketDataClient,
        limit: int = 50,
        now: datetime | None = None,
    ) -> CopyTradingTickResponse:
        ...


def _default_data_client_factory() -> PolymarketDataClient:
    return PolymarketDataClient.from_settings(get_settings())


@dataclass(slots=True)
class CopyTradingWatcherRunResult:
    status: CopyTradingWatcherStatusResponse
    executed: bool


class CopyTradingDemoWatcher:
    def __init__(
        self,
        *,
        interval_seconds: int = 10,
        limit: int = 50,
        session_factory: SessionFactory = SessionLocal,
        data_client_factory: DataClientFactory = _default_data_client_factory,
        tick_runner: TickRunner = run_demo_tick,
    ) -> None:
        self._interval_seconds = interval_seconds
        self._limit = limit
        self._session_factory = session_factory
        self._data_client_factory = data_client_factory
        self._tick_runner = tick_runner
        self._lock = RLock()
        self._enabled = False
        self._running = False
        self._thread: Thread | None = None
        self._stop_event = Event()
        self._last_run_at: datetime | None = None
        self._next_run_at: datetime | None = None
        self._last_result: CopyTradingWatcherLastResult | None = None
        self._error_count = 0
        self._last_error: str | None = None

    def get_status(self, *, message: str | None = None) -> CopyTradingWatcherStatusResponse:
        with self._lock:
            return CopyTradingWatcherStatusResponse(
                enabled=self._enabled,
                running=self._running,
                interval_seconds=self._interval_seconds,
                last_run_at=self._last_run_at,
                next_run_at=self._next_run_at if self._enabled else None,
                last_result=self._last_result,
                error_count=self._error_count,
                last_error=self._last_error,
                message=message,
            )

    def start(self) -> CopyTradingWatcherStatusResponse:
        with self._lock:
            if self._enabled and self._thread is not None and self._thread.is_alive():
                return self.get_status(message="Watcher demo ya activo.")
            self._enabled = True
            self._stop_event = Event()
            self._next_run_at = datetime.now(tz=UTC)
            self._thread = Thread(
                target=self._watcher_loop,
                name="copy-trading-demo-watcher",
                daemon=True,
            )
            self._thread.start()
        return self.get_status(message="Watcher demo iniciado.")

    def stop(self) -> CopyTradingWatcherStatusResponse:
        thread: Thread | None
        with self._lock:
            self._enabled = False
            self._next_run_at = None
            self._stop_event.set()
            thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=0.25)
        with self._lock:
            if self._thread is thread and thread is not None and not thread.is_alive():
                self._thread = None
        return self.get_status(message="Watcher demo pausado.")

    def run_once(
        self,
        *,
        db: Session | None = None,
        data_client: PolymarketDataClient | None = None,
        now: datetime | None = None,
    ) -> CopyTradingWatcherRunResult:
        with self._lock:
            if self._running:
                return CopyTradingWatcherRunResult(
                    status=self.get_status(message="Watcher demo ya esta ejecutando un escaneo."),
                    executed=False,
                )
            self._running = True
            self._last_error = None

        owns_db = db is None
        owns_client = data_client is None
        current_time = now or datetime.now(tz=UTC)
        session = db or self._session_factory()
        client = data_client or self._data_client_factory()
        try:
            tick_result = self._tick_runner(
                session,
                data_client=client,
                limit=self._limit,
                now=current_time,
            )
            if owns_db:
                session.commit()
            result = CopyTradingWatcherLastResult.model_validate(tick_result.model_dump())
            with self._lock:
                self._last_run_at = current_time
                self._last_result = result
                self._next_run_at = (
                    current_time + timedelta(seconds=self._interval_seconds) if self._enabled else None
                )
            return CopyTradingWatcherRunResult(
                status=self.get_status(message="Watcher demo ejecuto un escaneo."),
                executed=True,
            )
        except Exception as exc:
            if owns_db:
                session.rollback()
            self._record_failure(session, str(exc), current_time)
            if owns_db:
                try:
                    session.commit()
                except Exception:
                    session.rollback()
            return CopyTradingWatcherRunResult(
                status=self.get_status(message="Watcher demo fallo al escanear."),
                executed=False,
            )
        finally:
            if owns_client and hasattr(client, "close"):
                client.close()
            if owns_db:
                session.close()
            with self._lock:
                self._running = False

    def reset_state(self) -> None:
        self.stop()
        with self._lock:
            self._last_run_at = None
            self._next_run_at = None
            self._last_result = None
            self._error_count = 0
            self._last_error = None

    def _watcher_loop(self) -> None:
        while not self._stop_event.is_set():
            self.run_once()
            if self._stop_event.wait(self._interval_seconds):
                break
        with self._lock:
            self._running = False
            self._next_run_at = None
            self._thread = None

    def _record_failure(
        self,
        db: Session,
        error_message: str,
        current_time: datetime,
    ) -> None:
        safe_message = error_message[:180] or "Watcher demo fallo."
        try:
            add_copy_event(
                db,
                wallet_id=None,
                level="error",
                event_type="demo_watcher_failed",
                message="Watcher demo no pudo completar el escaneo.",
                metadata={"diagnostic": safe_message},
            )
        except Exception:
            pass
        with self._lock:
            self._error_count += 1
            self._last_error = safe_message
            self._last_run_at = current_time
            self._next_run_at = (
                current_time + timedelta(seconds=self._interval_seconds) if self._enabled else None
            )


demo_watcher = CopyTradingDemoWatcher()
