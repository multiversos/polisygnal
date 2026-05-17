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

    def run(self, argv: Sequence[str] | None = None) -> int:
        parser = build_parser()
        args = parser.parse_args(list(argv) if argv is not None else None)
        self._validate_args(args, parser)
        owner_id = str(uuid4())
        lock_handle = acquire_worker_lock(self._engine, worker_id=COPY_TRADING_WORKER_ID)
        if lock_handle is None:
            payload = self._build_lock_unavailable_payload()
            self._stdout.write(json.dumps(payload, indent=2) + "\n")
            return 0

        previous_handlers = self._install_signal_handlers()
        watcher = self._watcher_factory(args)
        final_status = "stopped"
        final_error: str | None = None
        final_state_written = False
        try:
            self._update_state(lambda db: mark_worker_started(db, owner_id=owner_id))
            loops_completed = 0
            while True:
                if self._stop_requested:
                    break
                loop_started_at = datetime.now(tz=UTC)
                self._update_state(
                    lambda db: mark_worker_loop_started(
                        db,
                        owner_id=owner_id,
                        now=loop_started_at,
                    )
                )
                result = watcher.run_once(now=loop_started_at)
                loop_finished_at = datetime.now(tz=UTC)
                success = result.executed
                error_message = None if success else (result.status.message or "copy_worker_cycle_failed")
                last_result = result.status.last_result.model_dump(mode="json") if result.status.last_result is not None else None
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
                if args.sleep_seconds > 0:
                    self._sleep_fn(args.sleep_seconds)

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
            self._stdout.write(json.dumps(payload, indent=2) + "\n")
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
                    indent=2,
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
                    indent=2,
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
        if args.loop and args.max_loops is None and not _truthy_env(self._env.get(ALLOW_UNBOUNDED_LOOP_ENV)):
            parser.error(
                "Para usar --loop sin --max-loops debes definir "
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Copy Trading worker demo-only con advisory lock y heartbeat persistido.",
    )
    parser.add_argument("--once", action="store_true", help="Ejecuta un solo ciclo reutilizando el watcher demo.")
    parser.add_argument("--loop", action="store_true", help="Ejecuta ciclos consecutivos hasta stop o max-loops.")
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


if __name__ == "__main__":
    raise SystemExit(main())
