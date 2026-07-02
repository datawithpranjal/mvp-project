from fastapi.testclient import TestClient

from app.api.routes import auth as auth_route
from app.api.routes import usage as usage_route
from app.core.config import DEFAULT_POSTGRES_URL
from app.main import app
from app.services.usage_store import UsageStore

client = TestClient(app)


def test_usage_events_capture_time_questions_and_logins(monkeypatch, tmp_path) -> None:
    store = UsageStore(
        storage_path=tmp_path / "usage.jsonl",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(usage_route, "usage_store", store)
    monkeypatch.setattr(auth_route.auth_service, "usage_store", store)
    monkeypatch.setattr(usage_route.settings, "admin_api_token", "test-admin-token")

    email = "usage.student@example.com"
    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={
            "mode": "signup",
            "email": email,
            "full_name": "Usage Student",
        },
    )
    assert otp_response.status_code == 200

    token_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_response.json()["debug_otp"]},
    )
    assert token_response.status_code == 200
    token = token_response.json()["token"]

    headers = {"Authorization": f"Bearer {token}"}
    heartbeat_response = client.post(
        "/api/v1/usage/events",
        headers=headers,
        json={
            "event_name": "session_heartbeat",
            "session_id": "session-test-001",
            "active_seconds": 60,
            "page_url": "/labs/sql",
            "metadata": {"path": "/labs/sql"},
        },
    )
    assert heartbeat_response.status_code == 200

    submitted_response = client.post(
        "/api/v1/usage/events",
        headers=headers,
        json={
            "event_name": "coding_lab_submitted",
            "session_id": "session-test-001",
            "page_url": "/labs/sql",
            "metadata": {
                "lab_slug": "sql-coding-01-second-highest-salary",
                "track": "sql",
                "passed": True,
            },
        },
    )
    assert submitted_response.status_code == 200

    completed_response = client.post(
        "/api/v1/usage/events",
        headers=headers,
        json={
            "event_name": "coding_lab_completed",
            "session_id": "session-test-001",
            "page_url": "/labs/sql",
            "metadata": {
                "lab_slug": "sql-coding-01-second-highest-salary",
                "track": "sql",
            },
        },
    )
    assert completed_response.status_code == 200

    summary_response = client.get(
        "/api/v1/admin/usage/summary",
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert summary_response.status_code == 200
    payload = summary_response.json()
    assert payload["total_users"] == 1
    assert payload["rows"][0]["email"] == email
    assert payload["rows"][0]["total_active_seconds"] == 60
    assert payload["rows"][0]["questions_submitted"] == 1
    assert payload["rows"][0]["questions_completed"] == 1
    assert payload["rows"][0]["logins_7d"] == 1
    assert payload["rows"][0]["logins_30d"] == 1


def test_usage_rejects_client_login_events(monkeypatch, tmp_path) -> None:
    store = UsageStore(
        storage_path=tmp_path / "usage.jsonl",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(usage_route, "usage_store", store)

    email = "usage.rejected@example.com"
    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={
            "mode": "signup",
            "email": email,
            "full_name": "Usage Rejected",
        },
    )
    token_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_response.json()["debug_otp"]},
    )
    token = token_response.json()["token"]

    response = client.post(
        "/api/v1/usage/events",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "event_name": "login_success",
            "session_id": "session-test-login",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Login events are recorded by the server."


def test_anonymous_usage_events_capture_daily_page_counts(monkeypatch, tmp_path) -> None:
    store = UsageStore(
        storage_path=tmp_path / "usage.jsonl",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(usage_route, "usage_store", store)
    monkeypatch.setattr(usage_route.settings, "admin_api_token", "test-admin-token")

    page_response = client.post(
        "/api/v1/usage/anonymous-events",
        json={
            "event_name": "page_view",
            "visitor_id": "visitor-test-001",
            "session_id": "anonymous-session-001",
            "page_url": "/scenarios/duplicate-records-after-rerun",
            "metadata": {
                "content_type": "scenario",
                "content_id": "duplicate-records-after-rerun",
            },
        },
    )
    assert page_response.status_code == 200

    heartbeat_response = client.post(
        "/api/v1/usage/anonymous-events",
        json={
            "event_name": "session_heartbeat",
            "visitor_id": "visitor-test-001",
            "session_id": "anonymous-session-001",
            "page_url": "/scenarios/duplicate-records-after-rerun",
            "active_seconds": 45,
            "metadata": {
                "path": "/scenarios/duplicate-records-after-rerun",
            },
        },
    )
    assert heartbeat_response.status_code == 200

    visitor_summary_response = client.get(
        "/api/v1/admin/usage/visitors",
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert visitor_summary_response.status_code == 200
    visitor_payload = visitor_summary_response.json()
    assert visitor_payload["total_visits"] == 1
    assert visitor_payload["unique_visitors"] == 1
    assert visitor_payload["total_active_seconds"] == 45
    assert visitor_payload["daily_totals"][0]["visits"] == 1
    assert visitor_payload["top_pages"][0]["page_url"] == "/scenarios/duplicate-records-after-rerun"

    user_summary_response = client.get(
        "/api/v1/admin/usage/summary",
        headers={"X-Admin-Token": "test-admin-token"},
    )
    assert user_summary_response.status_code == 200
    assert user_summary_response.json()["total_users"] == 0


def test_anonymous_usage_rejects_client_login_events(monkeypatch, tmp_path) -> None:
    store = UsageStore(
        storage_path=tmp_path / "usage.jsonl",
        postgres_url=DEFAULT_POSTGRES_URL,
    )
    monkeypatch.setattr(usage_route, "usage_store", store)

    response = client.post(
        "/api/v1/usage/anonymous-events",
        json={
            "event_name": "login_success",
            "visitor_id": "visitor-test-login",
            "session_id": "anonymous-session-login",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Login events are recorded by the server."
