"""Unit/protocol evidence only; real PostgreSQL invariants are in the integration module."""

from copy import deepcopy
import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient
import psycopg
import pytest

from app.api.routes import usage as usage_route
from app.core.config import DEFAULT_POSTGRES_URL
from app.main import app
from app.schemas.usage import AnonymousUsageEventRequest, UsageEventRequest
from app.services.usage_store import UsageStore, UsageStoreError

TEST_DSN = "postgresql://synthetic:never-log-this@127.0.0.1/tdf_usage_test_unit"
USER = {"id": "synthetic-account", "email": "synthetic@example.test", "full_name": "Synthetic"}


def catalog():
    return {
        "table": ("r", True),
        "columns": [
            ("id", "bigint", True, "nextval('public.user_usage_events_id_seq'::regclass)", "", "", True),
            ("user_id", "text", True, None, "", "", True),
            ("email", "text", True, None, "", "", True),
            ("full_name", "text", True, None, "", "", True),
            ("event_name", "text", True, None, "", "", True),
            ("session_id", "text", False, None, "", "", True),
            ("page_url", "text", False, None, "", "", True),
            ("active_seconds", "integer", True, "0", "", "", True),
            ("metadata", "jsonb", True, "'{}'::jsonb", "", "", True),
            ("created_at", "timestamp with time zone", True, "now()", "", "", True),
        ],
        "sequence": "public.user_usage_events_id_seq",
        "constraints": [
            ("user_usage_events_pkey", "p", "PRIMARY KEY (id)", True),
            ("user_usage_active_seconds_range", "c", "CHECK (((active_seconds >= 0) AND (active_seconds <= 300)))", True),
        ],
        "indexes": [
            ("user_usage_events_pkey", "CREATE UNIQUE INDEX user_usage_events_pkey ON public.user_usage_events USING btree (id)", True, True),
            ("idx_user_usage_events_user_created", "CREATE INDEX idx_user_usage_events_user_created ON public.user_usage_events USING btree (user_id, created_at DESC)", True, True),
            ("idx_user_usage_events_event_created", "CREATE INDEX idx_user_usage_events_event_created ON public.user_usage_events USING btree (event_name, created_at DESC)", True, True),
            ("idx_user_usage_events_page_created", "CREATE INDEX idx_user_usage_events_page_created ON public.user_usage_events USING btree (page_url, created_at DESC)", True, True),
        ],
    }


class DatabaseDouble:
    def __init__(self, *, exists=True, locked=False, fail_on=None):
        self.exists, self.locked, self.fail_on = exists, locked, fail_on
        self.metadata = catalog()
        self.calls, self.connections = [], []

    def connect(self, *args, **kwargs):
        connection = ConnectionDouble(self)
        self.connections.append(connection)
        return connection


class ConnectionDouble:
    def __init__(self, database):
        self.database = database
        self.committed = self.rolled_back = self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, kind, error, traceback):
        self.rolled_back = kind is not None
        self.closed = True

    def commit(self):
        if self.database.fail_on == "COMMIT":
            raise RuntimeError("synthetic server detail must not leak")
        self.committed = True

    def cursor(self):
        return CursorDouble(self.database)


class CursorDouble:
    def __init__(self, database):
        self.database = database
        self.sql = ""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, sql, params=None):
        self.sql = " ".join(sql.split())
        self.database.calls.append((self.sql, params))
        if self.database.fail_on and self.database.fail_on in self.sql:
            raise RuntimeError("synthetic server detail must not leak")

    def fetchone(self):
        if "pg_try_advisory" in self.sql:
            return (not self.database.locked,)
        if "to_regclass" in self.sql:
            return ("user_usage_events" if self.database.exists else None,)
        if "pg_get_serial_sequence" in self.sql:
            return (self.database.metadata["sequence"],)
        if "SELECT relkind" in self.sql:
            return self.database.metadata["table"]
        raise AssertionError("Unexpected metadata read")

    def fetchall(self):
        for source, key in [("pg_attribute", "columns"), ("pg_constraint", "constraints"), ("pg_index", "indexes")]:
            if source in self.sql:
                return self.database.metadata[key]
        raise AssertionError("Unexpected metadata list")


def ddl_calls(database):
    return [sql for sql, _ in database.calls if sql.startswith(("CREATE ", "ALTER ", "DROP "))]


def test_cold_writers_insert_only_and_preserve_parameterized_payload(monkeypatch, tmp_path):
    database = DatabaseDouble()
    monkeypatch.setattr(psycopg, "connect", database.connect)
    for _ in range(3):
        before = (len(database.calls), len(database.connections))
        store = UsageStore(postgres_url=TEST_DSN, storage_path=tmp_path / "not-a-fallback")
        assert (len(database.calls), len(database.connections)) == before
        response = store.record_event(USER, UsageEventRequest(
            event_name="session_heartbeat", session_id="session'; DROP TABLE x; --", active_seconds=300,
            page_url="/labs/sql", metadata={"source": "synthetic"},
        ))
        assert response.recorded is True
    assert len(database.calls) == 3
    for sql, params in database.calls:
        assert sql.startswith("INSERT INTO public.user_usage_events")
        assert "session';" not in sql
        assert params[4] == "session'; DROP TABLE x; --"
        assert params[6] == 300
    assert not ddl_calls(database)
    assert all(c.committed and c.closed and not c.rolled_back for c in database.connections)
    assert not (tmp_path / "not-a-fallback").exists()


def test_anonymous_and_server_login_use_same_insert_only_path(monkeypatch):
    database = DatabaseDouble()
    monkeypatch.setattr(psycopg, "connect", database.connect)
    store = UsageStore(postgres_url=TEST_DSN)
    store.record_anonymous_event(AnonymousUsageEventRequest(
        event_name="page_view", visitor_id="synthetic-visitor", session_id="synthetic-session",
    ))
    store.record_login(USER)
    assert [params[3] for _, params in database.calls] == ["page_view", "login_success"]
    assert database.calls[0][1][0] == "visitor:synthetic-visitor"
    assert not ddl_calls(database)


@pytest.mark.parametrize("fail_on", ["INSERT INTO", "COMMIT"])
@pytest.mark.parametrize("signed_in", [False, True])
def test_database_failure_returns_503_rolls_back_closes_and_never_falls_back(monkeypatch, tmp_path, fail_on, signed_in):
    database = DatabaseDouble(fail_on=fail_on)
    monkeypatch.setattr(psycopg, "connect", database.connect)
    path = tmp_path / "must-not-exist.jsonl"
    monkeypatch.setattr(usage_route, "usage_store", UsageStore(postgres_url=TEST_DSN, storage_path=path))
    monkeypatch.setattr(usage_route.auth_service, "get_profile", lambda token: USER)
    body = {"event_name": "page_view", "session_id": "synthetic"}
    if not signed_in:
        body["visitor_id"] = "synthetic"
    response = TestClient(app).post(
        "/api/v1/usage/events" if signed_in else "/api/v1/usage/anonymous-events", json=body,
        headers={"Authorization": "Bearer synthetic"} if signed_in else {},
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "Usage event could not be saved right now."}
    assert all(c.closed and c.rolled_back and not c.committed for c in database.connections)
    assert not path.exists()
    assert not ddl_calls(database)


@pytest.mark.parametrize("url", ["", "  ", DEFAULT_POSTGRES_URL, f" {DEFAULT_POSTGRES_URL} "])
def test_provision_refuses_unconfigured_storage_without_connecting(monkeypatch, url):
    monkeypatch.setattr(psycopg, "connect", lambda *a, **k: pytest.fail("must not connect"))
    with pytest.raises(UsageStoreError, match="requires configured PostgreSQL"):
        UsageStore(postgres_url=url).provision_postgres()


@pytest.mark.parametrize("check_only", [False, True])
def test_existing_schema_is_verified_without_any_ddl(monkeypatch, check_only):
    database = DatabaseDouble()
    monkeypatch.setattr(psycopg, "connect", database.connect)
    before = deepcopy(database.metadata)
    assert UsageStore(postgres_url=TEST_DSN).provision_postgres(check_only=check_only) is False
    assert database.metadata == before and not ddl_calls(database)
    assert database.connections[0].committed and database.connections[0].closed
    sql = [q for q, _ in database.calls]
    assert "SET LOCAL lock_timeout = '5s'" in sql
    assert "SET LOCAL statement_timeout = '30s'" in sql
    assert ("SET TRANSACTION READ ONLY" in sql) is check_only


def test_fresh_provision_protocol_contains_original_schema_and_rls_before_commit(monkeypatch):
    database = DatabaseDouble(exists=False)
    monkeypatch.setattr(psycopg, "connect", database.connect)
    assert UsageStore(postgres_url=TEST_DSN).provision_postgres() is True
    ddl = ddl_calls(database)
    assert len(ddl) == 5
    assert ddl[0].startswith("CREATE TABLE public.user_usage_events")
    assert "CHECK (active_seconds BETWEEN 0 AND 300)" in ddl[0]
    assert ddl[-1] == "ALTER TABLE public.user_usage_events ENABLE ROW LEVEL SECURITY"
    assert all("IF NOT EXISTS" not in q for q in ddl)
    assert database.connections[0].committed


@pytest.mark.parametrize("missing,locked,fail_on", [(True, False, None), (False, True, None), (False, False, "LOCK TABLE")])
def test_missing_readiness_busy_provisioner_and_missing_authority_fail_safely(monkeypatch, missing, locked, fail_on):
    database = DatabaseDouble(exists=not missing, locked=locked, fail_on=fail_on)
    monkeypatch.setattr(psycopg, "connect", database.connect)
    with pytest.raises(UsageStoreError):
        UsageStore(postgres_url=TEST_DSN).provision_postgres(check_only=missing)
    assert not ddl_calls(database)
    assert database.connections[0].rolled_back and database.connections[0].closed
    assert not database.connections[0].committed


@pytest.mark.parametrize("mismatch", ["rls", "kind", "column", "default", "sequence", "constraint", "missing_index", "index_order", "invalid_index", "extra_column"])
def test_schema_mismatch_is_not_silently_repaired(monkeypatch, mismatch):
    database = DatabaseDouble()
    m = database.metadata
    if mismatch == "rls": m["table"] = ("r", False)
    elif mismatch == "kind": m["table"] = ("v", True)
    elif mismatch == "sequence": m["sequence"] = "public.some_other_sequence"
    elif mismatch == "constraint": m["constraints"][1] = ("user_usage_active_seconds_range", "c", "CHECK (active_seconds >= 0)", True)
    elif mismatch == "missing_index": m["indexes"].pop()
    elif mismatch == "index_order": m["indexes"][1] = (m["indexes"][1][0], m["indexes"][1][1].replace(" DESC", ""), True, True)
    elif mismatch == "invalid_index": m["indexes"][1] = (*m["indexes"][1][:2], False, True)
    elif mismatch == "extra_column": m["columns"].append(("extra", "text", False, None, "", "", True))
    else:
        row = list(m["columns"][7]); row[1 if mismatch == "column" else 3] = "bigint" if mismatch == "column" else "1"
        m["columns"][7] = tuple(row)
    monkeypatch.setattr(psycopg, "connect", database.connect)
    with pytest.raises(UsageStoreError, match="mismatch"):
        UsageStore(postgres_url=TEST_DSN).provision_postgres()
    assert not ddl_calls(database)
    assert database.connections[0].rolled_back and not database.connections[0].committed


@pytest.mark.parametrize("fail_on", ["CREATE INDEX", "COMMIT"])
def test_provision_error_does_not_report_success_or_expose_server_details(monkeypatch, fail_on):
    database = DatabaseDouble(exists=False, fail_on=fail_on)
    monkeypatch.setattr(psycopg, "connect", database.connect)
    with pytest.raises(UsageStoreError) as error:
        UsageStore(postgres_url=TEST_DSN).provision_postgres()
    assert str(error.value) == "Usage provisioning failed; verify schema before retrying."
    assert database.connections[0].rolled_back and database.connections[0].closed


def test_operator_cli_requires_explicit_mode_and_redacts_errors(monkeypatch, capsys):
    path = Path(__file__).resolve().parents[2] / "scripts" / "provision_usage_store.py"
    spec = importlib.util.spec_from_file_location("usage_provision_cli_test", path)
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    monkeypatch.setattr(psycopg, "connect", lambda *a, **k: pytest.fail("must not connect without a mode"))
    with pytest.raises(SystemExit) as error:
        cli.main([])
    assert error.value.code == 2
    capsys.readouterr()
    database = DatabaseDouble(exists=False, fail_on="CREATE TABLE")
    monkeypatch.setattr(psycopg, "connect", database.connect)
    monkeypatch.setattr(cli, "UsageStore", lambda: UsageStore(postgres_url=TEST_DSN))
    assert cli.main(["--provision"]) == 1
    output = capsys.readouterr()
    assert "verify schema before retrying" in output.err
    assert "synthetic server detail" not in output.err and "never-log-this" not in output.err
    assert output.out == ""


@pytest.mark.parametrize("target,environment", [
    ("postgresql://synthetic@db.example.test/tdf_usage_test_example", None),
    ("postgresql://synthetic@localhost/tdf_usage_test_example", None),
    ("postgresql://synthetic@127.0.0.1/shared_database", None),
    ("postgresql://synthetic@127.0.0.1/tdf_usage_test_example?hostaddr=192.0.2.1", None),
    ("postgresql://synthetic@127.0.0.1/tdf_usage_test_example", "PGSERVICE"),
    ("postgresql://synthetic@127.0.0.1/tdf_usage_test_example", "PGHOSTADDR"),
])
def test_destructive_integration_guard_rejects_unsafe_target_before_any_connection(monkeypatch, target, environment):
    path = Path(__file__).with_name("test_usage_postgres_integration.py")
    spec = importlib.util.spec_from_file_location("usage_postgres_guard_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv("USAGE_TEST_ALLOW_DISPOSABLE", "1")
    monkeypatch.setenv("USAGE_TEST_POSTGRES_URL", target)
    for name in ["PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR"]:
        monkeypatch.delenv(name, raising=False)
    if environment:
        monkeypatch.setenv(environment, "synthetic-override")
    monkeypatch.setattr(psycopg, "connect", lambda *a, **k: pytest.fail("unsafe target reached connection code"))
    with pytest.raises(pytest.fail.Exception, match="literal-loopback disposable DB"):
        next(module.pg_dsn.__wrapped__())
