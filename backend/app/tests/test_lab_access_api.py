from fastapi.testclient import TestClient

from app.api.routes.python_validation import premium_access_service as python_premium_access_service
from app.main import app


client = TestClient(app)


def _signup(email: str) -> str:
    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={"mode": "signup", "email": email, "full_name": "Lab Access Learner"},
    )
    token_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_response.json()["debug_otp"]},
    )
    return token_response.json()["token"]


def test_python_premium_solution_is_not_public() -> None:
    response = client.get("/api/v1/python/labs/python-foundry-09-latest-customer-updates/solution")

    assert response.status_code == 401


def test_python_free_solution_remains_public() -> None:
    response = client.get("/api/v1/python/labs/python-foundry-01-normalize-payment-statuses/solution")

    assert response.status_code == 200


def test_python_premium_solution_requires_entitlement() -> None:
    token = _signup("python.free.learner@example.com")
    response = client.get(
        "/api/v1/python/labs/python-foundry-09-latest-customer-updates/solution",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Premium access is required for this Python lab."


def test_python_premium_solution_is_available_after_server_grant() -> None:
    email = "python.premium.learner@example.com"
    token = _signup(email)
    python_premium_access_service.grant_manual_access(
        email=email,
        plan_label="Premium Annual",
        billing_interval="yearly",
        amount_inr=999,
        payment_reference="TEST-PYTHON-PREMIUM",
    )

    response = client.get(
        "/api/v1/python/labs/python-foundry-09-latest-customer-updates/solution",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["solution_code"]


def test_pyspark_premium_validation_requires_entitlement_before_runner() -> None:
    token = _signup("pyspark.free.learner@example.com")
    response = client.post(
        "/api/v1/pyspark/validate/pyspark-driver-collect-oom",
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "result_df = events_df", "mode": "sample"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Premium access is required for this PySpark lab."


def test_pyspark_free_validation_does_not_require_premium() -> None:
    response = client.post(
        "/api/v1/pyspark/validate/pyspark-append-rerun-duplicates",
        json={"code": "result_df = incoming_df", "mode": "sample"},
    )

    assert response.status_code != 401
    assert response.status_code != 403


def test_server_python_runner_keeps_authentication_for_samples_and_hidden_cases(monkeypatch) -> None:
    from app.api.routes import python_validation as route
    from app.schemas.python_validation import PythonValidationResponse

    monkeypatch.setattr(route.service, "validate", lambda **kwargs: PythonValidationResponse(
        mode="sample", passed=True, message="Sample passed", tests=[], execution_engine="subprocess"
    ))
    path = "/api/v1/python/validate/python-foundry-01-normalize-payment-statuses"
    assert client.post(path, json={"code": "pass", "mode": "sample"}).status_code == 401
    assert client.post(path, json={"code": "pass", "mode": "hidden"}).status_code == 401
    premium_path = "/api/v1/python/validate/python-foundry-09-latest-customer-updates"
    assert client.post(premium_path, json={"code": "pass", "mode": "sample"}).status_code == 401


def test_free_sales_pyspark_scenario_is_not_premium_locked() -> None:
    from app.services.lab_access_service import pyspark_lab_requires_premium
    assert not pyspark_lab_requires_premium("yesterdays-sales-missing-late-source-arrival")
