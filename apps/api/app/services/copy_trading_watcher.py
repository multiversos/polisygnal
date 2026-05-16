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
    CopyTradingWatcherWalletScanResult,
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
        live_scan: bool = False,
    ) -> CopyTradingTickResponse:
        ...


def _default_data_client_factory() -> PolymarketDataClient:
    settings = get_settings()
    return PolymarketDataClient(
        base_url=settings.polymarket_data_base_url,
        gamma_base_url=settings.polymarket_base_url,
        timeout_seconds=min(settings.polymarket_data_timeout_seconds, 4.5),
        user_agent=settings.polymarket_user_agent,
    )


@dataclass(slots=True)
class CopyTradingWatcherRunResult:
    status: CopyTradingWatcherStatusResponse
    executed: bool


@dataclass(slots=True)
class WalletWatchHealth:
    consecutive_timeouts: int = 0
    last_duration_ms: int | None = None
    last_error: str | None = None
    last_priority: str = "normal"
    last_scanned_at: datetime | None = None
    last_status: str = "ok"


class CopyTradingDemoWatcher:
    def __init__(
        self,
        *,
        interval_seconds: int = 5,
        limit: int = 50,
        cycle_timeout_seconds: int | None = None,
        live_limit: int = 25,
        session_factory: SessionFactory = SessionLocal,
        data_client_factory: DataClientFactory = _default_data_client_factory,
        tick_runner: TickRunner = scan_copy_wallet,
    ) -> None:
        self._interval_seconds = interval_seconds
        self._limit = limit
        self._live_limit = max(1, min(live_limit, limit))
        self._cycle_timeout_seconds = max(cycle_timeout_seconds or (interval_seconds + 3), interval_seconds)
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
        self._wallet_health: dict[str, WalletWatchHealth] = {}

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
                cycle_budget_seconds=self._cycle_timeout_seconds,
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
            self._wallet_health = {}

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
        wallets = self._prioritize_wallets(wallets, reference_time=started_at)
        response = CopyTradingTickResponse()
        cycle_started_perf = perf_counter()
        slow_wallet_count = 0
        timed_out = False

        for index, wallet in enumerate(wallets):
            elapsed_ms = max(0, int((perf_counter() - cycle_started_perf) * 1000))
            if elapsed_ms >= self._cycle_timeout_seconds * 1000:
                timed_out = True
                remaining_wallets = wallets[index:]
                response.cycle_budget_exceeded = True
                response.skipped_wallets_due_to_budget += len(remaining_wallets)
                response.pending_wallets = len(remaining_wallets)
                response.errors.append("Watcher demo recorto el ciclo para no acumular retraso.")
                for pending_wallet in remaining_wallets:
                    pending_priority = self._priority_for_wallet(pending_wallet, reference_time=started_at)
                    response.wallet_scan_results.append(
                        CopyTradingWatcherWalletScanResult(
                            wallet_id=pending_wallet.id,
                            alias=pending_wallet.label,
                            wallet_address_short=_short_wallet_address(pending_wallet.proxy_wallet),
                            status="skipped",
                            priority=pending_priority,
                            next_scan_hint="Pendiente para proximo ciclo.",
                        )
                    )
                    self._update_wallet_health(
                        pending_wallet,
                        status="skipped",
                        duration_ms=None,
                        error_message=None,
                        priority=pending_priority,
                        scanned_at=started_at,
                    )
                self._record_cycle_truncated(
                    db,
                    duration_ms=elapsed_ms,
                    remaining_wallets=len(remaining_wallets),
                    slow_wallet_count=slow_wallet_count,
                )
                break

            wallet_started_perf = perf_counter()
            priority = self._priority_for_wallet(wallet, reference_time=started_at)
            partial: CopyTradingTickResponse | None = None
            wallet_status = "ok"
            error_message: str | None = None
            try:
                partial = self._tick_runner(
                    db,
                    wallet_id=wallet.id,
                    data_client=data_client,
                    limit=self._live_limit,
                    now=started_at,
                    emit_individual_skip_events=False,
                    live_scan=True,
                )
                if any("timeout" in error.lower() for error in partial.errors):
                    wallet_status = "timeout"
                    error_message = "Timeout al leer actividad publica."
                elif partial.errors:
                    wallet_status = "error"
                    error_message = partial.errors[0]
            except Exception as exc:
                wallet_status = "timeout" if _is_timeout_error(exc) else "error"
                error_message = _safe_error_message(str(exc))
                partial = CopyTradingTickResponse(wallets_scanned=1)
                if wallet_status == "timeout":
                    response.errors.append("Una wallet supero el tiempo maximo y se salto para seguir con el ciclo.")
                else:
                    response.errors.append("No se pudo leer actividad publica.")
            wallet_duration_ms = max(
                0,
                int((perf_counter() - wallet_started_perf) * 1000),
            )
            if wallet_status == "ok" and wallet_duration_ms > self._interval_seconds * 1000:
                wallet_status = "slow"
            if wallet_status in {"slow", "timeout"}:
                slow_wallet_count += 1
            _merge_tick_results(response, partial)
            if wallet_status == "timeout":
                self._timeout_count += 1
            wallet_result = CopyTradingWatcherWalletScanResult(
                wallet_id=wallet.id,
                alias=wallet.label,
                wallet_address_short=_short_wallet_address(wallet.proxy_wallet),
                status=wallet_status,
                duration_ms=wallet_duration_ms,
                trades_detected=partial.trades_detected,
                new_trades=partial.new_trades,
                orders_simulated=partial.orders_simulated,
                orders_skipped=partial.orders_skipped,
                historical_trades=partial.historical_trades,
                live_candidates=partial.live_candidates,
                timeout=wallet_status == "timeout",
                error_message=error_message,
                priority=priority,
                next_scan_hint=_next_scan_hint(
                    status=wallet_status,
                    historical_trades=partial.historical_trades,
                    trades_detected=partial.trades_detected,
                    live_limit=self._live_limit,
                ),
            )
            response.wallet_scan_results.append(wallet_result)
            self._update_wallet_health(
                wallet,
                status=wallet_status,
                duration_ms=wallet_duration_ms,
                error_message=error_message,
                priority=priority,
                scanned_at=started_at,
            )

        return response, slow_wallet_count, timed_out

    def _prioritize_wallets(self, wallets: list[CopyWallet], *, reference_time: datetime) -> list[CopyWallet]:
        priority_order = {"high": 0, "normal": 1, "low": 2}
        return sorted(
            wallets,
            key=lambda wallet: (
                priority_order[self._priority_for_wallet(wallet, reference_time=reference_time)],
                -(_utc_or_assume(wallet.last_trade_at).timestamp() if wallet.last_trade_at is not None else 0.0),
                -(_utc_or_assume(wallet.last_scan_at).timestamp() if wallet.last_scan_at is not None else 0.0),
                -(_utc_or_assume(wallet.updated_at).timestamp() if wallet.updated_at is not None else 0.0),
            ),
        )

    def _priority_for_wallet(self, wallet: CopyWallet, *, reference_time: datetime) -> str:
        health = self._wallet_health.get(wallet.id)
        if health is not None and health.consecutive_timeouts >= 2:
            return "low"
        last_trade_at = _utc_or_assume(wallet.last_trade_at) if wallet.last_trade_at is not None else None
        last_scan_at = _utc_or_assume(wallet.last_scan_at) if wallet.last_scan_at is not None else None
        if last_trade_at is not None and last_trade_at >= reference_time - timedelta(minutes=30):
            return "high"
        if last_scan_at is not None and last_scan_at >= reference_time - timedelta(minutes=10):
            return "high"
        if health is not None and health.last_status in {"timeout", "error"}:
            return "low"
        return "normal"

    def _record_cycle_truncated(
        self,
        db: Session,
        *,
        duration_ms: int,
        remaining_wallets: int,
        slow_wallet_count: int,
    ) -> None:
        add_copy_event(
            db,
            wallet_id=None,
            level="warning",
            event_type="demo_watcher_cycle_truncated",
            message="Watcher demo recorto el ciclo para no acumular retraso.",
            metadata={
                "duration_ms": duration_ms,
                "remaining_wallets": remaining_wallets,
                "slow_wallet_count": slow_wallet_count,
            },
        )

    def _update_wallet_health(
        self,
        wallet: CopyWallet,
        *,
        status: str,
        duration_ms: int | None,
        error_message: str | None,
        priority: str,
        scanned_at: datetime,
    ) -> None:
        health = self._wallet_health.get(wallet.id) or WalletWatchHealth()
        health.last_status = status
        health.last_duration_ms = duration_ms
        health.last_error = error_message
        health.last_priority = priority
        health.last_scanned_at = scanned_at
        if status == "timeout":
            health.consecutive_timeouts += 1
        elif status in {"ok", "slow"}:
            health.consecutive_timeouts = 0
        self._wallet_health[wallet.id] = health

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
    target.wallet_scan_results.extend(partial.wallet_scan_results)
    target.cycle_budget_exceeded = target.cycle_budget_exceeded or partial.cycle_budget_exceeded
    target.skipped_wallets_due_to_budget += partial.skipped_wallets_due_to_budget
    target.pending_wallets += partial.pending_wallets
    for reason, count in partial.skipped_reasons.items():
        target.skipped_reasons[reason] = target.skipped_reasons.get(reason, 0) + count
    target.errors.extend(partial.errors)


def _short_wallet_address(wallet: str) -> str:
    if len(wallet) <= 12:
        return wallet
    return f"{wallet[:6]}...{wallet[-4:]}"


def _safe_error_message(message: str | None) -> str | None:
    if not message:
        return None
    clean = " ".join(message.split()).strip()
    return clean[:180] if clean else None


def _is_timeout_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "timeout" in message or "timed out" in message or "readtimeout" in message


def _next_scan_hint(
    *,
    status: str,
    historical_trades: int,
    trades_detected: int,
    live_limit: int,
) -> str | None:
    if status == "timeout":
        return "Timeout reciente. Se reintentara en el proximo ciclo."
    if status == "slow":
        return "Wallet lenta. Se priorizaron wallets mas activas."
    if status == "skipped":
        return "Pendiente para proximo ciclo."
    if trades_detected >= live_limit:
        return "Se priorizaron trades recientes para mantener el escaneo live."
    return None


def _utc_or_assume(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
