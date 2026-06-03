import pytest
from fastapi.testclient import TestClient


def _import_app():
    try:
        from main import app  # noqa
        return app
    except ModuleNotFoundError as exc:
        # Minimal CI environments may not install optional infra deps (motor, chromadb, etc.)
        pytest.skip(f"Skipping API contract test; missing dependency: {exc}")


def test_v1_job_match_route_exists():
    app = _import_app()
    client = TestClient(app)
    # Minimal invalid payload to trigger validation but confirm route exists.
    r = client.post("/api/v1/job-match", json={})
    assert r.status_code in (400, 401, 422)


def test_metrics_endpoint_exists():
    app = _import_app()
    client = TestClient(app)
    r = client.get("/api/metrics")
    assert r.status_code == 200
    assert "text/plain" in r.headers.get("content-type", "")

