import json

import pytest

from app.schemas.ai_evaluation import AiScenarioContext
from app.services.ai_evaluation_service import (
    AiEvaluationConfigurationError,
    GeminiEvaluationService,
    OpenAIEvaluationService,
)


class FakeResponse:
    status_code = 200

    def __init__(self, output: dict[str, object]) -> None:
        self.output = output

    def json(self) -> dict[str, object]:
        return {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(self.output),
                        }
                    ],
                }
            ]
        }


class FakeClient:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def post(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.response


class ProviderErrorResponse:
    status_code = 429

    def json(self) -> dict[str, object]:
        return {
            "error": {
                "code": "insufficient_quota",
                "message": "The project has no remaining API quota.",
            }
        }


class GeminiResponse:
    status_code = 200

    def __init__(self, output: dict[str, object]) -> None:
        self.output = output

    def json(self) -> dict[str, object]:
        return {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {
                        "parts": [{"text": json.dumps(self.output)}],
                    },
                }
            ]
        }


class GeminiKeyErrorResponse:
    status_code = 400

    def json(self) -> dict[str, object]:
        return {
            "error": {
                "code": 400,
                "status": "INVALID_ARGUMENT",
                "message": "API key not valid. Please pass a valid API key.",
            }
        }


def sample_context() -> AiScenarioContext:
    return AiScenarioContext(
        title="Duplicate Orders After Retry",
        domain="airflow",
        scenario_type="log_analysis",
        business_context="A retry loaded the same order file twice.",
        problem_statement="Find the root cause and propose a production-safe fix.",
        requirement="Explain idempotency, reconciliation, and prevention.",
        model_solution="Use a stable file key and an idempotent merge.",
        production_explanation="Track processed files and reconcile source-to-target counts.",
    )


def test_openai_evaluation_parses_and_clamps_weighted_scores() -> None:
    client = FakeClient(
        FakeResponse(
            {
                "strengths": ["Correctly identified the retry as the trigger."],
                "gaps": ["Add a reconciliation check."],
                "improved_answer": "Use an idempotent merge and monitor duplicate keys.",
                "follow_up_questions": ["How would you replay the failed batch?"],
                "rubric_breakdown": {
                    "root_cause": 100,
                    "correctness": 100,
                    "production_thinking": 100,
                    "tradeoffs": 100,
                    "communication": 100,
                },
            }
        )
    )
    service = OpenAIEvaluationService(
        api_key="test-key",
        model="gpt-test",
        client=client,
    )

    result = service.evaluate(sample_context(), "The retry caused duplicate inserts.")

    assert result.score == 100
    assert result.verdict == "strong"
    assert result.rubric_breakdown.model_dump() == {
        "root_cause": 25,
        "correctness": 25,
        "production_thinking": 20,
        "tradeoffs": 15,
        "communication": 15,
    }
    assert result.mode == "openai"
    assert result.model == "gpt-test"
    assert client.calls[0]["url"] == "https://api.openai.com/v1/responses"
    assert client.calls[0]["headers"]["Authorization"] == "Bearer test-key"
    assert client.calls[0]["json"]["store"] is False
    assert client.calls[0]["json"]["text"]["format"]["strict"] is True


def test_openai_evaluation_requires_backend_key() -> None:
    service = OpenAIEvaluationService(api_key="", model="gpt-test")

    with pytest.raises(AiEvaluationConfigurationError, match="not configured"):
        service.evaluate(sample_context(), "A reasonable answer")


def test_openai_evaluation_reports_missing_api_quota() -> None:
    service = OpenAIEvaluationService(
        api_key="test-key",
        model="gpt-test",
        client=FakeClient(ProviderErrorResponse()),
    )

    with pytest.raises(AiEvaluationConfigurationError, match="billing or credits"):
        service.evaluate(sample_context(), "A reasonable answer")


def test_gemini_evaluation_returns_structured_result() -> None:
    client = FakeClient(
        GeminiResponse(
            {
                "strengths": ["The retry behavior was diagnosed correctly."],
                "gaps": ["Explain the reconciliation alert."],
                "improved_answer": "Use an idempotent merge and reconcile batch counts.",
                "follow_up_questions": ["How would you make replay safe?"],
                "rubric_breakdown": {
                    "root_cause": 23,
                    "correctness": 22,
                    "production_thinking": 18,
                    "tradeoffs": 10,
                    "communication": 12,
                },
            }
        )
    )
    service = GeminiEvaluationService(
        api_key="test-gemini-key",
        model="gemini-2.5-pro",
        client=client,
    )

    result = service.evaluate(sample_context(), "Use an idempotent merge.")

    assert result.score == 85
    assert result.verdict == "strong"
    assert result.mode == "gemini"
    assert result.model == "gemini-2.5-pro"
    call = client.calls[0]
    assert call["url"].endswith("/gemini-2.5-pro:generateContent")
    assert call["headers"]["x-goog-api-key"] == "test-gemini-key"
    assert "test-gemini-key" not in json.dumps(call["json"])
    assert call["json"]["generationConfig"]["responseMimeType"] == "application/json"
    assert "responseJsonSchema" in call["json"]["generationConfig"]


def test_gemini_evaluation_requires_backend_key() -> None:
    service = GeminiEvaluationService(api_key="", model="gemini-2.5-pro")

    with pytest.raises(AiEvaluationConfigurationError, match="not configured"):
        service.evaluate(sample_context(), "A reasonable answer")


def test_gemini_evaluation_reports_invalid_api_key() -> None:
    service = GeminiEvaluationService(
        api_key="invalid-key",
        model="gemini-2.5-pro",
        client=FakeClient(GeminiKeyErrorResponse()),
    )

    with pytest.raises(AiEvaluationConfigurationError, match="rejected"):
        service.evaluate(sample_context(), "A reasonable answer")
