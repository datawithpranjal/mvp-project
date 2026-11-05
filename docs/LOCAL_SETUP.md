# Local Setup

## Backend

From the repository root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/healthz
```

### Usage storage readiness when PostgreSQL is configured

Ordinary usage-event writes only insert and commit. They do not create tables,
indexes or row-level-security settings, including on a cold process. Before
starting traffic on a new environment, an authorized operator must provision
usage storage explicitly. This is a deployment prerequisite, not a request or
application-startup hook. The file-backed development mode is unchanged when
`POSTGRES_URL` is absent or is the documented development placeholder; a configured
PostgreSQL failure never falls back to a file.

From `backend`, with the intended connection supplied through the existing secure
`POSTGRES_URL` environment/configuration (never put it in command arguments or logs):

```bash
python scripts/provision_usage_store.py --check-only
```

This check runs a read-only transaction and fails if the table is missing or the
column/default/constraint/required-index definitions or enabled RLS differ. It
does not prove application-role write permission, valid authentication, saved
learner progress, physical pool capacity or overall database readiness. `/healthz`
alone does not test the database either. No schema/configuration action against a
live environment is implied by these instructions; use its normal release gates.

Only for an approved fresh-environment setup, before admitting traffic, run one
serialized operator/release step with the existing schema-capable connection:

```bash
python scripts/provision_usage_store.py --provision
python scripts/provision_usage_store.py --check-only
```

Provisioning has a 5-second connection timeout, a fail-fast transaction advisory
lock, a 5-second lock-wait deadline and a 30-second per-statement deadline. It
creates the original table, primary/range constraints, three usage indexes and
enabled RLS in one transaction. A concurrent/non-cooperating schema creation or
name collision fails and rolls back; it is not adopted as a repair. Existing
tables must already match and are only checked under a bounded lock. Mismatches,
missing authority, disabled RLS, or missing/changed required indexes fail without
automatic alteration. Fixing an existing mismatch requires a separately reviewed
operation; do not drop/rebuild a table, change an owner, grant privileges, add a
policy or disable/force RLS to make this command pass. Existing owner, grants,
policies, FORCE setting and additional indexes are not rewritten.
If a connection fails while COMMIT is being acknowledged, its outcome can be
unknown; the command reports failure, never success or a guaranteed rollback.
Verify the schema with a permitted readiness check before retrying. This change
does not add event idempotency or change the writer's existing acknowledgement
semantics.

The pre-traffic release gate must verify the actual schema/version and the
application connection's intended access in a permitted isolated environment.
Verify a committed synthetic event/readback and failure behavior there before
claiming runtime acceptance. Do not substitute the operator's schema check for an
application-role/RLS test. If provisioning cannot be guaranteed before traffic,
hold deployment. Usage endpoints return controlled 503s on missing schema or
database failure, with no silent local fallback. Other auth operations still have
their existing schema setup; this change removes usage-writer DDL only.

For isolated PostgreSQL tests, use a new disposable **local** PostgreSQL cluster
with only synthetic data. Set both `USAGE_TEST_POSTGRES_URL` and
`USAGE_TEST_ALLOW_DISPOSABLE=1`; the test database name must start with
`tdf_usage_test_`, and the literal host must be `127.0.0.1` or `::1` (no separate
host address or service setting). The tests create/drop their own tables/roles in
that disposable database; never supply Production, a tunnel or a customer clone.
With that explicit environment, from `backend`:

```bash
python -m pytest app/tests/test_usage_provisioning.py app/tests/test_usage_postgres_integration.py app/tests/test_usage_api.py app/tests/test_auth_continuity.py app/tests/test_admin_reporting.py
```

Without the disposable configuration, the real PostgreSQL module skips explicitly;
unit doubles cannot establish transaction/locking/RLS behavior. Do not start a host
service, change host security settings, install a server or use a remote database
just to turn a skip into a pass without separate authorization.

Rollback is a normal code revert/redeploy to the accepted prior source, preserving
all usage rows, indexes and enabled RLS; do not undo provisioning by deleting data
or weakening access. Reverting the writer reintroduces its old runtime-DDL risk
and is not itself a contention fix. Production effect/load acceptance remains a
separate release and measurement decision.

## Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` for local development.

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

## Environment Variables

- `NEXT_PUBLIC_API_BASE_URL`: frontend-to-backend URL.
- `BACKEND_CORS_ORIGINS`: comma-separated frontend origins.
- `BACKEND_CORS_ORIGIN_REGEX`: optional Vercel preview regex.
- `POSTGRES_URL`: optional Postgres/Supabase connection string.
- `RESEND_API_KEY`: optional OTP email provider key.
- `AUTH_EMAIL_FROM`: verified sender for OTP email.
- `AI_EVALUATION_PROVIDER`: `gemini` or `openai`.
- `GEMINI_API_KEY`: server-side Gemini API key; never expose it to the frontend.
- `GEMINI_MODEL`: Gemini model used for structured answer evaluation.

## How To Add A New Scenario

Create one JSON file under `backend/app/scenarios` or a scenario folder with `scenario.json`, `setup.sql`, and `expected.sql`.

For SQL validation, include:

- `validation_type: "SQL_OUTPUT_MATCH"`
- `setup.sql` to create seed tables
- `expected.sql` with the canonical expected result

For rubric validation, include:

- `validation_type: "DEBUG_RUBRIC"`, `"DESIGN_RUBRIC"`, or `"CODE_REVIEW_RUBRIC"`
- `rubric`
- `solution_query` or model answer fields
- `hints`

Restart or redeploy the backend. The file-backed loader will include the scenario in `/api/v1/scenarios`.
