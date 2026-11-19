"""Strict Cloud Run sandbox lifecycle adapter; provider isolation needs runtime proof."""

from dataclasses import dataclass, field
import json
import math
import os
from pathlib import Path
import selectors
import shutil
import signal
import subprocess
import time
import threading
from typing import Callable
from uuid import uuid4


UNAVAILABLE_MESSAGE = "The PySpark sandbox is unavailable. No correctness result was produced."
MAX_EXECUTION_SECONDS = 25.0
CLEANUP_SECONDS = 5.0
REAP_SECONDS = 0.5
MAX_JSON_BYTES = 1_048_576
PRIVATE_PAYLOAD_KEYS = frozenset({"expected_rows", "expected_output", "solution_code", "private_solution"})
_ADMISSION = threading.BoundedSemaphore(1)
_QUARANTINED = threading.Event()


def sandbox_listener_quarantined() -> bool:
    return _QUARANTINED.is_set()


class SandboxUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class SandboxPaths:
    launcher: Path = Path("/usr/local/gcp/bin/sandbox")
    request_root: Path = Path("/mnt/pyspark-requests")


def _control_environment() -> dict[str, str]:
    return {"PATH": "/usr/local/bin:/usr/bin:/bin"}


def _run_cli(command: list[str], *, env: dict[str, str], timeout: float) -> subprocess.CompletedProcess[str]:
    """Bound both output pipes and deadline; named sandbox deletion belongs to the caller."""
    if os.name != "posix":
        raise SandboxUnavailable(UNAVAILABLE_MESSAGE)
    deadline = time.monotonic() + timeout
    process = subprocess.Popen(
        command, cwd="/", env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
    )
    try:
        buffers = {"stdout": bytearray(), "stderr": bytearray()}
        with selectors.DefaultSelector() as selector:
            for name in buffers:
                stream = getattr(process, name)
                if stream is None:
                    raise SandboxUnavailable(UNAVAILABLE_MESSAGE)
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, name)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(command, timeout)
                for key, _ in selector.select(remaining):
                    buffer = buffers[key.data]
                    try:
                        chunk = os.read(key.fd, min(65_536, MAX_JSON_BYTES - len(buffer) + 1))
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fileobj)
                    elif len(buffer) + len(chunk) > MAX_JSON_BYTES:
                        raise SandboxUnavailable(UNAVAILABLE_MESSAGE)
                    else:
                        buffer.extend(chunk)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(command, timeout)
        process.wait(timeout=remaining)
        return subprocess.CompletedProcess(
            command, process.returncode,
            buffers["stdout"].decode("utf-8"), buffers["stderr"].decode("utf-8"),
        )
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=REAP_SECONDS)
        raise
    finally:
        # Closing inherited pipe handles does not wait for an escaped descendant.
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()


CommandRunner = Callable[..., subprocess.CompletedProcess[str]]


def _reject_private_fields(value: object) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str) or key in PRIVATE_PAYLOAD_KEYS:
                raise ValueError("Invalid sandbox payload")
            _reject_private_fields(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _reject_private_fields(child)


def _unique_json_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def _invalid_json_constant(value: str) -> None:
    raise ValueError("Invalid JSON number")


def _finite_json_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("Invalid JSON number")
    return result


def _decode_result(stdout: str, case_count: int) -> dict:
    if not isinstance(stdout, str) or len(stdout.encode("utf-8")) > MAX_JSON_BYTES:
        raise ValueError("Invalid sandbox output")
    result = json.loads(
        stdout, object_pairs_hook=_unique_json_object, parse_constant=_invalid_json_constant,
        parse_float=_finite_json_float,
    )
    if not isinstance(result, dict) or set(result) != {"cases"}:
        raise ValueError("Invalid sandbox output")
    cases = result["cases"]
    if not isinstance(cases, list) or len(cases) != case_count:
        raise ValueError("Invalid sandbox output")
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"rows", "error"}:
            raise ValueError("Invalid sandbox output")
        if not isinstance(case["rows"], list) or any(not isinstance(row, list) for row in case["rows"]):
            raise ValueError("Invalid sandbox output")
        if case["error"] is not None and not isinstance(case["error"], str):
            raise ValueError("Invalid sandbox output")
    return result


@dataclass(frozen=True)
class CloudRunSandboxExecutor:
    paths: SandboxPaths = field(default_factory=SandboxPaths)
    runner: CommandRunner = field(default=_run_cli, repr=False)

    def execute(self, code: str, payload: dict, timeout: float) -> dict:
        # One listener process per instance; do not turn concurrency80 into80 Spark JVMs.
        if _QUARANTINED.is_set() or not _ADMISSION.acquire(blocking=False):
            raise SandboxUnavailable(UNAVAILABLE_MESSAGE)
        if _QUARANTINED.is_set():
            _ADMISSION.release()
            raise SandboxUnavailable(UNAVAILABLE_MESSAGE)
        request_dir = None
        run_result = None
        run_failed = False
        cleanup_failed = False
        try:
            if (
                not isinstance(code, str) or not isinstance(payload, dict)
                or isinstance(timeout, bool) or not isinstance(timeout, (int, float))
                or not math.isfinite(timeout) or not 0 < timeout <= MAX_EXECUTION_SECONDS
            ):
                raise ValueError("Invalid sandbox request")
            cases = payload.get("cases")
            if not isinstance(cases, list) or not cases:
                raise ValueError("Invalid sandbox request")
            _reject_private_fields(payload)
            request_json = json.dumps(payload, allow_nan=False, ensure_ascii=False, separators=(",", ":"))
            if len(request_json.encode("utf-8")) > MAX_JSON_BYTES or len(code.encode("utf-8")) > MAX_JSON_BYTES:
                raise ValueError("Invalid sandbox request")

            launcher = self.paths.launcher
            root = self.paths.request_root
            if not launcher.is_absolute() or not launcher.is_file() or not os.access(launcher, os.X_OK):
                raise ValueError("Unavailable sandbox launcher")
            if not root.is_absolute() or not root.is_dir() or root.resolve(strict=True) != root:
                raise ValueError("Unavailable sandbox request volume")

            request_key = uuid4().hex
            sandbox_id = f"pyspark-{request_key}"
            selected_dir = root / request_key
            selected_dir.mkdir(mode=0o755)
            request_dir = selected_dir
            request_dir.chmod(0o755)
            for name, contents in (("request.json", request_json), ("submission.py", code)):
                path = request_dir / name
                with path.open("x", encoding="utf-8") as handle:
                    handle.write(contents)
                path.chmod(0o444)

            mount = (
                "type=volume,src=pyspark-requests,dst=/input,"
                f"volume-subpath={request_key},readonly"
            )
            command = [
                str(launcher), "run", "--template=pyspark-executor", f"--mount={mount}",
                "--stdin=false", "--write=false", "--workdir=/tmp", sandbox_id, "--",
                "/usr/local/bin/python", "/opt/pyspark_executor.py", "/input/request.json", "/input/submission.py",
            ]
            deadline = time.monotonic() + float(timeout) + CLEANUP_SECONDS
            try:
                run_result = self.runner(command, env=_control_environment(), timeout=float(timeout))
            except Exception:
                # A failed or timed-out run may still have created the named sandbox.
                run_failed = True
            finally:
                # Reserve the CLI reap bound inside the five-second cleanup budget.
                cleanup_timeout = max(0.001, min(CLEANUP_SECONDS - REAP_SECONDS, deadline - time.monotonic() - REAP_SECONDS))
                try:
                    deleted = self.runner(
                        [str(launcher), "delete", "--force", sandbox_id],
                        env=_control_environment(), timeout=cleanup_timeout,
                    )
                    cleanup_failed = deleted.returncode != 0
                except Exception:
                    cleanup_failed = True

            if run_failed or cleanup_failed or run_result is None or run_result.returncode != 0:
                raise ValueError("Sandbox execution or cleanup failed")
            return _decode_result(run_result.stdout, len(cases))
        except Exception:
            raise SandboxUnavailable(UNAVAILABLE_MESSAGE) from None
        finally:
            if cleanup_failed:
                # Unknown provider cleanup must not permit accumulating orphan workloads.
                _QUARANTINED.set()
            try:
                if request_dir is not None:
                    shutil.rmtree(request_dir)
            except OSError:
                _QUARANTINED.set()
                raise SandboxUnavailable(UNAVAILABLE_MESSAGE) from None
            finally:
                _ADMISSION.release()
