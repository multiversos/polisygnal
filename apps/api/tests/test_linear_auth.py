from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services.linear_auth import (
    LinearOAuthCredentials,
    LinearOAuthError,
    build_linear_oauth_authorize_url,
    ensure_local_redirect_uri,
    generate_pkce_challenge,
    get_linear_authorization_header,
    load_linear_oauth_credentials,
    save_linear_oauth_credentials,
)


def test_build_linear_oauth_authorize_url_contains_expected_parameters() -> None:
    url = build_linear_oauth_authorize_url(
        authorize_url="https://linear.app/oauth/authorize",
        client_id="client-123",
        redirect_uri="http://127.0.0.1:8765/callback",
        scopes=["read", "write"],
        state="state-123",
        code_challenge=generate_pkce_challenge("verifier-123"),
        actor="user",
    )

    assert "client_id=client-123" in url
    assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2Fcallback" in url
    assert "scope=read%2Cwrite" in url
    assert "code_challenge_method=S256" in url
    assert "actor=user" in url


def test_ensure_local_redirect_uri_rejects_remote_host() -> None:
    with pytest.raises(LinearOAuthError):
        ensure_local_redirect_uri("https://example.com/callback")


def test_save_and_load_linear_oauth_credentials_roundtrip(tmp_path) -> None:
    credentials = LinearOAuthCredentials(
        access_token="access-token",
        refresh_token="refresh-token",
        token_type="Bearer",
        expires_at=datetime.now(tz=UTC) + timedelta(hours=1),
        scope=("read", "write"),
        actor="user",
        client_id="client-123",
    )
    credentials_path = tmp_path / "oauth-credentials.json"

    save_linear_oauth_credentials(credentials_path, credentials)
    loaded = load_linear_oauth_credentials(credentials_path)

    assert loaded == credentials


def test_get_linear_authorization_header_uses_existing_oauth_credentials(tmp_path) -> None:
    credentials = LinearOAuthCredentials(
        access_token="access-token",
        refresh_token="refresh-token",
        token_type="Bearer",
        expires_at=datetime.now(tz=UTC) + timedelta(hours=1),
        scope=("read", "write"),
        actor="user",
        client_id="client-123",
    )
    credentials_path = tmp_path / "oauth-credentials.json"
    save_linear_oauth_credentials(credentials_path, credentials)

    authorization = get_linear_authorization_header(
        api_key=None,
        token_url="https://api.linear.app/oauth/token",
        oauth_client_id="client-123",
        oauth_actor="user",
        oauth_credentials_path=credentials_path,
        oauth_client_secret=None,
    )

    assert authorization == "Bearer access-token"


def test_get_linear_authorization_header_returns_api_key_when_present(tmp_path) -> None:
    authorization = get_linear_authorization_header(
        api_key="linear-personal-key",
        token_url="https://api.linear.app/oauth/token",
        oauth_client_id=None,
        oauth_actor="user",
        oauth_credentials_path=tmp_path / "oauth-credentials.json",
        oauth_client_secret=None,
    )

    assert authorization == "linear-personal-key"
