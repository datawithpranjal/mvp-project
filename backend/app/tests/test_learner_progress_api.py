from fastapi.testclient import TestClient

from app.api.routes import learner_progress as learner_progress_route
from app.api.routes import auth as auth_route
from app.main import app
from app.services.learner_progress_store import LearnerProgressStore


client = TestClient(app)


def create_session(email: str, name: str) -> str:
    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={"mode": "signup", "email": email, "full_name": name},
    )
    assert otp_response.status_code == 200
    verify_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_response.json()["debug_otp"]},
    )
    assert verify_response.status_code == 200
    return verify_response.json()["token"]


def test_progress_survives_reload_and_duplicate_attempt_is_idempotent(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        learner_progress_route,
        "learner_progress_store",
        LearnerProgressStore(storage_path=tmp_path / "progress.json"),
    )

    token = create_session("persistence.student@example.com", "Persistence Student")
    headers = {"Authorization": f"Bearer {token}"}
    draft_response = client.put(
        "/api/v1/learner-progress/coding_lab:sql/sql-1/draft",
        headers=headers,
        json={
            "draft_answer": "SELECT 1",
            "draft_interview_answer": "Use a stable grain.",
            "hints_revealed": 1,
            "client_revision": 10,
        },
    )
    assert draft_response.status_code == 200
    assert draft_response.json()["item"]["draft_answer"] == "SELECT 1"

    attempt_payload = {
        "idempotency_key": "attempt-persistence-1",
        "answer": "SELECT 1",
        "passed": True,
        "message": "Passed",
        "result": {"passed": True, "score": 100},
        "ai_feedback": None,
    }
    first_attempt = client.post(
        "/api/v1/learner-progress/coding_lab:sql/sql-1/attempt",
        headers=headers,
        json=attempt_payload,
    )
    duplicate_attempt = client.post(
        "/api/v1/learner-progress/coding_lab:sql/sql-1/attempt",
        headers=headers,
        json=attempt_payload,
    )
    assert first_attempt.status_code == 200
    assert duplicate_attempt.status_code == 200
    assert first_attempt.json()["duplicate"] is False
    assert duplicate_attempt.json()["duplicate"] is True
    assert len(duplicate_attempt.json()["item"]["attempts"]) == 1
    assert duplicate_attempt.json()["item"]["completed"] is True

    reloaded = client.get("/api/v1/learner-progress", headers=headers)
    assert reloaded.status_code == 200
    assert reloaded.json()["items"][0]["draft_answer"] == "SELECT 1"
    assert reloaded.json()["items"][0]["completed"] is True


def test_progress_is_scoped_to_the_authenticated_account(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        learner_progress_route,
        "learner_progress_store",
        LearnerProgressStore(storage_path=tmp_path / "progress.json"),
    )

    first_token = create_session("first.progress@example.com", "First Learner")
    second_token = create_session("second.progress@example.com", "Second Learner")
    response = client.put(
        "/api/v1/learner-progress/scenario/private-case/draft",
        headers={"Authorization": f"Bearer {first_token}"},
        json={"draft_answer": "private", "client_revision": 1},
    )
    assert response.status_code == 200

    second_view = client.get(
        "/api/v1/learner-progress",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert second_view.status_code == 200
    assert second_view.json()["items"] == []
