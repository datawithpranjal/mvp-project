import os
from pathlib import Path
import sys

import pytest

os.environ["ENVIRONMENT"] = "test"
os.environ["AUTH_ALLOW_DEMO_OTP"] = "true"
os.environ["AUTH_SHOW_DEBUG_OTP"] = "true"
os.environ["POSTGRES_URL"] = (
    "postgresql://postgres:postgres@postgres:5432/scenario_playground"
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def pytest_addoption(parser):
    parser.addoption(
        "--pyspark-test-java-home",
        help="Explicit trusted Java home for local Spark tests; never selected from the environment.",
    )
    parser.addoption(
        "--pyspark-test-import-root",
        action="append",
        default=[],
        help="Explicit trusted Python import root for local Spark tests; repeatable.",
    )


@pytest.fixture(autouse=True)
def explicit_pyspark_test_runtime(request, monkeypatch):
    java_home = request.config.getoption("--pyspark-test-java-home")
    if java_home is None:
        return

    from importlib.util import find_spec

    from app.services import pyspark_environment

    spark_spec = find_spec("pyspark")
    if spark_spec is None or spark_spec.origin is None:
        pytest.fail("The explicit Spark test runtime requires an installed PySpark package.")
    runtime = pyspark_environment.PysparkRuntimePaths(
        python=Path(sys.executable),
        java_home=Path(java_home),
        spark_home=Path(spark_spec.origin).resolve().parent,
        python_path=tuple(
            Path(root) for root in request.config.getoption("--pyspark-test-import-root")
        ),
    )
    monkeypatch.setattr(pyspark_environment, "discover_runtime_paths", lambda: runtime)
