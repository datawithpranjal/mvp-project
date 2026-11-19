"""Generic Spark transformation executor. Deployment isolation is supplied externally."""

import argparse
import contextlib
import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile

from pyspark_environment import PysparkRuntimePaths, build_child_environment


def _string_list(value, *, nonempty=False):
    return (
        isinstance(value, list)
        and (bool(value) or not nonempty)
        and all(isinstance(item, str) and item for item in value)
    )


def _validate_payload(payload):
    if not isinstance(payload, dict) or set(payload) != {"output_columns", "output_variable_names", "cases"}:
        raise ValueError("Invalid executor request.")
    if not _string_list(payload["output_columns"], nonempty=True):
        raise ValueError("Invalid executor output columns.")
    if not _string_list(payload["output_variable_names"], nonempty=True):
        raise ValueError("Invalid executor output variables.")
    if not isinstance(payload["cases"], list) or not payload["cases"]:
        raise ValueError("Invalid executor cases.")
    for case in payload["cases"]:
        if not isinstance(case, dict) or set(case) != {"inputs", "context"}:
            raise ValueError("Invalid executor case.")
        if not isinstance(case["context"], dict) or not all(isinstance(key, str) for key in case["context"]):
            raise ValueError("Invalid executor context.")
        if not isinstance(case["inputs"], list):
            raise ValueError("Invalid executor inputs.")
        for table in case["inputs"]:
            if not isinstance(table, dict) or set(table) != {"name", "rows", "timestamp_columns"}:
                raise ValueError("Invalid executor input table.")
            if not isinstance(table["name"], str) or not table["name"]:
                raise ValueError("Invalid executor input name.")
            if not isinstance(table["rows"], list) or not all(isinstance(row, dict) for row in table["rows"]):
                raise ValueError("Invalid executor input rows.")
            if not _string_list(table["timestamp_columns"]):
                raise ValueError("Invalid executor timestamp columns.")


def _normalize_value(value):
    if isinstance(value, Decimal):
        value = float(value)
    if isinstance(value, float):
        return round(value, 2)
    if isinstance(value, datetime.datetime):
        return value.isoformat(sep=" ")[:19]
    if isinstance(value, datetime.date):
        return value.isoformat()[:10]
    return value


def _normalize_rows(rows):
    normalized = [[_normalize_value(value) for value in row] for row in rows]
    return sorted(normalized, key=lambda row: json.dumps(row, sort_keys=True))


def _execute_cases(payload, code):
    from pyspark.sql import DataFrame, SparkSession, functions as F

    _validate_payload(payload)
    results = []
    with contextlib.redirect_stdout(sys.stderr):
        spark = (
            SparkSession.builder.master("local[1]")
            .appName("data-foundry-pyspark-executor")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.shuffle.partitions", "1")
            .getOrCreate()
        )
        spark.sparkContext.setLogLevel("ERROR")
        try:
            for case in payload["cases"]:
                try:
                    namespace = {"spark": spark, "F": F}
                    for table in case["inputs"]:
                        frame = spark.createDataFrame(table["rows"])
                        for column in table["timestamp_columns"]:
                            frame = frame.withColumn(column, F.to_timestamp(column))
                        namespace[table["name"]] = frame
                    namespace.update(case["context"])
                    exec(compile(code, "submission.py", "exec"), namespace, namespace)
                    output = next((
                        namespace[name] for name in payload["output_variable_names"]
                        if isinstance(namespace.get(name), DataFrame)
                    ), None)
                    if output is None:
                        raise ValueError("Create a Spark DataFrame assigned to one of the expected output variables.")
                    missing = [column for column in payload["output_columns"] if column not in output.columns]
                    if missing:
                        raise ValueError("Missing output columns: " + ", ".join(missing))
                    rows = _normalize_rows([
                        list(row) for row in output.select(*payload["output_columns"]).collect()
                    ])
                    results.append({"rows": rows, "error": None})
                except Exception as exc:
                    results.append({"rows": [], "error": str(exc)})
        finally:
            with contextlib.suppress(Exception):
                spark.stop()
    return {"cases": results}


def _run_process(command, *, cwd, env, timeout, input_text):
    with subprocess.Popen(
        command, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, start_new_session=True,
    ) as process:
        try:
            stdout, stderr = process.communicate(input=input_text, timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.communicate(timeout=5)
            raise
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def run(payload: dict, code: str, *, runtime_paths: PysparkRuntimePaths | None = None,
        timeout_seconds: float = 25.0) -> dict:
    """Execute only transformation inputs; correctness comparisons belong to the caller."""
    _validate_payload(payload)
    if not isinstance(code, str) or not code.strip():
        raise ValueError("PySpark code is required.")
    with tempfile.TemporaryDirectory(prefix="tdf-pyspark-executor-", dir="/tmp") as request:
        request_dir = Path(request)
        env = build_child_environment(request_dir, runtime_paths)
        completed = _run_process(
            [env["PYSPARK_PYTHON"], str(Path(__file__).resolve()), "--trusted-child"],
            cwd=str(request_dir), env=env, timeout=timeout_seconds,
            input_text=json.dumps({"payload": payload, "code": code}),
        )
        if completed.returncode != 0:
            raise RuntimeError("PySpark executor could not complete the request.")
        try:
            result = json.loads(completed.stdout)
            if not isinstance(result, dict) or set(result) != {"cases"}:
                raise ValueError("Invalid executor response.")
            if not isinstance(result["cases"], list) or len(result["cases"]) != len(payload["cases"]):
                raise ValueError("Invalid executor response.")
            for case in result["cases"]:
                if not isinstance(case, dict) or set(case) != {"rows", "error"}:
                    raise ValueError("Invalid executor response.")
                if not isinstance(case["rows"], list) or not all(isinstance(row, list) for row in case["rows"]):
                    raise ValueError("Invalid executor response.")
                if case["error"] is not None and not isinstance(case["error"], str):
                    raise ValueError("Invalid executor response.")
            return result
        except (ValueError, TypeError) as exc:
            raise RuntimeError("PySpark executor returned an invalid response.") from exc


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    try:
        if arguments == ["--trusted-child"]:
            request = json.load(sys.stdin)
            result = _execute_cases(request["payload"], request["code"])
        else:
            parser = argparse.ArgumentParser(description="Execute a generic PySpark transformation request.")
            parser.add_argument("request_json", type=Path)
            parser.add_argument("submission_py", type=Path)
            args = parser.parse_args(arguments)
            payload = json.loads(args.request_json.read_text(encoding="utf-8"))
            code = args.submission_py.read_text(encoding="utf-8")
            result = run(payload, code)
        print(json.dumps(result))
        return 0
    except Exception:
        print("PySpark executor could not complete the request.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
