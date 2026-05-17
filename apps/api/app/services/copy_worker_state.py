from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock

from sqlalchemy import select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.models.copy_worker_state import CopyWorkerState
from app.schemas.copy_trading import (
    CopyTradingWatcherLastResult,
    CopyTradingWatcherStatusResponse,
)

COPY_TRADING_WORKER_ID = "copy_trading_demo"
COPY_TRADING_WORKER_LOCK_KEY = 2_021_051_700
COPY_TRADING_WORKER_STALE_AFTER_SECONDS = 30

_LOCAL_LOCKS_GUARD = Lock()
_LOCAL_LOCKS: dict[str, Lock] = {}
_DATABASE_URL_PATTERN = re.compile(r"(postgresql(?:\+\w+)?://|sqlite\+\w+://)[^\s]+", re.IGNORECASE)
_DATABASE_URL_ASSIGNMENT_PATTERN = re.compile(r"(DATABASE_URL\s*=\s*)(\S+)", re.IGNORECASE)


@dataclass(slots=True)
class WorkerLockHandle:
    worker_id: str
    backend: str
    lock_key: int
    connection: Connection | None = None
    local_lock: Lock | None = None
    released: bool = False

    def release(self) -> None:
        if self.released:
            return
        if self.connection is not None:
            try:
                self.connection.execute(
                    text("SELECT pg_advisory_unlock(:key)"),
                    {"key": self.lock_key},
                )
            finally:
                self.connection.close()
        if self.local_lock is not None:
            self.local_lock.release()
        self.released = True


def acquire_worker_lock(
    engine: Engine,
    *,
    worker_id: str = COPY_TRADING_WORKER_ID,
    lock_key: int = COPY_TRADING_WORKER_LOCK_KEY,
) -> WorkerLockHandle | None:
    if engine.dialect.name == "postgresql":
        connection = engine.connect()
        acquired = bool(
            connection.execute(
                text("SELECT pg_try_advisory_lock(:key)"),
                {"key": lock_key},
            ).scalar()
        )
        if not acquired:
            connection.close()
            return None
        return WorkerLockHandle(
            worker_id=worker_id,
            backend="postgresql",
            lock_key=lock_key,
            connection=connection,
        )

    with _LOCAL_LOCKS_GUARD:
        local_lock = _LOCAL_LOCKS.setdefault(worker_id, Lock())
    acquired = local_lock.acquire(blocking=False)
    if not acquired:
        return None
    return WorkerLockHandle(
        worker_id=worker_id,
        backend="local",
        lock_key=lock_key,
        local_lock=local_lock,
    )


def get_or_create_worker_state(
    db: Session,
    *,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState:
    state = db.get(CopyWorkerState, worker_id)
    if state is not None:
        return state
    state = CopyWorkerState(id=worker_id, status="idle", consecutive_errors=0)
    db.add(state)
    db.flush()
    db.refresh(state)
    return state


def mark_worker_started(
    db: Session,
    *,
    owner_id: str,
    now: datetime | None = None,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState:
    from app.services.copy_trading_service import add_copy_event

    current_time = _utc_now(now)
    state = get_or_create_worker_state(db, worker_id=worker_id)
    state.owner_id = owner_id
    state.status = "running"
    state.started_at = current_time
    state.stopped_at = None
    state.last_heartbeat_at = current_time
    state.last_error = None
    db.add(state)
    add_copy_event(
        db,
        wallet_id=None,
        level="info",
        event_type="copy_worker_started",
        message="Copy Trading worker demo iniciado.",
        metadata={"owner_id": owner_id},
    )
    return state


def mark_worker_loop_started(
    db: Session,
    *,
    owner_id: str,
    now: datetime | None = None,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState:
    current_time = _utc_now(now)
    state = get_or_create_worker_state(db, worker_id=worker_id)
    state.owner_id = owner_id
    state.status = "running"
    state.last_heartbeat_at = current_time
    state.last_loop_started_at = current_time
    db.add(state)
    return state


def mark_worker_loop_finished(
    db: Session,
    *,
    owner_id: str,
    result_payload: dict[str, object] | None,
    success: bool,
    error_message: str | None = None,
    now: datetime | None = None,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState:
    from app.services.copy_trading_service import add_copy_event

    current_time = _utc_now(now)
    state = get_or_create_worker_state(db, worker_id=worker_id)
    state.owner_id = owner_id
    state.status = "running"
    state.last_heartbeat_at = current_time
    state.last_loop_finished_at = current_time
    state.last_result_json = result_payload
    if success:
        state.last_success_at = current_time
        state.last_error = None
        state.consecutive_errors = 0
    else:
        state.last_error = _safe_error(error_message)
        state.consecutive_errors += 1
        add_copy_event(
            db,
            wallet_id=None,
            level="error",
            event_type="copy_worker_cycle_failed",
            message="Copy Trading worker demo fallo en un ciclo.",
            metadata={"owner_id": owner_id, "diagnostic": state.last_error},
        )
    db.add(state)
    return state


def mark_worker_stopped(
    db: Session,
    *,
    owner_id: str,
    final_status: str = "stopped",
    error_message: str | None = None,
    now: datetime | None = None,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState:
    from app.services.copy_trading_service import add_copy_event

    current_time = _utc_now(now)
    state = get_or_create_worker_state(db, worker_id=worker_id)
    state.owner_id = owner_id
    state.status = final_status
    state.stopped_at = current_time
    state.last_heartbeat_at = current_time
    if error_message is not None:
        state.last_error = _safe_error(error_message)
    db.add(state)
    add_copy_event(
        db,
        wallet_id=None,
        level="warning" if final_status == "error" else "info",
        event_type="copy_worker_stopped",
        message=(
            "Copy Trading worker demo detenido con error."
            if final_status == "error"
            else "Copy Trading worker demo detenido."
        ),
        metadata={"owner_id": owner_id, "status": final_status},
    )
    return state


def serialize_worker_state(state: CopyWorkerState | None) -> dict[str, object] | None:
    if state is None:
        return None
    return {
        "id": state.id,
        "owner_id": state.owner_id,
        "status": state.status,
        "started_at": _serialize_datetime(state.started_at),
        "stopped_at": _serialize_datetime(state.stopped_at),
        "last_heartbeat_at": _serialize_datetime(state.last_heartbeat_at),
        "last_loop_started_at": _serialize_datetime(state.last_loop_started_at),
        "last_loop_finished_at": _serialize_datetime(state.last_loop_finished_at),
        "last_success_at": _serialize_datetime(state.last_success_at),
        "last_error": state.last_error,
        "last_result_json": state.last_result_json,
        "consecutive_errors": state.consecutive_errors,
    }


def build_worker_runtime_read(
    state: CopyWorkerState | None,
    *,
    now: datetime | None = None,
    stale_after_seconds: int = COPY_TRADING_WORKER_STALE_AFTER_SECONDS,
) -> dict[str, object]:
    current_time = _utc_now(now)
    worker_status = _derive_worker_status(
        state,
        now=current_time,
        stale_after_seconds=stale_after_seconds,
    )
    return {
        "worker_status": worker_status,
        "worker_owner_id": _mask_owner_id(state.owner_id if state is not None else None),
        "last_heartbeat_at": state.last_heartbeat_at if state is not None else None,
        "last_loop_started_at": state.last_loop_started_at if state is not None else None,
        "last_loop_finished_at": state.last_loop_finished_at if state is not None else None,
        "last_success_at": state.last_success_at if state is not None else None,
        "last_error": _sanitize_error_for_read(state.last_error if state is not None else None),
        "last_result_json": state.last_result_json if state is not None else None,
        "consecutive_errors": state.consecutive_errors if state is not None else 0,
        "stale_after_seconds": stale_after_seconds,
        "demo_only": True,
    }


def apply_persisted_worker_runtime(
    watcher_status: CopyTradingWatcherStatusResponse,
    state: CopyWorkerState | None,
    *,
    now: datetime | None = None,
    stale_after_seconds: int = COPY_TRADING_WORKER_STALE_AFTER_SECONDS,
) -> CopyTradingWatcherStatusResponse:
    worker_runtime = build_worker_runtime_read(
        state,
        now=now,
        stale_after_seconds=stale_after_seconds,
    )
    worker_status = worker_runtime["worker_status"]
    running = worker_status == "running"
    enabled = worker_status in {"running", "stale", "error"} or watcher_status.enabled
    duration_ms = _extract_last_result_number(state.last_result_json if state is not None else None, "duration_ms")
    last_result = watcher_status.last_result
    if last_result is None and state is not None and state.last_result_json:
        last_result = CopyTradingWatcherLastResult(
            wallets_scanned=_extract_last_result_number(state.last_result_json, "wallets_scanned") or 0,
            scanned_wallet_count=_extract_last_result_number(state.last_result_json, "wallets_scanned") or 0,
            trades_detected=_extract_last_result_number(state.last_result_json, "trades_detected") or 0,
            orders_simulated=_extract_last_result_number(state.last_result_json, "demo_orders_created") or 0,
            errors=[worker_runtime["last_error"]] if worker_runtime["last_error"] else [],
        )

    return watcher_status.model_copy(
        update={
            "enabled": enabled,
            "running": running,
            "last_run_started_at": (
                state.last_loop_started_at
                if state is not None and state.last_loop_started_at is not None
                else watcher_status.last_run_started_at
            ),
            "last_run_at": (
                state.last_loop_finished_at
                if state is not None and state.last_loop_finished_at is not None
                else state.last_loop_started_at
                if state is not None and state.last_loop_started_at is not None
                else watcher_status.last_run_at
            ),
            "last_run_finished_at": (
                state.last_loop_finished_at
                if state is not None and state.last_loop_finished_at is not None
                else watcher_status.last_run_finished_at
            ),
            "last_run_duration_ms": duration_ms if duration_ms is not None else watcher_status.last_run_duration_ms,
            "average_run_duration_ms": duration_ms if duration_ms is not None else watcher_status.average_run_duration_ms,
            "last_result": last_result,
            **worker_runtime,
        }
    )


def load_worker_state(
    db: Session,
    *,
    worker_id: str = COPY_TRADING_WORKER_ID,
) -> CopyWorkerState | None:
    return db.scalar(select(CopyWorkerState).where(CopyWorkerState.id == worker_id).limit(1))


def _safe_error(error_message: str | None) -> str | None:
    if error_message is None:
        return None
    clean = " ".join(error_message.split()).strip()
    if not clean:
        return None
    clean = _DATABASE_URL_ASSIGNMENT_PATTERN.sub(r"\1[redacted]", clean)
    clean = _DATABASE_URL_PATTERN.sub("[redacted-url]", clean)
    return clean[:500]


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC).isoformat()
    return value.astimezone(UTC).isoformat()


def _utc_now(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(tz=UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _derive_worker_status(
    state: CopyWorkerState | None,
    *,
    now: datetime,
    stale_after_seconds: int,
) -> str:
    if state is None:
        return "not_started"
    status = (state.status or "").strip().lower()
    if status in {"idle", ""}:
        return "not_started"
    if status == "stopped":
        return "stopped"
    if status == "error":
        return "error"
    if status == "running":
        if state.last_heartbeat_at is None:
            return "stale"
        heartbeat = _utc_now(state.last_heartbeat_at)
        if (now - heartbeat).total_seconds() > stale_after_seconds:
            return "stale"
        return "running"
    return "unknown"


def _mask_owner_id(owner_id: str | None) -> str | None:
    if owner_id is None:
        return None
    clean = owner_id.strip()
    if not clean:
        return None
    if len(clean) <= 8:
        return clean
    return f"{clean[:8]}..."


def _sanitize_error_for_read(error_message: str | None) -> str | None:
    return _safe_error(error_message)


def _extract_last_result_number(payload: dict[str, object] | None, key: str) -> int | None:
    if payload is None:
        return None
    value = payload.get(key)
    if isinstance(value, int):
        return value
    return None
