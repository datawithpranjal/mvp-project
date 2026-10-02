from copy import deepcopy
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.api.routes import auth as auth_route, learner_progress as progress_route
from app.main import app
from app.schemas.auth import AuthRequestOtpRequest, AuthVerifyOtpRequest
from app.services.auth_service import AuthService, AuthUnauthorizedError
from app.services.learner_progress_store import LearnerProgressStore
from app.services.premium_access_service import PremiumAccessService


@pytest.fixture
def service(monkeypatch):
    for name, value in [("_memory_users", {}), ("_memory_otps", []), ("_memory_sessions", {}), ("_memory_otp_verify_failures", [])]:
        monkeypatch.setattr(AuthService, name, value)
    instance = AuthService()
    instance.postgres_url = None
    instance.show_debug_otp = True
    monkeypatch.setattr(instance, "_deliver_otp", lambda *args: None)
    monkeypatch.setattr(instance, "_capture_signup_email", lambda *args: None)
    monkeypatch.setattr(instance, "_record_login_usage", lambda *args: None)
    monkeypatch.setattr(auth_route, "auth_service", instance)
    return instance


def request_code(service, email, mode="continue", **fields):
    return service.request_otp(AuthRequestOtpRequest(email=email, mode=mode, **fields)).debug_otp


def verify(service, email, code):
    return service.verify_otp(AuthVerifyOtpRequest(email=email, otp_code=code))


def test_unified_flow_creates_user_only_after_verification(service):
    code = request_code(service, " NEW.learner@example.com ")
    assert service._get_user_by_email("new.learner@example.com") is None
    with pytest.raises(AuthUnauthorizedError):
        verify(service, "new.learner@example.com", "000000")
    assert service._get_user_by_email("new.learner@example.com") is None
    session = verify(service, "new.learner@example.com", code)
    assert session.user.full_name == "Learner"
    assert service.get_profile(session.token).id == session.user.id
    with pytest.raises(AuthUnauthorizedError):
        verify(service, "new.learner@example.com", code)


@pytest.mark.parametrize("mode", ["signin", "signup", "continue"])
def test_old_clients_and_new_flow_keep_existing_account_and_session(service, mode):
    email = "existing.customer@example.com"
    first = verify(service, email, request_code(service, email, "signup", full_name="Existing Customer", role="Engineer", target_role="Senior"))
    before = first.user.model_dump()
    service._memory_otps.clear()  # New request after the cooldown, without waiting in the test.
    code = request_code(service, email, mode, full_name="Must not replace existing name", role="Must not replace role")
    second = verify(service, email, code)
    assert second.user.id == first.user.id
    assert second.user.full_name == before["full_name"]
    assert second.user.role == before["role"]
    assert second.user.target_role == before["target_role"]
    assert second.user.created_at == before["created_at"]
    assert service.get_profile(first.token).id == first.user.id
    assert len(service._memory_users) == 1


def test_expired_code_never_creates_user_and_resend_invalidates_old_code(service):
    email = "expired@example.com"
    old = request_code(service, email)
    service._memory_otps[-1]["expires_at"] = service._now() - timedelta(seconds=1)
    with pytest.raises(AuthUnauthorizedError):
        verify(service, email, old)
    assert service._get_user_by_email(email) is None
    service._memory_otps[-1]["created_at"] -= timedelta(minutes=2)
    new = request_code(service, email)
    assert service._memory_otps[0]["consumed_at"] is not None
    verify(service, email, new)


def configure_google(service):
    service.google_client_id = "test-client"
    service.google_client_secret = "test-secret"
    service.google_redirect_uri = "http://testserver/api/v1/auth/google/callback"
    service.google_state_secret = "test-state-secret"


@pytest.mark.parametrize("method", ["email", "google"])
def test_paid_customer_keeps_premium_progress_and_original_session(service, monkeypatch, tmp_path, method):
    email = "synthetic.customer@gmail.com"
    first = verify(service, email, request_code(service, email, "signup", full_name="Paid Learner", role="Engineer"))
    premium = PremiumAccessService()
    premium.grant_manual_access(email, "Premium", "yearly", 999, f"TEST-CONTINUITY-{method}")
    grant = deepcopy(premium._memory_grants[email])
    monkeypatch.setattr(progress_route, "learner_progress_store", LearnerProgressStore(storage_path=tmp_path / "progress.json"))
    client = TestClient(app)
    saved = client.put("/api/v1/learner-progress/coding_lab:sql/test-lab/draft", headers={"Authorization": f"Bearer {first.token}"}, json={"draft_answer": "SELECT 1", "client_revision": 123})
    assert saved.status_code == 200
    if method == "google":
        configure_google(service)
        monkeypatch.setattr(service, "_fetch_google_user_info", lambda code: {"email": email, "email_verified": True, "name": "Do not replace name"})
        second, _ = service.authenticate_google_callback("test-code", service._build_google_state("/labs/sql?lab=test-lab"))
    else:
        service._memory_otps.clear()
        second = verify(service, email, request_code(service, email.upper()))
    assert second.user.id == first.user.id
    assert second.user.full_name == "Paid Learner"
    assert second.user.role == "Engineer"
    assert service.get_profile(first.token).id == first.user.id
    assert premium.has_access(email)
    assert premium._memory_grants[email] == grant
    reloaded = client.get("/api/v1/learner-progress", headers={"Authorization": f"Bearer {second.token}"})
    assert reloaded.json()["items"][0]["draft_answer"] == "SELECT 1"


def test_google_requires_browser_cookie_and_preserves_destination(service, monkeypatch):
    configure_google(service)
    monkeypatch.setattr(service, "_fetch_google_user_info", lambda code: {"email": "google.learner@gmail.com", "email_verified": True, "name": "Google Learner"})
    client = TestClient(app)
    destination = "/labs/python?lab=python-foundry-01-normalize-payment-statuses"
    url = client.get("/api/v1/auth/google/start-url", params={"return_to": destination}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    bad = client.get("/api/v1/auth/google/callback", params={"state": state, "code": "test"}, follow_redirects=False)
    assert "#token=" not in bad.headers["location"]
    assert not service._memory_users
    started = client.get("/api/v1/auth/google/start", params={"state": state}, follow_redirects=False)
    assert "HttpOnly" in started.headers["set-cookie"]
    assert "SameSite=lax" in started.headers["set-cookie"]
    good = client.get("/api/v1/auth/google/callback", params={"state": state, "code": "test"}, follow_redirects=False)
    fragment = parse_qs(urlparse(good.headers["location"]).fragment)
    assert fragment["return_to"] == [destination]
    assert fragment["state"] == [state]
    assert good.headers["cache-control"] == "no-store"
    replay = client.get("/api/v1/auth/google/callback", params={"state": state, "code": "test"}, follow_redirects=False)
    assert "#token=" not in replay.headers["location"]


@pytest.mark.parametrize("target", ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil"])
def test_google_rejects_external_return_destinations(service, target):
    state = service._build_google_state(target)
    assert service._parse_google_state(state)["return_to"] == "/dashboard"


def test_google_rejects_tampered_expired_state_and_untrusted_mailbox(service, monkeypatch):
    configure_google(service)
    state = service._build_google_state("/labs")
    with pytest.raises(AuthUnauthorizedError):
        service._parse_google_state(state + "a")
    now = service._now()
    monkeypatch.setattr(service, "_now", lambda: now + timedelta(minutes=16))
    with pytest.raises(AuthUnauthorizedError):
        service._parse_google_state(state)
    monkeypatch.setattr(service, "_now", lambda: now)
    monkeypatch.setattr(service, "_fetch_google_user_info", lambda code: {"email": "stale@example.com", "email_verified": True})
    with pytest.raises(AuthUnauthorizedError, match="continue with email"):
        service.authenticate_google_callback("test", state)
    assert not service._memory_users


def test_google_unavailable_does_not_disable_email(service):
    service.google_client_id = None
    with TestClient(app) as client:
        assert client.get("/api/v1/auth/providers").json() == {"email": True, "google": False}
        response = client.post("/api/v1/auth/request-otp", json={"email": "fallback@example.com", "mode": "continue"})
        assert response.status_code == 200
