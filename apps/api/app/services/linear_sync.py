from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx

from app.core.config import REPO_ROOT

LinearStateType = Literal["backlog", "unstarted", "started", "completed", "canceled"]

ALLOWED_STATE_TYPES: frozenset[str] = frozenset(
    {"backlog", "unstarted", "started", "completed", "canceled"}
)
SYNC_MARKER_PREFIX = "polysignal-sync:id="
SYNC_MARKER_PATTERN = re.compile(
    r"<!--\s*polysignal-sync:id=(?P<sync_id>[a-z0-9][a-z0-9_-]*)\s*-->"
)

SYNC_BOOTSTRAP_QUERY = """
query SyncBootstrap($teamId: String!, $syncMarker: String!) {
  team(id: $teamId) {
    id
    name
    states {
      nodes {
        id
        name
        type
        position
      }
    }
  }
  issues(
    first: 250
    filter: {
      team: { id: { eq: $teamId } }
      description: { contains: $syncMarker }
    }
  ) {
    nodes {
      id
      identifier
      title
      description
      project {
        id
      }
      state {
        id
        name
        type
      }
    }
  }
}
"""

ISSUE_CREATE_MUTATION = """
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      state {
        id
        name
        type
      }
      project {
        id
      }
    }
  }
}
"""

ISSUE_UPDATE_MUTATION = """
mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      identifier
      title
      state {
        id
        name
        type
      }
      project {
        id
      }
    }
  }
}
"""


class LinearSyncError(RuntimeError):
    """Raised when the Linear sync configuration or API interaction fails."""


@dataclass(frozen=True)
class LinearIssueSeed:
    sync_id: str
    initiative: str
    title: str
    state_type: LinearStateType
    summary: str
    outcome: str
    done: tuple[str, ...]
    next_steps: tuple[str, ...]
    risks: tuple[str, ...]
    source_paths: tuple[str, ...]


@dataclass(frozen=True)
class LinearSyncCatalog:
    project_name: str
    snapshot_date: str
    project_stage: str
    current_focus: str
    source_of_truth: tuple[str, ...]
    issues: tuple[LinearIssueSeed, ...]


@dataclass(frozen=True)
class LinearWorkflowState:
    id: str
    name: str
    type: LinearStateType
    position: int


@dataclass(frozen=True)
class LinearRemoteIssue:
    id: str
    identifier: str
    title: str
    description: str | None
    state_id: str
    state_name: str
    state_type: LinearStateType
    project_id: str | None
    sync_id: str


@dataclass(frozen=True)
class LinearSyncBootstrap:
    team_id: str
    team_name: str
    states: tuple[LinearWorkflowState, ...]
    synced_issues: tuple[LinearRemoteIssue, ...]


@dataclass(frozen=True)
class LinearPlannedOperation:
    action: Literal["create", "update", "noop"]
    sync_id: str
    title: str
    state_type: LinearStateType
    reason: str
    changed_fields: tuple[str, ...]
    input_payload: dict[str, Any]
    existing_issue_id: str | None = None
    existing_identifier: str | None = None


@dataclass(frozen=True)
class LinearAppliedOperation:
    action: Literal["create", "update"]
    sync_id: str
    title: str
    state_type: LinearStateType
    issue_id: str
    issue_identifier: str
    changed_fields: tuple[str, ...]


def resolve_repo_path(path_value: str | Path) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def extract_sync_id(description: str | None) -> str | None:
    if not description:
        return None
    match = SYNC_MARKER_PATTERN.search(description)
    if match is None:
        return None
    return match.group("sync_id")


def load_sync_catalog(path: Path) -> LinearSyncCatalog:
    if not path.exists():
        raise LinearSyncError(f"No existe el archivo canonico de sync: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LinearSyncError(
            f"El archivo de sync no es JSON valido: {path} ({exc.msg})"
        ) from exc

    issues_payload = payload.get("issues")
    if not isinstance(issues_payload, list) or not issues_payload:
        raise LinearSyncError("El catalogo de Linear debe contener una lista 'issues'.")

    seen_sync_ids: set[str] = set()
    issues: list[LinearIssueSeed] = []
    for raw_issue in issues_payload:
        issue = _parse_issue_seed(raw_issue)
        if issue.sync_id in seen_sync_ids:
            raise LinearSyncError(
                f"El sync_id '{issue.sync_id}' esta duplicado en el catalogo."
            )
        seen_sync_ids.add(issue.sync_id)
        issues.append(issue)

    return LinearSyncCatalog(
        project_name=_require_str(payload, "project_name"),
        snapshot_date=_require_str(payload, "snapshot_date"),
        project_stage=_require_str(payload, "project_stage"),
        current_focus=_require_str(payload, "current_focus"),
        source_of_truth=_require_str_tuple(payload, "source_of_truth"),
        issues=tuple(issues),
    )


def build_issue_description(
    catalog: LinearSyncCatalog,
    issue: LinearIssueSeed,
    source_path: Path,
) -> str:
    local_state_label = {
        "backlog": "backlog",
        "unstarted": "todo",
        "started": "in_progress",
        "completed": "done",
        "canceled": "canceled",
    }[issue.state_type]
    source_of_truth = _dedupe_paths((*catalog.source_of_truth, *issue.source_paths))
    lines: list[str] = [
        f"<!-- polysignal-sync:id={issue.sync_id} -->",
        f"<!-- polysignal-sync:source={source_path.relative_to(REPO_ROOT).as_posix()} -->",
        "",
        issue.summary,
        "",
        "## Outcome esperado",
        issue.outcome,
        "",
        "## Estado local",
        f"- proyecto: `{catalog.project_name}`",
        f"- etapa: `{catalog.project_stage}`",
        f"- estado objetivo: `{local_state_label}`",
        f"- snapshot: `{catalog.snapshot_date}`",
        f"- foco actual: {catalog.current_focus}",
        "",
    ]

    _append_markdown_list(lines, "## Hecho", issue.done)
    _append_markdown_list(lines, "## Siguiente", issue.next_steps)
    _append_markdown_list(lines, "## Riesgos", issue.risks)
    _append_markdown_list(lines, "## Source of truth", source_of_truth, code_format=True)

    return "\n".join(lines).strip() + "\n"


def build_sync_plan(
    catalog: LinearSyncCatalog,
    bootstrap: LinearSyncBootstrap,
    source_path: Path,
    project_id: str | None = None,
) -> tuple[LinearPlannedOperation, ...]:
    state_by_type = _select_states_by_type(bootstrap.states)
    existing_by_sync_id: dict[str, LinearRemoteIssue] = {}
    for remote_issue in bootstrap.synced_issues:
        if remote_issue.sync_id in existing_by_sync_id:
            raise LinearSyncError(
                f"Se detectaron multiples issues remotas con el mismo sync_id "
                f"'{remote_issue.sync_id}'."
            )
        existing_by_sync_id[remote_issue.sync_id] = remote_issue

    operations: list[LinearPlannedOperation] = []
    for issue in catalog.issues:
        desired_state = state_by_type.get(issue.state_type)
        if desired_state is None:
            raise LinearSyncError(
                f"El team '{bootstrap.team_name}' no tiene workflow state para "
                f"'{issue.state_type}'."
            )

        desired_description = build_issue_description(catalog, issue, source_path)
        remote_issue = existing_by_sync_id.get(issue.sync_id)
        if remote_issue is None:
            create_input: dict[str, Any] = {
                "teamId": bootstrap.team_id,
                "title": issue.title,
                "description": desired_description,
                "stateId": desired_state.id,
            }
            if project_id:
                create_input["projectId"] = project_id
            operations.append(
                LinearPlannedOperation(
                    action="create",
                    sync_id=issue.sync_id,
                    title=issue.title,
                    state_type=issue.state_type,
                    reason="missing_remote_issue",
                    changed_fields=tuple(sorted(create_input.keys())),
                    input_payload=create_input,
                )
            )
            continue

        update_input: dict[str, Any] = {}
        changed_fields: list[str] = []
        if remote_issue.title != issue.title:
            update_input["title"] = issue.title
            changed_fields.append("title")
        if _normalize_multiline(remote_issue.description) != _normalize_multiline(
            desired_description
        ):
            update_input["description"] = desired_description
            changed_fields.append("description")
        if remote_issue.state_id != desired_state.id:
            update_input["stateId"] = desired_state.id
            changed_fields.append("stateId")
        if project_id and remote_issue.project_id != project_id:
            update_input["projectId"] = project_id
            changed_fields.append("projectId")

        if not update_input:
            operations.append(
                LinearPlannedOperation(
                    action="noop",
                    sync_id=issue.sync_id,
                    title=issue.title,
                    state_type=issue.state_type,
                    reason="already_in_sync",
                    changed_fields=(),
                    input_payload={},
                    existing_issue_id=remote_issue.id,
                    existing_identifier=remote_issue.identifier,
                )
            )
            continue

        operations.append(
            LinearPlannedOperation(
                action="update",
                sync_id=issue.sync_id,
                title=issue.title,
                state_type=issue.state_type,
                reason="field_drift",
                changed_fields=tuple(changed_fields),
                input_payload=update_input,
                existing_issue_id=remote_issue.id,
                existing_identifier=remote_issue.identifier,
            )
        )

    return tuple(operations)


class LinearApiClient:
    def __init__(
        self,
        *,
        api_url: str,
        authorization: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._api_url = api_url
        self._client = httpx.Client(
            timeout=timeout_seconds,
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._client.close()

    def execute(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._client.post(
                self._api_url,
                json={"query": query, "variables": variables},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LinearSyncError(f"Fallo la llamada HTTP a Linear: {exc}") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise LinearSyncError(
                "Linear respondio con un payload no JSON durante el sync."
            ) from exc

        errors = payload.get("errors")
        if errors:
            first_error = errors[0]
            message = first_error.get("message", "Error desconocido de GraphQL.")
            raise LinearSyncError(f"Linear GraphQL devolvio error: {message}")

        data = payload.get("data")
        if not isinstance(data, dict):
            raise LinearSyncError("Linear GraphQL no devolvio un bloque 'data' usable.")
        return data


class LinearSyncService:
    def __init__(self, api_client: LinearApiClient) -> None:
        self._api_client = api_client

    def fetch_bootstrap(self, team_id: str) -> LinearSyncBootstrap:
        payload = self._api_client.execute(
            SYNC_BOOTSTRAP_QUERY,
            {"teamId": team_id, "syncMarker": SYNC_MARKER_PREFIX},
        )
        team_payload = payload.get("team")
        if not isinstance(team_payload, dict):
            raise LinearSyncError(
                f"Linear no devolvio datos del team '{team_id}'. Verifica el TEAM ID."
            )

        states_payload = team_payload.get("states", {}).get("nodes", [])
        issues_payload = payload.get("issues", {}).get("nodes", [])

        states = tuple(_parse_state(item) for item in states_payload)
        synced_issues = tuple(_parse_remote_issue(item) for item in issues_payload)

        return LinearSyncBootstrap(
            team_id=_require_str(team_payload, "id"),
            team_name=_require_str(team_payload, "name"),
            states=states,
            synced_issues=synced_issues,
        )

    def sync(
        self,
        *,
        team_id: str,
        source_path: Path,
        apply: bool,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        catalog = load_sync_catalog(source_path)
        bootstrap = self.fetch_bootstrap(team_id)
        plan = build_sync_plan(catalog, bootstrap, source_path, project_id=project_id)

        applied_results: list[LinearAppliedOperation] = []
        if apply:
            for operation in plan:
                if operation.action == "create":
                    applied_results.append(self._create_issue(operation))
                elif operation.action == "update":
                    applied_results.append(self._update_issue(operation))

        summary = {
            "to_create": sum(1 for item in plan if item.action == "create"),
            "to_update": sum(1 for item in plan if item.action == "update"),
            "unchanged": sum(1 for item in plan if item.action == "noop"),
            "applied": len(applied_results),
        }
        return {
            "status": "ok",
            "mode": "apply" if apply else "dry_run",
            "team_id": bootstrap.team_id,
            "team_name": bootstrap.team_name,
            "project_id": project_id,
            "source_path": str(source_path),
            "project_name": catalog.project_name,
            "snapshot_date": catalog.snapshot_date,
            "project_stage": catalog.project_stage,
            "current_focus": catalog.current_focus,
            "issues_total": len(catalog.issues),
            "summary": summary,
            "operations": [
                _serialize_planned_operation(operation) for operation in plan
            ],
            "applied_operations": [
                _serialize_applied_operation(operation) for operation in applied_results
            ],
        }

    def _create_issue(self, operation: LinearPlannedOperation) -> LinearAppliedOperation:
        payload = self._api_client.execute(
            ISSUE_CREATE_MUTATION,
            {"input": operation.input_payload},
        )
        result = payload.get("issueCreate")
        if not isinstance(result, dict) or not result.get("success"):
            raise LinearSyncError(
                f"Linear no confirmo la creacion del issue '{operation.title}'."
            )
        issue_payload = result.get("issue")
        if not isinstance(issue_payload, dict):
            raise LinearSyncError(
                f"Linear no devolvio el issue creado para '{operation.title}'."
            )

        return LinearAppliedOperation(
            action="create",
            sync_id=operation.sync_id,
            title=operation.title,
            state_type=operation.state_type,
            issue_id=_require_str(issue_payload, "id"),
            issue_identifier=_require_str(issue_payload, "identifier"),
            changed_fields=operation.changed_fields,
        )

    def _update_issue(self, operation: LinearPlannedOperation) -> LinearAppliedOperation:
        if operation.existing_issue_id is None:
            raise LinearSyncError(
                f"El issue '{operation.title}' no tiene existing_issue_id para update."
            )

        payload = self._api_client.execute(
            ISSUE_UPDATE_MUTATION,
            {
                "id": operation.existing_issue_id,
                "input": operation.input_payload,
            },
        )
        result = payload.get("issueUpdate")
        if not isinstance(result, dict) or not result.get("success"):
            raise LinearSyncError(
                f"Linear no confirmo la actualizacion del issue '{operation.title}'."
            )
        issue_payload = result.get("issue")
        if not isinstance(issue_payload, dict):
            raise LinearSyncError(
                f"Linear no devolvio el issue actualizado para '{operation.title}'."
            )

        return LinearAppliedOperation(
            action="update",
            sync_id=operation.sync_id,
            title=operation.title,
            state_type=operation.state_type,
            issue_id=_require_str(issue_payload, "id"),
            issue_identifier=_require_str(issue_payload, "identifier"),
            changed_fields=operation.changed_fields,
        )


def _parse_issue_seed(payload: Any) -> LinearIssueSeed:
    if not isinstance(payload, dict):
        raise LinearSyncError("Cada issue del catalogo debe ser un objeto JSON.")
    state_type = _require_str(payload, "state_type")
    if state_type not in ALLOWED_STATE_TYPES:
        raise LinearSyncError(
            "state_type invalido en el catalogo de Linear: "
            f"'{state_type}'. Usa uno de {sorted(ALLOWED_STATE_TYPES)}."
        )

    return LinearIssueSeed(
        sync_id=_require_str(payload, "sync_id"),
        initiative=_require_str(payload, "initiative"),
        title=_require_str(payload, "title"),
        state_type=state_type,  # type: ignore[arg-type]
        summary=_require_str(payload, "summary"),
        outcome=_require_str(payload, "outcome"),
        done=_require_str_tuple(payload, "done"),
        next_steps=_require_str_tuple(payload, "next_steps"),
        risks=_require_str_tuple(payload, "risks"),
        source_paths=_require_str_tuple(payload, "source_paths"),
    )


def _parse_state(payload: Any) -> LinearWorkflowState:
    if not isinstance(payload, dict):
        raise LinearSyncError("Linear devolvio un workflow state invalido.")
    state_type = _require_str(payload, "type")
    if state_type not in ALLOWED_STATE_TYPES:
        raise LinearSyncError(
            f"Linear devolvio un workflow state type no soportado: '{state_type}'."
        )
    return LinearWorkflowState(
        id=_require_str(payload, "id"),
        name=_require_str(payload, "name"),
        type=state_type,  # type: ignore[arg-type]
        position=_require_int(payload, "position"),
    )


def _parse_remote_issue(payload: Any) -> LinearRemoteIssue:
    if not isinstance(payload, dict):
        raise LinearSyncError("Linear devolvio un issue remoto invalido.")
    state_payload = payload.get("state")
    if not isinstance(state_payload, dict):
        raise LinearSyncError("Linear devolvio un issue remoto sin state.")
    state_type = _require_str(state_payload, "type")
    if state_type not in ALLOWED_STATE_TYPES:
        raise LinearSyncError(
            f"Linear devolvio un issue con state type no soportado: '{state_type}'."
        )
    sync_id = extract_sync_id(payload.get("description"))
    if sync_id is None:
        raise LinearSyncError(
            "Se encontro un issue remoto filtrado para sync pero sin marcador canonico."
        )
    project_payload = payload.get("project")
    project_id = None
    if isinstance(project_payload, dict):
        project_id = project_payload.get("id")
        if project_id is not None and not isinstance(project_id, str):
            raise LinearSyncError("Linear devolvio un project.id invalido.")

    return LinearRemoteIssue(
        id=_require_str(payload, "id"),
        identifier=_require_str(payload, "identifier"),
        title=_require_str(payload, "title"),
        description=payload.get("description"),
        state_id=_require_str(state_payload, "id"),
        state_name=_require_str(state_payload, "name"),
        state_type=state_type,  # type: ignore[arg-type]
        project_id=project_id,
        sync_id=sync_id,
    )


def _select_states_by_type(
    states: tuple[LinearWorkflowState, ...]
) -> dict[LinearStateType, LinearWorkflowState]:
    state_map: dict[LinearStateType, LinearWorkflowState] = {}
    for state in sorted(states, key=lambda item: item.position):
        if state.type not in state_map:
            state_map[state.type] = state
    return state_map


def _serialize_planned_operation(operation: LinearPlannedOperation) -> dict[str, Any]:
    return {
        "action": operation.action,
        "sync_id": operation.sync_id,
        "title": operation.title,
        "state_type": operation.state_type,
        "reason": operation.reason,
        "changed_fields": list(operation.changed_fields),
        "existing_issue_id": operation.existing_issue_id,
        "existing_identifier": operation.existing_identifier,
    }


def _serialize_applied_operation(operation: LinearAppliedOperation) -> dict[str, Any]:
    return {
        "action": operation.action,
        "sync_id": operation.sync_id,
        "title": operation.title,
        "state_type": operation.state_type,
        "issue_id": operation.issue_id,
        "issue_identifier": operation.issue_identifier,
        "changed_fields": list(operation.changed_fields),
    }


def _append_markdown_list(
    lines: list[str],
    heading: str,
    values: tuple[str, ...],
    *,
    code_format: bool = False,
) -> None:
    if not values:
        return
    lines.append(heading)
    for value in values:
        content = f"`{value}`" if code_format else value
        lines.append(f"- {content}")
    lines.append("")


def _dedupe_paths(values: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return tuple(deduped)


def _normalize_multiline(value: str | None) -> str:
    if value is None:
        return ""
    return value.replace("\r\n", "\n").strip()


def _require_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise LinearSyncError(f"Falta el campo string requerido '{key}'.")
    return value.strip()


def _require_int(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int):
        raise LinearSyncError(f"Falta el campo entero requerido '{key}'.")
    return value


def _require_str_tuple(payload: dict[str, Any], key: str) -> tuple[str, ...]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise LinearSyncError(f"Falta la lista requerida '{key}'.")
    cleaned: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise LinearSyncError(
                f"Todos los elementos de '{key}' deben ser strings no vacios."
            )
        cleaned.append(item.strip())
    return tuple(cleaned)
