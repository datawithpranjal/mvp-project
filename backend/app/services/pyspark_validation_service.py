from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.schemas.pyspark_validation import (
    PysparkTestResult,
    PysparkValidationMode,
    PysparkValidationResponse,
)
from app.services.pyspark_specs import PYSPARK_SPECS, PysparkCase, PysparkSpec


class PysparkValidationError(RuntimeError):
    pass


class PysparkValidationConfigurationError(PysparkValidationError):
    pass


class PysparkValidationNotFoundError(PysparkValidationError):
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
        re.compile(r"\bspark\s*\.\s*read\b|\braw_sales_path\b"),
        "The runner provides seeded DataFrames directly. Do not read external files in this validator.",
    ),
    (
        re.compile(r"\.write\b|insertInto\s*\(|saveAsTable\s*\(|\.save\s*\("),
        "For validation, do not write to a warehouse. Assign the final DataFrame to the expected result variable instead.",
    ),
]


class PysparkValidationService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def validate(
        self,
        slug: str,
        code: str,
        mode: PysparkValidationMode,
    ) -> PysparkValidationResponse:
        spec = PYSPARK_SPECS.get(slug)
        if spec is None:
            raise PysparkValidationNotFoundError(
                "This PySpark practice item does not have executable validation yet."
            )

        guardrail_error = self._validate_code_guardrails(code)
        if guardrail_error:
            tests = [
                PysparkTestResult(
                    name="static safety check",
                    passed=False,
                    message=guardrail_error,
                )
            ]
            return PysparkValidationResponse(
                mode=mode,
                passed=False,
                message=guardrail_error,
                tests=tests,
                execution_engine="local",
            )

        if self.settings.pyspark_runner_url:
            return self._validate_remote(slug=slug, code=code, mode=mode)

        if not self.settings.pyspark_execution_enabled:
            raise PysparkValidationConfigurationError(
                "PySpark execution is not enabled on this backend. Configure PYSPARK_RUNNER_URL "
                "for production or set PYSPARK_EXECUTION_ENABLED=true in a local Spark worker."
            )

        cases = spec.sample_cases if mode == "sample" else spec.hidden_cases
        tests = self._run_code_checks(spec=spec, code=code, mode=mode)
        tests.extend(self._run_local(spec=spec, code=code, cases=list(cases)))
        passed = all(test.passed for test in tests)
        return PysparkValidationResponse(
            mode=mode,
            passed=passed,
            message=(
                "PySpark validation passed."
                if passed
                else "PySpark validation found an output mismatch."
            ),
            tests=tests,
            execution_engine="local",
        )

    def _validate_remote(
        self,
        slug: str,
        code: str,
        mode: PysparkValidationMode,
    ) -> PysparkValidationResponse:
        url = f"{self.settings.pyspark_runner_url.rstrip('/')}/api/v1/pyspark/validate/{slug}"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.settings.pyspark_runner_token:
            headers["X-Runner-Token"] = self.settings.pyspark_runner_token

        try:
            with httpx.Client(timeout=self.settings.pyspark_timeout_seconds + 5) as client:
                response = client.post(url, headers=headers, json={"code": code, "mode": mode})
        except httpx.HTTPError as exc:
            raise PysparkValidationConfigurationError(
                "The PySpark runner could not be reached."
            ) from exc

        if response.status_code >= 400:
            raise PysparkValidationConfigurationError(
                f"The PySpark runner rejected the request with status {response.status_code}."
            )

        payload = response.json()
        payload["execution_engine"] = "remote"
        return PysparkValidationResponse.model_validate(payload)

    def _validate_code_guardrails(self, code: str) -> str | None:
        if len(code) > 8000:
            return "Code is too long for this runner."
        for pattern, message in DISALLOWED_CODE_PATTERNS:
            if pattern.search(code):
                return message
        return None

    def _run_code_checks(
        self,
        spec: PysparkSpec,
        code: str,
        mode: PysparkValidationMode,
    ) -> list[PysparkTestResult]:
        compact_code = "".join(code.lower().split())
        tests: list[PysparkTestResult] = []
        for check in spec.code_checks:
            if mode not in check.modes:
                continue
            matched = check.needle in compact_code
            passed = matched if check.should_contain else not matched
            tests.append(
                PysparkTestResult(
                    name=check.name,
                    passed=passed,
                    message="Static code check passed." if passed else check.message,
                )
            )
        return tests

    def _run_local(
        self,
        spec: PysparkSpec,
        code: str,
        cases: list[PysparkCase],
    ) -> list[PysparkTestResult]:
        if not spec.output_columns or not cases:
            return []

        with tempfile.TemporaryDirectory(prefix="data-foundry-pyspark-") as tmp:
            tmp_path = Path(tmp)
            submission_path = tmp_path / "submission.py"
            runner_path = tmp_path / "runner.py"
            submission_path.write_text(code, encoding="utf-8")
            runner_path.write_text(
                self._runner_script(spec=spec, cases=cases, submission_path=submission_path),
                encoding="utf-8",
            )
            env = {
                **os.environ,
                "PYSPARK_PYTHON": sys.executable,
                "SPARK_LOCAL_HOSTNAME": "127.0.0.1",
            }
            completed = subprocess.run(
                [sys.executable, str(runner_path)],
                cwd=str(tmp_path),
                env=env,
                capture_output=True,
                text=True,
                timeout=self.settings.pyspark_timeout_seconds,
                check=False,
            )

        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "PySpark execution failed.").strip()
            return [
                PysparkTestResult(
                    name="runner startup",
                    passed=False,
                    message=message[-1200:],
                )
            ]

        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return [
                PysparkTestResult(
                    name="runner output",
                    passed=False,
                    message="PySpark runner returned an invalid result.",
                )
            ]

        return [PysparkTestResult.model_validate(item) for item in payload["tests"]]

    def _runner_script(
        self,
        spec: PysparkSpec,
        cases: list[PysparkCase],
        submission_path: Path,
    ) -> str:
        payload = {
            "output_columns": list(spec.output_columns),
            "output_variable_names": list(spec.output_variable_names),
            "cases": [
                {
                    "name": case.name,
                    "inputs": [
                        {
                            "name": input_table.name,
                            "rows": input_table.rows,
                            "timestamp_columns": list(input_table.timestamp_columns),
                        }
                        for input_table in case.inputs
                    ],
                    "context": case.context,
                    "expected_rows": case.expected_rows,
                }
                for case in cases
            ],
            "submission_path": str(submission_path),
        }
        payload_json = json.dumps(payload)
        return textwrap.dedent(
            f"""
            import contextlib
            import datetime as _dt
            import json
            import sys
            import traceback
            from decimal import Decimal

            from pyspark.sql import SparkSession, functions as F
            from pyspark.sql.dataframe import DataFrame

            PAYLOAD = json.loads({payload_json!r})

            def normalize_value(value):
                if isinstance(value, Decimal):
                    value = float(value)
                if isinstance(value, float):
                    return round(value, 2)
                if isinstance(value, _dt.datetime):
                    return value.isoformat(sep=" ")[:19]
                if isinstance(value, _dt.date):
                    return value.isoformat()[:10]
                return value

            def query_result(columns, rows):
                return {{
                    "columns": columns,
                    "column_types": [],
                    "rows": [[normalize_value(value) for value in row] for row in rows],
                }}

            def normalize_rows(rows):
                normalized = [[normalize_value(value) for value in row] for row in rows]
                return sorted(normalized, key=lambda row: json.dumps(row, sort_keys=True))

            tests = []
            spark = (
                SparkSession.builder
                .master("local[1]")
                .appName("data-foundry-pyspark-validation")
                .config("spark.ui.enabled", "false")
                .config("spark.sql.shuffle.partitions", "1")
                .getOrCreate()
            )
            spark.sparkContext.setLogLevel("ERROR")

            try:
                user_code = open(PAYLOAD["submission_path"], "r", encoding="utf-8").read()
                for case in PAYLOAD["cases"]:
                    try:
                        namespace = {{
                            "spark": spark,
                            "F": F,
                        }}
                        for input_table in case["inputs"]:
                            df = spark.createDataFrame(input_table["rows"])
                            for timestamp_column in input_table.get("timestamp_columns", []):
                                df = df.withColumn(timestamp_column, F.to_timestamp(timestamp_column))
                            namespace[input_table["name"]] = df
                        for context_key, context_value in case.get("context", {{}}).items():
                            namespace[context_key] = context_value
                        exec(compile(user_code, "submission.py", "exec"), namespace, namespace)
                        output_df = None
                        for variable_name in PAYLOAD["output_variable_names"]:
                            candidate = namespace.get(variable_name)
                            if isinstance(candidate, DataFrame):
                                output_df = candidate
                                break
                        if not isinstance(output_df, DataFrame):
                            raise ValueError(
                                "Create a Spark DataFrame assigned to one of the expected output variables."
                            )
                        missing_columns = [
                            column for column in PAYLOAD["output_columns"]
                            if column not in output_df.columns
                        ]
                        if missing_columns:
                            raise ValueError("Missing output columns: " + ", ".join(missing_columns))
                        selected_df = output_df.select(*PAYLOAD["output_columns"])
                        actual_rows = normalize_rows(
                            [list(row) for row in selected_df.collect()]
                        )
                        expected_rows = normalize_rows(case["expected_rows"])
                        passed = actual_rows == expected_rows
                        tests.append({{
                            "name": case["name"],
                            "passed": passed,
                            "message": (
                                "Output matched expected aggregate."
                                if passed else
                                "Output mismatch. Check the expected grain, filters, deduplication, and projected columns."
                            ),
                            "actual_output": query_result(PAYLOAD["output_columns"], actual_rows),
                            "expected_output": query_result(PAYLOAD["output_columns"], expected_rows),
                        }})
                    except Exception as exc:
                        tests.append({{
                            "name": case["name"],
                            "passed": False,
                            "message": str(exc),
                            "actual_output": query_result(PAYLOAD["output_columns"], []),
                            "expected_output": query_result(
                                PAYLOAD["output_columns"],
                                case["expected_rows"],
                            ),
                        }})
            finally:
                with contextlib.suppress(Exception):
                    spark.stop()

            print(json.dumps({{"tests": tests}}))
            """
        ).strip()


__all__ = [
    "PysparkValidationConfigurationError",
    "PysparkValidationError",
    "PysparkValidationNotFoundError",
    "PysparkValidationService",
]
