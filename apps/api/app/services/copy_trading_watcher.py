from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import perf_counter
from threading import Event, RLock, Thread
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.polymarket import PolymarketGammaClient
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
from app.services.copy_trading_demo_settlement import settle_open_demo_positions
from app.services.copy_trading_service import add_copy_event


class SessionFactory(Protocol):
    def __call__(self) -> Session:
        ...


class DataClientFactory(Protocol):
    def __call__(self) -> PolymarketDataClient:
        ...


class GammaClientFactory(Protocol):
    def __call__(self) -> PolymarketGammaClient:
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


def _default_gamma_client_factory() -> PolymarketGammaClient:
    settings = get_settings()
    return PolymarketGammaClient.from_settings(settings)


@dataclass(slots=True)
class CopyTradingWatcherRunResult:
    status: CopyTradingWatcherStatusResponse
    executed: bool


@dataclass(slots=True)
class WalletWatchHealth:
    consecutive_timeouts: int = 0
    consecutive_slow_scans: int = 0
    last_duration_ms: int | None = None
    last_error: str | None = None
    last_priority: str = "normal"
    last_scanned_at: datetime | None = None
    last_status: str = "scanned_ok"
    last_reason: str | None = None
    pending_budget_streak: int = 0
    pending_priority_streak: int = 0


class CopyTradingDemoWatcher:
    def __init__(
        self,
        *,
        interval_seconds: int = 5,
        limit: int = 50,
        cycle_timeout_seconds: int | None = None,
        live_limit: int = 25,
        settlement_interval_seconds: int = 120,
        session_factory: SessionFactory = SessionLocal,
        data_client_factory: DataClientFactory = _default_data_client_factory,
        gamma_client_factory: GammaClientFactory = _default_gamma_client_factory,
        tick_runner: TickRunner = scan_copy_wallet,
    ) -> None:
        self._interval_seconds = interval_seconds
        self._limit = limit
        self._live_limit = max(1, min(live_limit, limit))
        self._cycle_timeout_seconds = max(cycle_timeout_seconds or (interval_seconds + 3), interval_seconds)
        self._settlement_interval_seconds = max(settlement_interval_seconds, 30)
        self._session_factory = session_factory
        self._data_client_factory = data_client_factory
        self._gamma_client_factory = gamma_client_factory
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
        self._last_settlement_run_at: datetime | None = None
        self._error_count = 0
        self._scanned_wallet_count = 0
        self._slow_wallet_count = 0
        self._timeout_count = 0
        self._errored_wallet_count = 0
        self._skipped_due_to_budget_count = 0
        self._skipped_due_to_priority_count = 0
        self._pending_wallet_count = 0
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
                scanned_wallet_count=self._scanned_wallet_count,
                slow_wallet_count=self._slow_wallet_count,
                timeout_count=self._timeout_count,
                errored_wallet_count=self._errored_wallet_count,
                skipped_due_to_budget_count=self._skipped_due_to_budget_count,
                skipped_due_to_priority_count=self._skipped_due_to_priority_count,
                pending_wallet_count=self._pending_wallet_count,
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
            tick_result = self._run_cycle(
                session,
                data_client=client,
                started_at=current_time,
            )
            self._maybe_run_demo_settlement(session, current_time=current_time)
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
                self._scanned_wallet_count = result.scanned_wallet_count
                self._slow_wallet_count = result.slow_wallet_count
                self._timeout_count = result.timeout_count
                self._errored_wallet_count = result.errored_wallet_count
                self._skipped_due_to_budget_count = result.skipped_due_to_budget_count
                self._skipped_due_to_priority_count = result.skipped_due_to_priority_count
                self._pending_wallet_count = result.pending_wallet_count
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
            self._last_settlement_run_at = None
            self._error_count = 0
            self._scanned_wallet_count = 0
            self._slow_wallet_count = 0
            self._timeout_count = 0
            self._errored_wallet_count = 0
            self._skipped_due_to_budget_count = 0
            self._skipped_due_to_priority_count = 0
            self._pending_wallet_count = 0
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
    ) -> CopyTradingTickResponse:
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
        focus_target = max(4, min(6, len(wallets)))

        for index, wallet in enumerate(wallets):
            priority = self._priority_for_wallet(wallet, reference_time=started_at)
            if self._should_defer_for_priority(
                wallet,
                priority=priority,
                scanned_wallet_count=response.scanned_wallet_count,
                focus_target=focus_target,
            ):
                self._append_skipped_wallet_result(
                    response,
                    wallet,
                    status="skipped_priority",
                    reason="Pendiente: baja prioridad en este ciclo.",
                    skipped_reason="priority",
                    priority=priority,
                    reference_time=started_at,
                )
                continue

            elapsed_ms = max(0, int((perf_counter() - cycle_started_perf) * 1000))
            if elapsed_ms >= self._cycle_timeout_seconds * 1000:
                remaining_wallets = wallets[index:]
                response.cycle_budget_exceeded = True
                response.errors.append("Watcher demo recorto el ciclo para no acumular retraso.")
                for pending_wallet in remaining_wallets:
                    pending_priority = self._priority_for_wallet(
                        pending_wallet,
                        reference_time=started_at,
                    )
                    skipped_status = (
                        "skipped_priority"
                        if self._should_defer_for_priority(
                            pending_wallet,
                            priority=pending_priority,
                            scanned_wallet_count=response.scanned_wallet_count,
                            focus_target=focus_target,
                        )
                        else "skipped_budget"
                    )
                    skipped_reason = "priority" if skipped_status == "skipped_priority" else "budget"
                    reason = (
                        "Pendiente: baja prioridad en este ciclo."
                        if skipped_status == "skipped_priority"
                        else "Pendiente: ciclo recortado por carga."
                    )
                    self._append_skipped_wallet_result(
                        response,
                        pending_wallet,
                        status=skipped_status,
                        reason=reason,
                        skipped_reason=skipped_reason,
                        priority=pending_priority,
                        reference_time=started_at,
                    )
                self._record_cycle_truncated(
                    db,
                    duration_ms=elapsed_ms,
                    remaining_wallets=len(remaining_wallets),
                    slow_wallet_count=response.slow_wallet_count,
                )
                break

            wallet_started_perf = perf_counter()
            partial: CopyTradingTickResponse | None = None
            wallet_status = "scanned_ok"
            error_message: str | None = None
            reason = "Escaneada correctamente."
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
                    reason = "Timeout: supero el tiempo maximo permitido."
                elif partial.errors:
                    wallet_status = "error"
                    error_message = partial.errors[0]
                    reason = "Error: no se pudo leer actividad publica."
            except Exception as exc:
                wallet_status = "timeout" if _is_timeout_error(exc) else "error"
                error_message = _safe_error_message(str(exc))
                reason = (
                    "Timeout: supero el tiempo maximo permitido."
                    if wallet_status == "timeout"
                    else "Error: no se pudo leer actividad publica."
                )
                partial = CopyTradingTickResponse(wallets_scanned=1)
                if wallet_status == "timeout":
                    response.errors.append("Una wallet supero el tiempo maximo y se salto para seguir con el ciclo.")
                else:
                    response.errors.append("No se pudo leer actividad publica.")
            wallet_duration_ms = max(
                0,
                int((perf_counter() - wallet_started_perf) * 1000),
            )
            if wallet_status == "scanned_ok" and wallet_duration_ms > self._interval_seconds * 1000:
                wallet_status = "slow"
                reason = f"Lenta: tardo {wallet_duration_ms / 1000:.1f}s."
            _merge_tick_results(response, partial)
            response.scanned_wallet_count += 1
            if wallet_status == "slow":
                response.slow_wallet_count += 1
            elif wallet_status == "timeout":
                response.timeout_count += 1
            elif wallet_status == "error":
                response.errored_wallet_count += 1
            wallet_result = CopyTradingWatcherWalletScanResult(
                wallet_id=wallet.id,
                alias=wallet.label,
                wallet_address_short=_short_wallet_address(wallet.proxy_wallet),
                status=wallet_status,
                reason=reason,
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
                skipped_reason=None,
                last_scanned_at=started_at,
                consecutive_timeouts=self._peek_consecutive_timeouts(wallet.id, wallet_status),
                consecutive_slow_scans=self._peek_consecutive_slow_scans(wallet.id, wallet_status),
            )
            response.wallet_scan_results.append(wallet_result)
            self._update_wallet_health(
                wallet,
                status=wallet_status,
                duration_ms=wallet_duration_ms,
                error_message=error_message,
                priority=priority,
                scanned_at=started_at,
                reason=reason,
            )

        response.pending_wallets = response.pending_wallet_count
        response.skipped_wallets_due_to_budget = response.skipped_due_to_budget_count
        return response

    def _maybe_run_demo_settlement(self, db: Session, *, current_time: datetime) -> None:
        with self._lock:
            last_run = self._last_settlement_run_at
        if last_run is not None and current_time < last_run + timedelta(seconds=self._settlement_interval_seconds):
            return
        gamma_client = self._gamma_client_factory()
        try:
            settle_open_demo_positions(db, gamma_client=gamma_client, now=current_time, limit=20)
            with self._lock:
                self._last_settlement_run_at = current_time
        except Exception:
            add_copy_event(
                db,
                wallet_id=None,
                level="warning",
                event_type="demo_settlement_failed",
                message="No pudimos revisar resoluciones demo en este ciclo.",
            )
        finally:
            gamma_client.close()

    def _prioritize_wallets(self, wallets: list[CopyWallet], *, reference_time: datetime) -> list[CopyWallet]:
        return sorted(
            wallets,
            key=lambda wallet: self._wallet_sort_key(wallet, reference_time=reference_time),
        )

    def _priority_for_wallet(self, wallet: CopyWallet, *, reference_time: datetime) -> str:
        health = self._wallet_health.get(wallet.id)
        if health is not None and health.consecutive_timeouts >= 2:
            return "low"
        last_trade_at = _utc_or_assume(wallet.last_trade_at) if wallet.last_trade_at is not None else None
        if last_trade_at is not None and last_trade_at >= reference_time - timedelta(minutes=30):
            return "high"
        if health is not None and health.last_status in {"timeout", "error"}:
            return "low"
        return "normal"

    def _wallet_sort_key(self, wallet: CopyWallet, *, reference_time: datetime) -> tuple[float, ...]:
        priority = self._priority_for_wallet(wallet, reference_time=reference_time)
        health = self._wallet_health.get(wallet.id)
        bucket = self._scheduling_bucket(priority=priority, health=health)
        pending_boost = (health.pending_budget_streak + health.pending_priority_streak) if health else 0
        last_scan_reference = health.last_scanned_at if health and health.last_scanned_at is not None else wallet.last_scan_at
        last_scan_rank = _utc_or_assume(last_scan_reference).timestamp() if last_scan_reference is not None else -1.0
        last_trade_rank = (
            -_utc_or_assume(wallet.last_trade_at).timestamp() if wallet.last_trade_at is not None else 0.0
        )
        updated_rank = -_utc_or_assume(wallet.updated_at).timestamp() if wallet.updated_at is not None else 0.0
        return (
            float(bucket),
            float(-pending_boost),
            last_scan_rank,
            last_trade_rank,
            updated_rank,
        )

    def _scheduling_bucket(self, *, priority: str, health: WalletWatchHealth | None) -> int:
        if priority == "high":
            return 0
        if (
            health is not None
            and health.last_status in {"skipped_budget", "skipped_priority"}
            and health.consecutive_timeouts < 2
        ):
            return 1
        if priority == "normal":
            return 2
        return 3

    def _should_defer_for_priority(
        self,
        wallet: CopyWallet,
        *,
        priority: str,
        scanned_wallet_count: int,
        focus_target: int,
    ) -> bool:
        if priority != "low":
            return False
        health = self._wallet_health.get(wallet.id)
        if health is not None and health.last_status in {"skipped_budget", "skipped_priority"}:
            return False
        return scanned_wallet_count >= focus_target

    def _append_skipped_wallet_result(
        self,
        response: CopyTradingTickResponse,
        wallet: CopyWallet,
        *,
        status: str,
        reason: str,
        skipped_reason: str,
        priority: str,
        reference_time: datetime,
    ) -> None:
        response.wallet_scan_results.append(
            CopyTradingWatcherWalletScanResult(
                wallet_id=wallet.id,
                alias=wallet.label,
                wallet_address_short=_short_wallet_address(wallet.proxy_wallet),
                status=status,
                reason=reason,
                priority=priority,
                timeout=False,
                next_scan_hint=(
                    "Pendiente por carga. Volvera en el proximo ciclo."
                    if status == "skipped_budget"
                    else "Pendiente por prioridad. Volvera en el proximo ciclo."
                ),
                skipped_reason=skipped_reason,
                last_scanned_at=self._wallet_last_scanned_at(wallet),
                consecutive_timeouts=self._peek_consecutive_timeouts(wallet.id, status),
                consecutive_slow_scans=self._peek_consecutive_slow_scans(wallet.id, status),
            )
        )
        response.pending_wallet_count += 1
        if status == "skipped_budget":
            response.skipped_due_to_budget_count += 1
        elif status == "skipped_priority":
            response.skipped_due_to_priority_count += 1
        self._update_wallet_health(
            wallet,
            status=status,
            duration_ms=None,
            error_message=None,
            priority=priority,
            scanned_at=reference_time,
            reason=reason,
        )

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
        reason: str | None,
    ) -> None:
        health = self._wallet_health.get(wallet.id) or WalletWatchHealth()
        health.last_status = status
        health.last_duration_ms = duration_ms
        health.last_error = error_message
        health.last_priority = priority
        health.last_reason = reason
        if status not in {"skipped_budget", "skipped_priority"}:
            health.last_scanned_at = scanned_at
        if status == "timeout":
            health.consecutive_timeouts += 1
            health.pending_budget_streak = 0
            health.pending_priority_streak = 0
        elif status in {"scanned_ok", "slow"}:
            health.consecutive_timeouts = 0
            health.pending_budget_streak = 0
            health.pending_priority_streak = 0
        if status == "slow":
            health.consecutive_slow_scans += 1
        elif status == "scanned_ok":
            health.consecutive_slow_scans = 0
        if status == "skipped_budget":
            health.pending_budget_streak += 1
        elif status != "timeout":
            health.pending_budget_streak = 0
        if status == "skipped_priority":
            health.pending_priority_streak += 1
        elif status not in {"timeout", "skipped_budget"}:
            health.pending_priority_streak = 0
        self._wallet_health[wallet.id] = health

    def _wallet_last_scanned_at(self, wallet: CopyWallet) -> datetime | None:
        health = self._wallet_health.get(wallet.id)
        if health is not None and health.last_scanned_at is not None:
            return health.last_scanned_at
        if wallet.last_scan_at is None:
            return None
        return _utc_or_assume(wallet.last_scan_at)

    def _peek_consecutive_timeouts(self, wallet_id: str, next_status: str) -> int:
        health = self._wallet_health.get(wallet_id)
        current = health.consecutive_timeouts if health is not None else 0
        if next_status == "timeout":
            return current + 1
        if next_status in {"scanned_ok", "slow"}:
            return 0
        return current

    def _peek_consecutive_slow_scans(self, wallet_id: str, next_status: str) -> int:
        health = self._wallet_health.get(wallet_id)
        current = health.consecutive_slow_scans if health is not None else 0
        if next_status == "slow":
            return current + 1
        if next_status == "scanned_ok":
            return 0
        return current

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
    target.scanned_wallet_count += partial.scanned_wallet_count
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
    target.slow_wallet_count += partial.slow_wallet_count
    target.timeout_count += partial.timeout_count
    target.errored_wallet_count += partial.errored_wallet_count
    target.skipped_due_to_budget_count += partial.skipped_due_to_budget_count
    target.skipped_due_to_priority_count += partial.skipped_due_to_priority_count
    target.pending_wallet_count += partial.pending_wallet_count
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
    if status == "skipped_budget":
        return "Pendiente por carga. Volvera en el proximo ciclo."
    if status == "skipped_priority":
        return "Pendiente por prioridad. Volvera en el proximo ciclo."
    if trades_detected >= live_limit:
        return "Se priorizaron trades recientes para mantener el escaneo live."
    return None


def _utc_or_assume(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
