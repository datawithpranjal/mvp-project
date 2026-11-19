import ast
from dataclasses import replace
import datetime
from decimal import Decimal
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from app.services import pyspark_environment
from app.services.pyspark_specs import PYSPARK_SPECS


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
PDF_SLUG = "pyspark-pdf-01-the-endless-final-stage"
CUSTOMER_PDF_SLUG = "pyspark-pdf-02-shuffle-storm-after-a-big-join"
CORE_SLUG = "pyspark-append-rerun-duplicates"
SALES_SLUG = "yesterdays-sales-missing-late-source-arrival"
PDF_CODE = '''from pyspark.sql import functions as F
result_df = incident_signals.filter(
    F.col("risk_score") >= F.col("action_threshold")
).select("signal_id", "diagnosis", "recommended_fix")
'''
SALES_CODE = '''from pyspark.sql import functions as F
daily_sales = (raw_sales.withColumn("business_date", F.to_date("sale_ts_utc"))
    .filter((F.col("business_date") == F.lit(run_date)) & (F.col("status") == "PAID"))
    .dropDuplicates(["order_id"]).groupBy("business_date")
    .agg(F.count("order_id").alias("order_count"), F.sum("amount").alias("gross_sales")))
'''


@pytest.fixture
def executor(monkeypatch):
    monkeypatch.setitem(sys.modules, "pyspark_environment", pyspark_environment)
    spec = importlib.util.spec_from_file_location("standalone_pyspark_executor", BACKEND_ROOT / "pyspark_executor.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def payload_for(slug=PDF_SLUG, mode="sample"):
    spec = PYSPARK_SPECS[slug]
    cases = spec.sample_cases if mode == "sample" else spec.hidden_cases
    return {
        "output_columns": list(spec.output_columns),
        "output_variable_names": list(spec.output_variable_names),
        "cases": [{
            "inputs": [{
                "name": table.name,
                "rows": table.rows,
                "timestamp_columns": list(table.timestamp_columns),
            } for table in case.inputs],
            "context": dict(case.context),
        } for case in cases],
    }


def test_executor_image_contains_only_generic_program_and_runtime_helper():
    dockerfile = (REPO_ROOT / "docker" / "pyspark-executor.Dockerfile").read_text(encoding="utf-8")
    copies = [line.strip() for line in dockerfile.splitlines() if line.startswith("COPY ")]
    assert copies == [
        "COPY backend/requirements-pyspark-executor.txt /opt/requirements.txt",
        "COPY backend/pyspark_executor.py /opt/pyspark_executor.py",
        "COPY backend/app/services/pyspark_environment.py /opt/pyspark_environment.py",
    ]
    assert 'ENTRYPOINT ["python", "/opt/pyspark_executor.py"]' in dockerfile
    assert "EXPOSE " not in dockerfile
    assert "uvicorn" not in dockerfile
    assert "PYSPARK_RUNNER_TOKEN" not in dockerfile
    assert (BACKEND_ROOT / "requirements-pyspark-executor.txt").read_text().strip() == "pyspark==3.5.9"
    source = (BACKEND_ROOT / "pyspark_executor.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append(node.module or "")
    assert all(not name.startswith("app") for name in imports)
    assert "pyspark_specs" not in source
    assert "expected_rows" not in source
    assert '"passed"' not in source


@pytest.mark.parametrize("private_location", ["top", "case", "input"])
def test_executor_rejects_private_grading_fields_before_starting_a_process(executor, monkeypatch, private_location):
    payload = payload_for()
    target = payload if private_location == "top" else payload["cases"][0]
    if private_location == "input":
        target = target["inputs"][0]
    target["expected_rows"] = [["synthetic-private-oracle"]]

    def no_runtime(*args, **kwargs):
        pytest.fail("Private grading fields reached runtime setup")

    monkeypatch.setattr(executor, "build_child_environment", no_runtime)
    with pytest.raises(ValueError):
        executor.run(payload, PDF_CODE)


def test_executor_preserves_existing_value_normalization(executor):
    assert executor._normalize_rows([
        [2, Decimal("5.126"), datetime.date(2026, 5, 7)],
        [1, 3.456, datetime.datetime(2026, 5, 7, 12, 13, 14, 999)],
    ]) == [[1, 3.46, "2026-05-07 12:13:14"], [2, 5.13, "2026-05-07"]]


@pytest.mark.parametrize("returncode,stdout", [
    (1, '{"cases":[]}'),
    (0, "learner noise\n{}"),
    (0, '{"passed":true}'),
    (0, '{"cases":[]}'),
    (0, '{"cases":[{"rows":[],"error":null,"passed":true}]}'),
])
def test_executor_runtime_or_protocol_failure_cannot_produce_a_result(executor, monkeypatch, returncode, stdout):
    monkeypatch.setattr(executor, "build_child_environment", lambda *args: {"PYSPARK_PYTHON": sys.executable})
    monkeypatch.setattr(executor, "_run_process", lambda *args, **kwargs: subprocess.CompletedProcess(
        args[0], returncode, stdout, "synthetic internal runtime detail"
    ))
    with pytest.raises(RuntimeError) as error:
        executor.run(payload_for(), PDF_CODE)
    assert "synthetic internal" not in str(error.value)


def test_executor_cli_reads_only_provided_request_and_submission(executor, monkeypatch, tmp_path, capsys):
    request_path = tmp_path / "request.json"
    submission_path = tmp_path / "submission.py"
    payload = payload_for()
    request_path.write_text(json.dumps(payload), encoding="utf-8")
    submission_path.write_text(PDF_CODE, encoding="utf-8")
    captured = []

    def run(request, code):
        captured.append((request, code))
        return {"cases": [{"rows": [], "error": None}]}

    monkeypatch.setattr(executor, "run", run)
    assert executor.main([str(request_path), str(submission_path)]) == 0
    assert captured == [(payload, PDF_CODE)]
    output = capsys.readouterr()
    assert json.loads(output.out) == {"cases": [{"rows": [], "error": None}]}
    assert output.err == ""


@pytest.mark.skipif(os.name != "posix", reason="POSIX process-group cleanup")
def test_executor_timeout_stops_descendant_processes(executor, tmp_path):
    import time

    started = tmp_path / "descendant-started"
    lifetime_pipe = tmp_path / "descendant-lifetime"
    os.mkfifo(lifetime_pipe, mode=0o600)
    reader = os.open(lifetime_pipe, os.O_RDONLY | os.O_NONBLOCK)
    child = (
        "import os,time; from pathlib import Path; "
        f"pipe=os.open({str(lifetime_pipe)!r},os.O_WRONLY); "
        "os.write(pipe,b'child-started'); "
        f"Path({str(started)!r}).write_text('started'); time.sleep(10)"
    )
    parent = f"import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',{child!r}]); time.sleep(10)"
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            executor._run_process(
                [sys.executable, "-c", parent], cwd=str(tmp_path),
                env={"PATH": "/usr/bin:/bin"}, timeout=1.0, input_text="",
            )
        assert started.read_text() == "started", "The descendant must actually start before timeout"
        received = bytearray()
        deadline = time.monotonic() + 0.75
        while True:
            try:
                chunk = os.read(reader, 64)
            except BlockingIOError:
                assert time.monotonic() < deadline, "Timed-out descendant still holds its lifetime pipe"
                time.sleep(0.01)
                continue
            if not chunk:
                break
            received.extend(chunk)
        assert received == b"child-started"
    finally:
        os.close(reader)


@pytest.mark.skipif(os.name != "posix", reason="POSIX nonblocking process I/O")
def test_executor_run_refuses_actual_child_stdout_overflow(executor, monkeypatch, tmp_path):
    import time

    monkeypatch.setattr(executor, "MAX_OUTPUT_BYTES", 4096)
    monkeypatch.setattr(executor, "build_child_environment", lambda *args: {
        "PATH": "/usr/bin:/bin", "PYSPARK_PYTHON": sys.executable,
    })
    real_run_process = executor._run_process
    started = tmp_path / "overflow-descendant-started"
    lifetime_pipe = tmp_path / "overflow-descendant-lifetime"
    os.mkfifo(lifetime_pipe, mode=0o600)
    reader = os.open(lifetime_pipe, os.O_RDONLY | os.O_NONBLOCK)
    child = (
        "import os,time; from pathlib import Path; "
        f"pipe=os.open({str(lifetime_pipe)!r},os.O_WRONLY); "
        "os.write(pipe,b'child-started'); "
        f"Path({str(started)!r}).write_text('started'); time.sleep(10)"
    )
    producer = (
        "import os,subprocess,sys,time\nfrom pathlib import Path\n"
        "sys.stdin.read()\n"
        f"subprocess.Popen([sys.executable,'-c',{child!r}])\n"
        "deadline=time.monotonic()+2\n"
        f"while not Path({str(started)!r}).exists():\n"
        "    if time.monotonic() >= deadline:\n"
        "        raise RuntimeError('synthetic descendant did not start')\n"
        "    time.sleep(0.01)\n"
        "os.write(1,b'x'*4097)\ntime.sleep(10)\n"
    )

    def trusted_overflow(command, **kwargs):
        return real_run_process(
            [sys.executable, "-c", producer], **kwargs
        )

    monkeypatch.setattr(executor, "_run_process", trusted_overflow)
    try:
        with pytest.raises(RuntimeError) as error:
            executor.run(payload_for(), PDF_CODE, timeout_seconds=3.0)
        assert "unavailable" in str(error.value)
        assert "synthetic" not in str(error.value)
        assert "x" * 64 not in str(error.value)
        assert started.read_text() == "started", "The descendant must actually start before overflow"
        received = bytearray()
        deadline = time.monotonic() + 0.75
        while True:
            try:
                chunk = os.read(reader, 64)
            except BlockingIOError:
                assert time.monotonic() < deadline, "Overflowed descendant still holds its lifetime pipe"
                time.sleep(0.01)
                continue
            if not chunk:
                break
            received.extend(chunk)
        assert received == b"child-started"
    finally:
        os.close(reader)


@pytest.mark.skipif(os.name != "posix", reason="POSIX nonblocking process I/O")
def test_executor_discards_actual_child_stderr_and_preserves_success_output(executor, monkeypatch, tmp_path):
    monkeypatch.setattr(executor, "MAX_OUTPUT_BYTES", 4096)
    completed = executor._run_process(
        [sys.executable, "-c", (
            "import os; os.write(2,b'x'*(4096*512)); "
            "os.write(1,b'{\"cases\":[]}')"
        )],
        cwd=str(tmp_path), env={"PATH": "/usr/bin:/bin"}, timeout=3.0, input_text="",
    )
    assert completed.returncode == 0
    assert completed.stdout == '{"cases":[]}'
    assert completed.stderr == ""


@pytest.mark.skipif(os.name != "posix", reason="POSIX nonblocking process I/O")
def test_executor_preserves_actual_child_nonzero_return_without_returning_stderr(executor, tmp_path):
    completed = executor._run_process(
        [sys.executable, "-c", (
            "import sys; sys.stdout.write('synthetic partial output'); "
            "sys.stderr.write('synthetic private stderr'); sys.exit(7)"
        )],
        cwd=str(tmp_path), env={"PATH": "/usr/bin:/bin"}, timeout=3.0, input_text="",
    )
    assert completed.returncode == 7
    assert completed.stdout == "synthetic partial output"
    assert completed.stderr == ""


@pytest.mark.skipif(os.name != "posix", reason="POSIX nonblocking process I/O")
def test_executor_blocked_stdin_remains_inside_execution_deadline(executor, tmp_path):
    import time

    started = tmp_path / "nonreading-child-started"
    code = f"import time; from pathlib import Path; Path({str(started)!r}).write_text('started'); time.sleep(10)"
    beginning = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired):
        executor._run_process(
            [sys.executable, "-c", code], cwd=str(tmp_path),
            env={"PATH": "/usr/bin:/bin"}, timeout=1.0, input_text="x" * 524_288,
        )
    assert started.read_text() == "started"
    assert time.monotonic() - beginning < 1.0 + executor.REAP_SECONDS + 1.0


@pytest.mark.skipif(os.name != "posix", reason="POSIX nonblocking process I/O")
def test_executor_write_io_failure_is_generic_after_child_started(executor, monkeypatch, tmp_path):
    import time

    started = tmp_path / "io-child-started"
    code = f"import time; from pathlib import Path; Path({str(started)!r}).write_text('started'); time.sleep(10)"
    original_write = os.write

    def failed_input_write(descriptor, data):
        if bytes(data).startswith(b"synthetic-trusted-input"):
            deadline = time.monotonic() + 1.0
            while not started.exists():
                assert time.monotonic() < deadline, "The I/O test child did not start"
                time.sleep(0.01)
            raise OSError("synthetic-private-write-detail")
        return original_write(descriptor, data)

    monkeypatch.setattr(executor.os, "write", failed_input_write)
    with pytest.raises(RuntimeError) as error:
        executor._run_process(
            [sys.executable, "-c", code], cwd=str(tmp_path),
            env={"PATH": "/usr/bin:/bin"}, timeout=3.0, input_text="synthetic-trusted-input",
        )
    assert started.read_text() == "started"
    assert "synthetic-private-write-detail" not in str(error.value)
    assert "unavailable" in str(error.value)


def test_executor_bounds_utf8_input_bytes_before_launch(executor, monkeypatch, tmp_path):
    monkeypatch.setattr(executor, "MAX_INPUT_BYTES", 4096)

    def no_process(*args, **kwargs):
        pytest.fail("Oversized UTF-8 input reached process creation")

    monkeypatch.setattr(executor.subprocess, "Popen", no_process)
    with pytest.raises(RuntimeError) as error:
        executor._run_process(
            [sys.executable, "-c", "pass"], cwd=str(tmp_path),
            env={"PATH": "/usr/bin:/bin"}, timeout=1.0, input_text="\u20ac" * 1366,
        )
    assert "unavailable" in str(error.value)


def test_executor_cli_runtime_failure_has_no_result_or_private_detail(executor, monkeypatch, tmp_path, capsys):
    request_path = tmp_path / "request.json"
    submission_path = tmp_path / "submission.py"
    request_path.write_text(json.dumps(payload_for()), encoding="utf-8")
    submission_path.write_text(PDF_CODE, encoding="utf-8")

    def failed_run(*args, **kwargs):
        raise RuntimeError("synthetic-private-runtime-detail")

    monkeypatch.setattr(executor, "run", failed_run)
    assert executor.main([str(request_path), str(submission_path)]) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "PySpark executor could not complete the request.\n"


@pytest.mark.skipif(os.environ.get("RUN_SPARK_TESTS") != "1", reason="requires Java and optional Spark dependencies")
@pytest.mark.parametrize("slug,code,mode,correct", [
    (CUSTOMER_PDF_SLUG, PDF_CODE, "sample", True),
    (CUSTOMER_PDF_SLUG, PDF_CODE, "hidden", True),
    (CUSTOMER_PDF_SLUG, PDF_CODE.replace(">=", ">"), "sample", False),
    (CUSTOMER_PDF_SLUG, PDF_CODE.replace(">=", ">"), "hidden", False),
    (PDF_SLUG, PDF_CODE, "sample", True),
    (PDF_SLUG, PDF_CODE, "hidden", True),
    (PDF_SLUG, PDF_CODE.replace(">=", ">"), "sample", False),
    (PDF_SLUG, PDF_CODE.replace(">=", ">"), "hidden", False),
    (CORE_SLUG, 'result_df = orders.dropDuplicates(["order_id"])', "sample", True),
    (SALES_SLUG, SALES_CODE, "sample", True),
])
def test_parent_grades_real_generic_executor_outputs(executor, monkeypatch, tmp_path, slug, code, mode, correct):
    from app.core.config import Settings
    from app.services import pyspark_validation_service

    runtime = pyspark_environment.discover_runtime_paths()
    helper_root = tmp_path / "standalone-helper"
    helper_root.mkdir()
    (helper_root / "pyspark_environment.py").write_text(
        Path(pyspark_environment.__file__).read_text(encoding="utf-8"), encoding="utf-8"
    )
    runtime = replace(runtime, python_path=(*runtime.python_path, helper_root))
    dispatched = []

    class LocalGenericExecutor:
        def execute(self, *, code, payload, timeout):
            assert payload == payload_for(slug, mode)
            assert "expected_rows" not in json.dumps(payload)
            assert all(set(case) == {"inputs", "context"} for case in payload["cases"])
            output = executor.run(payload, code, runtime_paths=runtime, timeout_seconds=timeout)
            dispatched.append({"payload": payload, "code": code, "output": output})
            return output

    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", {})
        settings = Settings(
            _env_file=None,
            pyspark_execution_enabled=True,
            pyspark_runner_url=None,
            pyspark_runner_token="synthetic-local-executor-no-access",
        )
    monkeypatch.setattr(pyspark_validation_service, "get_settings", lambda: settings)
    service = pyspark_validation_service.PysparkValidationService(sandbox_executor=LocalGenericExecutor())
    submitted_code = "print('learner protocol noise')\n" + code
    result = service.validate(slug, submitted_code, mode)
    assert result.passed is correct
    assert result.mode == mode
    assert len(dispatched) == 1
    assert dispatched[0]["code"] == submitted_code
    raw = dispatched[0]["output"]
    assert set(raw) == {"cases"}
    spec = PYSPARK_SPECS[slug]
    cases = spec.sample_cases if mode == "sample" else spec.hidden_cases
    output_tests = [test for test in result.tests if test.actual_output is not None]
    assert len(raw["cases"]) == len(output_tests) == len(cases)
    for actual, graded, case in zip(raw["cases"], output_tests, cases):
        assert set(actual) == {"rows", "error"}
        assert actual["error"] is None
        expected = executor._normalize_rows(case.expected_rows)
        assert graded.passed is correct
        assert graded.expected_output.rows == expected
        assert graded.actual_output.rows == actual["rows"]
        if correct:
            assert graded.actual_output.rows == graded.expected_output.rows
        if not correct:
            assert len(actual["rows"]) == 1
