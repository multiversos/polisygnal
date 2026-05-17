from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from math import ceil
from time import perf_counter
from typing import TextIO
from uuid import uuid4

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.session import SessionLocal, engine
from app.services.copy_trading_watcher import CopyTradingDemoWatcher
from app.services.copy_worker_state import (
    COPY_TRADING_WORKER_ID,
    acquire_worker_lock,
    get_or_create_worker_state,
    load_worker_state,
    mark_worker_loop_finished,
    mark_worker_loop_started,
    mark_worker_started,
    mark_worker_stopped,
    serialize_worker_state,
)

ALLOW_UNBOUNDED_LOOP_ENV = "POLYSIGNAL_COPY_WORKER_ALLOW_UNBOUNDED_LOOP"
ERROR_BACKOFF_ENV = "POLYSIGNAL_COPY_WORKER_ERROR_BACKOFF_SECONDS"
MAX_ERROR_BACKOFF_ENV = "POLYSIGNAL_COPY_WORKER_MAX_BACKOFF_SECONDS"


class CopyTradingWorkerCommand:
    def __init__(
        self,
        *,
        engine_instance: Engine = engine,
        session_factory: sessionmaker[Session] = SessionLocal,
        watcher_factory: callable | None = None,
        stdout: TextIO | None = None,
        stderr: TextIO | None = None,
        sleep_fn: callable | None = None,
        env: dict[str, str] | None = None,
    ) -> None:
        self._engine = engine_instance
        self._session_factory = session_factory
        self._watcher_factory = watcher_factory or self._build_default_watcher
        self._stdout = stdout or sys.stdout
        self._stderr = stderr or sys.stderr
        self._sleep_fn = sleep_fn or time.sleep
        self._env = env or os.environ
        self._stop_requested = False
        self._received_signal: str | None = None
        self._base_error_backoff_seconds = _float_env(self._env.get(ERROR_BACKOFF_ENV), default=5.0, minimum=0.0)
        self._max_error_backoff_seconds = _float_env(
            self._env.get(MAX_ERROR_BACKOFF_ENV),
            default=60.0,
            minimum=self._base_error_backoff_seconds,
        )

    def run(self, argv: Sequence[str] | None = None) -> int:
        parser = build_parser()
        args = parser.parse_args(list(argv) if argv is not None else None)
        self._validate_args(args, parser)
        owner_id = str(uuid4())
        lock_handle = acquire_worker_lock(self._engine, worker_id=COPY_TRADING_WORKER_ID)
        if lock_handle is None:
            payload = self._build_lock_unavailable_payload()
            self._emit_log("lock_unavailable", payload)
            self._stdout.write(json.dumps(payload) + "\n")
            return 0

        previous_handlers = self._install_signal_handlers()
        watcher = self._watcher_factory(args)
        final_status = "stopped"
        final_error: str | None = None
        final_state_written = False
        try:
            self._emit_log(
                "worker_started",
                {
                    "worker_id": COPY_TRADING_WORKER_ID,
                    "owner_id": owner_id,
                    "mode": "demo",
                    "loop": args.loop,
                    "once": args.once,
                    "max_loops": args.max_loops,
                    "forever": args.forever,
                    "sleep_seconds": args.sleep_seconds,
                },
            )
            self._update_state(lambda db: mark_worker_started(db, owner_id=owner_id))
            loops_completed = 0
            consecutive_error_loops = 0
            while True:
                if self._stop_requested:
                    break
                loop_started_at = datetime.now(tz=UTC)
                loop_started_perf = perf_counter()
                self._emit_log(
                    "cycle_started",
                    {
                        "owner_id": owner_id,
                        "loop_number": loops_completed + 1,
                        "started_at": loop_started_at.isoformat(),
                    },
                )
                self._update_state(
                    lambda db: mark_worker_loop_started(
                        db,
                        owner_id=owner_id,
                        now=loop_started_at,
                    )
                )
                result = watcher.run_once(now=loop_started_at)
                loop_finished_at = datetime.now(tz=UTC)
                cycle_duration_ms = max(0, int((perf_counter() - loop_started_perf) * 1000))
                success = result.executed
                error_message = None if success else (result.status.message or "copy_worker_cycle_failed")
                if success:
                    consecutive_error_loops = 0
                else:
                    consecutive_error_loops += 1
                last_result = _build_result_payload(
                    loop_number=loops_completed + 1,
                    duration_ms=cycle_duration_ms,
                    last_result=result.status.last_result.model_dump(mode="json")
                    if result.status.last_result is not None
                    else None,
                    error_message=error_message,
                )
                self._emit_log(
                    "cycle_finished",
                    {
                        "owner_id": owner_id,
                        "loop_number": loops_completed + 1,
                        "finished_at": loop_finished_at.isoformat(),
                        "success": success,
                        "wallets_scanned": (last_result or {}).get("wallets_scanned", 0),
                        "trades_detected": (last_result or {}).get("trades_detected", 0),
                        "orders_simulated": (last_result or {}).get("orders_simulated", 0),
                        "errors_count": len((last_result or {}).get("errors", [])),
                    },
                )
                self._update_state(
                    lambda db: mark_worker_loop_finished(
                        db,
                        owner_id=owner_id,
                        result_payload=last_result,
                        success=success,
                        error_message=error_message,
                        now=loop_finished_at,
                    )
                )
                loops_completed += 1
                if args.once:
                    break
                if args.max_loops is not None and loops_completed >= args.max_loops:
                    break
                if self._stop_requested:
                    break
                if not success:
                    backoff_seconds = min(
                        self._max_error_backoff_seconds,
                        self._base_error_backoff_seconds * (2 ** max(0, consecutive_error_loops - 1)),
                    )
                    if backoff_seconds > 0:
                        self._emit_log(
                            "cycle_backoff",
                            {
                                "owner_id": owner_id,
                                "loop_number": loops_completed,
                                "backoff_seconds": backoff_seconds,
                                "consecutive_errors": consecutive_error_loops,
                            },
                        )
                        self._sleep_until_next_cycle(backoff_seconds)
                        continue
                if args.sleep_seconds > 0:
                    self._sleep_until_next_cycle(args.sleep_seconds)

            self._update_state(
                lambda db: mark_worker_stopped(
                    db,
                    owner_id=owner_id,
                    final_status=final_status,
                    error_message=final_error,
                )
            )
            final_state_written = True
            payload = self._build_success_payload(owner_id=owner_id, loops_completed=loops_completed)
            self._emit_log(
                "worker_stopped",
                {
                    "owner_id": owner_id,
                    "status": final_status,
                    "loops_completed": loops_completed,
                    "received_signal": self._received_signal,
                },
            )
            self._stdout.write(json.dumps(payload) + "\n")
            return 0
        except KeyboardInterrupt:
            final_status = "stopped"
            final_error = "Interrupted by user."
            self._stdout.write(
                json.dumps(
                    {
                        "owner_id": owner_id,
                        "status": "stopped",
                        "message": "Interrupted by user.",
                    },
                )
                + "\n"
            )
            return 0
        except Exception as exc:
            final_status = "error"
            final_error = str(exc)
            self._stderr.write(
                json.dumps(
                    {
                        "owner_id": owner_id,
                        "status": "error",
                        "error": " ".join(str(exc).split())[:500],
                    },
                )
                + "\n"
            )
            return 1
        finally:
            self._restore_signal_handlers(previous_handlers)
            try:
                if not final_state_written:
                    self._update_state(
                        lambda db: mark_worker_stopped(
                            db,
                            owner_id=owner_id,
                            final_status=final_status,
                            error_message=final_error,
                        )
                    )
            finally:
                lock_handle.release()

    def _build_default_watcher(self, args: argparse.Namespace) -> CopyTradingDemoWatcher:
        interval_seconds = max(1, int(ceil(max(args.sleep_seconds, 0.0) or 1.0)))
        return CopyTradingDemoWatcher(interval_seconds=interval_seconds)

    def _validate_args(self, args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
        if not args.once and not args.loop:
            parser.error("Elige --once o --loop.")
        if args.once and args.loop:
            parser.error("Usa solo una de estas opciones: --once o --loop.")
        if args.max_loops is not None and not args.loop:
            parser.error("--max-loops solo aplica con --loop.")
        if args.forever and not args.loop:
            parser.error("--forever solo aplica con --loop.")
        if args.loop and args.max_loops is None and not args.forever and not _truthy_env(self._env.get(ALLOW_UNBOUNDED_LOOP_ENV)):
            parser.error(
                "Para usar --loop sin --max-loops debes pasar --forever o definir "
                f"{ALLOW_UNBOUNDED_LOOP_ENV}=true."
            )

    def _build_lock_unavailable_payload(self) -> dict[str, object]:
        state = self._read_state()
        return {
            "worker_id": COPY_TRADING_WORKER_ID,
            "status": "lock_unavailable",
            "message": "Otro worker ya tiene el advisory lock.",
            "state": state,
        }

    def _build_success_payload(self, *, owner_id: str, loops_completed: int) -> dict[str, object]:
        return {
            "worker_id": COPY_TRADING_WORKER_ID,
            "owner_id": owner_id,
            "status": "ok",
            "loops_completed": loops_completed,
            "state": self._read_state(),
            "stop_requested": self._stop_requested,
            "received_signal": self._received_signal,
        }

    def _read_state(self) -> dict[str, object] | None:
        session = self._session_factory()
        try:
            return serialize_worker_state(load_worker_state(session))
        finally:
            session.close()

    def _update_state(self, callback: callable) -> None:
        session = self._session_factory()
        try:
            get_or_create_worker_state(session)
            callback(session)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _install_signal_handlers(self) -> dict[int, object]:
        previous_handlers: dict[int, object] = {}
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[sig] = signal.getsignal(sig)
            signal.signal(sig, self._handle_signal)
        return previous_handlers

    def _restore_signal_handlers(self, previous_handlers: dict[int, object]) -> None:
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)

    def _handle_signal(self, signum: int, _frame: object) -> None:
        self._received_signal = signal.Signals(signum).name
        self._stop_requested = True

    def _sleep_until_next_cycle(self, total_seconds: float) -> None:
        remaining = max(0.0, total_seconds)
        while remaining > 0 and not self._stop_requested:
            interval = min(remaining, 0.25)
            self._sleep_fn(interval)
            remaining -= interval

    def _emit_log(self, event: str, payload: dict[str, object]) -> None:
        safe_payload = {
            "event": event,
            "worker_id": COPY_TRADING_WORKER_ID,
            "demo_only": True,
            **payload,
        }
        self._stdout.write(json.dumps(safe_payload) + "\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Copy Trading worker demo-only con advisory lock y heartbeat persistido.",
    )
    parser.add_argument("--once", action="store_true", help="Ejecuta un solo ciclo reutilizando el watcher demo.")
    parser.add_argument("--loop", action="store_true", help="Ejecuta ciclos consecutivos hasta stop o max-loops.")
    parser.add_argument("--forever", action="store_true", help="Permite loop sin max-loops de forma explicita.")
    parser.add_argument("--max-loops", type=int, default=None, help="Corta el loop despues de N ciclos.")
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=5.0,
        help="Segundos de espera entre ciclos cuando se usa --loop.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    command = CopyTradingWorkerCommand()
    return command.run(argv)


def _truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _float_env(value: str | None, *, default: float, minimum: float) -> float:
    if value is None:
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return max(minimum, parsed)


def _build_result_payload(
    *,
    loop_number: int,
    duration_ms: int,
    last_result: dict[str, object] | None,
    error_message: str | None,
) -> dict[str, object]:
    payload = last_result or {}
    errors = payload.get("errors", [])
    error_list = errors if isinstance(errors, list) else []
    return {
        "loops_completed": loop_number,
        "wallets_scanned": payload.get("wallets_scanned", 0),
        "trades_detected": payload.get("trades_detected", 0),
        "demo_orders_created": payload.get("orders_simulated", 0),
        "positions_opened": payload.get("buy_simulated", 0),
        "positions_closed": payload.get("sell_simulated", 0),
        "settlement_checked": payload.get("settlement_checked", 0),
        "duration_ms": duration_ms,
        "errors_count": len(error_list) + (1 if error_message and not error_list else 0),
    }


if __name__ == "__main__":
    raise SystemExit(main())
