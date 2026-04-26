from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import webbrowser
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from queue import Queue
from typing import Any, Callable
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from app.core.config import REPO_ROOT


class LinearOAuthError(RuntimeError):
    """Raised when the local OAuth flow or token handling fails."""


@dataclass(frozen=True)
class LinearOAuthCredentials:
    access_token: str
    refresh_token: str
    token_type: str
    expires_at: datetime
    scope: tuple[str, ...]
    actor: str
    client_id: str

    def is_expired(self, *, skew_seconds: int = 120) -> bool:
        return self.expires_at <= datetime.now(tz=UTC) + timedelta(seconds=skew_seconds)

    def to_payload(self) -> dict[str, Any]:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "expires_at": self.expires_at.isoformat(),
            "scope": list(self.scope),
            "actor": self.actor,
            "client_id": self.client_id,
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "LinearOAuthCredentials":
        access_token = _require_str(payload, "access_token")
        refresh_token = _require_str(payload, "refresh_token")
        token_type = _require_str(payload, "token_type")
        expires_at_raw = _require_str(payload, "expires_at")
        actor = _require_str(payload, "actor")
        client_id = _require_str(payload, "client_id")
        scope = _require_str_tuple(payload, "scope")

        try:
            expires_at = datetime.fromisoformat(expires_at_raw)
        except ValueError as exc:
            raise LinearOAuthError("expires_at en credenciales de Linear no es valido.") from exc
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)

        return cls(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type=token_type,
            expires_at=expires_at.astimezone(UTC),
            scope=scope,
            actor=actor,
            client_id=client_id,
        )


@dataclass(frozen=True)
class LinearOAuthCallbackResult:
    code: str | None
    state: str | None
    error: str | None
    error_description: str | None


def resolve_linear_credentials_path(path_value: str | Path) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def load_linear_oauth_credentials(path: Path) -> LinearOAuthCredentials | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LinearOAuthError(
            f"El archivo de credenciales de Linear no es JSON valido: {path}"
        ) from exc
    if not isinstance(payload, dict):
        raise LinearOAuthError(
            f"El archivo de credenciales de Linear debe contener un objeto JSON: {path}"
        )
    return LinearOAuthCredentials.from_payload(payload)


def save_linear_oauth_credentials(path: Path, credentials: LinearOAuthCredentials) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(credentials.to_payload(), indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def generate_pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def generate_pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def generate_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def build_linear_oauth_authorize_url(
    *,
    authorize_url: str,
    client_id: str,
    redirect_uri: str,
    scopes: list[str],
    state: str,
    code_challenge: str,
    actor: str,
) -> str:
    if not scopes:
        raise LinearOAuthError("El flujo OAuth requiere al menos un scope.")
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": ",".join(scopes),
            "state": state,
            "actor": actor,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{authorize_url}?{query}"


def ensure_local_redirect_uri(redirect_uri: str) -> None:
    parsed = urlparse(redirect_uri)
    if parsed.scheme != "http":
        raise LinearOAuthError("El redirect URI local de Linear debe usar http.")
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise LinearOAuthError(
            "El redirect URI local de Linear debe apuntar a 127.0.0.1 o localhost."
        )
    if not parsed.port:
        raise LinearOAuthError("El redirect URI local de Linear debe incluir un puerto.")
    if not parsed.path:
        raise LinearOAuthError("El redirect URI local de Linear debe incluir un path.")


class LinearOAuthTokenClient:
    def __init__(self, *, token_url: str, timeout_seconds: float = 30.0) -> None:
        self._token_url = token_url
        self._client = httpx.Client(timeout=timeout_seconds)

    def close(self) -> None:
        self._client.close()

    def exchange_code(
        self,
        *,
        client_id: str,
        redirect_uri: str,
        code: str,
        code_verifier: str,
        actor: str,
        client_secret: str | None = None,
    ) -> LinearOAuthCredentials:
        form = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code": code,
            "code_verifier": code_verifier,
        }
        if client_secret:
            form["client_secret"] = client_secret
        payload = self._post_form(form)
        return self._parse_token_payload(payload, actor=actor, client_id=client_id)

    def refresh_token(
        self,
        *,
        client_id: str,
        refresh_token: str,
        actor: str,
        client_secret: str | None = None,
    ) -> LinearOAuthCredentials:
        form = {
            "grant_type": "refresh_token",
            "client_id": client_id,
            "refresh_token": refresh_token,
        }
        if client_secret:
            form["client_secret"] = client_secret
        payload = self._post_form(form)
        return self._parse_token_payload(payload, actor=actor, client_id=client_id)

    def _post_form(self, form: dict[str, str]) -> dict[str, Any]:
        try:
            response = self._client.post(
                self._token_url,
                data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LinearOAuthError(f"Fallo la llamada al token endpoint de Linear: {exc}") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise LinearOAuthError(
                "Linear devolvio una respuesta no JSON durante el intercambio OAuth."
            ) from exc
        if not isinstance(payload, dict):
            raise LinearOAuthError("Linear devolvio un payload OAuth invalido.")
        if "error" in payload:
            message = str(payload.get("error_description") or payload.get("error"))
            raise LinearOAuthError(f"Linear rechazo la autenticacion OAuth: {message}")
        return payload

    def _parse_token_payload(
        self,
        payload: dict[str, Any],
        *,
        actor: str,
        client_id: str,
    ) -> LinearOAuthCredentials:
        access_token = _require_str(payload, "access_token")
        refresh_token = _require_str(payload, "refresh_token")
        token_type = _require_str(payload, "token_type")
        expires_in = _require_int(payload, "expires_in")

        raw_scope = payload.get("scope")
        scope: tuple[str, ...]
        if isinstance(raw_scope, str):
            scope = tuple(part.strip() for part in raw_scope.replace(",", " ").split() if part.strip())
        elif isinstance(raw_scope, list):
            values = [part.strip() for part in raw_scope if isinstance(part, str) and part.strip()]
            scope = tuple(values)
        else:
            scope = ()

        expires_at = datetime.now(tz=UTC) + timedelta(seconds=expires_in)
        return LinearOAuthCredentials(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type=token_type,
            expires_at=expires_at,
            scope=scope,
            actor=actor,
            client_id=client_id,
        )


def wait_for_linear_oauth_callback(
    *,
    redirect_uri: str,
    timeout_seconds: int = 180,
) -> LinearOAuthCallbackResult:
    parsed = urlparse(redirect_uri)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port
    path = parsed.path or "/"
    if port is None:
        raise LinearOAuthError("El redirect URI local de Linear debe incluir un puerto.")

    queue: Queue[LinearOAuthCallbackResult] = Queue(maxsize=1)

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            request_path = urlparse(self.path)
            if request_path.path != path:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Not found")
                return

            query = parse_qs(request_path.query)
            result = LinearOAuthCallbackResult(
                code=_first(query.get("code")),
                state=_first(query.get("state")),
                error=_first(query.get("error")),
                error_description=_first(query.get("error_description")),
            )
            queue.put(result)

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                (
                    "<html><body><h1>Linear conectado</h1>"
                    "<p>Puedes volver a Codex y continuar.</p></body></html>"
                ).encode("utf-8")
            )

            threading.Thread(target=self.server.shutdown, daemon=True).start()

        def log_message(self, format: str, *args: object) -> None:
            return

    server = HTTPServer((host, port), CallbackHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        try:
            result = queue.get(timeout=timeout_seconds)
        except Exception as exc:
            raise LinearOAuthError(
                "Timeout esperando la aprobacion OAuth de Linear en el navegador."
            ) from exc
        return result
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def authenticate_linear_via_browser(
    *,
    authorize_url: str,
    token_url: str,
    client_id: str,
    redirect_uri: str,
    scopes: list[str],
    actor: str,
    credentials_path: Path,
    open_browser: bool = True,
    timeout_seconds: int = 180,
    client_secret: str | None = None,
    authorization_url_callback: Callable[[str, bool], None] | None = None,
) -> dict[str, Any]:
    ensure_local_redirect_uri(redirect_uri)

    state = generate_oauth_state()
    verifier = generate_pkce_verifier()
    challenge = generate_pkce_challenge(verifier)
    url = build_linear_oauth_authorize_url(
        authorize_url=authorize_url,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scopes=scopes,
        state=state,
        code_challenge=challenge,
        actor=actor,
    )

    browser_opened = False
    if open_browser:
        browser_opened = bool(webbrowser.open(url, new=1, autoraise=True))
    if authorization_url_callback is not None:
        authorization_url_callback(url, browser_opened)

    callback = wait_for_linear_oauth_callback(
        redirect_uri=redirect_uri,
        timeout_seconds=timeout_seconds,
    )
    if callback.error:
        description = callback.error_description or callback.error
        raise LinearOAuthError(f"Linear devolvio un error OAuth: {description}")
    if callback.state != state:
        raise LinearOAuthError(
            "El state devuelto por Linear no coincide con el enviado. Se aborta por seguridad."
        )
    if not callback.code:
        raise LinearOAuthError("Linear no devolvio un authorization code utilizable.")

    token_client = LinearOAuthTokenClient(token_url=token_url)
    try:
        credentials = token_client.exchange_code(
            client_id=client_id,
            redirect_uri=redirect_uri,
            code=callback.code,
            code_verifier=verifier,
            actor=actor,
            client_secret=client_secret,
        )
    finally:
        token_client.close()

    save_linear_oauth_credentials(credentials_path, credentials)
    return {
        "status": "ok",
        "authorization_url": url,
        "browser_opened": browser_opened,
        "credentials_path": str(credentials_path),
        "token_type": credentials.token_type,
        "scope": list(credentials.scope),
        "expires_at": credentials.expires_at.isoformat(),
        "actor": credentials.actor,
        "client_id": credentials.client_id,
    }


def get_linear_authorization_header(
    *,
    api_key: str | None,
    token_url: str,
    oauth_client_id: str | None,
    oauth_actor: str,
    oauth_credentials_path: Path,
    oauth_client_secret: str | None = None,
) -> str:
    if api_key:
        return api_key

    if not oauth_client_id:
        raise LinearOAuthError(
            "Falta autenticacion de Linear. Usa LINEAR_API_KEY o autentica OAuth con LINEAR_OAUTH_CLIENT_ID."
        )

    credentials = load_linear_oauth_credentials(oauth_credentials_path)
    if credentials is None:
        raise LinearOAuthError(
            f"No existen credenciales OAuth de Linear en {oauth_credentials_path}. Ejecuta login_linear primero."
        )
    if credentials.client_id != oauth_client_id:
        raise LinearOAuthError(
            "Las credenciales OAuth locales pertenecen a otro client_id. Reautentica con login_linear."
        )

    if credentials.is_expired():
        token_client = LinearOAuthTokenClient(token_url=token_url)
        try:
            credentials = token_client.refresh_token(
                client_id=oauth_client_id,
                refresh_token=credentials.refresh_token,
                actor=oauth_actor,
                client_secret=oauth_client_secret,
            )
        finally:
            token_client.close()
        save_linear_oauth_credentials(oauth_credentials_path, credentials)

    return f"Bearer {credentials.access_token}"


def _first(values: list[str] | None) -> str | None:
    if not values:
        return None
    value = values[0]
    return value if value else None


def _require_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise LinearOAuthError(f"Falta el campo string requerido '{key}'.")
    return value.strip()


def _require_int(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int):
        raise LinearOAuthError(f"Falta el campo entero requerido '{key}'.")
    return value


def _require_str_tuple(payload: dict[str, Any], key: str) -> tuple[str, ...]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise LinearOAuthError(f"Falta la lista requerida '{key}'.")
    cleaned: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise LinearOAuthError(
                f"Todos los elementos de '{key}' deben ser strings no vacios."
            )
        cleaned.append(item.strip())
    return tuple(cleaned)
