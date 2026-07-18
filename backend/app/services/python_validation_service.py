from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

from app.schemas.python_validation import (
    PythonTestResult,
    PythonValidationMode,
    PythonValidationResponse,
)
from app.services.python_lab_specs import PYTHON_LAB_SPECS, PythonLabSpec, PythonTestCase


class PythonValidationError(RuntimeError):
    pass


class PythonValidationNotFoundError(PythonValidationError):
    pass


DISALLOWED_CODE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\b(import\s+os|from\s+os\s+import|subprocess|socket|requests|urllib)\b"),
        "Network, process, and operating-system access are not allowed in this runner.",
    ),
    (
        re.compile(r"(^|[^A-Za-z0-9_])(__[A-Za-z0-9_]*__|eval\s*\(|exec\s*\(|open\s*\()", re.MULTILINE),
        "Dynamic execution and local file access are not allowed in this runner.",
    ),
    (
        re.compile(r"\b(pip|conda|shutil|pathlib|globals\s*\(|locals\s*\(|compile\s*\()", re.IGNORECASE),
        "Package installation, filesystem helpers, and namespace introspection are not allowed.",
    ),
]


class PythonValidationService:
    def validate(
        self,
        slug: str,
        code: str,
        mode: PythonValidationMode,
    ) -> PythonValidationResponse:
        spec = PYTHON_LAB_SPECS.get(slug)
        if spec is None:
            raise PythonValidationNotFoundError(
                "This Python practice item does not have executable validation yet."
            )

        guardrail_error = self._validate_code_guardrails(code)
        if guardrail_error:
            return PythonValidationResponse(
                mode=mode,
                passed=False,
                message=guardrail_error,
                tests=[
                    PythonTestResult(
                        name="static safety check",
                        passed=False,
                        message=guardrail_error,
                    )
                ],
            )

        cases = list(spec.sample_cases)
        if mode == "hidden":
            cases.extend(spec.hidden_cases)

        tests = self._run_local(spec=spec, code=code, cases=cases)
        passed = all(test.passed for test in tests)
        return PythonValidationResponse(
            mode=mode,
            passed=passed,
            message=(
                "Python validation passed."
                if passed
                else "Python validation found an output mismatch or runtime error."
            ),
            tests=tests,
        )

    def get_solution(self, slug: str) -> tuple[str, str]:
        spec = PYTHON_LAB_SPECS.get(slug)
        if spec is None:
            raise PythonValidationNotFoundError(
                "This Python practice item does not have a server-side solution yet."
            )
        return spec.solution_code, spec.explanation

    def _validate_code_guardrails(self, code: str) -> str | None:
        if len(code) > 8000:
            return "Code is too long for this runner."
        for pattern, message in DISALLOWED_CODE_PATTERNS:
            if pattern.search(code):
                return message
        return None

    def _run_local(
        self,
        spec: PythonLabSpec,
        code: str,
        cases: list[PythonTestCase],
    ) -> list[PythonTestResult]:
        with tempfile.TemporaryDirectory(prefix="data-foundry-python-") as tmp:
            tmp_path = Path(tmp)
            submission_path = tmp_path / "submission.py"
            runner_path = tmp_path / "runner.py"
            submission_path.write_text(code, encoding="utf-8")
            runner_path.write_text(
                self._runner_script(spec=spec, cases=cases, submission_path=submission_path),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [sys.executable, str(runner_path)],
                cwd=str(tmp_path),
                env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": ""},
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )

        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "Python execution failed.").strip()
            return [
                PythonTestResult(
                    name="runner startup",
                    passed=False,
                    message=message[-1200:],
                )
            ]

        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return [
                PythonTestResult(
                    name="runner output",
                    passed=False,
                    message="Python runner returned an invalid result.",
                )
            ]

        return [PythonTestResult.model_validate(item) for item in payload["tests"]]

    def _runner_script(
        self,
        spec: PythonLabSpec,
        cases: list[PythonTestCase],
        submission_path: Path,
    ) -> str:
        payload = {
            "function_name": spec.function_name,
            "cases": [
                {
                    "name": item.name,
                    "args": item.args,
                    "expected": item.expected,
                }
                for item in cases
            ],
            "submission_path": str(submission_path),
        }
        payload_json = json.dumps(payload)
        return textwrap.dedent(
            f"""
            import contextlib
            import json
            import sys
            import traceback

            PAYLOAD = json.loads({payload_json!r})

            def normalize(value):
                if isinstance(value, tuple):
                    return [normalize(item) for item in value]
                if isinstance(value, list):
                    return [normalize(item) for item in value]
                if isinstance(value, set):
                    return sorted(normalize(item) for item in value)
                if isinstance(value, dict):
                    return {{
                        key: normalize(value[key])
                        for key in sorted(value)
                    }}
                return value

            tests = []
            namespace = {{}}

            try:
                user_code = open(PAYLOAD["submission_path"], "r", encoding="utf-8").read()
                exec(compile(user_code, "submission.py", "exec"), namespace, namespace)
                candidate = namespace.get(PAYLOAD["function_name"])
                if not callable(candidate):
                    raise AssertionError(
                        f"Define a function named {{PAYLOAD['function_name']}}."
                    )
                for case in PAYLOAD["cases"]:
                    try:
                        actual = normalize(candidate(*case["args"]))
                        expected = normalize(case["expected"])
                        passed = actual == expected
                        tests.append({{
                            "name": case["name"],
                            "passed": passed,
                            "message": (
                                "Output matched expected value."
                                if passed else
                                "Output mismatch. Check edge cases, ordering, and returned data shape."
                            ),
                            "actual": actual,
                            "expected": expected,
                        }})
                    except Exception as exc:
                        tests.append({{
                            "name": case["name"],
                            "passed": False,
                            "message": str(exc),
                            "actual": None,
                            "expected": normalize(case["expected"]),
                        }})
            except Exception:
                tests.append({{
                    "name": "submission load",
                    "passed": False,
                    "message": traceback.format_exc()[-1200:],
                    "actual": None,
                    "expected": None,
                }})

            print(json.dumps({{"tests": tests}}, default=str))
            """
        ).strip()


__all__ = [
    "PythonValidationError",
    "PythonValidationNotFoundError",
    "PythonValidationService",
]
