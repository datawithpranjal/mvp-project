"""Mocked CLI lifecycle contracts, not evidence of provider isolation."""

from dataclasses import FrozenInstanceError, replace
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import threading
from types import SimpleNamespace

import pytest

from app.services import pyspark_sandbox
from app.services.pyspark_sandbox import (
    CloudRunSandboxExecutor,
    SandboxPaths,
    SandboxUnavailable,
    UNAVAILABLE_MESSAGE,
)


PAYLOAD = {"output_columns": ["signal_id"], "output_variable_names": ["result_df"], "cases": [{"inputs": [], "context": {}}]}
RESULT = {"cases": [{"rows": [["synthetic-signal"]], "error": None}]}
CODE = "result_df = incident_signals"


@pytest.fixture(autouse=True)
def isolated_test_quarantine(monkeypatch):
    monkeypatch.setattr(pyspark_sandbox, "_QUARANTINED", threading.Event())


@pytest.fixture
def paths(tmp_path):
    launcher = tmp_path / "trusted-bin" / "sandbox"
    launcher.parent.mkdir()
    launcher.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    launcher.chmod(0o700)
    root = tmp_path / "requests"
    root.mkdir()
    return SandboxPaths(launcher=launcher, request_root=root)


def completed(command, *, output=None, status=0):
    return subprocess.CompletedProcess(command, status, json.dumps(RESULT) if output is None else output, "")


def assert_unavailable(action):
    with pytest.raises(SandboxUnavailable) as error:
        action()
    assert str(error.value) == UNAVAILABLE_MESSAGE


def test_blocking_run_mounts_only_unique_request_and_requires_named_delete(paths):
    private = paths.request_root / "private-marker.json"
    private.write_text('"synthetic-private-oracle-not-for-the-sandbox"', encoding="utf-8")
    calls = []
    staged = []

    def runner(command, *, env, timeout):
        calls.append((command, env, timeout))
        assert env == {"PATH": "/usr/local/bin:/usr/bin:/bin"}
        if command[1] == "run":
            sandbox_id = command[7]
            assert re.fullmatch(r"pyspark-[a-f0-9]{32}", sandbox_id)
            key = sandbox_id.removeprefix("pyspark-")
            request_dir = paths.request_root / key
            staged.append(request_dir)
            assert set(path.name for path in request_dir.iterdir()) == {"request.json", "submission.py"}
            assert json.loads((request_dir / "request.json").read_text()) == PAYLOAD
            assert (request_dir / "submission.py").read_text() == CODE
            assert "synthetic-private-oracle" not in (request_dir / "request.json").read_text()
            for name in ("request.json", "submission.py"):
                assert stat.S_IMODE((request_dir / name).stat().st_mode) == 0o444
            assert command == [
                str(paths.launcher), "run", "--template=pyspark-executor",
                "--mount=type=volume,src=pyspark-requests,dst=/input,"
                f"volume-subpath={key},readonly",
                "--stdin=false", "--write=false", "--workdir=/tmp", sandbox_id, "--",
                "/usr/local/bin/python", "/opt/pyspark_executor.py", "/input/request.json", "/input/submission.py",
            ]
            assert timeout == 25.0
        else:
            assert command == [str(paths.launcher), "delete", "--force", calls[0][0][7]]
            assert 0 < timeout <= 5.0
        return completed(command)

    assert CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25) == RESULT
    assert [call[0][1] for call in calls] == ["run", "delete"]
    assert all(not directory.exists() for directory in staged)
    assert set(path.name for path in paths.request_root.iterdir()) == {private.name}
    assert private.read_text() == '"synthetic-private-oracle-not-for-the-sandbox"'


def test_command_never_selects_detach_egress_rootfs_or_host_environment(paths):
    commands = []

    def runner(command, **kwargs):
        commands.append(command)
        return completed(command)

    CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25)
    for command in commands:
        assert not any(argument.startswith(("--allow-egress", "--rootfs", "--env", "--detach")) for argument in command)
        assert all("default" not in argument for argument in command)
    assert sum(argument.startswith("--mount=") for argument in commands[0]) == 1


def test_control_environment_does_not_read_parent_values(paths, monkeypatch):
    class UnreadableParent(dict):
        def forbidden(self, *args, **kwargs):
            pytest.fail("Sandbox adapter read the listener environment")

        __getitem__ = get = __iter__ = items = keys = values = copy = forbidden

    parent = UnreadableParent({
        "PYSPARK_RUNNER_TOKEN": "synthetic-private-token-no-access",
        "PATH": "synthetic-untrusted-path",
        "HTTP_PROXY": "synthetic-untrusted-proxy",
        "GOOGLE_APPLICATION_CREDENTIALS": "synthetic-private-cloud-path",
    })

    def runner(command, *, env, timeout):
        assert env == {"PATH": "/usr/local/bin:/usr/bin:/bin"}
        return completed(command)

    monkeypatch.setattr(os, "environ", parent)
    assert CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25) == RESULT


@pytest.mark.parametrize("failure", ["nonzero", "timeout", "start_failure"])
def test_failed_run_still_forces_cleanup_of_the_exact_named_sandbox(paths, failure):
    calls = []

    def runner(command, *, env, timeout):
        calls.append(command)
        if command[1] == "run":
            if failure == "timeout":
                raise subprocess.TimeoutExpired(command, timeout, stderr="synthetic-private-runtime-detail")
            if failure == "start_failure":
                raise OSError("synthetic-private-launcher-detail")
            return completed(command, status=1)
        return completed(command)

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25))
    assert [command[1] for command in calls] == ["run", "delete"]
    assert calls[1] == [str(paths.launcher), "delete", "--force", calls[0][7]]
    assert not list(paths.request_root.iterdir())


@pytest.mark.parametrize("failure", ["nonzero", "timeout", "start_failure"])
def test_successful_run_cannot_return_a_result_when_delete_fails(paths, failure):
    calls = []

    def runner(command, *, env, timeout):
        calls.append(command)
        if command[1] == "delete":
            assert 0 < timeout <= 5
            if failure == "timeout":
                raise subprocess.TimeoutExpired(command, timeout)
            if failure == "start_failure":
                raise OSError("synthetic-private-delete-detail")
            return completed(command, status=1)
        return completed(command)

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25))
    assert [command[1] for command in calls] == ["run", "delete"]
    assert not list(paths.request_root.iterdir())


@pytest.mark.parametrize("output", [
    "not JSON", "[]", "{}", '{"sandbox_id":"synthetic-detached-id","status":"running"}',
    '{"cases":[]}', '{"cases":[{},{}]}', '{"cases":[{}]}',
    '{"cases":[{"rows":{},"error":null}]}', '{"cases":[{"rows":[{}],"error":null}]}',
    '{"cases":[{"rows":[],"error":7}]}',
    '{"cases":[{"rows":[],"error":null,"passed":true}]}',
    '{"cases":[{"rows":[[NaN]],"error":null}]}',
    '{"cases":[{"rows":[[1e999]],"error":null}]}',
    '{"cases":[],"cases":[{"rows":[],"error":null}]}',
    '{"cases":[{"rows":[],"error":null}],"expected_rows":[]}',
])
def test_malformed_detached_or_private_result_cannot_be_a_correctness_result(paths, output):
    calls = []

    def runner(command, **kwargs):
        calls.append(command)
        return completed(command, output=output)

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, runner).execute(CODE, PAYLOAD, 25))
    assert [command[1] for command in calls] == ["run", "delete"]
    assert not list(paths.request_root.iterdir())


def test_case_error_is_returned_without_inventing_pass_or_expected_fields(paths):
    result = {"cases": [{"rows": [], "error": "synthetic learner exception"}]}
    executor = CloudRunSandboxExecutor(paths, lambda command, **kwargs: completed(command, output=json.dumps(result)))
    assert executor.execute(CODE, PAYLOAD, 25) == result


@pytest.mark.parametrize("private_key", ["expected_rows", "expected_output", "solution_code", "private_solution"])
def test_private_payload_fields_are_rejected_recursively_before_staging_or_launch(paths, private_key):
    payload = {"cases": [{"inputs": [{"nested": {private_key: "synthetic-private-marker"}}]}]}

    def no_command(*args, **kwargs):
        pytest.fail("A private payload reached the launcher")

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, no_command).execute(CODE, payload, 25))
    assert not list(paths.request_root.iterdir())


@pytest.mark.parametrize("timeout", [0, -1, 26, float("nan"), float("inf"), True, "25"])
def test_invalid_execution_budget_never_launches(paths, timeout):
    def no_command(*args, **kwargs):
        pytest.fail("Invalid execution budget reached the launcher")

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, no_command).execute(CODE, PAYLOAD, timeout))
    assert not list(paths.request_root.iterdir())


@pytest.mark.parametrize("invalid_root", ["missing", "relative", "file", "symlink"])
def test_missing_or_aliased_request_volume_has_no_fallback_or_parent_creation(paths, tmp_path, invalid_root):
    root = tmp_path / "other-root"
    if invalid_root == "relative":
        root = Path("relative-requests")
    elif invalid_root == "file":
        root.write_text("synthetic non-directory", encoding="utf-8")
    elif invalid_root == "symlink":
        root.symlink_to(paths.request_root, target_is_directory=True)
    selected = replace(paths, request_root=root)

    def no_command(*args, **kwargs):
        pytest.fail("Invalid request volume reached the launcher")

    assert_unavailable(lambda: CloudRunSandboxExecutor(selected, no_command).execute(CODE, PAYLOAD, 25))
    assert not list(paths.request_root.iterdir())
    if invalid_root == "missing":
        assert not root.exists()


@pytest.mark.parametrize("invalid_launcher", ["missing", "relative", "nonexecutable"])
def test_unavailable_launcher_cannot_fall_back_to_ordinary_python(paths, invalid_launcher):
    launcher = paths.launcher
    if invalid_launcher == "missing":
        launcher = launcher.parent / "missing-launcher"
    elif invalid_launcher == "relative":
        launcher = Path("relative-sandbox")
    else:
        launcher.chmod(0o600)

    def no_command(*args, **kwargs):
        pytest.fail("Unavailable launcher selected another execution path")

    assert_unavailable(lambda: CloudRunSandboxExecutor(replace(paths, launcher=launcher), no_command).execute(CODE, PAYLOAD, 25))
    assert not list(paths.request_root.iterdir())


def test_default_launcher_is_strict_without_a_test_selector(monkeypatch):
    is_file = Path.is_file

    def selected_is_file(path):
        if path == Path("/usr/local/gcp/bin/sandbox"):
            return False
        return is_file(path)

    def no_command(*args, **kwargs):
        pytest.fail("Missing default launcher fell back to another runtime")

    monkeypatch.setattr(Path, "is_file", selected_is_file)
    assert_unavailable(lambda: CloudRunSandboxExecutor(runner=no_command).execute(CODE, PAYLOAD, 25))


def test_every_execution_uses_a_different_id_and_request_subpath(paths):
    ids = []

    def runner(command, **kwargs):
        if command[1] == "run":
            ids.append(command[7])
        return completed(command)

    executor = CloudRunSandboxExecutor(paths, runner)
    executor.execute(CODE, PAYLOAD, 25)
    executor.execute(CODE, PAYLOAD, 25)
    assert len(set(ids)) == 2
    assert not list(paths.request_root.iterdir())


def test_existing_request_subpath_is_preserved_instead_of_reused_or_removed(paths, monkeypatch):
    key = "a" * 32
    existing = paths.request_root / key
    existing.mkdir()
    marker = existing / "private-marker"
    marker.write_text("synthetic preexisting request", encoding="utf-8")
    monkeypatch.setattr(pyspark_sandbox, "uuid4", lambda: SimpleNamespace(hex=key))

    def no_command(*args, **kwargs):
        pytest.fail("An existing request directory was reused")

    assert_unavailable(lambda: CloudRunSandboxExecutor(paths, no_command).execute(CODE, PAYLOAD, 25))
    assert marker.read_text() == "synthetic preexisting request"


def test_paths_and_runner_selection_are_immutable(paths):
    executor = CloudRunSandboxExecutor(paths)
    with pytest.raises(FrozenInstanceError):
        executor.paths = SandboxPaths()
    with pytest.raises(FrozenInstanceError):
        paths.request_root = Path("/tmp")


def test_listener_admits_only_one_spark_request_and_releases_afterwards(paths):
    calls = []

    def runner(command, **kwargs):
        calls.append(command)
        if command[1] == "run":
            blocked = CloudRunSandboxExecutor(paths, lambda *a, **k: pytest.fail("Concurrent launch"))
            assert_unavailable(lambda: blocked.execute(CODE, PAYLOAD, 25))
        return completed(command)

    executor = CloudRunSandboxExecutor(paths, runner)
    assert executor.execute(CODE, PAYLOAD, 25) == RESULT
    assert executor.execute(CODE, PAYLOAD, 25) == RESULT
    assert [command[1] for command in calls] == ["run", "delete", "run", "delete"]


def test_unknown_cleanup_quarantines_listener_without_retry_or_new_launch(paths):
    calls = []

    def runner(command, **kwargs):
        calls.append(command)
        return completed(command, status=1 if command[1] == "delete" else 0)

    executor = CloudRunSandboxExecutor(paths, runner)
    assert_unavailable(lambda: executor.execute(CODE, PAYLOAD, 25))
    assert pyspark_sandbox.sandbox_listener_quarantined()
    assert_unavailable(lambda: executor.execute(CODE, PAYLOAD, 25))
    assert [command[1] for command in calls] == ["run", "delete"]


def test_quarantine_is_rechecked_after_admission_acquisition(paths, monkeypatch):
    releases = []

    class RacingAdmission:
        def acquire(self, *, blocking):
            pyspark_sandbox._QUARANTINED.set()
            return True

        def release(self):
            releases.append(True)

    monkeypatch.setattr(pyspark_sandbox, "_ADMISSION", RacingAdmission())
    executor = CloudRunSandboxExecutor(paths, lambda *a, **k: pytest.fail("Launch after quarantine"))
    assert_unavailable(lambda: executor.execute(CODE, PAYLOAD, 25))
    assert releases == [True]
    assert not list(paths.request_root.iterdir())


@pytest.mark.skipif(os.name != "posix", reason="POSIX CLI pipe and process-group contract")
def test_cli_timeout_kills_its_process_group_without_claiming_sandbox_cleanup(tmp_path):
    sentinel = tmp_path / "trusted-descendant-survived"
    descendant = (
        "import time; from pathlib import Path; time.sleep(0.8); "
        f"Path({str(sentinel)!r}).write_text('unexpected')"
    )
    parent = (
        "import subprocess,sys,time; "
        f"subprocess.Popen([sys.executable,'-c',{descendant!r}]); time.sleep(10)"
    )
    with pytest.raises(subprocess.TimeoutExpired):
        pyspark_sandbox._run_cli(
            [sys.executable, "-B", "-c", parent],
            env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, timeout=0.3,
        )
    time.sleep(1)
    assert not sentinel.exists()


@pytest.mark.skipif(os.name != "posix", reason="POSIX CLI pipe contract")
@pytest.mark.parametrize("descriptor", [1, 2])
def test_cli_rejects_stdout_or_stderr_overflow_before_buffering_the_full_stream(monkeypatch, descriptor):
    monkeypatch.setattr(pyspark_sandbox, "MAX_JSON_BYTES", 4096)
    script = f"import os,time; os.write({descriptor}, b'x' * 65536); time.sleep(10)"
    started = time.monotonic()
    assert_unavailable(lambda: pyspark_sandbox._run_cli(
        [sys.executable, "-B", "-c", script],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, timeout=5,
    ))
    assert time.monotonic() - started < 3


@pytest.mark.skipif(os.name != "posix", reason="POSIX CLI pipe contract")
def test_cli_drains_both_pipes_with_independent_byte_limits(monkeypatch):
    monkeypatch.setattr(pyspark_sandbox, "MAX_JSON_BYTES", 4096)
    script = "import os; os.write(1, b'x' * 4096); os.write(2, b'y' * 4096)"
    result = pyspark_sandbox._run_cli(
        [sys.executable, "-B", "-c", script],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, timeout=5,
    )
    assert result.returncode == 0
    assert len(result.stdout.encode("utf-8")) == 4096
    assert len(result.stderr.encode("utf-8")) == 4096


@pytest.mark.skipif(os.name != "posix", reason="POSIX CLI pipe contract")
def test_cli_closed_pipes_do_not_remove_the_original_process_deadline():
    script = "import os,time; os.close(1); os.close(2); time.sleep(10)"
    with pytest.raises(subprocess.TimeoutExpired):
        pyspark_sandbox._run_cli(
            [sys.executable, "-B", "-c", script],
            env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, timeout=0.2,
        )


@pytest.mark.skipif(os.name != "posix", reason="POSIX CLI pipe contract")
def test_cli_pipe_io_failure_kills_and_reaps_the_cli(monkeypatch):
    native_popen = subprocess.Popen
    native_read = os.read
    processes = []

    def selected_popen(*args, **kwargs):
        process = native_popen(*args, **kwargs)
        processes.append(process)
        descriptors = {process.stdout.fileno(), process.stderr.fileno()}

        def failed_read(descriptor, size):
            if descriptor in descriptors:
                raise OSError("synthetic pipe failure")
            return native_read(descriptor, size)

        monkeypatch.setattr(os, "read", failed_read)
        return process

    monkeypatch.setattr(subprocess, "Popen", selected_popen)
    with pytest.raises(OSError, match="synthetic pipe failure"):
        pyspark_sandbox._run_cli(
            [sys.executable, "-B", "-c", "import os,time; os.write(1,b'ready'); time.sleep(10)"],
            env={"PATH": "/usr/local/bin:/usr/bin:/bin"}, timeout=5,
        )
    assert len(processes) == 1
    assert processes[0].poll() is not None
    assert processes[0].stdout.closed and processes[0].stderr.closed
