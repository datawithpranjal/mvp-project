from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.services.pyspark_sandbox import CloudRunSandboxExecutor, SandboxUnavailable
from app.services.pyspark_specs import PYSPARK_SPECS
from app.services.pyspark_validation_service import PysparkValidationConfigurationError, PysparkValidationService


SLUG = "pyspark-pdf-01-the-endless-final-stage"
CUSTOMER_SLUG = "pyspark-pdf-02-shuffle-storm-after-a-big-join"


class CapturedExecutor:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def execute(self, **kwargs):
        self.calls.append(deepcopy(kwargs))
        if self.error is not None:
            raise self.error
        return self.result


def service_for(executor):
    service = PysparkValidationService(sandbox_executor=executor)
    service.settings = service.settings.model_copy(update={
        "pyspark_runner_url": None, "pyspark_execution_enabled": True,
        "pyspark_runner_token": "synthetic-parent-token", "pyspark_timeout_seconds": 25.0,
    })
    return service


@pytest.mark.parametrize("mode", ["sample", "hidden"])
@pytest.mark.parametrize("correct", [True, False])
@pytest.mark.parametrize("slug", [CUSTOMER_SLUG, SLUG])
def test_grading_stays_in_listener_and_never_sends_private_oracles(mode, correct, slug):
    spec = PYSPARK_SPECS[slug]
    cases = spec.sample_cases if mode == "sample" else spec.hidden_cases
    rows = [deepcopy(case.expected_rows) for case in cases]
    if not correct:
        rows[0] = rows[0][1:]
    executor = CapturedExecutor({"cases": [{"rows": row, "error": None} for row in rows]})
    result = service_for(executor).validate(slug, "result_df = incident_signals", mode)
    assert result.passed is correct
    assert result.tests[0].name == cases[0].name
    assert result.tests[0].expected_output.rows == sorted(cases[0].expected_rows)
    call = executor.calls[0]
    assert call["timeout"] == 25.0
    payload = call["payload"]
    assert set(payload) == {"output_columns", "output_variable_names", "cases"}
    for serialized, case in zip(payload["cases"], cases):
        assert set(serialized) == {"inputs", "context"}
        assert serialized["context"] == case.context
        assert all(set(table) == {"name", "rows", "timestamp_columns"} for table in serialized["inputs"])
    assert "synthetic-parent-token" not in repr(payload)


@pytest.mark.parametrize("bad", [
    {}, {"cases": []}, {"cases": None}, {"cases": [{"rows": [], "error": False}]},
    {"cases": [{"rows": [[1]], "error": None}]},
    {"cases": [{"rows": [], "error": None, "passed": True}]},
    {"cases": [{"rows": "not rows", "error": None}]},
])
def test_missing_or_malformed_sandbox_evidence_is_unavailable(bad):
    with pytest.raises(PysparkValidationConfigurationError, match="invalid output"):
        service_for(CapturedExecutor(bad)).validate(SLUG, "result_df = incident_signals", "sample")


def test_learner_failure_is_incorrect_while_launcher_failure_is_unavailable(monkeypatch):
    wrong = service_for(CapturedExecutor({"cases": [{"rows": [], "error": "Missing output columns: signal_id"}]}))
    result = wrong.validate(SLUG, "result_df = incident_signals", "sample")
    assert not result.passed
    assert result.tests[0].message == "Missing output columns: signal_id"

    unavailable = service_for(CapturedExecutor(error=SandboxUnavailable("private control failure")))
    monkeypatch.setattr(unavailable, "_run_worker", lambda *a, **k: pytest.fail("Ordinary execution fallback"))
    with pytest.raises(PysparkValidationConfigurationError, match="sandbox is unavailable") as error:
        unavailable.validate(SLUG, "result_df = incident_signals", "sample")
    assert "private" not in str(error.value)


def test_worker_selects_sandbox_and_has_no_launcher_failure_fallback(monkeypatch):
    from app import pyspark_worker

    assert isinstance(pyspark_worker.service._sandbox_executor, CloudRunSandboxExecutor)
    failed = service_for(CapturedExecutor(error=SandboxUnavailable("private launcher detail")))
    monkeypatch.setattr(pyspark_worker, "service", failed)
    monkeypatch.setattr(failed, "_run_worker", lambda *a, **k: pytest.fail("Ordinary execution fallback"))
    response = TestClient(pyspark_worker.app).post(
        f"/api/v1/pyspark/validate/{SLUG}",
        headers={"X-Runner-Token": "synthetic-parent-token"},
        json={"code": "result_df = incident_signals", "mode": "sample"},
    )
    assert response.status_code == 503
    assert "No correctness result" in response.json()["detail"]
    assert "private" not in response.text
