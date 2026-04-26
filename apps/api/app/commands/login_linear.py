from __future__ import annotations

import argparse
import json
import sys

from app.core.config import get_settings
from app.services.linear_auth import (
    LinearOAuthError,
    authenticate_linear_via_browser,
    resolve_linear_credentials_path,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Autentica este repo contra Linear usando OAuth local con aprobacion web."
    )
    parser.add_argument(
        "--client-id",
        type=str,
        default=None,
        help="Client ID del OAuth2 app de Linear. Si se omite, usa LINEAR_OAUTH_CLIENT_ID.",
    )
    parser.add_argument(
        "--client-secret",
        type=str,
        default=None,
        help="Client secret opcional del OAuth2 app de Linear.",
    )
    parser.add_argument(
        "--redirect-uri",
        type=str,
        default=None,
        help="Redirect URI local. Si se omite, usa POLYSIGNAL_LINEAR_OAUTH_REDIRECT_URI.",
    )
    parser.add_argument(
        "--scopes",
        type=str,
        default=None,
        help="Scopes separados por comas. Si se omite, usa POLYSIGNAL_LINEAR_OAUTH_SCOPES.",
    )
    parser.add_argument(
        "--actor",
        type=str,
        default=None,
        help="Actor OAuth de Linear: user o app.",
    )
    parser.add_argument(
        "--credentials-path",
        type=str,
        default=None,
        help="Ruta donde guardar las credenciales locales.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=180,
        help="Tiempo maximo de espera para la aprobacion web.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="No intenta abrir el navegador automaticamente; imprime la URL para abrirla manualmente.",
    )
    args = parser.parse_args()

    settings = get_settings()
    client_id = args.client_id or settings.linear_oauth_client_id
    client_secret = args.client_secret
    redirect_uri = args.redirect_uri or settings.linear_oauth_redirect_uri
    actor = args.actor or settings.linear_oauth_actor
    scopes = (
        [item.strip() for item in args.scopes.split(",") if item.strip()]
        if args.scopes
        else settings.linear_oauth_scopes
    )
    credentials_path = resolve_linear_credentials_path(
        args.credentials_path or settings.linear_oauth_credentials_path
    )

    if not client_id:
        _print_error_and_exit(
            "Falta LINEAR_OAUTH_CLIENT_ID. Primero crea un OAuth2 app en Linear y exporta su client_id."
        )

    try:
        payload = authenticate_linear_via_browser(
            authorize_url=settings.linear_oauth_authorize_url,
            token_url=settings.linear_oauth_token_url,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scopes=scopes,
            actor=actor,
            credentials_path=credentials_path,
            open_browser=not args.no_browser,
            timeout_seconds=args.timeout_seconds,
            authorization_url_callback=_announce_authorization_url,
        )
    except LinearOAuthError as exc:
        _print_error_and_exit(str(exc))

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


def _announce_authorization_url(url: str, browser_opened: bool) -> None:
    status = "si" if browser_opened else "no"
    print(
        (
            "Linear OAuth listo.\n"
            f"- navegador abierto automaticamente: {status}\n"
            f"- si no ves la pagina de autorizacion, abre esta URL manualmente:\n{url}\n"
        ),
        file=sys.stderr,
        flush=True,
    )


if __name__ == "__main__":
    main()
