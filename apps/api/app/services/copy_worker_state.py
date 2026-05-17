from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock

from sqlalchemy import select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.models.copy_worker_state import CopyWorkerState
from app.services.copy_trading_service import add_copy_event

COPY_TRADING_WORKER_ID = "copy_trading_demo"
COPY_TRADING_WORKER_LOCK_KEY = 2_021_051_700

_LOCAL_LOCKS_GUARD = Lock()
_LOCAL_LOCKS: dict[str, Lock] = {}


@dataclass(slots=True)
class WorkerLockHandle:
    worker_id: str
    backend: str
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
                    {"key": COPY_TRADING_WORKER_LOCK_KEY},
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
        return WorkerLockHandle(worker_id=worker_id, backend="postgresql", connection=connection)

    with _LOCAL_LOCKS_GUARD:
        local_lock = _LOCAL_LOCKS.setdefault(worker_id, Lock())
    acquired = local_lock.acquire(blocking=False)
    if not acquired:
        return None
    return WorkerLockHandle(worker_id=worker_id, backend="local", local_lock=local_lock)


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
    return clean[:500] if clean else None


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
