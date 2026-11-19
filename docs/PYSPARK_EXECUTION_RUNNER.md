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

The worker image starts `app.pyspark_worker:app`, a dedicated internal API. It
requires a configured `PYSPARK_RUNNER_TOKEN` and its matching `X-Runner-Token`
header on both validation aliases, including Free labs. Disabled local execution,
a missing token, or a configured runner URL fail closed without executing code.
The unchanged public backend checks learner entitlement before forwarding. Do not
deploy `app.main:app` as the worker: its public Premium check expects learner
authorization, which the internal proxy does not forward.

The image copies the current `backend/app`, including all `PYSPARK_SPECS` and
PDF lab definitions. Worker health aliases `/healthz` and `/api/healthz` report
the internal contract, supported lab count and SHA-256 of the sorted supported
slug list (compact JSON, UTF-8). This identifies catalogue membership only; it
does not attest grading fixtures, source revision or the deployed image. Retain
the exact Git revision, immutable image digest, build record, previous revision
and traffic settings separately before any rollout. A healthy process does not
prove validation readiness.

### November 19 PDF-lab incident candidate

#### Local same-service sandbox candidate and operator preflight

The isolated execution candidate wires the worker to the supported Cloud Run
sandbox CLI. It selects only the `pyspark-executor` template and mounts one
generated request subdirectory from the `pyspark-requests` memory volume as
read-only `/input`. The clean executor image copies only the generic program,
runtime helper and Spark dependency list. It contains no listener application,
catalogue, private solution or expected-output fixture. The listener keeps
grading expectations; the execution payload contains only output schema, input
rows and case context. Existing API actual/expected response fields are
preserved, including hidden-mode fields; this does not make that API a
confidential-oracle interface.

Missing launcher, template/mount errors and malformed output fail unavailable
without ordinary-Python fallback. Each submission runs in a new named sandbox
and requires successful forced deletion before a result is accepted. Uncertain
deletion quarantines the listener against further launches; an app-only restart
is not proof of cleanup. One admission slot and one explicit Uvicorn worker
bound this code to one active validation per listener instance. This is not a
capacity or denial-of-service guarantee. No egress-enabling flag or host-root
mount is supplied. Local mocks verify this command contract only; they cannot
verify the provider boundary.

Google documents this as a Preview feature requiring a new second-generation
revision. Templates share the existing instance CPU/memory. See the
[service configuration](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes),
[CLI lifecycle and flags](https://docs.cloud.google.com/run/docs/reference/sandbox-cli),
and [untrusted-code boundaries](https://docs.cloud.google.com/run/docs/code-execution#security-boundaries-for-untrusted-code).
Enabling the launcher alone does not select this executor or a clean image.

The following is a proposed operator sequence, not authorization or an executed
Cloud action. Root/CEO remains the sole provider-session executor.

1. Match the reviewed exact Git source archive/hash and both build destinations.
   Use `cloudbuild.pyspark-sandbox.yaml` to build the listener and clean execution
   images from that archive. Record source/build ID, resolved Python/base/JRE/
   Spark versions, image labels and immutable digests. Floating dependency ranges
   mean local Java11/Spark3.5.1 tests do not certify the built images. A revision
   label alone is not proof of matching build input.

   ```sh
   gcloud builds submit "$OPS053_SOURCE_ARCHIVE" \
     --account="$OPS053_VERIFIED_OWNER" --project=tdfpyspark \
     --region="$OPS053_BUILD_REGION" \
     --config=cloudbuild.pyspark-sandbox.yaml \
     --substitutions="_SOURCE_REVISION=$OPS053_SOURCE_REVISION,_WORKER_IMAGE=$OPS053_WORKER_IMAGE,_EXECUTOR_IMAGE=$OPS053_EXECUTOR_IMAGE"
   ```

2. Before any revision, root records the currently verified service
   `data-foundry-pyspark-runner`, region `asia-south1`, revision
   `data-foundry-pyspark-runner-00002-wgs`,100% traffic, full registry URI and digest
   `sha256:2f34f2fae6595ec71f25e12dd74fa6795f19f49d741654d699334058483b1b49`.
   Retain1CPU/2GiB,30s request timeout,max3 and the existing token binding. Current
   concurrency80 is not80-JVM capacity evidence. Confirm container port matches
   this image's8000 and the explicit single worker. No token value is needed.

3. After separate guarded approval, create a no-traffic revision on that same
   service with launcher enabled, one clean template pinned by digest, and one
   in-memory `pyspark-requests` volume mounted only in the listener at
   `/mnt/pyspark-requests`. Do not mount the listener root or all request folders
   in the template. The CLI supplies the single readonly request subpath.
   Preserve authentication/IAM and secret binding through the provider's safe
   update path. Do not export plaintext env values or replace the complete
   service spec from an incomplete fragment. Preview availability, existing
   deployment/build permissions and template setup remain operator prerequisites;
   no new service, IAM grant or secret rotation is proposed.

4. In the exact isolated runtime, verify default Debian runtime discovery and
   actual Python/Spark/JVM startup; dummy-only parent-env/private-file/other-
   request denial; metadata-token access never attempted; noncredential metadata
   and outbound reachability denied; loopback Python-to-JVM works; timeout,
   output-overflow and explicit deletion leave no surviving sandbox. Report
   booleans, status and duration only. A failed deletion must quarantine admission
   and block promotion until root verifies cleanup or retires the instance.

5. Route an approved isolated backend preview to the no-traffic revision while
   retaining its existing private token binding without reading it. The exact
   reported Free lab is `pyspark-pdf-02-shuffle-storm-after-a-big-join`. Post its
   public inclusive-threshold reference and strict-threshold wrong answer in
   both `sample` and `hidden` modes, serially. Require HTTP200, remote engine,
   nonempty consistent results and correct/wrong verdicts. Retain PDF01 and older
   core/sales checks. Both PDF02 API modes remain Free; the UI Submit sign-in
   requirement is separate. Check adjacent Premium guest401/nonmember403 without
   grants. No customer session is needed.

   ```sh
   curl --fail-with-body -H 'Content-Type: application/json' \
     --data-binary @pdf02-reference-sample.json \
     "$OPS053_BACKEND_PREVIEW/api/v1/pyspark/validate/pyspark-pdf-02-shuffle-storm-after-a-big-join"
   ```

   The other three requests change the JSON mode to `hidden` and/or the public
   reference's `>=` comparison to `>`. Never send an internal runner token from
   this probe. Record first and immediate-repeat duration/startup evidence under
   the unchanged25s process and30s Cloud/proxy budgets; do not widen them merely
   to resolve this404. Actual template compatibility/deadline failure keeps HOLD.

6. Only after exact Product/Engineering and CEO runtime acceptance, root changes
   traffic through the normal release path and verifies canonical PDF02 Run
   sample plus Submit using an existing owned QA session, preserving drafts and
   access rules. Ananya alone supplies verified retry steps and obtains customer
   confirmation. Rollback restores recorded00002-wgs100% and its immutable image/
   prior revision configuration. With no traffic shifted, discard the failed
   candidate after confirmed cleanup. No Vercel-only revert can roll back the
   external worker.

   ```sh
   gcloud run services update-traffic data-foundry-pyspark-runner \
     --account="$OPS053_VERIFIED_OWNER" --project=tdfpyspark \
     --region=asia-south1 \
     --to-revisions=data-foundry-pyspark-runner-00002-wgs=100
   ```

For every management command use the verified owner account explicitly and
the existing project/region. Current target binding and management
authentication were restored by the CEO; this does not authorize a build or
revision. Use the exact account confirmed in the root receipt, never the cached
expired identity, and do not repeat login/help probes from this Engineering task.

#### Separate local child-environment mitigation

The follow-up environment candidate replaces inherited listener variables with a
fresh dictionary for each learner subprocess. Python, Java and installed Spark
paths are resolved only when local execution is requested; a proxy-only backend
does not need a local runtime. The runtime uses the absolute interpreter path,
the installed Spark package and a real Java home derived from `/usr/bin/java`.
Missing runtime files fail unavailable without falling back to the parent
environment. The worker image's Debian JRE layout still requires image proof.

The child receives only controlled executable/library paths, Python/Spark
controls, UTF-8 locale settings, and request-owned home/temp/Spark directories
with mode0700 under `/tmp`. No parent application/cloud/database credentials,
proxy settings, arbitrary Python/Java/Spark launch options or gateway settings
are forwarded. No TZ value is forwarded or set. Dropping an inherited TZ may
change a JVM's default timezone; local supported-lab checks do not establish
container timezone equivalence. Grading fixtures and comparison code are
unchanged. The parent API retains its existing token and entitlement behavior.

Local tests can inject an immutable runtime descriptor using test-only command
options for an explicit Java home and narrow import root. These selectors are
not request fields or production environment overrides. A local dependency
selector does not establish the container's runtime or isolation.

This removes direct environment forwarding only. Learner Python and Spark/JVM
still require a separately verified filesystem, process, identity and network
boundary. Parent-state, shared-file and cloud-identity exposure are not ruled
out by environment filtering. Keep deployment HOLD until that boundary, current
runner target binding and management access are verified. The original
`cbd809ed5fbf612dca3714b4175ecab838f380f8` candidate remains frozen; this is a
separate reversible local child change, with no live fix or security-isolation
claim.

#### Original incident evidence (frozen cbd809e)

Canonical synthetic probes returned remote success for the original sales
scenario and the older duplicate-rerun lab, but Free PDF01 returned HTTP 503
wrapping runner HTTP 404. The actual signed-in app reproduced the same error.
This establishes a lab-specific failure and supports catalogue drift; the live
worker source and its upstream 404 body remain unverified. The retained October
worker revision predates the PDF catalogue. This source candidate is not a
deployed repair and changes no public backend, entitlement, fixture, timeout,
resource, token value or cloud setting.

The repository has a Docker Cloud Build recipe, but no checked-in automatic
worker deployment workflow. Before release, an authorized operator must verify
the configured runner origin, current service/revision/image and existing build
route. Build this exact candidate, preserve the existing token binding without
printing it, and test an isolated revision before changing traffic. Require the
PDF01 correct and boundary-missing wrong answers, sample and hidden cases,
older sales/core labs, internal token failures and unchanged public paid-access
denials. Preserve existing worker resource and process limits. Do not substitute
an arbitrary runner or widen execution budgets to treat this 404.

If accepted, record first verified public PDF01 success and monitor unavailable
responses separately from completed mismatches. Roll back worker traffic to the
recorded prior revision/image if necessary; a Vercel-only revert does not roll
back the external worker. Customer recovery remains unverified until support
receives confirmation for the reported exercise. Cloud access and write-only
runner-origin configuration currently prevent the required live identity and
rollout proof.

## Local Runner

To run Spark locally, install the Spark dependencies into your backend environment:

```bash
cd backend
pip install -r requirements-spark.txt
PYSPARK_EXECUTION_ENABLED=true uvicorn app.pyspark_worker:app --host 127.0.0.1 --port 8001
```

Provide a local-only test runner token to the worker and a separate local
backend on port 8000 configured with `PYSPARK_RUNNER_URL=http://127.0.0.1:8001`
and the same token. Never place the
token in frontend configuration. Then point the frontend to the local backend:

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
