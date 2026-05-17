from __future__ import annotations

import io
import json
from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.commands.copy_trading_worker import CopyTradingWorkerCommand, main
from app.db.base import Base
from app.models.copy_worker_state import CopyWorkerState
from app.schemas.copy_trading import CopyTradingWatcherLastResult, CopyTradingWatcherStatusResponse
from app.services.copy_trading_watcher import CopyTradingDemoWatcher, CopyTradingWatcherRunResult
from app.services.copy_worker_state import COPY_TRADING_WORKER_ID, acquire_worker_lock


class DummyDataClient:
    def close(self) -> None:
        return None


class DummyGammaClient:
    def close(self) -> None:
        return None

    def fetch_market_by_condition_id(self, condition_id: str):
        return None

    def fetch_market_by_slug(self, slug: str):
        return None


class FakeWatcher:
    def __init__(self) -> None:
        self.calls = 0

    def run_once(self, *, now: datetime | None = None) -> CopyTradingWatcherRunResult:
        self.calls += 1
        result = CopyTradingWatcherLastResult(wallets_scanned=0, scanned_wallet_count=0)
        status = CopyTradingWatcherStatusResponse(
            enabled=False,
            running=False,
            interval_seconds=1,
            cycle_budget_seconds=1,
            last_run_started_at=now,
            last_run_finished_at=now,
            last_result=result,
        )
        return CopyTradingWatcherRunResult(status=status, executed=True)


class FailingWatcher:
    def __init__(self) -> None:
        self.calls = 0

    def run_once(self, *, now: datetime | None = None) -> CopyTradingWatcherRunResult:
        self.calls += 1
        result = CopyTradingWatcherLastResult(errors=["No se pudo leer actividad publica."])
        status = CopyTradingWatcherStatusResponse(
            enabled=False,
            running=False,
            interval_seconds=1,
            cycle_budget_seconds=1,
            last_run_started_at=now,
            last_run_finished_at=now,
            last_result=result,
            message="Watcher demo fallo al escanear.",
        )
        return CopyTradingWatcherRunResult(status=status, executed=False)


@pytest.fixture
def worker_db() -> Generator[tuple[sessionmaker[Session], object], None, None]:
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
    try:
        yield TestingSessionLocal, engine
    finally:
        Base.metadata.drop_all(bind=engine)


def test_copy_trading_worker_help_exits_cleanly(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["--help"])

    captured = capsys.readouterr()
    assert exc.value.code == 0
    assert "Copy Trading worker demo-only" in captured.out
    assert "--once" in captured.out
    assert "--loop" in captured.out


def test_copy_trading_worker_once_succeeds_on_empty_db(worker_db: tuple[sessionmaker[Session], object]) -> None:
    testing_session_factory, testing_engine = worker_db
    stdout = io.StringIO()
    stderr = io.StringIO()
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: CopyTradingDemoWatcher(
            session_factory=testing_session_factory,
            data_client_factory=DummyDataClient,
            gamma_client_factory=DummyGammaClient,
        ),
        stdout=stdout,
        stderr=stderr,
        env={},
    )

    exit_code = command.run(["--once"])

    assert exit_code == 0
    payload = _read_last_json(stdout.getvalue())
    assert payload["status"] == "ok"
    assert payload["loops_completed"] == 1
    with testing_session_factory() as session:
        state = session.get(CopyWorkerState, COPY_TRADING_WORKER_ID)
        assert state is not None
        assert state.status == "stopped"
        assert state.last_heartbeat_at is not None
        assert state.last_loop_started_at is not None
        assert state.last_loop_finished_at is not None
        assert state.last_success_at is not None
        assert state.last_result_json is not None
        assert state.last_result_json["loops_completed"] == 1
        assert state.last_result_json["wallets_scanned"] == 0
        assert state.last_result_json["demo_orders_created"] == 0
        assert state.consecutive_errors == 0


def test_copy_trading_worker_lock_acquired_and_second_lock_rejected(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    _testing_session_factory, testing_engine = worker_db

    first_lock = acquire_worker_lock(testing_engine)
    try:
        second_lock = acquire_worker_lock(testing_engine)
        assert first_lock is not None
        assert second_lock is None
    finally:
        assert first_lock is not None
        first_lock.release()


def test_copy_trading_worker_returns_cleanly_when_lock_is_held(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    stdout = io.StringIO()
    stderr = io.StringIO()
    first_lock = acquire_worker_lock(testing_engine)
    try:
        command = CopyTradingWorkerCommand(
            engine_instance=testing_engine,
            session_factory=testing_session_factory,
            watcher_factory=lambda _args: FakeWatcher(),
            stdout=stdout,
            stderr=stderr,
            env={},
        )

        exit_code = command.run(["--once"])

        assert exit_code == 0
        payload = _read_last_json(stdout.getvalue())
        assert payload["status"] == "lock_unavailable"
        assert payload["state"] is None
    finally:
        assert first_lock is not None
        first_lock.release()


def test_copy_trading_worker_does_not_require_private_key_seed_or_clob(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    stdout = io.StringIO()
    stderr = io.StringIO()
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FakeWatcher(),
        stdout=stdout,
        stderr=stderr,
        env={},
    )

    exit_code = command.run(["--once"])

    assert exit_code == 0
    payload = _read_last_json(stdout.getvalue())
    assert payload["status"] == "ok"
    assert "private" not in stdout.getvalue().lower()
    assert "seed" not in stdout.getvalue().lower()
    assert "clob" not in stdout.getvalue().lower()


def test_copy_trading_worker_loop_respects_max_loops(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    stdout = io.StringIO()
    stderr = io.StringIO()
    fake_watcher = FakeWatcher()
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: fake_watcher,
        stdout=stdout,
        stderr=stderr,
        env={},
        sleep_fn=lambda _seconds: None,
    )

    exit_code = command.run(["--loop", "--max-loops", "2", "--sleep-seconds", "0"])

    assert exit_code == 0
    assert fake_watcher.calls == 2
    payload = _read_last_json(stdout.getvalue())
    assert payload["status"] == "ok"
    assert payload["loops_completed"] == 2


def test_copy_trading_worker_rejects_unbounded_loop_without_flag_or_env(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FakeWatcher(),
        stdout=io.StringIO(),
        stderr=io.StringIO(),
        env={},
    )

    with pytest.raises(SystemExit) as exc:
        command.run(["--loop"])

    assert exc.value.code == 2


def test_copy_trading_worker_allows_forever_flag(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    stdout = io.StringIO()
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FakeWatcher(),
        stdout=stdout,
        stderr=io.StringIO(),
        env={},
        sleep_fn=lambda _seconds: None,
    )

    exit_code = command.run(["--loop", "--forever", "--max-loops", "1", "--sleep-seconds", "0"])

    assert exit_code == 0
    payload = _read_last_json(stdout.getvalue())
    assert payload["status"] == "ok"
    assert payload["loops_completed"] == 1


def test_copy_trading_worker_error_increments_consecutive_errors(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FailingWatcher(),
        stdout=io.StringIO(),
        stderr=io.StringIO(),
        env={"POLYSIGNAL_COPY_WORKER_ERROR_BACKOFF_SECONDS": "0"},
        sleep_fn=lambda _seconds: None,
    )

    exit_code = command.run(["--once"])

    assert exit_code == 0
    with testing_session_factory() as session:
        state = session.get(CopyWorkerState, COPY_TRADING_WORKER_ID)
        assert state is not None
        assert state.consecutive_errors == 1
        assert state.last_result_json == {
            "loops_completed": 1,
            "wallets_scanned": 0,
            "trades_detected": 0,
            "demo_orders_created": 0,
            "positions_opened": 0,
            "positions_closed": 0,
            "settlement_checked": 0,
            "duration_ms": state.last_result_json["duration_ms"],
            "errors_count": 1,
        }


def test_copy_trading_worker_success_resets_consecutive_errors(
    worker_db: tuple[sessionmaker[Session], object],
) -> None:
    testing_session_factory, testing_engine = worker_db
    failing_command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FailingWatcher(),
        stdout=io.StringIO(),
        stderr=io.StringIO(),
        env={"POLYSIGNAL_COPY_WORKER_ERROR_BACKOFF_SECONDS": "0"},
        sleep_fn=lambda _seconds: None,
    )
    success_command = CopyTradingWorkerCommand(
        engine_instance=testing_engine,
        session_factory=testing_session_factory,
        watcher_factory=lambda _args: FakeWatcher(),
        stdout=io.StringIO(),
        stderr=io.StringIO(),
        env={},
    )

    assert failing_command.run(["--once"]) == 0
    assert success_command.run(["--once"]) == 0

    with testing_session_factory() as session:
        state = session.get(CopyWorkerState, COPY_TRADING_WORKER_ID)
        assert state is not None
        assert state.consecutive_errors == 0
        assert state.last_error is None
        assert state.last_result_json["errors_count"] == 0


def _read_last_json(output: str) -> dict[str, object]:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    assert lines
    return json.loads(lines[-1])
