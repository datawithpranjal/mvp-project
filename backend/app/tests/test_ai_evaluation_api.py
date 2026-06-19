from fastapi.testclient import TestClient

from app.api.routes import ai_evaluation as ai_route
from app.main import app
from app.schemas.ai_evaluation import AiEvaluationResponse, AiRubricBreakdown

client = TestClient(app)


def test_ai_evaluation_endpoint_requires_authentication() -> None:
    response = client.post(
        "/api/v1/ai/evaluate-scenario",
        json={
            "scenario_slug": "frontend-only-ai-lab",
            "user_answer": "Use an idempotent merge.",
            "context": _context_payload(),
        },
    )

    assert response.status_code == 401


def test_ai_evaluation_endpoint_returns_structured_score(monkeypatch) -> None:
    email = "ai.evaluation.student@example.com"
    otp_response = client.post(
        "/api/v1/auth/request-otp",
        json={"mode": "signup", "email": email},
    )
    token_response = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "otp_code": otp_response.json()["debug_otp"]},
    )
    token = token_response.json()["token"]

    monkeypatch.setattr(
        ai_route.ai_evaluation_service,
        "evaluate",
        lambda context, answer: AiEvaluationResponse(
            score=76,
            verdict="good",
            strengths=["The root cause is clearly stated."],
            gaps=["Add rollback planning."],
            improved_answer="Explain the idempotent merge and reconciliation checks.",
            follow_up_questions=["How would you handle a partial replay?"],
            rubric_breakdown=AiRubricBreakdown(
                root_cause=22,
                correctness=21,
                production_thinking=15,
                tradeoffs=8,
                communication=10,
            ),
            model="gpt-test",
        ),
    )

    response = client.post(
        "/api/v1/ai/evaluate-scenario",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "scenario_slug": "frontend-only-ai-lab",
            "user_answer": "Use an idempotent merge and reconcile duplicate keys.",
            "context": _context_payload(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["score"] == 76
    assert payload["verdict"] == "good"
    assert payload["mode"] == "openai"
    assert payload["rubric_breakdown"]["root_cause"] == 22


def _context_payload() -> dict[str, object]:
    return {
        "title": "Duplicate Orders After Retry",
        "domain": "airflow",
        "scenario_type": "log_analysis",
        "business_context": "A retry loaded the same file twice.",
        "problem_statement": "Diagnose and fix duplicate loading.",
        "requirement": "Explain idempotency and monitoring.",
        "broken_code": "load(file)",
        "actual_output": "duplicate order rows",
        "expected_output": "one row per order",
        "model_solution": "Use an idempotent merge.",
        "production_explanation": "Track file keys and reconcile counts.",
        "common_mistakes": ["Relying only on retries"],
        "follow_ups": ["How would you replay safely?"],
        "rubric": {
            "root_cause": 25,
            "correctness": 25,
            "production_thinking": 20,
            "tradeoffs": 15,
            "communication": 15,
        },
    }
