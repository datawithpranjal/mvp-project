"""Minimal learner-process environment. This is not an execution sandbox."""

from dataclasses import dataclass
from importlib.util import find_spec
import os
from pathlib import Path
import re
import socket
import sys


class PysparkRuntimeConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class PysparkRuntimePaths:
    python: Path
    java_home: Path
    spark_home: Path
    python_path: tuple[Path, ...] = ()


def discover_runtime_paths() -> PysparkRuntimePaths:
    """Resolve installed dependencies without consulting runtime environment overrides."""
    try:
        spec = find_spec("pyspark")
        if spec is None or spec.origin is None:
            raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.")
        return PysparkRuntimePaths(
            # Preserve a virtual environment's invocation path rather than its base binary.
            python=Path(sys.executable),
            java_home=Path("/usr/bin/java").resolve(strict=True).parent.parent,
            spark_home=Path(spec.origin).resolve(strict=True).parent,
        )
    except (ImportError, OSError, ValueError) as exc:
        raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.") from exc


def _require_file(path: Path, *, executable: bool = False) -> None:
    if not path.is_absolute() or not path.is_file() or (executable and not os.access(path, os.X_OK)):
        raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.")


def build_child_environment(
    request_dir: Path, runtime: PysparkRuntimePaths | None = None,
) -> dict[str, str]:
    """Build a fresh environment; never copy values from the listener's environment."""
    runtime = runtime if runtime is not None else discover_runtime_paths()
    try:
        _require_file(runtime.python, executable=True)
        _require_file(runtime.java_home / "bin" / "java", executable=True)
        _require_file(runtime.java_home / "release")
        _require_file(runtime.spark_home / "bin" / "spark-submit", executable=True)
        if not (runtime.spark_home / "jars").is_dir():
            raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.")
        for import_root in runtime.python_path:
            if not import_root.is_absolute() or not (import_root.is_file() or import_root.is_dir()):
                raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.")
        if not request_dir.is_absolute() or not request_dir.is_dir() or request_dir.is_symlink() \
                or re.fullmatch(r"/[A-Za-z0-9_./-]+", str(request_dir)) is None:
            raise PysparkRuntimeConfigurationError("The PySpark request directory is unavailable.")

        hostname = socket.gethostname()
        if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?", hostname) is None:
            raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.")

        paths = {name: request_dir / name for name in ("home", "tmp", "spark")}
        for directory in paths.values():
            if directory.is_symlink():
                raise PysparkRuntimeConfigurationError("The PySpark request directory is unavailable.")
            directory.mkdir(mode=0o700, exist_ok=True)
            directory.chmod(0o700)

        hosts_file = request_dir / "java-hosts"
        descriptor = os.open(hosts_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="ascii") as hosts:
            hosts.write(f"127.0.0.1 localhost {hostname}\n::1 localhost\n")
    except OSError as exc:
        raise PysparkRuntimeConfigurationError("The selected PySpark runtime is unavailable.") from exc

    env = {
        "PATH": os.pathsep.join(dict.fromkeys((
            str(runtime.python.parent), str(runtime.java_home / "bin"),
            "/usr/local/bin", "/usr/bin", "/bin",
        ))),
        "JAVA_HOME": str(runtime.java_home),
        "JAVA_TOOL_OPTIONS": (
            "-Djdk.net.hosts.file=" + str(hosts_file)
            + " -XX:ActiveProcessorCount=1 -XX:TieredStopAtLevel=1"
        ),
        "SPARK_HOME": str(runtime.spark_home),
        "PYSPARK_PYTHON": str(runtime.python),
        "PYSPARK_DRIVER_PYTHON": str(runtime.python),
        "SPARK_LOCAL_HOSTNAME": "127.0.0.1",
        "HOME": str(paths["home"]),
        "TMPDIR": str(paths["tmp"]),
        "TMP": str(paths["tmp"]),
        "TEMP": str(paths["tmp"]),
        "SPARK_LOCAL_DIRS": str(paths["spark"]),
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }
    if runtime.python_path:
        env["PYTHONPATH"] = os.pathsep.join(str(path) for path in runtime.python_path)
    return env
