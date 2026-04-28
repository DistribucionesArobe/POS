"""Smoke test - verifica que la app arranca."""
from fastapi.testclient import TestClient


def test_health(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    from app.main import app
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
