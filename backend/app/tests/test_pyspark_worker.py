import os
from types import SimpleNamespace
from urllib.parse import urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from app.schemas.pyspark_validation import PysparkTestResult, PysparkValidationResponse
from app.services.pyspark_specs import PYSPARK_SPECS
from app.services.pyspark_validation_service import (
    PysparkValidationConfigurationError,
    PysparkValidationError,
    PysparkValidationNotFoundError,
    PysparkValidationService,
)


RUNNER_TOKEN = "test-worker-token-with-no-production-access"
FREE_SLUG = "pyspark-append-rerun-duplicates"
PAID_SLUG = "pyspark-driver-collect-oom"
PDF_SLUG = "pyspark-pdf-01-the-endless-final-stage"
SALES_SLUG = "yesterdays-sales-missing-late-source-arrival"
VALIDATION_PATHS = ("/api/v1/pyspark/validate", "/v1/pyspark/validate")
PDF_REFERENCE = '''from pyspark.sql import functions as F
result_df = incident_signals.filter(
    F.col("risk_score") >= F.col("action_threshold")
).select("signal_id", "diagnosis", "recommended_fix")
'''
SALES_REFERENCE = '''from pyspark.sql import functions as F
daily_sales = (raw_sales.withColumn("business_date", F.to_date("sale_ts_utc"))
    .filter((F.col("business_date") == F.lit(run_date)) & (F.col("status") == "PAID"))
    .dropDuplicates(["order_id"]).groupBy("business_date")
    .agg(F.count("order_id").alias("order_count"), F.sum("amount").alias("gross_sales")))
'''


@pytest.fixture
def worker(monkeypatch):
    from app import pyspark_worker

    service = PysparkValidationService()
    service.settings = service.settings.model_copy(update={
        "pyspark_execution_enabled": True,
        "pyspark_runner_url": None,
        "pyspark_runner_token": RUNNER_TOKEN,
        "pyspark_timeout_seconds": 25.0,
    })
    monkeypatch.setattr(pyspark_worker, "service", service)
    return pyspark_worker


def client_for(worker):
    return TestClient(worker.app, raise_server_exceptions=False)


def authorized_headers():
    return {"X-Runner-Token": RUNNER_TOKEN}


def test_worker_exposes_only_health_and_validation_routes(worker):
    assert {(route.path, frozenset(route.methods)) for route in worker.app.routes} == {
        ("/healthz", frozenset({"GET"})),
        ("/api/healthz", frozenset({"GET"})),
        ("/api/v1/pyspark/validate/{slug}", frozenset({"POST"})),
        ("/v1/pyspark/validate/{slug}", frozenset({"POST"})),
    }


@pytest.mark.parametrize("path", ["/healthz", "/api/healthz"])
def test_health_identifies_worker_catalog_without_secrets(worker, path):
    response = client_for(worker).get(path)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["runner_contract"] == "tdf-pyspark-worker-v1"
    assert body["supported_lab_count"] == len(PYSPARK_SPECS)
    assert len(body["catalog_sha256"]) == 64
    assert all(character in "0123456789abcdef" for character in body["catalog_sha256"])
    assert RUNNER_TOKEN not in response.text


@pytest.mark.parametrize("path", VALIDATION_PATHS)
@pytest.mark.parametrize("slug", [FREE_SLUG, "not-a-supported-lab"])
@pytest.mark.parametrize("headers", [{}, {"X-Runner-Token": "wrong-token"}])
def test_runner_token_is_required_before_slug_or_code_checks(worker, monkeypatch, path, slug, headers):
    def no_validation(*args, **kwargs):
        pytest.fail("Unauthenticated request reached validation")

    monkeypatch.setattr(worker.service, "validate", no_validation)
    response = client_for(worker).post(
        f"{path}/{slug}",
        headers=headers,
        json={"code": "import os\nresult_df = orders", "mode": "sample"},
    )
    assert response.status_code == 401
    assert RUNNER_TOKEN not in response.text


@pytest.mark.parametrize("settings_update", [
    {"pyspark_execution_enabled": False},
    {"pyspark_runner_token": None},
    {"pyspark_runner_token": ""},
    {"pyspark_runner_token": "   "},
    {"pyspark_runner_url": "https://must-never-be-called.example"},
])
def test_invalid_worker_configuration_cannot_execute_or_proxy(worker, monkeypatch, settings_update):
    worker.service.settings = worker.service.settings.model_copy(update=settings_update)

    def no_execution(*args, **kwargs):
        pytest.fail("Invalid worker configuration reached execution or forwarding")

    monkeypatch.setattr(worker.service, "validate", no_execution)
    monkeypatch.setattr(worker.service, "_validate_remote", no_execution)
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/{FREE_SLUG}",
        headers=authorized_headers(),
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == 503
    assert "must-never-be-called" not in response.text
    assert RUNNER_TOKEN not in response.text
    assert "passed" not in response.json()


@pytest.mark.parametrize("path", VALIDATION_PATHS)
@pytest.mark.parametrize("slug", [FREE_SLUG, PAID_SLUG])
def test_authenticated_backend_can_execute_free_and_paid_labs(worker, monkeypatch, path, slug):
    calls = []

    def validate(**kwargs):
        calls.append(kwargs)
        return PysparkValidationResponse(
            mode=kwargs["mode"],
            passed=True,
            message="PySpark validation passed.",
            tests=[PysparkTestResult(name="fixture", passed=True, message="Output matched.")],
            execution_engine="local",
        )

    monkeypatch.setattr(worker.service, "validate", validate)
    response = client_for(worker).post(
        f"{path}/{slug}",
        headers=authorized_headers(),
        json={"code": "result_df = orders", "mode": "hidden"},
    )
    assert response.status_code == 200
    assert response.json()["passed"] is True
    assert calls == [{"slug": slug, "code": "result_df = orders", "mode": "hidden"}]


@pytest.mark.parametrize("headers", [{}, {"X-Runner-Token": RUNNER_TOKEN}])
def test_public_backend_still_requires_learner_authorization_for_paid_labs(headers):
    from app.main import app

    response = TestClient(app).post(
        f"{VALIDATION_PATHS[0]}/{PAID_SLUG}",
        headers=headers,
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == 401


def test_public_nonmember_cannot_use_worker_token_to_bypass_entitlement(monkeypatch):
    from app.api.routes import pyspark_validation as public_route
    from app.main import app

    monkeypatch.setattr(
        public_route.auth_service,
        "get_profile",
        lambda token: SimpleNamespace(email="synthetic.nonmember@example.com"),
    )
    monkeypatch.setattr(public_route.premium_access_service, "has_access", lambda email: False)

    def no_validation(*args, **kwargs):
        pytest.fail("Nonmember reached paid validation")

    monkeypatch.setattr(public_route.service, "validate", no_validation)
    response = TestClient(app).post(
        f"{VALIDATION_PATHS[0]}/{PAID_SLUG}",
        headers={"Authorization": "Bearer synthetic-learner", **authorized_headers()},
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Premium access is required for this PySpark lab."


def test_public_backend_forwards_pdf_to_authenticated_worker_without_learner_credentials(worker, monkeypatch):
    from app.api.routes import pyspark_validation as public_route
    from app.main import app

    public_service = PysparkValidationService()
    public_service.settings = public_service.settings.model_copy(update={
        "pyspark_execution_enabled": False,
        "pyspark_runner_url": "https://worker.contract.example",
        "pyspark_runner_token": RUNNER_TOKEN,
    })
    monkeypatch.setattr(public_route, "service", public_service)
    worker_client = client_for(worker)
    public_client = TestClient(app)
    forwarded = []
    local_calls = []

    def local_cases(*, spec, code, cases):
        local_calls.append({"spec": spec, "code": code, "cases": cases})
        output = {"columns": list(spec.output_columns), "rows": cases[0].expected_rows}
        return [PysparkTestResult(
            name=cases[0].name,
            passed=True,
            message="Output matched.",
            actual_output=output,
            expected_output=output,
        )]

    monkeypatch.setattr(worker.service, "_run_local", local_cases)

    class WorkerAdapter:
        def __init__(self, **kwargs):
            self.timeout = kwargs["timeout"]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, *, headers, json):
            forwarded.append({"url": url, "headers": headers, "body": json, "timeout": self.timeout})
            assert urlsplit(url).netloc == "worker.contract.example"
            return worker_client.post(urlsplit(url).path, headers=headers, json=json)

    monkeypatch.setattr(httpx, "Client", WorkerAdapter)
    response = public_client.post(
        f"{VALIDATION_PATHS[0]}/{PDF_SLUG}",
        headers={"Authorization": "Bearer synthetic-learner"},
        json={"code": PDF_REFERENCE, "mode": "hidden"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["passed"] is True
    assert body["execution_engine"] == "remote"
    assert body["mode"] == "hidden"
    assert len(forwarded) == 1
    assert forwarded[0]["url"] == f"https://worker.contract.example{VALIDATION_PATHS[0]}/{PDF_SLUG}"
    assert forwarded[0]["body"] == {"code": PDF_REFERENCE, "mode": "hidden"}
    assert forwarded[0]["headers"]["X-Runner-Token"] == RUNNER_TOKEN
    assert "authorization" not in {key.lower() for key in forwarded[0]["headers"]}
    assert forwarded[0]["timeout"] == public_service.settings.pyspark_timeout_seconds + 5
    assert len(local_calls) == 1
    assert local_calls[0]["spec"] is PYSPARK_SPECS[PDF_SLUG]
    assert local_calls[0]["code"] == PDF_REFERENCE
    assert local_calls[0]["cases"] == list(PYSPARK_SPECS[PDF_SLUG].hidden_cases)
    assert body["tests"][0]["actual_output"]["rows"] == PYSPARK_SPECS[PDF_SLUG].hidden_cases[0].expected_rows


def test_authenticated_unknown_slug_returns_not_found(worker, monkeypatch):
    def no_execution(*args, **kwargs):
        pytest.fail("Unknown slug reached execution")

    monkeypatch.setattr(worker.service, "_run_local", no_execution)
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/not-a-supported-lab",
        headers=authorized_headers(),
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == 404
    assert "does not have executable validation" in response.json()["detail"]


@pytest.mark.parametrize("code", [
    "import os\nresult_df = orders",
    'result_df = spark.read.parquet("external-path")',
    'orders.write.save("external-path")',
    'exec("pass")',
])
def test_authenticated_worker_keeps_safety_checks_before_execution(worker, monkeypatch, code):
    def no_execution(*args, **kwargs):
        pytest.fail("Unsafe code reached execution or forwarding")

    monkeypatch.setattr(worker.service, "_run_local", no_execution)
    monkeypatch.setattr(worker.service, "_validate_remote", no_execution)
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/{FREE_SLUG}",
        headers=authorized_headers(),
        json={"code": code, "mode": "sample"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["passed"] is False
    assert body["tests"][0]["name"] == "static safety check"
    assert body["tests"][0]["passed"] is False


@pytest.mark.parametrize("error,status_code", [
    (PysparkValidationNotFoundError("Unavailable practice item."), 404),
    (PysparkValidationConfigurationError("No correctness result was produced."), 503),
    (PysparkValidationError("Validation failed."), 500),
])
def test_worker_preserves_classified_failure_statuses(worker, monkeypatch, error, status_code):
    def fail(**kwargs):
        raise error

    monkeypatch.setattr(worker.service, "validate", fail)
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/{FREE_SLUG}",
        headers=authorized_headers(),
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == status_code
    assert response.json() == {"detail": str(error)}


def test_unexpected_worker_failure_does_not_expose_private_exception(worker, monkeypatch):
    def fail(**kwargs):
        raise RuntimeError("private worker credential and filesystem detail")

    monkeypatch.setattr(worker.service, "validate", fail)
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/{FREE_SLUG}",
        headers=authorized_headers(),
        json={"code": "result_df = orders", "mode": "sample"},
    )
    assert response.status_code == 500
    assert "private" not in response.text
    assert RUNNER_TOKEN not in response.text


@pytest.mark.skipif(os.environ.get("RUN_SPARK_TESTS") != "1", reason="requires Java and optional Spark dependencies")
@pytest.mark.parametrize("slug,code,mode,passed", [
    (PDF_SLUG, PDF_REFERENCE, "sample", True),
    (PDF_SLUG, PDF_REFERENCE, "hidden", True),
    (PDF_SLUG, PDF_REFERENCE.replace(">=", ">"), "sample", False),
    (PDF_SLUG, PDF_REFERENCE.replace(">=", ">"), "hidden", False),
    (FREE_SLUG, 'result_df = orders.dropDuplicates(["order_id"])', "sample", True),
    (SALES_SLUG, SALES_REFERENCE, "sample", True),
])
def test_worker_catalog_real_spark(worker, slug, code, mode, passed):
    response = client_for(worker).post(
        f"{VALIDATION_PATHS[0]}/{slug}",
        headers=authorized_headers(),
        json={"code": code, "mode": mode},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["execution_engine"] == "local"
    assert body["mode"] == mode
    assert body["passed"] is passed, body
    assert body["tests"]
    assert body["passed"] == all(test["passed"] for test in body["tests"])
    output_tests = [test for test in body["tests"] if test.get("actual_output") is not None]
    assert output_tests, body
    for test in output_tests:
        assert test["actual_output"]["columns"] == test["expected_output"]["columns"]
        if passed:
            assert test["actual_output"]["rows"] == test["expected_output"]["rows"]
    if slug == PDF_SLUG:
        expected_ids = (
            ["pyspark-01-boundary", "pyspark-01-hot"]
            if mode == "sample"
            else ["pyspark-01-hidden-boundary", "pyspark-01-hidden-hot"]
        )
        assert [row[0] for row in output_tests[0]["expected_output"]["rows"]] == expected_ids
        if not passed:
            assert len(output_tests[0]["actual_output"]["rows"]) == 1
    if slug == SALES_SLUG:
        assert output_tests[0]["actual_output"]["rows"] == [["2026-05-07", 2, 420.0]]
