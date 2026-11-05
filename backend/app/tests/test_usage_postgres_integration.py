"""Opt-in, destructive tests for a NEW task-owned disposable local PostgreSQL DB.

Never set these variables to a tunnel, shared DB, Production or customer clone.
No default application POSTGRES_URL is read as a test target.
"""

from concurrent.futures import ThreadPoolExecutor
import os
from time import monotonic
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
import pytest

from app.schemas.usage import UsageEventRequest
from app.services.usage_store import UsageStore, UsageStoreError


@pytest.fixture
def pg_dsn():
    dsn = os.environ.get("USAGE_TEST_POSTGRES_URL")
    if not dsn or os.environ.get("USAGE_TEST_ALLOW_DISPOSABLE") != "1":
        pytest.skip("Real PostgreSQL requires explicit task-owned disposable local test configuration.")
    try:
        params = conninfo_to_dict(dsn)
    except Exception:
        pytest.fail("Invalid disposable PostgreSQL test configuration.", pytrace=False)
    if (
        params.get("host") not in {"127.0.0.1", "::1"}
        or not params.get("dbname", "").startswith("tdf_usage_test_")
        or any(params.get(k) for k in ("hostaddr", "service"))
        or any(os.environ.get(k) for k in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"))
    ):
        pytest.fail("Tests require an explicit literal-loopback disposable DB, without service/hostaddr overrides.", pytrace=False)
    with psycopg.connect(dsn) as connection:
        count = connection.execute(
            "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"
        ).fetchone()[0]
        if count:
            pytest.fail("Disposable DB must contain no application tables before each test.", pytrace=False)
    try:
        yield dsn
    finally:
        # Only our fixed test table; no CASCADE, other DB, cluster setting or volume.
        with psycopg.connect(dsn) as connection:
            connection.execute("DROP TABLE IF EXISTS public.user_usage_events")


def user(number=0):
    return {"id": f"synthetic-{number}", "email": "synthetic@example.test", "full_name": "Synthetic"}


def payload(number=0):
    return UsageEventRequest(event_name="page_view", session_id=f"synthetic-session-{number}", page_url="/labs/sql")


def security_snapshot(connection):
    table = connection.execute(
        """SELECT relowner, relacl, relrowsecurity, relforcerowsecurity
           FROM pg_class WHERE oid = 'public.user_usage_events'::regclass"""
    ).fetchone()
    policies = connection.execute(
        """SELECT polname, polcmd, polpermissive, polroles,
                  pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
           FROM pg_policy WHERE polrelid = 'public.user_usage_events'::regclass ORDER BY polname"""
    ).fetchall()
    indexes = connection.execute(
        """SELECT pg_get_indexdef(indexrelid), indisvalid, indisready
           FROM pg_index WHERE indrelid = 'public.user_usage_events'::regclass ORDER BY indexrelid"""
    ).fetchall()
    return table, policies, indexes


def test_real_fresh_atomic_setup_idempotence_and_existing_data_preserved(pg_dsn):
    store = UsageStore(postgres_url=pg_dsn)
    assert store.provision_postgres() is True
    store.record_event(user(), payload())
    with psycopg.connect(pg_dsn) as connection:
        before = security_snapshot(connection)
    assert store.provision_postgres() is False
    assert store.provision_postgres(check_only=True) is False
    with psycopg.connect(pg_dsn) as connection:
        assert security_snapshot(connection) == before
        assert connection.execute("SELECT count(*) FROM public.user_usage_events").fetchone()[0] == 1


def test_real_mid_provision_name_collision_rolls_back_table_and_sequence(pg_dsn):
    with psycopg.connect(pg_dsn) as connection:
        connection.execute("CREATE TABLE public.synthetic_collision (id integer)")
        connection.execute("CREATE INDEX idx_user_usage_events_user_created ON public.synthetic_collision(id)")
    try:
        with pytest.raises(UsageStoreError, match="verify schema"):
            UsageStore(postgres_url=pg_dsn).provision_postgres()
        with psycopg.connect(pg_dsn) as connection:
            assert connection.execute("SELECT to_regclass('public.user_usage_events')").fetchone()[0] is None
            assert connection.execute("SELECT to_regclass('public.user_usage_events_id_seq')").fetchone()[0] is None
    finally:
        with psycopg.connect(pg_dsn) as connection:
            connection.execute("DROP TABLE public.synthetic_collision")


def test_real_missing_schema_write_fails_without_fallback_or_implicit_setup(pg_dsn, tmp_path):
    path = tmp_path / "not-a-fallback"
    store = UsageStore(postgres_url=pg_dsn, storage_path=path)
    with pytest.raises(UsageStoreError):
        store.record_event(user(), payload())
    with pytest.raises(UsageStoreError, match="schema is missing"):
        store.provision_postgres(check_only=True)
    assert not path.exists()
    with psycopg.connect(pg_dsn) as connection:
        assert connection.execute("SELECT to_regclass('public.user_usage_events')").fetchone()[0] is None


def test_real_mismatched_schema_fails_without_repair_or_data_loss(pg_dsn):
    store = UsageStore(postgres_url=pg_dsn)
    store.provision_postgres()
    store.record_event(user(), payload())
    with psycopg.connect(pg_dsn) as connection:
        connection.execute("DROP INDEX public.idx_user_usage_events_page_created")
        connection.execute("ALTER TABLE public.user_usage_events ALTER COLUMN active_seconds SET DEFAULT 1")
        before = security_snapshot(connection)
    with pytest.raises(UsageStoreError, match="mismatch"):
        store.provision_postgres()
    with psycopg.connect(pg_dsn) as connection:
        assert security_snapshot(connection) == before
        assert connection.execute("SELECT count(*) FROM public.user_usage_events").fetchone()[0] == 1
        default = connection.execute(
            """SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d
               JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
               WHERE a.attrelid = 'public.user_usage_events'::regclass AND a.attname = 'active_seconds'"""
        ).fetchone()[0]
        assert default == "1"


class TracedConnection:
    def __init__(self, connection, statements):
        self.connection, self.statements = connection, statements

    def __enter__(self):
        self.connection.__enter__()
        return self

    def __exit__(self, *args):
        return self.connection.__exit__(*args)

    def cursor(self):
        return TracedCursor(self.connection.cursor(), self.statements)

    def commit(self):
        return self.connection.commit()


class TracedCursor:
    def __init__(self, cursor, statements):
        self.cursor, self.statements = cursor, statements

    def __enter__(self):
        self.cursor.__enter__()
        return self

    def __exit__(self, *args):
        return self.cursor.__exit__(*args)

    def execute(self, query, params=None):
        self.statements.append(" ".join(query.split()))
        return self.cursor.execute(query, params)


def test_real_non_owner_rls_writer_concurrent_acknowledgements_and_no_ddl(pg_dsn, monkeypatch):
    # A non-owner insert role would fail the old ALTER TABLE path, even if its
    # database happened to permit public-schema CREATE. No credentials are added.
    store = UsageStore(postgres_url=pg_dsn)
    store.provision_postgres()
    role = "tdf_usage_probe_" + uuid4().hex[:12]
    original_connect = psycopg.connect
    statements = []
    try:
        with original_connect(pg_dsn) as connection:
            connection.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS").format(sql.Identifier(role)))
            connection.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("GRANT INSERT ON public.user_usage_events TO {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("GRANT USAGE ON SEQUENCE public.user_usage_events_id_seq TO {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("CREATE POLICY synthetic_insert ON public.user_usage_events FOR INSERT TO {} WITH CHECK (user_id LIKE 'synthetic-%')").format(sql.Identifier(role)))
        def writer_connect(*args, **kwargs):
            connection = original_connect(*args, **kwargs)
            connection.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
            return TracedConnection(connection, statements)
        monkeypatch.setattr(psycopg, "connect", writer_connect)
        def write(number):
            return UsageStore(postgres_url=pg_dsn).record_event(user(number), payload(number)).recorded
        with ThreadPoolExecutor(max_workers=4) as executor:
            assert all(executor.map(write, range(24)))
        assert len(statements) == 24
        assert all(query.startswith("INSERT INTO public.user_usage_events") for query in statements)
        with original_connect(pg_dsn) as connection:
            count, distinct = connection.execute(
                "SELECT count(*), count(DISTINCT session_id) FROM public.user_usage_events"
            ).fetchone()
            assert (count, distinct) == (24, 24)
    finally:
        monkeypatch.setattr(psycopg, "connect", original_connect)
        with original_connect(pg_dsn, autocommit=True) as connection:
            connection.execute("DROP TABLE IF EXISTS public.user_usage_events")
            connection.execute(sql.SQL("REVOKE USAGE ON SCHEMA public FROM {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))


def test_real_rls_owner_grants_policies_force_and_extra_index_unchanged(pg_dsn):
    store = UsageStore(postgres_url=pg_dsn)
    store.provision_postgres()
    role = "tdf_usage_probe_" + uuid4().hex[:12]
    try:
        with psycopg.connect(pg_dsn) as connection:
            connection.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS").format(sql.Identifier(role)))
            connection.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("GRANT SELECT ON public.user_usage_events TO {}").format(sql.Identifier(role)))
            connection.execute("ALTER TABLE public.user_usage_events FORCE ROW LEVEL SECURITY")
            connection.execute("CREATE INDEX synthetic_extra_index ON public.user_usage_events(session_id)")
        store.record_event(user(), payload())
        with psycopg.connect(pg_dsn) as connection:
            connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
            assert connection.execute("SELECT count(*) FROM public.user_usage_events").fetchone()[0] == 0
        with psycopg.connect(pg_dsn) as connection:
            connection.execute(sql.SQL("CREATE POLICY synthetic_select ON public.user_usage_events FOR SELECT TO {} USING (user_id = 'synthetic-0')").format(sql.Identifier(role)))
            before = security_snapshot(connection)
        assert store.provision_postgres() is False
        assert store.provision_postgres(check_only=True) is False
        with psycopg.connect(pg_dsn) as connection:
            assert security_snapshot(connection) == before
            connection.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
            assert connection.execute("SELECT count(*) FROM public.user_usage_events").fetchone()[0] == 1
    finally:
        with psycopg.connect(pg_dsn, autocommit=True) as connection:
            connection.execute("DROP TABLE IF EXISTS public.user_usage_events")
            connection.execute(sql.SQL("REVOKE USAGE ON SCHEMA public FROM {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))


def test_real_provision_serialization_and_lock_deadline(pg_dsn):
    store = UsageStore(postgres_url=pg_dsn)
    store.provision_postgres()
    with psycopg.connect(pg_dsn) as other:
        other.execute("SELECT pg_advisory_xact_lock(1431521095, 1)")
        start = monotonic()
        with pytest.raises(UsageStoreError, match="already running"):
            store.provision_postgres()
        assert monotonic() - start < 3
    with psycopg.connect(pg_dsn) as other:
        other.execute("LOCK TABLE public.user_usage_events IN ACCESS EXCLUSIVE MODE")
        start = monotonic()
        with pytest.raises(UsageStoreError, match="verify schema"):
            store.provision_postgres()
        elapsed = monotonic() - start
        assert 4 <= elapsed < 10
    assert store.provision_postgres(check_only=True) is False
