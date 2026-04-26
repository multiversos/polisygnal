from __future__ import annotations

from pathlib import Path

import pytest

from app.services.linear_sync import (
    LinearIssueSeed,
    LinearRemoteIssue,
    LinearSyncBootstrap,
    LinearSyncCatalog,
    LinearSyncError,
    LinearWorkflowState,
    build_issue_description,
    build_sync_plan,
    extract_sync_id,
    load_sync_catalog,
    resolve_repo_path,
)


def test_extract_sync_id_from_description() -> None:
    description = "<!-- polysignal-sync:id=ops-system -->\n\nTexto"

    assert extract_sync_id(description) == "ops-system"
    assert extract_sync_id("Sin marcador") is None
    assert extract_sync_id(None) is None


def test_build_issue_description_contains_canonical_sections() -> None:
    catalog = LinearSyncCatalog(
        project_name="PolySignal",
        snapshot_date="2026-04-25",
        project_stage="operational_mvp",
        current_focus="cerrar la brecha entre evidencia, consumo y ejecucion",
        source_of_truth=("docs/project-status.md", "docs/reglamento-operativo.md"),
        issues=(),
    )
    issue = LinearIssueSeed(
        sync_id="ops-system",
        initiative="Execution",
        title="Instalar sistema operativo de ejecucion",
        state_type="started",
        summary="Sistema operativo de ejecucion con reglas claras.",
        outcome="Que el equipo siempre sepa que se hizo y que falta.",
        done=("Linear sync base",),
        next_steps=("adoptar la disciplina diaria",),
        risks=("sin actualizacion diaria el tablero pierde valor",),
        source_paths=("docs/tasks.md",),
    )

    description = build_issue_description(
        catalog,
        issue,
        resolve_repo_path("docs/linear-project-board.json"),
    )

    assert "<!-- polysignal-sync:id=ops-system -->" in description
    assert "## Outcome esperado" in description
    assert "## Estado local" in description
    assert "`docs/project-status.md`" in description
    assert "`docs/tasks.md`" in description


def test_build_sync_plan_creates_updates_and_noops() -> None:
    catalog = LinearSyncCatalog(
        project_name="PolySignal",
        snapshot_date="2026-04-25",
        project_stage="operational_mvp",
        current_focus="producto accionable",
        source_of_truth=("docs/project-status.md",),
        issues=(
            LinearIssueSeed(
                sync_id="completed-item",
                initiative="Foundation",
                title="Consolidar backend MVP",
                state_type="completed",
                summary="Backend MVP operativo.",
                outcome="Backend estable y auditable.",
                done=("sync manual",),
                next_steps=("ninguno",),
                risks=("ninguno",),
                source_paths=("README.md",),
            ),
            LinearIssueSeed(
                sync_id="started-item",
                initiative="Product",
                title="Producto frontend navegable",
                state_type="started",
                summary="Falta cerrar la capa de consumo.",
                outcome="Dashboard y UX navegable.",
                done=("dashboard html",),
                next_steps=("conectar frontend",),
                risks=("sin UX, el MVP sigue tecnico",),
                source_paths=("docs/roadmap.md",),
            ),
        ),
    )
    bootstrap = LinearSyncBootstrap(
        team_id="team-uuid",
        team_name="PolySignal",
        states=(
            LinearWorkflowState(
                id="state-backlog",
                name="Backlog",
                type="backlog",
                position=0,
            ),
            LinearWorkflowState(
                id="state-started",
                name="In Progress",
                type="started",
                position=20,
            ),
            LinearWorkflowState(
                id="state-done",
                name="Done",
                type="completed",
                position=40,
            ),
        ),
        synced_issues=(
            LinearRemoteIssue(
                id="issue-1",
                identifier="POLY-1",
                title="Consolidar backend MVP",
                description=build_issue_description(
                    catalog,
                    catalog.issues[0],
                    resolve_repo_path("docs/linear-project-board.json"),
                ),
                state_id="state-done",
                state_name="Done",
                state_type="completed",
                project_id=None,
                sync_id="completed-item",
            ),
            LinearRemoteIssue(
                id="issue-2",
                identifier="POLY-2",
                title="Producto frontend",
                description="<!-- polysignal-sync:id=started-item -->\n\nViejo contenido\n",
                state_id="state-backlog",
                state_name="Backlog",
                state_type="backlog",
                project_id=None,
                sync_id="started-item",
            ),
        ),
    )

    operations = build_sync_plan(
        catalog,
        bootstrap,
        resolve_repo_path("docs/linear-project-board.json"),
    )

    assert operations[0].action == "noop"
    assert operations[1].action == "update"
    assert set(operations[1].changed_fields) == {"description", "stateId", "title"}


def test_load_repository_linear_catalog_is_valid() -> None:
    catalog = load_sync_catalog(resolve_repo_path("docs/linear-project-board.json"))

    assert catalog.project_name == "PolySignal"
    assert catalog.snapshot_date == "2026-04-25"
    assert len(catalog.issues) >= 8


def test_load_sync_catalog_rejects_invalid_state_type(tmp_path: Path) -> None:
    catalog_path = tmp_path / "invalid.json"
    catalog_path.write_text(
        """
{
  "project_name": "PolySignal",
  "snapshot_date": "2026-04-25",
  "project_stage": "operational_mvp",
  "current_focus": "focus",
  "source_of_truth": ["docs/project-status.md"],
  "issues": [
    {
      "sync_id": "bad-item",
      "initiative": "Foundation",
      "title": "Bad state",
      "state_type": "invalid",
      "summary": "summary",
      "outcome": "outcome",
      "done": ["a"],
      "next_steps": ["b"],
      "risks": ["c"],
      "source_paths": ["README.md"]
    }
  ]
}
""".strip(),
        encoding="utf-8",
    )

    with pytest.raises(LinearSyncError):
        load_sync_catalog(catalog_path)
