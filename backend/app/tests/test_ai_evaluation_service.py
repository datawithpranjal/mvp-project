import json

import pytest

from app.schemas.ai_evaluation import AiScenarioContext
from app.services.ai_evaluation_service import (
    AiEvaluationConfigurationError,
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
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def post(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.response


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
