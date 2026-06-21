from fastapi.testclient import TestClient

from app.api.routes import feedback as feedback_route
from app.core.config import DEFAULT_POSTGRES_URL
from app.main import app
from app.services.feedback_store import FeedbackStore

client = TestClient(app)


def test_feedback_submission_and_admin_read(monkeypatch, tmp_path) -> None:
    store = FeedbackStore(
        storage_path=tmp_path / "feedback.jsonl",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(feedback_route, "feedback_store", store)
    monkeypatch.setattr(feedback_route.settings, "admin_api_token", "test-admin-token")

    response = client.post(
        "/api/v1/feedback",
        json={
            "name": "Launch Learner",
            "email": "learner@example.com",
            "category": "content",
            "message": "The SQL explanations are useful, but I would like more edge cases.",
            "rating": 4,
            "page_url": "/labs/sql",
        },
    )

    assert response.status_code == 200
    assert response.json()["submitted"] is True

    unauthorized = client.get("/api/v1/admin/feedback")
    assert unauthorized.status_code == 401

    admin_response = client.get(
        "/api/v1/admin/feedback",
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert admin_response.status_code == 200
    payload = admin_response.json()
    assert payload["count"] == 1
    assert payload["rows"][0]["email"] == "learner@example.com"
    assert payload["rows"][0]["category"] == "content"
    assert payload["rows"][0]["rating"] == 4


def test_feedback_rejects_short_message(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        feedback_route,
        "feedback_store",
        FeedbackStore(
            storage_path=tmp_path / "feedback.jsonl",
            postgres_url=DEFAULT_POSTGRES_URL,
        ),
    )

    response = client.post(
        "/api/v1/feedback",
        json={
            "name": "Learner",
            "email": "learner@example.com",
            "category": "bug",
            "message": "Broken",
        },
    )

    assert response.status_code == 422
