from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.pyspark_validation import (
    PysparkTestResult,
    PysparkValidationMode,
    PysparkValidationResponse,
)
from app.schemas.validation import QueryResult


class PysparkValidationError(RuntimeError):
    pass


class PysparkValidationConfigurationError(PysparkValidationError):
    pass


class PysparkValidationNotFoundError(PysparkValidationError):
    pass


@dataclass(frozen=True)
class PysparkCase:
    name: str
    run_date: str
    rows: list[dict[str, Any]]
    expected_rows: list[list[Any]]


@dataclass(frozen=True)
class PysparkScenarioSpec:
    slug: str
    output_columns: list[str]
    sample_cases: list[PysparkCase]
    hidden_cases: list[PysparkCase]


YESTERDAYS_SALES_SPEC = PysparkScenarioSpec(
    slug="yesterdays-sales-missing-late-source-arrival",
    output_columns=["business_date", "order_count", "gross_sales"],
    sample_cases=[
        PysparkCase(
            name="visible late-arriving paid sales",
            run_date="2026-05-07",
            rows=[
                {
                    "order_id": 7001,
                    "customer_id": 101,
                    "sale_ts_utc": "2026-05-07 10:15:00",
                    "amount": 250.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-08 03:22:10",
                },
                {
                    "order_id": 7002,
                    "customer_id": 102,
                    "sale_ts_utc": "2026-05-07 18:40:00",
                    "amount": 170.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-08 03:25:44",
                },
                {
                    "order_id": 7003,
                    "customer_id": 103,
                    "sale_ts_utc": "2026-05-08 01:05:00",
                    "amount": 90.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-08",
                    "ingested_at": "2026-05-08 03:26:01",
                },
                {
                    "order_id": 7004,
                    "customer_id": 104,
                    "sale_ts_utc": "2026-05-07 12:30:00",
                    "amount": 75.0,
                    "status": "CANCELLED",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-08 03:23:00",
                },
            ],
            expected_rows=[["2026-05-07", 2, 420.0]],
        )
    ],
    hidden_cases=[
        PysparkCase(
            name="hidden duplicate late file should not double count",
            run_date="2026-05-07",
            rows=[
                {
                    "order_id": 8101,
                    "customer_id": 201,
                    "sale_ts_utc": "2026-05-07 09:00:00",
                    "amount": 300.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-09 01:10:00",
                },
                {
                    "order_id": 8101,
                    "customer_id": 201,
                    "sale_ts_utc": "2026-05-07 09:00:00",
                    "amount": 300.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-09 01:12:00",
                },
                {
                    "order_id": 8102,
                    "customer_id": 202,
                    "sale_ts_utc": "2026-05-07 22:35:00",
                    "amount": 120.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-09 01:13:00",
                },
                {
                    "order_id": 8103,
                    "customer_id": 203,
                    "sale_ts_utc": "2026-05-07 12:00:00",
                    "amount": 70.0,
                    "status": "CANCELLED",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-09 01:14:00",
                },
                {
                    "order_id": 8104,
                    "customer_id": 204,
                    "sale_ts_utc": "2026-05-08 00:05:00",
                    "amount": 999.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-08",
                    "ingested_at": "2026-05-09 01:15:00",
                },
            ],
            expected_rows=[["2026-05-07", 2, 420.0]],
        ),
        PysparkCase(
            name="hidden same ingestion day includes wrong business dates",
            run_date="2026-05-07",
            rows=[
                {
                    "order_id": 8201,
                    "customer_id": 301,
                    "sale_ts_utc": "2026-05-06 23:50:00",
                    "amount": 500.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-06",
                    "ingested_at": "2026-05-07 01:00:00",
                },
                {
                    "order_id": 8202,
                    "customer_id": 302,
                    "sale_ts_utc": "2026-05-07 11:45:00",
                    "amount": 80.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-08 02:00:00",
                },
                {
                    "order_id": 8203,
                    "customer_id": 303,
                    "sale_ts_utc": "2026-05-07 19:10:00",
                    "amount": 140.0,
                    "status": "PAID",
                    "source_file_date": "2026-05-07",
                    "ingested_at": "2026-05-08 02:01:00",
                },
            ],
            expected_rows=[["2026-05-07", 2, 220.0]],
        ),
    ],
)


PYSPARK_SPECS = {YESTERDAYS_SALES_SPEC.slug: YESTERDAYS_SALES_SPEC}


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
        "The runner provides the raw_sales DataFrame directly. Do not read external files.",
    ),
    (
        re.compile(r"\.write\b|insertInto\s*\(|saveAsTable\s*\(|\.save\s*\("),
        "For validation, do not write to a warehouse. Assign the fixed result DataFrame to daily_sales.",
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
                "This scenario does not have executable PySpark validation yet."
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
        tests = self._run_local(spec=spec, code=code, cases=cases)
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

    def _run_local(
        self,
        spec: PysparkScenarioSpec,
        code: str,
        cases: list[PysparkCase],
    ) -> list[PysparkTestResult]:
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
        spec: PysparkScenarioSpec,
        cases: list[PysparkCase],
        submission_path: Path,
    ) -> str:
        payload = {
            "output_columns": spec.output_columns,
            "cases": [
                {
                    "name": case.name,
                    "run_date": case.run_date,
                    "rows": case.rows,
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
                if isinstance(value, (_dt.date, _dt.datetime)):
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
                        raw_sales = spark.createDataFrame(case["rows"])
                        raw_sales = (
                            raw_sales
                            .withColumn("sale_ts_utc", F.to_timestamp("sale_ts_utc"))
                            .withColumn("ingested_at", F.to_timestamp("ingested_at"))
                        )
                        run_date = case["run_date"]
                        namespace = {{
                            "spark": spark,
                            "F": F,
                            "raw_sales": raw_sales,
                            "run_date": run_date,
                        }}
                        exec(compile(user_code, "submission.py", "exec"), namespace, namespace)
                        output_df = namespace.get("daily_sales")
                        if output_df is None:
                            output_df = namespace.get("fixed_daily_sales")
                        if not isinstance(output_df, DataFrame):
                            raise ValueError(
                                "Create a Spark DataFrame named daily_sales or fixed_daily_sales."
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
                                "Output mismatch. Check business_date, duplicate order handling, status filter, and gross_sales."
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
