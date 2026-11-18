from __future__ import annotations

import json
import os
import re
import signal
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
        except httpx.TimeoutException as exc:
            raise PysparkValidationConfigurationError(
                "PySpark execution timed out. No correctness result was produced. Retry the check."
            ) from exc
        except httpx.HTTPError as exc:
            raise PysparkValidationConfigurationError(
                "The PySpark runner could not be reached."
            ) from exc

        if response.status_code >= 400:
            raise PysparkValidationConfigurationError(
                f"The PySpark runner rejected the request with status {response.status_code}."
            )

        try:
            payload = response.json()
            payload["execution_engine"] = "remote"
            result = PysparkValidationResponse.model_validate(payload)
            if result.mode != mode or not result.tests or result.passed != all(test.passed for test in result.tests):
                raise ValueError("Missing or inconsistent validation evidence")
            return result
        except (ValueError, TypeError) as exc:
            raise PysparkValidationConfigurationError(
                "The PySpark runner returned an invalid response. No correctness result was produced."
            ) from exc

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
            try:
                completed = self._run_worker(
                    [sys.executable, str(runner_path)],
                    cwd=str(tmp_path),
                    env=env,
                    timeout=self.settings.pyspark_timeout_seconds,
                )
            except subprocess.TimeoutExpired as exc:
                raise PysparkValidationConfigurationError(
                    "PySpark execution timed out. No correctness result was produced. Retry the check."
                ) from exc

        if completed.returncode != 0:
            raise PysparkValidationConfigurationError(
                "The PySpark worker could not finish the check. No correctness result was produced."
            )

        try:
            payload = json.loads(completed.stdout)
            if not payload["tests"]:
                raise ValueError("No checks returned")
            return [PysparkTestResult.model_validate(item) for item in payload["tests"]]
        except (ValueError, TypeError, KeyError) as exc:
            raise PysparkValidationConfigurationError(
                "The PySpark worker returned an invalid result. No correctness result was produced."
            ) from exc

    @staticmethod
    def _run_worker(
        command: list[str], *, cwd: str, env: dict[str, str], timeout: float,
    ) -> subprocess.CompletedProcess[str]:
        # Spark starts a JVM child. Killing only its Python parent leaves work running.
        with subprocess.Popen(
            command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True,
        ) as process:
            try:
                stdout, stderr = process.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                if os.name == "posix":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                else:
                    process.kill()
                process.communicate(timeout=5)
                raise
            return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)

    def _runner_script(
        self,
        spec: PysparkSpec,
        cases: list[PysparkCase],
        submission_path: Path,
    ) -> str:
        payload = {
            "output_columns": list(spec.output_columns),
            "output_variable_names": list(spec.output_variable_names),
            "numeric_tolerances": spec.numeric_tolerances,
            "cases": [
                {
                    "name": case.name,
                    "inputs": [
                        {
                            "name": input_table.name,
                            "rows": input_table.rows,
                            "timestamp_columns": list(input_table.timestamp_columns),
                            "input_schema": input_table.input_schema,
                        }
                        for input_table in case.inputs
                    ],
                    "context": case.context,
                    "expected_rows": case.expected_rows,
                    "session_timezone": case.session_timezone,
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
            import math
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
                    if PAYLOAD["numeric_tolerances"]:
                        return value if math.isfinite(value) else str(value)
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

            def rows_match(actual, expected):
                if not PAYLOAD["numeric_tolerances"]:
                    return normalize_rows(actual) == normalize_rows(expected)
                if len(actual) != len(expected):
                    return False

                def row_match(left, right):
                    for column, a, b in zip(PAYLOAD["output_columns"], left, right):
                        tolerance = PAYLOAD["numeric_tolerances"].get(column)
                        if tolerance is None:
                            if normalize_value(a) != normalize_value(b):
                                return False
                        else:
                            if any(isinstance(v, bool) or not isinstance(v, (int, float, Decimal)) for v in (a, b)):
                                return False
                            a, b = Decimal(str(a)), Decimal(str(b))
                            if not a.is_finite() or not b.is_finite() or abs(a - b) > Decimal(tolerance):
                                return False
                    return True

                # One-to-one multiset matching preserves duplicates and accepts
                # numeric representation differences without rounding the answer.
                matches = {{}}
                def assign(index, seen):
                    for target, row in enumerate(expected):
                        if target not in seen and row_match(actual[index], row):
                            seen.add(target)
                            if target not in matches or assign(matches[target], seen):
                                matches[target] = index
                                return True
                    return False
                return all(assign(index, set()) for index in range(len(actual)))

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
                    # Fixture/runtime setup errors must escape to an unavailable
                    # worker result, rather than being graded as learner mistakes.
                    if case.get("session_timezone"):
                        spark.conf.set("spark.sql.session.timeZone", case["session_timezone"])
                        spark.conf.set("spark.sql.timestampType", "TIMESTAMP_LTZ")
                    namespace = {{"spark": spark, "F": F}}
                    for input_table in case["inputs"]:
                        df = spark.createDataFrame(input_table["rows"], schema=input_table.get("input_schema"))
                        for timestamp_column in input_table.get("timestamp_columns", []):
                            df = df.withColumn(timestamp_column, F.to_timestamp(timestamp_column))
                        namespace[input_table["name"]] = df
                    for context_key, context_value in case.get("context", {{}}).items():
                        namespace[context_key] = context_value
                    try:
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
                        actual_rows = [list(row) for row in selected_df.collect()]
                        expected_rows = case["expected_rows"]
                        passed = rows_match(actual_rows, expected_rows)
                        tests.append({{
                            "name": case["name"],
                            "passed": passed,
                            "message": (
                                "Output matched expected aggregate."
                                if passed else
                                "Output mismatch. Check the expected grain, filters, deduplication, and projected columns."
                            ),
                            "actual_output": query_result(PAYLOAD["output_columns"], normalize_rows(actual_rows)),
                            "expected_output": query_result(PAYLOAD["output_columns"], normalize_rows(expected_rows)),
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
