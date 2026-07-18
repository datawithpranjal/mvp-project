import pytest

from app.services.python_lab_specs import PYTHON_LAB_SPECS
from app.services.python_validation_service import (
    PythonValidationNotFoundError,
    PythonValidationService,
)


def test_python_validation_passes_visible_sample() -> None:
    service = PythonValidationService()
    spec = PYTHON_LAB_SPECS["python-foundry-01-normalize-payment-statuses"]

    response = service.validate(
        slug=spec.slug,
        code=spec.solution_code,
        mode="sample",
    )

    assert response.validation_type == "PYTHON_OUTPUT_MATCH"
    assert response.mode == "sample"
    assert response.passed is True
    assert len(response.tests) == 1


def test_python_validation_passes_hidden_cases_with_solution() -> None:
    service = PythonValidationService()
    spec = PYTHON_LAB_SPECS["python-foundry-19-apply-cdc-events"]

    response = service.validate(
        slug=spec.slug,
        code=spec.solution_code,
        mode="hidden",
    )

    assert response.passed is True
    assert len(response.tests) == len(spec.sample_cases) + len(spec.hidden_cases)


@pytest.mark.parametrize("slug,spec", PYTHON_LAB_SPECS.items())
def test_all_python_reference_solutions_pass_hidden_cases(slug, spec) -> None:
    service = PythonValidationService()

    response = service.validate(
        slug=slug,
        code=spec.solution_code,
        mode="hidden",
    )

    failed_tests = [test.name for test in response.tests if not test.passed]
    assert response.passed is True, f"{slug} failed tests: {failed_tests}"


def test_python_validation_fails_wrong_answer_on_hidden_cases() -> None:
    service = PythonValidationService()

    response = service.validate(
        slug="python-foundry-10-reconcile-snapshot-keys",
        code="""
def reconcile_snapshot_keys(source_keys, warehouse_keys):
    return {
        "missing_in_warehouse": [],
        "extra_in_warehouse": [],
        "matched": []
    }
""",
        mode="hidden",
    )

    assert response.passed is False
    assert any(test.passed is False for test in response.tests)


def test_python_validation_rejects_disallowed_code() -> None:
    service = PythonValidationService()

    response = service.validate(
        slug="python-foundry-02-extract-failed-job-ids",
        code="""
import os

def extract_failed_job_ids(log_lines):
    return os.listdir("/")
""",
        mode="sample",
    )

    assert response.passed is False
    assert response.tests[0].name == "static safety check"
    assert "operating-system access" in response.message


def test_python_validation_raises_for_unknown_slug() -> None:
    service = PythonValidationService()

    with pytest.raises(PythonValidationNotFoundError):
        service.validate(
            slug="python-foundry-does-not-exist",
            code="def anything():\n    return None",
            mode="sample",
        )
