from copy import deepcopy
from datetime import timedelta
import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.api.routes import auth as auth_route, learner_progress as progress_route
from app.main import app
from app.core.config import Settings
from app.schemas.auth import AuthRequestOtpRequest, AuthVerifyOtpRequest
from app.services.auth_service import AuthService, AuthUnauthorizedError, AuthValidationError
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


@pytest.mark.parametrize("origin", ["https://datawithpranjal.com", "https://www.datawithpranjal.com"])
@pytest.mark.parametrize("outcome", ["success", "cancel", "missing_code", "provider_error", "missing_cookie"])
def test_google_returns_success_and_failures_to_original_trusted_origin(service, monkeypatch, origin, outcome):
    configure_google(service)
    service.frontend_base_url = "https://datawithpranjal.com"
    service.google_frontend_origins = {"https://www.datawithpranjal.com"}
    calls = []

    def google_profile(code):
        calls.append(code)
        if outcome == "provider_error":
            raise AuthUnauthorizedError("Please continue with email.")
        return {"email": "origin.test@gmail.com", "email_verified": True, "name": "Learner"}

    monkeypatch.setattr(service, "_fetch_google_user_info", google_profile)
    client = TestClient(app)
    destination = "/labs/python?lab=example#editor"
    result = client.get("/api/v1/auth/google/start-url", params={"return_to": destination, "frontend_origin": origin})
    assert result.status_code == 200
    assert result.headers["cache-control"] == "no-store"
    state = parse_qs(urlparse(result.json()["url"]).query)["state"][0]
    assert service._parse_google_state(state)["frontend_origin"] == origin
    # Neither an extra query parameter nor a forged HTTP header overrides signed state.
    if outcome != "missing_cookie":
        client.get("/api/v1/auth/google/start", params={"state": state, "frontend_origin": "https://evil.example"}, follow_redirects=False)
    params = {"state": state, "frontend_origin": "https://evil.example"}
    if outcome == "cancel":
        params["error"] = "access_denied"
    elif outcome != "missing_code":
        params["code"] = "test"
    response = client.get("/api/v1/auth/google/callback", params=params, headers={"Origin": "https://evil.example"}, follow_redirects=False)
    target = urlparse(response.headers["location"])
    assert f"{target.scheme}://{target.netloc}" == origin
    assert target.path == "/auth/callback"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "Max-Age=0" in response.headers["set-cookie"]
    if outcome == "success":
        assert parse_qs(target.fragment)["return_to"] == [destination]
        assert "token" in parse_qs(target.fragment)
    else:
        assert "token" not in parse_qs(target.fragment)
        assert "error" in parse_qs(target.query)
        assert not service._memory_users
    if outcome in {"cancel", "missing_code", "missing_cookie"}:
        assert not calls


@pytest.mark.parametrize("origin", [
    "https://evil.example", "https://datawithpranjal.com.evil.example",
    "https://datawithpranjal.com@evil.example", "https://www.datawithpranjal.com:444",
    "https://www.datawithpranjal.com/", "https://www.datawithpranjal.com/path",
    "https://www.datawithpranjal.com?redirect=evil", "https://www.datawithpranjal.com#fragment",
    "https://www.datawithpranjal.com\\@evil.example", "https://www.datawithpranjal.com\nevil",
    "http://www.datawithpranjal.com", "//www.datawithpranjal.com", "https://*.vercel.app",
    "https://%77ww.datawithpranjal.com", "https://unapproved-preview.vercel.app", "",
])
def test_google_rejects_untrusted_or_malformed_origins_before_navigation(service, origin):
    configure_google(service)
    service.frontend_base_url = "https://datawithpranjal.com"
    service.google_frontend_origins = {"https://www.datawithpranjal.com"}
    client = TestClient(app)
    for endpoint in ["start-url", "start"]:
        result = client.get(f"/api/v1/auth/google/{endpoint}", params={"frontend_origin": origin}, follow_redirects=False)
        assert result.status_code == 400
        assert "location" not in result.headers
        assert "set-cookie" not in result.headers


def signed_test_state(service, payload):
    encoded = service._base64url_encode(json.dumps(payload).encode())
    signature = hmac.new(service.google_state_secret.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{service._base64url_encode(signature)}"


@pytest.mark.parametrize("failure", ["tampered", "expired", "removed_origin", "malformed_signed_origin"])
def test_google_revalidates_state_origin_even_on_cancellation(service, monkeypatch, failure):
    configure_google(service)
    service.frontend_base_url = "https://datawithpranjal.com"
    service.google_frontend_origins = {"https://www.datawithpranjal.com"}
    state = service._build_google_state("/labs", frontend_origin="https://www.datawithpranjal.com")
    if failure == "tampered":
        state += "a"
    elif failure == "expired":
        now = service._now()
        monkeypatch.setattr(service, "_now", lambda: now + timedelta(minutes=16))
    elif failure == "removed_origin":
        service.google_frontend_origins.clear()
    else:
        payload = service._parse_google_state(state)
        payload["frontend_origin"] = {"url": "https://evil.example"}
        state = signed_test_state(service, payload)
    client = TestClient(app)
    client.cookies.set(auth_route.GOOGLE_STATE_COOKIE, state)
    result = client.get("/api/v1/auth/google/callback", params={"state": state, "error": "access_denied"}, follow_redirects=False)
    assert result.headers["location"].startswith("https://datawithpranjal.com/auth/callback?error=")
    assert not service._memory_users


def test_google_legacy_state_and_configured_local_development_are_supported(service):
    configure_google(service)
    service.frontend_base_url = "http://localhost:3000"
    payload = service._parse_google_state(service._build_google_state("/labs"))
    del payload["frontend_origin"]
    assert service.google_callback_origin(signed_test_state(service, payload)) == "http://localhost:3000"
    # A loopback origin still requires explicit configuration; it is not globally trusted.
    with pytest.raises(AuthValidationError):
        service._build_google_state("/labs", frontend_origin="http://localhost:3001")
    service.google_frontend_origins = {"http://localhost:3001"}
    assert service.google_frontend_origin("http://localhost:3001") == "http://localhost:3001"


def test_google_origin_configuration_is_an_explicit_list(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_FRONTEND_ORIGINS", " https://www.datawithpranjal.com,https://datawithpranjal.com ")
    assert Settings(_env_file=None).google_oauth_frontend_origins == ["https://www.datawithpranjal.com", "https://datawithpranjal.com"]
    monkeypatch.setenv("GOOGLE_OAUTH_FRONTEND_ORIGINS", "")
    assert Settings(_env_file=None).google_oauth_frontend_origins == []
