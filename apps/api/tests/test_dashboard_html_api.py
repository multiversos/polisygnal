from __future__ import annotations

from fastapi.testclient import TestClient

from app.services import dashboard_artifacts


def test_get_app_meta_returns_dashboard_available_when_artifact_exists(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.write_text("<html><body>dashboard</body></html>\n", encoding="utf-8")

    app_meta_response = client.get("/app/meta")
    dashboard_meta_response = client.get("/dashboard/latest/meta")

    assert app_meta_response.status_code == 200
    assert app_meta_response.json() == {
        "dashboard_available": True,
        "dashboard_path": "/dashboard/latest",
        "app_path": "/app",
        "root_path": "/",
    }
    assert (
        app_meta_response.json()["dashboard_available"]
        == dashboard_meta_response.json()["artifact_available"]
    )


def test_get_root_redirects_to_latest_dashboard(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.write_text("<html><body>dashboard</body></html>\n", encoding="utf-8")

    response = client.get("/", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/dashboard/latest"


def test_get_app_redirects_to_latest_dashboard(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.write_text("<html><body>dashboard</body></html>\n", encoding="utf-8")

    response = client.get("/app", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/dashboard/latest"


def test_get_latest_dashboard_meta_returns_existing_artifact_metadata(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    html = (
        "<!DOCTYPE html>\n"
        "<html><head><title>PolySignal Dashboard</title></head>"
        "<body><h1>Latest dashboard</h1></body></html>\n"
    )
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.write_text(html, encoding="utf-8")

    response = client.get("/dashboard/latest/meta")

    assert response.status_code == 200
    assert response.json() == {
        "artifact_available": True,
        "path": str(dashboard_path),
        "generated_at": response.json()["generated_at"],
    }
    assert response.json()["generated_at"] is not None


def test_get_latest_dashboard_serves_existing_html_artifact(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)
    dashboard_path = tmp_path / "logs" / "dashboard" / "latest-dashboard.html"
    html = (
        "<!DOCTYPE html>\n"
        "<html><head><title>PolySignal Dashboard</title></head>"
        "<body><h1>Latest dashboard</h1></body></html>\n"
    )
    dashboard_path.parent.mkdir(parents=True, exist_ok=True)
    dashboard_path.write_text(html, encoding="utf-8")

    response = client.get("/dashboard/latest")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert response.content == dashboard_path.read_bytes()


def test_get_latest_dashboard_returns_clear_404_when_artifact_is_missing(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/dashboard/latest")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Dashboard latest artifact no encontrado. Ejecuta generate_dashboard primero."
    }

    redirected_response = client.get("/", follow_redirects=True)
    assert redirected_response.status_code == 404
    assert redirected_response.json() == {
        "detail": "Dashboard latest artifact no encontrado. Ejecuta generate_dashboard primero."
    }

    redirected_app_response = client.get("/app", follow_redirects=True)
    assert redirected_app_response.status_code == 404
    assert redirected_app_response.json() == {
        "detail": "Dashboard latest artifact no encontrado. Ejecuta generate_dashboard primero."
    }


def test_get_latest_dashboard_meta_returns_empty_payload_when_artifact_is_missing(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)

    response = client.get("/dashboard/latest/meta")

    assert response.status_code == 200
    assert response.json() == {
        "artifact_available": False,
        "path": None,
        "generated_at": None,
    }


def test_get_app_meta_returns_dashboard_unavailable_when_artifact_is_missing(
    client: TestClient,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_artifacts, "REPO_ROOT", tmp_path)

    app_meta_response = client.get("/app/meta")
    dashboard_meta_response = client.get("/dashboard/latest/meta")
    dashboard_html_response = client.get("/dashboard/latest")
    root_redirect_response = client.get("/", follow_redirects=False)
    app_redirect_response = client.get("/app", follow_redirects=False)

    assert app_meta_response.status_code == 200
    assert app_meta_response.json() == {
        "dashboard_available": False,
        "dashboard_path": "/dashboard/latest",
        "app_path": "/app",
        "root_path": "/",
    }
    assert (
        app_meta_response.json()["dashboard_available"]
        == dashboard_meta_response.json()["artifact_available"]
    )
    assert dashboard_html_response.status_code == 404
    assert root_redirect_response.status_code == 307
    assert root_redirect_response.headers["location"] == "/dashboard/latest"
    assert app_redirect_response.status_code == 307
    assert app_redirect_response.headers["location"] == "/dashboard/latest"
