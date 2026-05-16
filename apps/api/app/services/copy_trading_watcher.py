from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import perf_counter
from threading import Event, RLock, Thread
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.polymarket_data import PolymarketDataClient
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.copy_trading import CopyWallet
from app.schemas.copy_trading import (
    CopyTradingTickResponse,
    CopyTradingWatcherLastResult,
    CopyTradingWatcherStatusResponse,
)
from app.services.copy_trading_demo_engine import scan_copy_wallet
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
        wallet_id: str,
        data_client: PolymarketDataClient,
        limit: int = 50,
        now: datetime | None = None,
        emit_individual_skip_events: bool = True,
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
        interval_seconds: int = 5,
        limit: int = 50,
        cycle_timeout_seconds: int | None = None,
        session_factory: SessionFactory = SessionLocal,
        data_client_factory: DataClientFactory = _default_data_client_factory,
        tick_runner: TickRunner = scan_copy_wallet,
    ) -> None:
        self._interval_seconds = interval_seconds
        self._limit = limit
        self._cycle_timeout_seconds = max(cycle_timeout_seconds or interval_seconds * 3, interval_seconds)
        self._session_factory = session_factory
        self._data_client_factory = data_client_factory
        self._tick_runner = tick_runner
        self._lock = RLock()
        self._enabled = False
        self._running = False
        self._thread: Thread | None = None
        self._stop_event = Event()
        self._current_run_started_at: datetime | None = None
        self._last_run_started_at: datetime | None = None
        self._last_run_at: datetime | None = None
        self._last_run_finished_at: datetime | None = None
        self._last_run_duration_ms: int | None = None
        self._total_run_duration_ms = 0
        self._run_count = 0
        self._next_run_at: datetime | None = None
        self._last_result: CopyTradingWatcherLastResult | None = None
        self._error_count = 0
        self._slow_wallet_count = 0
        self._timeout_count = 0
        self._last_error: str | None = None

    def get_status(self, *, message: str | None = None) -> CopyTradingWatcherStatusResponse:
        with self._lock:
            average_run_duration_ms = (
                int(self._total_run_duration_ms / self._run_count) if self._run_count > 0 else None
            )
            last_duration_ms = self._last_run_duration_ms
            behind_by_seconds = 0
            if last_duration_ms is not None:
                behind_by_seconds = max(0, int((last_duration_ms - self._interval_seconds * 1000) / 1000))
            return CopyTradingWatcherStatusResponse(
                enabled=self._enabled,
                running=self._running,
                interval_seconds=self._interval_seconds,
                current_run_started_at=self._current_run_started_at,
                last_run_started_at=self._last_run_started_at,
                last_run_at=self._last_run_at,
                last_run_finished_at=self._last_run_finished_at,
                last_run_duration_ms=last_duration_ms,
                average_run_duration_ms=average_run_duration_ms,
                next_run_at=self._next_run_at if self._enabled else None,
                last_result=self._last_result,
                error_count=self._error_count,
                slow_wallet_count=self._slow_wallet_count,
                timeout_count=self._timeout_count,
                is_over_interval=bool(last_duration_ms is not None and last_duration_ms > self._interval_seconds * 1000),
                behind_by_seconds=behind_by_seconds,
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
            self._current_run_started_at = now or datetime.now(tz=UTC)
            self._last_run_started_at = self._current_run_started_at
            self._next_run_at = self._current_run_started_at + timedelta(seconds=self._interval_seconds)
            self._last_error = None

        owns_db = db is None
        owns_client = data_client is None
        current_time = self._current_run_started_at or now or datetime.now(tz=UTC)
        run_started_perf = perf_counter()
        session = db or self._session_factory()
        client = data_client or self._data_client_factory()
        try:
            tick_result, slow_wallet_count, timed_out = self._run_cycle(
                session,
                data_client=client,
                started_at=current_time,
            )
            if owns_db:
                session.commit()
            result = CopyTradingWatcherLastResult.model_validate(tick_result.model_dump())
            finished_at = now or datetime.now(tz=UTC)
            duration_ms = max(0, int((perf_counter() - run_started_perf) * 1000))
            with self._lock:
                self._last_run_at = finished_at
                self._last_run_finished_at = finished_at
                self._last_run_duration_ms = duration_ms
                self._total_run_duration_ms += duration_ms
                self._run_count += 1
                self._last_result = result
                self._slow_wallet_count = slow_wallet_count
                if timed_out:
                    self._timeout_count += 1
                self._next_run_at = (
                    max(finished_at, current_time + timedelta(seconds=self._interval_seconds))
                    if self._enabled
                    else None
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
                self._current_run_started_at = None

    def reset_state(self) -> None:
        self.stop()
        with self._lock:
            self._current_run_started_at = None
            self._last_run_started_at = None
            self._last_run_at = None
            self._last_run_finished_at = None
            self._last_run_duration_ms = None
            self._total_run_duration_ms = 0
            self._run_count = 0
            self._next_run_at = None
            self._last_result = None
            self._error_count = 0
            self._slow_wallet_count = 0
            self._timeout_count = 0
            self._last_error = None

    def _watcher_loop(self) -> None:
        while not self._stop_event.is_set():
            run_result = self.run_once()
            with self._lock:
                next_run_at = self._next_run_at
            if self._stop_event.is_set():
                break
            if not run_result.executed or next_run_at is None:
                if self._stop_event.wait(self._interval_seconds):
                    break
                continue
            wait_seconds = max(0.0, (next_run_at - datetime.now(tz=UTC)).total_seconds())
            if self._stop_event.wait(wait_seconds):
                break
        with self._lock:
            self._running = False
            self._current_run_started_at = None
            self._next_run_at = None
            self._thread = None

    def _run_cycle(
        self,
        db: Session,
        *,
        data_client: PolymarketDataClient,
        started_at: datetime,
    ) -> tuple[CopyTradingTickResponse, int, bool]:
        wallets = list(
            db.scalars(
                select(CopyWallet)
                .where(CopyWallet.enabled.is_(True))
                .where(CopyWallet.mode == "demo")
                .order_by(CopyWallet.updated_at.desc())
            ).all()
        )
        response = CopyTradingTickResponse()
        cycle_started_perf = perf_counter()
        slow_wallet_count = 0
        timed_out = False

        for index, wallet in enumerate(wallets):
            wallet_started_perf = perf_counter()
            partial = self._tick_runner(
                db,
                wallet_id=wallet.id,
                data_client=data_client,
                limit=self._limit,
                now=started_at,
                emit_individual_skip_events=False,
            )
            wallet_duration_ms = max(
                0,
                int((perf_counter() - wallet_started_perf) * 1000),
            )
            if wallet_duration_ms > self._interval_seconds * 1000:
                slow_wallet_count += 1
            _merge_tick_results(response, partial)
            if (perf_counter() - cycle_started_perf) >= self._cycle_timeout_seconds and index < len(wallets) - 1:
                timed_out = True
                response.errors.append("Watcher demo recorto el ciclo para no acumular retraso.")
                add_copy_event(
                    db,
                    wallet_id=None,
                    level="warning",
                    event_type="demo_watcher_cycle_truncated",
                    message="Watcher demo recorto el ciclo para no acumular retraso.",
                    metadata={
                        "duration_ms": max(0, int((perf_counter() - cycle_started_perf) * 1000)),
                        "remaining_wallets": len(wallets) - index - 1,
                        "slow_wallet_count": slow_wallet_count,
                    },
                )
                break

        return response, slow_wallet_count, timed_out

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
            self._last_run_finished_at = current_time
            self._last_run_duration_ms = 0
            self._next_run_at = (
                current_time + timedelta(seconds=self._interval_seconds) if self._enabled else None
            )


demo_watcher = CopyTradingDemoWatcher()


def _merge_tick_results(target: CopyTradingTickResponse, partial: CopyTradingTickResponse) -> None:
    target.wallets_scanned += partial.wallets_scanned
    target.trades_detected += partial.trades_detected
    target.new_trades += partial.new_trades
    target.orders_simulated += partial.orders_simulated
    target.buy_simulated += partial.buy_simulated
    target.sell_simulated += partial.sell_simulated
    target.orders_skipped += partial.orders_skipped
    target.orders_blocked += partial.orders_blocked
    target.live_candidates += partial.live_candidates
    target.recent_outside_window += partial.recent_outside_window
    target.historical_trades += partial.historical_trades
    for reason, count in partial.skipped_reasons.items():
        target.skipped_reasons[reason] = target.skipped_reasons.get(reason, 0) + count
    target.errors.extend(partial.errors)
