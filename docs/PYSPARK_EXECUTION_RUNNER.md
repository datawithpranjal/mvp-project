# PySpark Execution Runner

The main website and FastAPI backend can stay on Vercel, but PySpark should run in a separate isolated worker. Vercel serverless is not a good place for Spark because Spark needs Java, local process time, memory, and predictable temporary storage.

## Recommended Production Setup

Use a small container service for PySpark validation:

- Recommended: Google Cloud Run
- Also acceptable: Fly.io or Render web service
- Image: `docker/pyspark-runner.Dockerfile`
- Memory: start with 2 GiB
- CPU: start with 1 vCPU
- Timeout: 25-30 seconds
- Scaling: min instances 0, max instances based on budget

The production flow is:

1. Browser calls the existing FastAPI backend endpoint.
2. Vercel backend proxies the request to the PySpark runner.
3. PySpark runner executes visible sample or hidden tests.
4. Backend returns pass/fail, actual output, expected output, and test messages.

## Environment Variables

Set these on the Vercel backend:

```bash
PYSPARK_RUNNER_URL=https://your-pyspark-runner-url
PYSPARK_RUNNER_TOKEN=<32+ char shared secret>
PYSPARK_EXECUTION_ENABLED=false
PYSPARK_TIMEOUT_SECONDS=25
```

Set these on the PySpark runner service:

```bash
PYSPARK_EXECUTION_ENABLED=true
PYSPARK_RUNNER_TOKEN=<same shared secret>
BACKEND_CORS_ORIGINS=https://datawithpranjal.com,https://www.datawithpranjal.com
```

Do not set `PYSPARK_RUNNER_URL` on the runner itself. That variable is only for the Vercel backend proxy.

## Local Runner

To run Spark locally, install the Spark dependencies into your backend environment:

```bash
cd backend
pip install -r requirements-spark.txt
PYSPARK_EXECUTION_ENABLED=true uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then run the frontend with:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- -p 3002
```

## Validation Contract

The first executable PySpark scenario is:

`yesterdays-sales-missing-late-source-arrival`

The learner code must create a Spark DataFrame named `daily_sales` or `fixed_daily_sales` with these columns:

```text
business_date, order_count, gross_sales
```

The runner provides:

```python
raw_sales
run_date
F
spark
```

The runner intentionally blocks external file reads, warehouse writes, subprocess/network access, and dynamic execution. This protects the platform and keeps the practice focused on transformation logic.

## Why This Is Safer

User code execution is risky. Keeping Spark in a separate container allows us to apply stricter resource limits, timeouts, secrets isolation, no database credentials, and optional network egress restrictions.

## Engineering verification checkpoint — 2026-10-30

Task: `20261030-ENGINEERING-01`, contribution to `20261030-REVENUE-01`.
Base: refreshed `origin/main` at `ecbec1b`. This checkpoint is local evidence;
Product's interactive-CTA HOLD remains. No merge, deployment or learner/business
improvement is established.

### Findings and bounded change

- A live reference request returned HTTP 503 after 30.43s; an immediate repeat
  returned `2026-05-07 / 2 / 420` with HTTP 200 after 27.02s. These are first/repeat
  observations, not verified cold/warm instance measurements or an error-rate estimate.
- The original worker timeout escaped as `subprocess.TimeoutExpired`, which can
  produce HTTP 500. The patch classifies local/proxy timeouts, failed workers and
  invalid/missing/inconsistent result evidence as unavailable validation. This
  reproduces a code-level 500 path; it does not prove the cause of Product's live 500.
- Timeout cleanup terminates the POSIX worker process group, including the JVM.
  The configured 25s worker budget, per-run subprocess, separate remote-worker
  architecture, access checks and existing static guardrails remain unchanged.
- The selected scenario labels visible-sample success as incomplete. Solution
  review cannot call manual completion; historical progress is preserved and
  accompanied by an explicit provenance caveat. Executor errors show Unavailable.

### Verified evidence

- 221 backend tests passed, including six real-Spark checks: correct sample and
  hidden results; starter, ingestion-date, cancelled-row and duplicate-counting
  failures; plus malformed evidence, safety rejection and descendant cleanup.
- TypeScript and the 25-route frontend production build passed. Existing
  auth-continuity and guest-progress-migration checks
  passed, including transient-session errors, correct return paths, draft flushing,
  account switches and newer-draft preservation. These are local automated checks.
- Local reference baseline: first process 7.81s, repeat process 6.93s, hidden checks
  7.06s. Every run starts a new Spark process; these are not cloud cold-start figures
  or a measured performance improvement.
- In-app browser against localhost frontend/test API: reference sample visibly
  returns `2026-05-07 / 2 / 420` and “Visible sample passed · not completed”; wrong
  ingestion-date code returns a mismatch and no pass. A controlled 30s sleep hits
  the unchanged worker deadline and shows “No correctness result” / “Unavailable”,
  with the exercise still In progress.
- Opening sign-in, cancelling and reloading retains corrected code, explanation
  and the exact task; no OTP is sent. Reviewing the solution leaves In progress
  and exposes no Mark complete button for this executable scenario.
- The proposed `/scenarios/airflow-green-dashboard-wrong` route opens the expected
  title and a Premium lock for a guest. It is verified as an existing destination,
  not an automatic post-result recommendation: generic Next still uses catalog order.
- The initial preview request was blocked by the preview address configuration:
  source CSP permits `http://localhost:*`, while the initial API URL used 127.0.0.1;
  the test API also needed the preview origin. Using localhost and the matching
  runtime CORS origin resolved it without editing CSP/CORS source policy.

### Remaining gates, recovery and approval

- Google Cloud CLI credentials returned `invalid_grant`; runner metadata/logs,
  deployed revisions and true cold-start/resource causes remain unverified.
- Static regex checks and process cleanup are not a hard sandbox. Hard CPU/memory,
  filesystem/network boundaries, output limits and concurrency still require
  verification; no security isolation claim or shared persistent JVM is introduced.
- Real production OTP/Google continuity, account save/reload, second-device recovery,
  an intentional next-task placement and Analytics' measurement chain remain gates.
- Local code/tests/commit are autonomous. Release requires the separate applicable
  approval and Product acceptance. Rollback of a future release would redeploy its
  prior verified frontend/backend and worker images; no schema/data migration exists.
- After an approved deployment, observe sample success/error classes and latency,
  hidden-result provenance, account-save failures and next-task clicks. Define QA
  exclusion and eligible denominators with Analytics before making business claims.

## Local continuation follow-up — 2026-10-30

Built on `3b20bd19` on the same `codex/support-scenario-runner` branch. This
supersedes the preceding checkpoint's local recommendation-placement gap only.
The selected free sales scenario now displays one explicit, Premium-labelled
“DAG Green but Dashboard Wrong” continuation after a passing executable result.
Both sample and hidden results qualify; sample success still says “not completed”.
No result, failure, unavailable execution, empty checks, inconsistent results or
another source scenario do not qualify. Editing the answer clears the current
result and the recommendation through the existing workspace behavior.

The link uses the existing catalog title and opens exactly
`/scenarios/airflow-green-dashboard-wrong`. The card explains the next learning
step (freshness/completeness checks), states that Premium is required, and keeps
the free exercise available. Existing Previous/Next navigation and access guards
are unchanged. No new entitlement, price, persistence or Analytics event contract
is introduced.

Verification: `cd frontend && node --import tsx ../scripts/validate-scenario-continuation.ts`
checks passing sample/hidden and remote results, negative eligibility cases, the
exact target title and its Premium tier. TypeScript passes. Local browser checks
confirm the card is absent initially, appears after the real 2-order/420 sample,
and opens the existing Premium lock. A failing starter sample does not display
the recommendation. The 25-route frontend production build passed.
Backend code is unchanged from the prior 221-test verification.

Product's launch HOLD remains. Account/save/cross-device continuity, durable
provenance, Analytics traces, production reliability/isolation and release
verification remain separate gates. This is local implementation evidence, not
measured learner or revenue improvement. Rollback is to the preceding local
commit; no migration or production change exists.
