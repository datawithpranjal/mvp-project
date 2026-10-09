from datetime import date, datetime, timedelta, timezone
import json

from fastapi.testclient import TestClient
import pytest

from app.api.routes import reporting as route
from app.core.config import DEFAULT_POSTGRES_URL, Settings
from app.main import app
from app.services import admin_reporting as module
from app.services.admin_reporting import AdminReporting, IST, usage_report, source_label

client = TestClient(app)
NOW = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
START = datetime(2026, 9, 8, tzinfo=IST)
END = datetime(2026, 10, 8, tzinfo=IST)


def event(user="account-1", name="coding_lab_submitted", at=None, session="session-1", **metadata):
    return {"user_id": user, "event_name": name, "session_id": session, "at": at or START, "created_at": (at or START).isoformat(), "metadata": metadata}


def summarize(records):
    return usage_report(records, START, END, START - timedelta(days=30))


def service(tmp_path):
    return AdminReporting(Settings(_env_file=None, postgres_url=DEFAULT_POSTGRES_URL, usage_store_path=str(tmp_path / "usage.jsonl"), feedback_store_path=str(tmp_path / "feedback.jsonl")))


def test_full_population_counts_not_first_fifty():
    records = [event(user=f"account-{n}", session=f"session-{n}", lab_slug="sql-test", passed=n % 2 == 0) for n in range(125)]
    result = summarize(records + records[:2])
    assert result["current"]["observed_accounts"] == 125
    assert result["current"]["practising_accounts"] == 125
    assert result["current"]["submission_events"] == 127
    assert result["learning"][0]["starters"] == 125
    assert result["learning"][0]["reported_pass_accounts"] == 63


def test_anonymous_and_account_not_added_as_people_and_ordering():
    landing = event("visitor:browser", "page_view", START + timedelta(hours=1))
    landing["page_url"] = "/?utm_source=youtube&utm_content=roadmap"
    records = [event(name="coding_lab_submitted"), landing, event(name="content_view", at=START + timedelta(hours=2))]
    result = summarize(records)
    assert result["acquisition"][0] == {"source": "youtube / roadmap", "landing_sessions": 1, "content_sessions": 1, "account_practice_sessions": 0, "checkout_sessions": 0}
    assert result["current"]["anonymous_browsers"] == 1
    assert result["current"]["observed_accounts"] == 1
    assert "people" not in result["current"]


def test_shared_browser_session_excluded_from_account_attribution():
    records = [event("visitor:one", "page_view"), event(at=START + timedelta(hours=1)), event("account-2", at=START + timedelta(hours=2))]
    result = summarize(records)
    assert result["ambiguous_sessions"] == 1
    assert result["acquisition"][0]["account_practice_sessions"] == 0


def test_retention_maturity_history_and_calendar_boundaries():
    records = [event(at=START), event(at=START + timedelta(days=2)), event(at=START + timedelta(days=22)), event("new", at=END - timedelta(days=2)), event("old", at=START - timedelta(days=1)), event("old", at=START + timedelta(days=1))]
    result = summarize(records)
    assert result["retention"] == [
        {"window": "W1", "eligible": 1, "returned": 1, "pending": 1, "rate": 100.0},
        {"window": "W4", "eligible": 1, "returned": 1, "pending": 1, "rate": 100.0},
    ]


def test_no_mature_cohort_is_null_not_zero_percent():
    result = summarize([event(at=END - timedelta(days=1))])
    assert result["retention"][0]["rate"] is None


def test_ist_midnight_and_previous_period_are_disjoint():
    result = summarize([event(at=START - timedelta(seconds=1)), event(at=START), event(at=END)])
    assert result["current"]["submission_events"] == 1
    assert result["previous"]["submission_events"] == 1
    assert result["daily"][0]["date"] == "2026-09-08"


def test_self_completion_is_not_reported_pass():
    result = summarize([event(name="scenario_completed", scenario_slug="incident")])
    assert result["learning"][0]["reported_pass_accounts"] == 0
    assert result["learning"][0]["completion_events"] == 1


def test_auth_retries_deduplicate_session_and_require_order():
    records = [event(name="auth_succeeded", method="email"), event(name="auth_started", at=START + timedelta(minutes=1), method="email"), event(name="auth_started", at=START + timedelta(minutes=2), method="email"), event(name="auth_failed", at=START + timedelta(minutes=3), method="email"), event(name="auth_succeeded", at=START + timedelta(minutes=4), method="email"), event(at=START + timedelta(minutes=5))]
    assert summarize(records)["authentication"] == [{"method": "email", "started_sessions": 1, "succeeded_after_start": 1, "sessions_with_error": 1, "practice_after_success": 1}]


def test_missing_empty_and_corrupt_are_distinct(tmp_path):
    reporter = service(tmp_path)
    result = reporter.report(now=NOW)
    assert result["sources"]["usage"] == "missing"
    assert result["usage"] is None
    (tmp_path / "usage.jsonl").write_text("")
    result = reporter.report(now=NOW)
    assert result["sources"]["usage"] == "empty"
    assert result["usage"]["current"]["events"] == 0
    (tmp_path / "usage.jsonl").write_text("not-json\n")
    result = reporter.report(now=NOW)
    assert result["sources"]["usage"] == "unavailable"
    assert result["usage"] is None


def test_overflow_never_returns_partial_totals(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "MAX_ROWS", 2)
    record = {k: v for k, v in event().items() if k != "at"}
    (tmp_path / "usage.jsonl").write_text("\n".join(json.dumps(record) for _ in range(3)))
    result = service(tmp_path).report(now=NOW)
    assert result["sources"]["usage"] == "capacity_exceeded"
    assert result["usage"] is None


def test_payment_classification_mismatch_and_no_pii(tmp_path, monkeypatch):
    reporter = service(tmp_path)
    def purchase(email, **overrides):
        return {"email": email, "amount_inr": 999, "currency": "INR", "purchase_status": "paid", "payment_provider": "razorpay", "billing_interval": "monthly", "purchased_at": START, "access_expires_at": NOW + timedelta(days=20), **overrides}
    fixtures = {"usage": [], "purchases": [purchase("a@example.com"), purchase("b@example.com"), purchase("manual@example.com", payment_provider="manual"), purchase("free@example.com", amount_inr=0), purchase("refund@example.com", purchase_status="refunded")], "grants": [{"email": "a@example.com", "expires_at": NOW + timedelta(days=1)}], "feedback": [{"created_at": START, "category": "bug", "rating": 1, "message": "secret raw message", "email": "pii@example.com"}]}
    monkeypatch.setattr(reporter, "read", lambda source, start, end: (fixtures[source], "ready"))
    result = reporter.report(now=NOW)
    assert result["payments"]["recorded_gross_inr"] == 1998
    assert result["payments"]["other_records"] == 3
    assert result["payments"]["paid_without_active_grant_now"] == 1
    serialized = json.dumps(result, default=str)
    assert "@example.com" not in serialized
    assert "secret raw message" not in serialized
    assert result["feedback"]["low_ratings"] == 1


def test_source_failure_does_not_zero_other_sections(tmp_path, monkeypatch):
    reporter = service(tmp_path)
    def read(source, start, end):
        if source == "purchases":
            raise RuntimeError("database credentials must not escape")
        return [], "empty"
    monkeypatch.setattr(reporter, "read", read)
    result = reporter.report(now=NOW)
    assert result["payments"] is None
    assert result["usage"]["current"]["events"] == 0
    assert "credentials" not in json.dumps(result)


def test_safe_source_labels_and_bad_urls():
    assert source_label({"page_url": "/?utm_source=person@example.com"}) == "direct / unknown"
    assert source_label({"page_url": "http://[invalid"}) == "invalid / unknown"
    assert source_label({"metadata": {"referrer": "https://notyoutube.com"}}) == "other referral / untagged"


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(route.settings, "admin_api_token", "admin-test-only")
    monkeypatch.setattr(route.settings, "reporting_api_token", "reader-test-only")
    monkeypatch.setattr(route, "reporting", service(tmp_path))


def test_report_auth_revocation_and_no_cache(configured, monkeypatch):
    assert client.get("/api/v1/admin/reporting").status_code == 401
    response = client.get("/api/v1/admin/reporting", headers={"X-Reporting-Token": "reader-test-only"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/v1/admin/reporting", headers={"X-Admin-Token": "admin-test-only"}).status_code == 200
    monkeypatch.setattr(route.settings, "reporting_api_token", "replacement-reader")
    assert client.get("/api/v1/admin/reporting", headers={"X-Reporting-Token": "reader-test-only"}).status_code == 401


def test_reader_cannot_reuse_full_admin_secret(configured, monkeypatch):
    monkeypatch.setattr(route.settings, "reporting_api_token", "admin-test-only")
    assert client.get("/api/v1/admin/reporting", headers={"X-Reporting-Token": "admin-test-only"}).status_code == 401
    with pytest.raises(ValueError, match="must differ"):
        Settings(_env_file=None, admin_api_token="same", reporting_api_token="same")


@pytest.mark.parametrize("query", ["days=0", "days=366", "days=-1", "end_date=2999-01-01", "end_date=0001-01-01", "end_date=bad"])
def test_bounded_queries(configured, query):
    assert client.get(f"/api/v1/admin/reporting?{query}", headers={"X-Reporting-Token": "reader-test-only"}).status_code == 422


@pytest.mark.parametrize("days", [180, 365])
def test_extended_report_windows(configured, days):
    response = client.get(
        f"/api/v1/admin/reporting?days={days}&end_date=2026-10-07",
        headers={"X-Reporting-Token": "reader-test-only"},
    )
    assert response.status_code == 200
    report = response.json()
    start = datetime.fromisoformat(report["start"])
    end = datetime.fromisoformat(report["end_exclusive"])
    previous = datetime.fromisoformat(report["previous_start"])
    assert (end - start).days == days
    assert (start - previous).days == days
    assert (previous - datetime.fromisoformat(report["history_start"])).days == 365
    assert end == END


@pytest.mark.parametrize("header", ["X-Reporting-Token", "X-Admin-Token"])
@pytest.mark.parametrize("method,path,payload", [
    ("POST", "/api/v1/admin/premium/manual-grant", {"email": "test@example.com", "plan_label": "Premium", "billing_interval": "monthly", "amount_inr": 0, "payment_reference": "test"}),
    ("POST", "/api/v1/admin/content-audit/run", {"items": []}),
    ("POST", "/api/v1/admin/content-audit/test", {"content_id": "test"}),
    ("PATCH", "/api/v1/admin/content-audit/test/issues/test", {"status": "fixed"}),
    ("GET", "/api/v1/admin/content-audit/run-daily", None),
    ("POST", "/api/v1/admin/ai/test", None),
    ("GET", "/api/v1/admin/feedback", None),
    ("GET", "/api/v1/admin/premium/purchases", None),
    ("GET", "/api/v1/admin/usage/summary", None),
])
def test_reader_denied_writes_and_pii(configured, header, method, path, payload):
    response = client.request(method, path, headers={header: "reader-test-only"}, json=payload)
    assert response.status_code == 401, response.text


def test_reporting_has_no_write_method(configured):
    assert client.post("/api/v1/admin/reporting", headers={"X-Reporting-Token": "reader-test-only"}).status_code == 405
    assert client.get("/v1/admin/reporting", headers={"X-Reporting-Token": "reader-test-only"}).status_code == 200


def test_postgres_queries_are_read_only_fixed_projection(monkeypatch, tmp_path):
    import psycopg
    statements = []
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, query, params=None): statements.append((query, params))
        def fetchone(self): return {"present": True}
        def fetchall(self): return []
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def cursor(self): return Cursor()
    monkeypatch.setattr(psycopg, "connect", lambda *args, **kwargs: Connection())
    reporter = service(tmp_path)
    reporter.postgres_url = "postgresql://test"
    for source in ("usage", "feedback", "purchases", "grants"):
        rows, status = reporter.read(source, START, END)
        assert rows == [] and status == "empty"
    assert sum(query == "SET TRANSACTION READ ONLY" for query, _ in statements) == 4
    assert not any(word in query.upper() for query, _ in statements for word in ("INSERT ", "UPDATE ", "DELETE ", "CREATE ", "ALTER "))
    usage_query = next(query for query, _ in statements if "FROM public.user_usage_events" in query)
    assert "email" not in usage_query and "full_name" not in usage_query
