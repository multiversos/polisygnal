from __future__ import annotations

import argparse
import json
import sys

from app.core.config import get_settings
from app.services.linear_auth import (
    LinearOAuthError,
    get_linear_authorization_header,
    resolve_linear_credentials_path,
)
from app.services.linear_sync import (
    LinearApiClient,
    LinearSyncError,
    LinearSyncService,
    resolve_repo_path,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sincroniza el backlog canonico del repo con Linear."
    )
    parser.add_argument(
        "--source-path",
        type=str,
        default=None,
        help="Ruta al JSON canonico que define los issues a sincronizar.",
    )
    parser.add_argument(
        "--team-id",
        type=str,
        default=None,
        help="UUID del team de Linear. Si se omite, usa LINEAR_TEAM_ID.",
    )
    parser.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="UUID del project de Linear. Si se omite, usa LINEAR_PROJECT_ID.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica los cambios en Linear. Sin este flag solo hace dry-run.",
    )
    args = parser.parse_args()

    settings = get_settings()
    team_id = args.team_id or settings.linear_team_id
    project_id = args.project_id or settings.linear_project_id
    source_path = resolve_repo_path(
        args.source_path or settings.linear_sync_source_path
    )
    oauth_credentials_path = resolve_linear_credentials_path(
        settings.linear_oauth_credentials_path
    )

    if not team_id:
        _print_error_and_exit(
            "Falta LINEAR_TEAM_ID. Copia el UUID del team desde Linear y exportalo."
        )

    try:
        authorization_header = get_linear_authorization_header(
            api_key=settings.linear_api_key,
            token_url=settings.linear_oauth_token_url,
            oauth_client_id=settings.linear_oauth_client_id,
            oauth_actor=settings.linear_oauth_actor,
            oauth_credentials_path=oauth_credentials_path,
            oauth_client_secret=settings.linear_oauth_client_secret,
        )
        api_client = LinearApiClient(
            api_url=settings.linear_api_url,
            authorization=authorization_header,
        )
        service = LinearSyncService(api_client)
        payload = service.sync(
            team_id=team_id,
            project_id=project_id,
            source_path=source_path,
            apply=args.apply,
        )
    except (LinearSyncError, LinearOAuthError) as exc:
        _print_error_and_exit(str(exc))
    finally:
        if "api_client" in locals():
            api_client.close()

    print(json.dumps(payload, indent=2, ensure_ascii=True))


def _print_error_and_exit(message: str) -> None:
    print(
        json.dumps(
            {
                "status": "error",
                "error": message,
            },
            indent=2,
            ensure_ascii=True,
        ),
        file=sys.stderr,
    )
    raise SystemExit(1)


if __name__ == "__main__":
    main()
