from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_scenarios_returns_full_library() -> None:
    response = client.get("/api/v1/scenarios")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 26

    slugs = {scenario["slug"] for scenario in payload}
    assert {
        "incremental-load-missing-records",
        "null-trap",
        "top-n-tie-trap",
        "merge-with-duplicate-matches",
        "timezone-boundary-bug",
        "poison-pill-event",
    }.issubset(slugs)

    null_trap_summary = next(scenario for scenario in payload if scenario["slug"] == "null-trap")
    assert null_trap_summary["access_tier"] == "free"
    assert null_trap_summary["section"] == "SQL"
    assert null_trap_summary["validation_type"] == "SQL_OUTPUT_MATCH"
    assert "Data Quality" in null_trap_summary["topics"]


def test_detail_endpoint_includes_sql_expected_output() -> None:
    response = client.get("/api/v1/scenarios/null-trap")

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "The NULL Trap"
    assert payload["access_tier"] == "free"
    assert payload["validation_type"] == "SQL_OUTPUT_MATCH"
    assert "reactivation campaign" in payload["business_context"]
    assert payload["student_task"].startswith("Write a single read-only SQL query")
    assert payload["broken_code"].startswith("SELECT customer_id")
    assert [table["name"] for table in payload["tables"]] == ["customers", "orders"]
    assert payload["expected_output"]["columns"] == ["customer_id", "customer_name"]
    assert payload["expected_output"]["rows"] == [[3, "Cleo"], [4, "Dev"]]
    assert payload["solution_answer"].startswith("SELECT c.customer_id")
    assert len(payload["hints"]) == 3


def test_detail_endpoint_includes_rubric_scenario() -> None:
    response = client.get("/api/v1/scenarios/silent-udf-tax")

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation_type"] == "CODE_REVIEW_RUBRIC"
    assert payload["expected_output"] is None
    assert payload["broken_code"].startswith("from pyspark.sql")
    assert "Python UDF" in payload["solution_answer"]
    assert len(payload["rubric"]) >= 3


def test_validate_endpoint_accepts_correct_sql_query() -> None:
    response = client.post(
        "/api/v1/scenarios/top-n-tie-trap/validate",
        json={
            "answer": """
            WITH ranked_products AS (
              SELECT
                category,
                product_id,
                revenue,
                ROW_NUMBER() OVER (
                  PARTITION BY category
                  ORDER BY revenue DESC, product_id ASC
                ) AS rank_in_category
              FROM product_revenue
            )
            SELECT category, product_id, revenue, rank_in_category
            FROM ranked_products
            WHERE rank_in_category <= 3
            """
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert len(payload["actual_output"]["rows"]) == 6


def test_validate_endpoint_returns_model_answer_for_rubric_scenario() -> None:
    response = client.post(
        "/api/v1/scenarios/silent-udf-tax/validate",
        json={
            "answer": "Use built-in Spark functions instead of a Python UDF."
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation_type"] == "CODE_REVIEW_RUBRIC"
    assert payload["passed"] is None
    assert payload["actual_output"] is None
    assert "built-ins" in payload["solution_answer"]
    assert len(payload["rubric"]) >= 3


def test_email_capture_endpoint_unlocks_premium() -> None:
    response = client.post(
        "/api/v1/email-captures",
        json={
            "email": "student@example.com",
            "source": "library-premium-unlock",
            "scenario_slug": "bad-join-explodes-rows",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "captured": True,
        "email": "student@example.com",
        "unlocked_premium": True,
    }


def test_email_capture_admin_endpoint_requires_configuration() -> None:
    response = client.get("/api/v1/admin/email-captures")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Admin email capture access is not configured."
    }


def test_signup_otp_login_profile_and_logout_flow() -> None:
    email = "otp.student@example.com"

    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={
            "mode": "signup",
            "email": email,
            "full_name": "OTP Student",
            "role": "Analytics Engineer",
            "experience_level": "Intermediate",
            "target_role": "Data Engineer",
            "country": "India",
            "preparation_goal": "Prepare for product company interviews",
        },
    )

    assert otp_response.status_code == 200
    otp_payload = otp_response.json()
    assert otp_payload["email"] == email
    assert otp_payload["otp_required"] is True
    assert len(otp_payload["debug_otp"]) == 6

    session_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_payload["debug_otp"]},
    )

    assert session_response.status_code == 200
    session_payload = session_response.json()
    token = session_payload["token"]
    assert session_payload["user"]["email"] == email
    assert session_payload["user"]["full_name"] == "OTP Student"
    assert session_payload["user"]["target_role"] == "Data Engineer"

    profile_response = client.patch(
        "/api/v1/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"phone": "+91 9999999999", "linkedin_url": "https://linkedin.com/in/student"},
    )

    assert profile_response.status_code == 200
    profile_payload = profile_response.json()
    assert profile_payload["phone"] == "+91 9999999999"
    assert profile_payload["linkedin_url"] == "https://linkedin.com/in/student"

    logout_response = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert logout_response.status_code == 200
    assert logout_response.json() == {"logged_out": True}

    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert me_response.status_code == 401
