# The Data Foundry

The Data Foundry is a practice-first platform for Data Engineering interviews, production scenarios, project simulation, and job readiness. It is built by Data with Pranjal.

Instead of isolated syntax drills or PDF bundles, each lab starts from a production-style scenario with broken logic, sample tables, logs, expected behavior, hints, answer submission, and progress tracking.

This release includes the new Broken Pipeline Lab with curated production-debugging scenarios, imported PDF scenario labs, plus the existing backend scenario API for DuckDB SQL validation.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Backend: FastAPI
- Validation engine: embedded DuckDB inside the backend
- Future persistence scaffold: Postgres
- Local environment: Docker Compose

## Current Features

- Broken Pipeline Lab with MCQ diagnosis, broken SQL, broken PySpark, log analysis, output mismatch debugging, hints, model answers, and interview-style evaluation
- Scenario library with free and premium tiers
- Backend-backed OTP login, sign-up, logout, and editable user profile
- Optional Google login using the same backend session/profile model
- User-selectable light and dark mode
- Manual premium checkout with annual and monthly pricing plus a Paytm UPI QR
- Difficulty filters: `Beginner`, `Intermediate`, `Advanced`
- Topic filters: `SQL`, `Spark`, `Airflow`, `Kafka`, `Lakehouse`, `Data Quality`
- Scenario detail pages with business context, problem statement, student task, sample tables, broken code, logs, hints, and common mistakes
- Two validation modes:
  - `SQL_OUTPUT_MATCH` for exact DuckDB result validation
  - `DEBUG_RUBRIC`, `DESIGN_RUBRIC`, and `CODE_REVIEW_RUBRIC` for model-answer comparison
- Local progress tracking, attempt history, and hint reveal state in the browser
- Onboarding, dashboard, readiness score, XP/streaks, weak-area tracking, and learning paths
- E-commerce Orders Data Pipeline Simulator
- Mock Interview Room with deterministic AI-evaluator fallback
- Manual UPI premium payment submission with backend/admin premium access scaffolding
- Signup email capture happens immediately when a learner creates an account
- PDF import flow for `docs/120-data-engineering-scenarios.pdf`, including generated PySpark fix labs with broken code samples
- Browser-native SQL and Python Labs generated from the coding practice PDFs

## Project Structure

```text
frontend/   Next.js UI
backend/    FastAPI API, file-backed scenarios, DuckDB validation, tests
docker/     Dockerfiles for frontend and backend
```

## Run With Docker Compose

1. Copy `.env.example` to `.env`.
2. Start the stack:

```bash
docker compose up --build
```

3. Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/healthz](http://localhost:8000/healthz)

## Run Locally Without Docker

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev
```

## Deploy To Vercel

The most stable setup today is **two Vercel projects from the same repository**:

- one Vercel project for the frontend with root directory `frontend`
- one Vercel project for the backend with root directory `backend`

This is the recommended path because Vercel's single-project multi-service setup is currently documented as **Private Beta**.

### Why two projects

- `frontend/` is a standard Next.js app and deploys cleanly on Vercel
- `backend/` is a standard FastAPI app and now exposes a Vercel entrypoint at `backend/api/index.py`
- the frontend talks to the backend through `NEXT_PUBLIC_API_BASE_URL`

### 1. Push the repository to GitHub

Vercel works best when both projects point at the same Git repository.

### 2. Deploy the backend project on Vercel

In Vercel:

1. Click **Add New Project**
2. Import this repository
3. Set **Root Directory** to `backend`
4. Keep the detected Python/FastAPI settings
5. Add these environment variables:

```text
BACKEND_CORS_ORIGINS=https://your-frontend-project.vercel.app,http://localhost:3000
BACKEND_CORS_ORIGIN_REGEX=
POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/scenario_playground
ADMIN_API_TOKEN=choose-a-long-random-token
RESEND_API_KEY=
OTP_EMAIL_FROM=Data Engineering Scenario Playground <onboarding@resend.dev>
AUTH_SHOW_DEBUG_OTP=true
FRONTEND_BASE_URL=https://your-frontend-project.vercel.app
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://your-backend-project.vercel.app/api/v1/auth/google/callback
GOOGLE_OAUTH_STATE_SECRET=choose-a-long-random-token
```

For production email capture, set `POSTGRES_URL` to your Supabase Postgres connection string instead of the local Docker value. Use the full URI with your database password, for example:

```text
POSTGRES_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
```

For real OTP emails, create a Resend account, add `RESEND_API_KEY`, set `OTP_EMAIL_FROM` to a sender address allowed by Resend, and set:

```text
AUTH_SHOW_DEBUG_OTP=false
```

For Google login, create OAuth credentials in Google Cloud Console and add:

```text
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://your-backend-project.vercel.app/api/v1/auth/google/callback
FRONTEND_BASE_URL=https://your-frontend-project.vercel.app
GOOGLE_OAUTH_STATE_SECRET=choose-a-long-random-token
```

The same redirect URI must be added under **Authorized redirect URIs** in Google Cloud.

If you want preview deployments from many Vercel URLs to call the backend, you can optionally set:

```text
BACKEND_CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app
```

After deployment, note the backend URL, for example:

```text
https://data-engineering-playground-api.vercel.app
```

### 3. Deploy the frontend project on Vercel

In Vercel:

1. Click **Add New Project**
2. Import the same repository again
3. Set **Root Directory** to `frontend`
4. Add this environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://your-backend-project.vercel.app
```

Then deploy.

### 4. Open the site

Your public frontend URL will be something like:

```text
https://data-engineering-playground.vercel.app
```

At that point, anyone with the link can access the portal.

### 5. Optional: add custom domains

You can later attach:

- a custom domain like `playground.yourdomain.com` to the frontend project
- a custom domain like `api.yourdomain.com` to the backend project

If you add a custom frontend domain, update:

```text
BACKEND_CORS_ORIGINS=https://playground.yourdomain.com
```

If you add a custom backend domain, update:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

### Current production notes

- The app does **not** depend on Postgres for core scenario usage, so the deployed MVP still works without provisioning a production database first.
- Email capture writes to Supabase/Postgres when `POSTGRES_URL` is set to a real external database URL. If the default local Docker URL is used, it falls back to local file storage for development.
- Login, signup, profile, OTPs, and sessions are backed by Postgres in production.
- Premium checkout is still a manual MVP flow and the browser unlock is not a real payment-gateway verification.

### Supabase security / RLS

Supabase exposes tables in the `public` schema through its Data API, so production tables must have Row-Level Security enabled. Backend-owned tables in this project should not be directly readable or writable from the browser.

If Supabase reports `rls_disabled_in_public`, run the hardening script in **Supabase Dashboard -> SQL Editor**:

```text
docs/SUPABASE_RLS_FIX.sql
```

The backend also enables RLS automatically when it creates its Postgres tables. Do not add public `anon` or `authenticated` policies for `email_captures`, `playground_users`, `auth_otps`, `auth_sessions`, `auth_otp_attempts`, `premium_access_grants`, or `premium_payment_requests`; those tables are accessed through the FastAPI backend only.

## Email Capture

Production email captures are stored in the `email_captures` table. The backend creates the table automatically the first time a student submits an email.

To view captured emails in Supabase:

1. Open Supabase.
2. Go to **Table Editor**.
3. Open the `email_captures` table.

You can also use SQL:

```sql
select email, source, scenario_slug, captured_at
from email_captures
order by captured_at desc;
```

You can also inspect captures through the backend admin endpoint:

```bash
curl -H "x-admin-token: YOUR_ADMIN_API_TOKEN" \
  "https://your-backend-project.vercel.app/api/v1/admin/email-captures"
```

This returns the active storage backend, whether the table exists, the row count, and the latest captured emails.

## API Endpoints

- `GET /healthz`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/{slug}`
- `POST /api/v1/email-captures`
- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `GET /api/v1/auth/google/start-url`
- `GET /api/v1/auth/google/start`
- `GET /api/v1/auth/google/callback`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/profile`
- `POST /api/v1/auth/logout`
- `POST /api/v1/scenarios/{slug}/validate`

Validation request body:

```json
{
  "answer": "SELECT ..."
}
```

For rubric-based scenarios, `answer` is free-form text instead of SQL.

Auth notes:

- Users, OTPs, and sessions are stored in Postgres when `POSTGRES_URL` points at Supabase.
- If `RESEND_API_KEY` is set, OTPs are sent through Resend.
- If `RESEND_API_KEY` is not set, OTPs stay in demo mode and the API response includes `debug_otp`.
- Set `AUTH_SHOW_DEBUG_OTP=false` in production so OTPs are not shown in the browser response.

## Tests

Backend tests currently cover:

- five SQL output-match scenarios
- a broken SQL submission path
- read-only SQL enforcement
- rubric scenario detail and submission responses
- scenario list and email capture APIs

Run them with:

```bash
cd backend
pytest
```

## Broken Pipeline Lab Scenario Data

The new practice system uses typed frontend scenario data in:

```text
frontend/lib/scenarios.ts
frontend/data/scenarios.generated.json
```

Each lab supports:

- MCQ diagnosis
- Broken SQL fixes
- Broken PySpark fixes
- Log/error analysis
- Output mismatch debugging
- Interview-style explanation

The deterministic evaluator lives in:

```text
frontend/lib/scenarioEvaluator.ts
```

## Browser Coding Labs

SQL and Python coding practice lives fully in the frontend:

```text
frontend/data/coding-labs.generated.json
frontend/data/public-sql-practice.generated.json
frontend/lib/coding-labs.ts
frontend/components/labs/BrowserCodingLab.tsx
```

- SQL Lab uses `sql.js` to execute SQLite-compatible SQL in the browser.
- Python Lab loads Pyodide in the browser and runs function tests client-side.
- No backend API is used for SQL/Python coding execution.
- The public SQL coverage pack is generated from repository file names only; prompts, tables, seed data, and solutions are original Data Foundry content.

Regenerate the coding lab data from the two PDFs:

```bash
./frontend/node_modules/.bin/tsx scripts/import-coding-labs-from-pdf.ts \
  "/path/to/04 - SQL Coding Practice with Solutions - 50 Questions - Data with Pranjal.pdf" \
  "/path/to/06 - Python Coding Practice with Solutions - 50 Questions - Data with Pranjal.pdf"
```

Regenerate the original SQL coverage pack mapped from public SQL practice repositories:

```bash
./frontend/node_modules/.bin/tsx scripts/import-public-sql-coverage-pack.ts
```

The importer reads GitHub tree metadata, deduplicates similar file titles, and writes:

```text
data/public-sql-practice.generated.json
frontend/data/public-sql-practice.generated.json
```

## Import The 120-Scenario PDF

Place the PDF here:

```text
docs/120-data-engineering-scenarios.pdf
```

Then run:

```bash
./frontend/node_modules/.bin/tsx scripts/import-scenarios-from-pdf.ts
```

Or pass the PDF path directly:

```bash
./frontend/node_modules/.bin/tsx scripts/import-scenarios-from-pdf.ts "/path/to/Scenario-Based Data Engineering Interview Handbook - 120 Questions - Data with Pranjal.pdf"
```

If needed, install the optional parser tooling:

```bash
cd frontend
npm install --save-dev tsx pdf-parse
```

The script writes:

```text
data/scenarios.generated.json
frontend/data/scenarios.generated.json
```

The frontend copy is automatically merged into `/scenarios` by `frontend/lib/scenarios.ts`. PDF extraction still needs human review. Use `docs/scenario-import-guide.md` and `data/scenarios.manual.template.json` to clean up domain, difficulty, practice type, broken code, hints, and model answers before publishing broadly.

## How To Add A Legacy Backend Scenario

The preferred path is one JSON file per scenario in `backend/app/scenarios/`.

1. Create a file named `backend/app/scenarios/<slug>.json`.
2. Use this shape:

```json
{
  "id": "unique-id",
  "slug": "kebab-case-title",
  "title": "Scenario title",
  "difficulty": "beginner",
  "section": "SQL",
  "access_tier": "free",
  "topic_tags": ["SQL", "Data Quality"],
  "short_description": "Short card description.",
  "business_context": "Why this matters in production.",
  "problem_statement": "What is broken.",
  "student_task": "What the student must submit.",
  "learning_goals": ["Goal 1", "Goal 2"],
  "broken_code": "Broken query, code, or config snippet",
  "production_logs": ["log line 1", "log line 2"],
  "sample_tables": [
    {
      "name": "table_name",
      "columns": ["col_a", "col_b"],
      "rows": [[1, "x"], [2, "y"]]
    }
  ],
  "expected_output": [],
  "solution_query": "Reference SQL or model answer",
  "explanation": "Why the solution works.",
  "common_mistakes": ["Mistake 1"],
  "validation_type": "SQL_OUTPUT_MATCH",
  "rubric": [],
  "hints": ["Hint 1", "Hint 2"]
}
```

3. Choose the validation type:

- `SQL_OUTPUT_MATCH`
  - Add `sample_tables`
  - Make `solution_query` a DuckDB-compatible query
  - The backend will build in-memory tables from `sample_tables` and compare student output to the solution output
- `DEBUG_RUBRIC`, `DESIGN_RUBRIC`, `CODE_REVIEW_RUBRIC`
  - Use `solution_query` as the model answer text
  - Add a `rubric` array with weighted checklist items
  - Include `broken_code`, `production_logs`, and hints when helpful

4. Restart the backend if it is already running.
5. Open the homepage. The new scenario will appear automatically because the loader scans `backend/app/scenarios/*.json`.

## Notes

- The older folder-based format with `scenario.json`, `setup.sql`, and `expected.sql` is still supported for existing scenarios.
- Authentication uses the FastAPI OTP/profile endpoints and stores sessions in Postgres when `POSTGRES_URL` points at Supabase.
- Practice progress is currently localStorage-based and documented for future server-side persistence.
- Premium checkout is a manual UPI flow for product prototyping, not a real payment-gateway integration.
