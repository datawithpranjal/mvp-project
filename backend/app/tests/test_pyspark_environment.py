import json
import os
from dataclasses import replace
from pathlib import Path
import stat
import subprocess
import textwrap

import pytest

from app.services import pyspark_environment
from app.services.pyspark_environment import (
    PysparkRuntimeConfigurationError,
    PysparkRuntimePaths,
    build_child_environment,
)
from app.services.pyspark_specs import PYSPARK_SPECS
from app.services.pyspark_validation_service import (
    PysparkValidationConfigurationError,
    PysparkValidationService,
)


SECRET_MARKERS = {
    "PYSPARK_RUNNER_TOKEN": "synthetic-runner-marker-no-access",
    "OPENAI_API_KEY": "synthetic-provider-marker-no-access",
    "POSTGRES_URL": "synthetic-database-marker-no-access",
    "GOOGLE_APPLICATION_CREDENTIALS": "synthetic-cloud-marker-no-access",
    "AWS_SECRET_ACCESS_KEY": "synthetic-cloud-marker-no-access",
    "UNRECOGNIZED_PRIVATE_TOKEN": "synthetic-unknown-marker-no-access",
}
OVERRIDE_MARKERS = {
    "PATH": "synthetic-untrusted-search-path",
    "HOME": "synthetic-untrusted-home",
    "PYTHONPATH": "synthetic-untrusted-import-path",
    "PYTHONHOME": "synthetic-untrusted-python-home",
    "PYTHONSTARTUP": "synthetic-untrusted-startup-path",
    "JAVA_HOME": "synthetic-untrusted-java-home",
    "JAVA_TOOL_OPTIONS": "synthetic-untrusted-java-options",
    "_JAVA_OPTIONS": "synthetic-untrusted-java-options",
    "JDK_JAVA_OPTIONS": "synthetic-untrusted-java-options",
    "SPARK_HOME": "synthetic-untrusted-spark-home",
    "SPARK_CONF_DIR": "synthetic-untrusted-spark-config",
    "SPARK_SUBMIT_OPTS": "synthetic-untrusted-spark-options",
    "PYSPARK_SUBMIT_ARGS": "synthetic-untrusted-submit-arguments",
    "PYSPARK_GATEWAY_PORT": "synthetic-untrusted-gateway-port",
    "PYSPARK_GATEWAY_SECRET": "synthetic-untrusted-gateway-secret",
    "LD_PRELOAD": "synthetic-untrusted-loader-path",
    "DYLD_INSERT_LIBRARIES": "synthetic-untrusted-loader-path",
    "HTTP_PROXY": "synthetic-untrusted-proxy",
    "HTTPS_PROXY": "synthetic-untrusted-proxy",
    "ALL_PROXY": "synthetic-untrusted-proxy",
    "NO_PROXY": "synthetic-untrusted-proxy",
}
REQUIRED_KEYS = {
    "PATH", "JAVA_HOME", "JAVA_TOOL_OPTIONS", "SPARK_HOME", "PYSPARK_PYTHON", "PYSPARK_DRIVER_PYTHON",
    "SPARK_LOCAL_HOSTNAME", "HOME", "TMPDIR", "TMP", "TEMP", "SPARK_LOCAL_DIRS",
    "PYTHONNOUSERSITE", "PYTHONDONTWRITEBYTECODE", "LANG", "LC_ALL",
}
PDF_SLUG = "pyspark-pdf-01-the-endless-final-stage"


def executable_file(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    path.chmod(0o700)
    return path


@pytest.fixture
def runtime_paths(tmp_path):
    python = executable_file(tmp_path / "python-runtime" / "bin" / "python")
    java_home = tmp_path / "java-runtime"
    executable_file(java_home / "bin" / "java")
    (java_home / "release").write_text('JAVA_VERSION="11.0.0"\n', encoding="utf-8")
    spark_home = tmp_path / "spark-runtime"
    executable_file(spark_home / "bin" / "spark-submit")
    (spark_home / "jars").mkdir()
    return PysparkRuntimePaths(python=python, java_home=java_home, spark_home=spark_home)


def dummy_settings(monkeypatch):
    from app.core.config import Settings

    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", {})
        return Settings(
            _env_file=None,
            pyspark_execution_enabled=True,
            pyspark_runner_url=None,
            pyspark_runner_token=SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"],
            pyspark_timeout_seconds=25.0,
        )


def local_service(monkeypatch, runtime):
    from app.services import pyspark_validation_service

    settings = dummy_settings(monkeypatch)
    monkeypatch.setattr(pyspark_validation_service, "get_settings", lambda: settings)
    return PysparkValidationService(runtime_paths=runtime)


def assert_runtime_environment(env, request_dir, runtime):
    assert set(env) == REQUIRED_KEYS | ({"PYTHONPATH"} if runtime.python_path else set())
    assert env["PATH"].split(os.pathsep) == list(dict.fromkeys([
        str(runtime.python.parent), str(runtime.java_home / "bin"),
        "/usr/local/bin", "/usr/bin", "/bin",
    ]))
    assert env["JAVA_HOME"] == str(runtime.java_home)
    assert env["JAVA_TOOL_OPTIONS"] == "-Djdk.net.hosts.file=" + str(request_dir / "java-hosts")
    assert stat.S_IMODE((request_dir / "java-hosts").stat().st_mode) == 0o600
    assert env["SPARK_HOME"] == str(runtime.spark_home)
    assert env["PYSPARK_PYTHON"] == str(runtime.python)
    assert env["PYSPARK_DRIVER_PYTHON"] == str(runtime.python)
    assert env["SPARK_LOCAL_HOSTNAME"] == "127.0.0.1"
    assert env["HOME"] == str(request_dir / "home")
    assert env["TMPDIR"] == env["TMP"] == env["TEMP"] == str(request_dir / "tmp")
    assert env["SPARK_LOCAL_DIRS"] == str(request_dir / "spark")
    assert env["PYTHONNOUSERSITE"] == env["PYTHONDONTWRITEBYTECODE"] == "1"
    assert env["LANG"] == env["LC_ALL"] == "C.UTF-8"
    if runtime.python_path:
        assert env["PYTHONPATH"].split(os.pathsep) == [str(path) for path in runtime.python_path]
    for name in SECRET_MARKERS:
        assert name not in env
    for name, marker in OVERRIDE_MARKERS.items():
        assert env.get(name) != marker


def test_child_environment_does_not_read_or_modify_parent_environment(monkeypatch, tmp_path, runtime_paths):
    class UnreadableParentEnvironment(dict):
        def forbidden(self, *args, **kwargs):
            pytest.fail("Child environment construction read the parent environment")

        __getitem__ = get = __iter__ = items = keys = values = copy = forbidden

    parent = UnreadableParentEnvironment({**SECRET_MARKERS, **OVERRIDE_MARKERS})
    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", parent)
        env = build_child_environment(tmp_path, runtime_paths)
    assert_runtime_environment(env, tmp_path, runtime_paths)
    assert parent == {**SECRET_MARKERS, **OVERRIDE_MARKERS}
    for directory in ("home", "tmp", "spark"):
        path = tmp_path / directory
        assert path.is_dir()
        assert stat.S_IMODE(path.stat().st_mode) == 0o700


def test_python_import_path_requires_explicit_trusted_runtime_selection(monkeypatch, tmp_path, runtime_paths):
    trusted_import_root = tmp_path / "trusted-import-root"
    trusted_import_root.mkdir()
    selected = replace(runtime_paths, python_path=(trusted_import_root,))
    parent = {**SECRET_MARKERS, **OVERRIDE_MARKERS}
    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", parent)
        env = build_child_environment(tmp_path, selected)
    assert_runtime_environment(env, tmp_path, selected)
    assert parent == {**SECRET_MARKERS, **OVERRIDE_MARKERS}


def test_child_environment_uses_private_loopback_hosts_without_dns(monkeypatch, tmp_path, runtime_paths):
    monkeypatch.setattr(pyspark_environment.socket, "gethostname", lambda: "sandbox-synthetic-123")

    def no_dns(*args, **kwargs):
        pytest.fail("Trusted hostname mapping attempted a DNS lookup")

    monkeypatch.setattr(pyspark_environment.socket, "getaddrinfo", no_dns)
    monkeypatch.setattr(pyspark_environment.socket, "gethostbyname", no_dns)
    env = build_child_environment(tmp_path, runtime_paths)
    assert_runtime_environment(env, tmp_path, runtime_paths)
    hosts_file = tmp_path / "java-hosts"
    assert hosts_file.read_text(encoding="ascii") == (
        "127.0.0.1 localhost sandbox-synthetic-123\n::1 localhost\n"
    )
    assert not hosts_file.is_symlink()


@pytest.mark.parametrize("hostname", ["sandbox injected", "sandbox\ninjected", "a" * 254, ""])
def test_invalid_hostname_cannot_become_jvm_hosts_content(monkeypatch, tmp_path, runtime_paths, hostname):
    monkeypatch.setattr(pyspark_environment.socket, "gethostname", lambda: hostname)

    def no_process(*args, **kwargs):
        pytest.fail("Invalid hostname reached process creation")

    monkeypatch.setattr(subprocess, "Popen", no_process)
    with pytest.raises(PysparkRuntimeConfigurationError):
        build_child_environment(tmp_path, runtime_paths)
    assert not (tmp_path / "java-hosts").exists()


@pytest.mark.parametrize("existing_entry", ["symlink", "file"])
def test_java_hosts_file_never_overwrites_an_existing_entry(tmp_path, runtime_paths, existing_entry):
    request_dir = tmp_path / "request"
    request_dir.mkdir()
    outside = tmp_path / "outside-hosts"
    outside.write_text("synthetic existing hosts content", encoding="ascii")
    hosts_file = request_dir / "java-hosts"
    if existing_entry == "symlink":
        hosts_file.symlink_to(outside)
    else:
        hosts_file.write_text("synthetic request hosts content", encoding="ascii")

    with pytest.raises(PysparkRuntimeConfigurationError):
        build_child_environment(request_dir, runtime_paths)
    assert outside.read_text(encoding="ascii") == "synthetic existing hosts content"
    if existing_entry == "symlink":
        assert hosts_file.is_symlink()
    else:
        assert hosts_file.read_text(encoding="ascii") == "synthetic request hosts content"


@pytest.mark.parametrize("invalid_field", [
    "relative_python", "missing_python", "nonexecutable_python", "relative_java_home",
    "missing_java", "missing_java_release", "relative_spark_home", "missing_spark_submit",
    "missing_spark_jars", "relative_import_path", "missing_import_path",
])
def test_incomplete_or_untrusted_runtime_paths_fail_closed(tmp_path, runtime_paths, invalid_field):
    if invalid_field == "relative_python":
        runtime = replace(runtime_paths, python=Path("relative-python"))
    elif invalid_field == "missing_python":
        runtime = replace(runtime_paths, python=tmp_path / "missing-python")
    elif invalid_field == "nonexecutable_python":
        runtime_paths.python.chmod(0o600)
        runtime = runtime_paths
    elif invalid_field == "relative_java_home":
        runtime = replace(runtime_paths, java_home=Path("relative-java"))
    elif invalid_field == "missing_java":
        (runtime_paths.java_home / "bin" / "java").unlink()
        runtime = runtime_paths
    elif invalid_field == "missing_java_release":
        (runtime_paths.java_home / "release").unlink()
        runtime = runtime_paths
    elif invalid_field == "relative_spark_home":
        runtime = replace(runtime_paths, spark_home=Path("relative-spark"))
    elif invalid_field == "missing_spark_submit":
        (runtime_paths.spark_home / "bin" / "spark-submit").unlink()
        runtime = runtime_paths
    elif invalid_field == "missing_spark_jars":
        (runtime_paths.spark_home / "jars").rmdir()
        runtime = runtime_paths
    elif invalid_field == "relative_import_path":
        runtime = replace(runtime_paths, python_path=(Path("relative-import-root"),))
    else:
        runtime = replace(runtime_paths, python_path=(tmp_path / "missing-import-root",))

    request_dir = tmp_path / "request"
    request_dir.mkdir()
    with pytest.raises(PysparkRuntimeConfigurationError):
        build_child_environment(request_dir, runtime)


@pytest.mark.parametrize("invalid_request", [
    "relative", "missing", "file", "symlink", "home_symlink", "option_space", "option_quote",
])
def test_invalid_request_directory_cannot_select_external_runtime_storage(tmp_path, runtime_paths, invalid_request):
    request_dir = tmp_path / "request"
    if invalid_request == "relative":
        request_dir = Path("relative-request")
    elif invalid_request == "file":
        request_dir.write_text("synthetic non-directory", encoding="utf-8")
    elif invalid_request == "symlink":
        target = tmp_path / "outside-request"
        target.mkdir()
        request_dir.symlink_to(target, target_is_directory=True)
    elif invalid_request == "home_symlink":
        request_dir.mkdir()
        target = tmp_path / "outside-home"
        target.mkdir(mode=0o755)
        target.chmod(0o755)
        (request_dir / "home").symlink_to(target, target_is_directory=True)
    elif invalid_request == "option_space":
        request_dir = tmp_path / "request -Dsynthetic=true"
        request_dir.mkdir()
    elif invalid_request == "option_quote":
        request_dir = tmp_path / "request'option"
        request_dir.mkdir()

    with pytest.raises(PysparkRuntimeConfigurationError):
        build_child_environment(request_dir, runtime_paths)
    if invalid_request == "home_symlink":
        assert stat.S_IMODE(target.stat().st_mode) == 0o755
    if invalid_request in {"option_space", "option_quote"}:
        assert not (request_dir / "java-hosts").exists()


def test_missing_runtime_discovery_fails_before_any_worker_process(monkeypatch, tmp_path):
    def unavailable_runtime():
        raise PysparkRuntimeConfigurationError("synthetic missing runtime")

    monkeypatch.setattr(pyspark_environment, "discover_runtime_paths", unavailable_runtime)
    with pytest.raises(PysparkRuntimeConfigurationError):
        build_child_environment(tmp_path)

    service = local_service(monkeypatch, None)

    def no_process(*args, **kwargs):
        pytest.fail("Missing local runtime reached a worker process")

    monkeypatch.setattr(service, "_run_worker", no_process)
    spec = PYSPARK_SPECS[PDF_SLUG]
    with pytest.raises(PysparkValidationConfigurationError) as error:
        service._run_local(spec, "result_df = incident_signals", list(spec.sample_cases))
    assert "synthetic missing runtime" not in str(error.value)


def test_local_execution_passes_only_sanitized_environment_and_keeps_parent_token(monkeypatch, tmp_path, runtime_paths):
    service = local_service(monkeypatch, runtime_paths)
    parent = {**SECRET_MARKERS, **OVERRIDE_MARKERS, "TMPDIR": str(tmp_path)}
    before = dict(parent)
    captured = {}

    def capture_worker(command, *, cwd, env, timeout):
        captured.update({"command": command, "cwd": cwd, "env": env, "timeout": timeout})
        assert_runtime_environment(env, Path(cwd), runtime_paths)
        assert service.settings.pyspark_runner_token == SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"]
        return subprocess.CompletedProcess(command, 0, json.dumps({"tests": [{
            "name": "synthetic environment boundary", "passed": True, "message": "Boundary captured."
        }]}), "")

    monkeypatch.setattr(service, "_run_worker", capture_worker)
    spec = PYSPARK_SPECS[PDF_SLUG]
    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", parent)
        results = service._run_local(spec, "result_df = incident_signals", list(spec.sample_cases))
    assert results[0].passed is True
    assert captured["command"][0] == str(runtime_paths.python)
    assert captured["timeout"] == 25.0
    assert parent == before
    assert service.settings.pyspark_runner_token == SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"]


def test_remote_validation_does_not_require_a_local_spark_runtime(monkeypatch):
    def unavailable_runtime():
        pytest.fail("Remote validation tried to discover a local Spark runtime")

    monkeypatch.setattr(pyspark_environment, "discover_runtime_paths", unavailable_runtime)
    service = local_service(monkeypatch, None)
    service.settings = service.settings.model_copy(update={"pyspark_runner_url": "https://synthetic-worker.example"})
    sentinel = object()
    monkeypatch.setattr(service, "_validate_remote", lambda **kwargs: sentinel)
    assert service.validate(PDF_SLUG, "result_df = incident_signals", "sample") is sentinel


def test_worker_authentication_keeps_parent_token_out_of_execution(monkeypatch, runtime_paths):
    from fastapi.testclient import TestClient
    from app import pyspark_worker

    service = local_service(monkeypatch, runtime_paths)
    monkeypatch.setattr(pyspark_worker, "service", service)
    captured = []

    def capture_worker(command, *, cwd, env, timeout):
        captured.append(env)
        assert SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"] not in env.values()
        return subprocess.CompletedProcess(command, 0, json.dumps({"tests": [{
            "name": "synthetic authenticated boundary", "passed": True, "message": "Boundary captured."
        }]}), "")

    monkeypatch.setattr(service, "_run_worker", capture_worker)
    client = TestClient(pyspark_worker.app)
    path = f"/api/v1/pyspark/validate/{PDF_SLUG}"
    body = {"code": "result_df = incident_signals", "mode": "sample"}
    parent = {**SECRET_MARKERS, **OVERRIDE_MARKERS}
    before = dict(parent)
    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", parent)
        assert client.post(path, json=body).status_code == 401
        assert client.post(path, headers={"X-Runner-Token": "wrong-dummy-token"}, json=body).status_code == 401
        assert not captured
        response = client.post(path, headers={"X-Runner-Token": SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"]}, json=body)
    assert response.status_code == 200
    assert len(captured) == 1
    assert service.settings.pyspark_runner_token == SECRET_MARKERS["PYSPARK_RUNNER_TOKEN"]
    assert parent == before


@pytest.mark.skipif(os.environ.get("RUN_SPARK_TESTS") != "1", reason="requires Java and optional Spark dependencies")
def test_trusted_python_and_spark_jvm_receive_no_application_sentinels(monkeypatch, tmp_path):
    runtime = pyspark_environment.discover_runtime_paths()
    probe_path = tmp_path / "trusted_runtime_probe.py"
    probe_path.write_text(textwrap.dedent(f'''\
        import json
        import os
        from pyspark.sql import SparkSession

        sentinel_keys = {tuple(SECRET_MARKERS)!r}
        override_markers = {OVERRIDE_MARKERS!r}
        checks = {{"python_sentinels_absent": all(key not in os.environ for key in sentinel_keys)}}
        checks["python_override_markers_absent"] = all(
            os.environ.get(key) != marker for key, marker in override_markers.items()
        )
        spark = (SparkSession.builder.master("local[1]")
            .appName("data-foundry-trusted-environment-check")
            .config("spark.ui.enabled", "false")
            .config("spark.sql.shuffle.partitions", "1")
            .getOrCreate())
        try:
            checks["jvm_sentinels_absent"] = all(
                spark.sparkContext._jvm.java.lang.System.getenv(key) is None
                for key in sentinel_keys
            )
            checks["jvm_override_markers_absent"] = all(
                spark.sparkContext._jvm.java.lang.System.getenv(key) != marker
                for key, marker in override_markers.items()
            )
            checks["spark35_runtime"] = spark.version.startswith("3.5.")
            checks["spark_action_completed"] = spark.range(2).count() == 2
        finally:
            spark.stop()
        print(json.dumps(checks))
        '''), encoding="utf-8")
    parent = {**SECRET_MARKERS, **OVERRIDE_MARKERS}
    before = dict(parent)
    with monkeypatch.context() as isolated:
        isolated.setattr(os, "environ", parent)
        env = build_child_environment(tmp_path, runtime)
        completed = PysparkValidationService._run_worker(
            [str(runtime.python), str(probe_path)],
            cwd=str(tmp_path), env=env, timeout=25.0,
        )
    assert completed.returncode == 0, "Trusted synthetic runtime probe failed"
    assert json.loads(completed.stdout) == {
        "python_sentinels_absent": True,
        "jvm_sentinels_absent": True,
        "python_override_markers_absent": True,
        "jvm_override_markers_absent": True,
        "spark35_runtime": True,
        "spark_action_completed": True,
    }
    assert parent == before
