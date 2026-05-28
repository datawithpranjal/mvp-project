# Data Engineering Scenario Playground

Data Engineering Scenario Playground is a practical interview-prep app for data engineers. Instead of isolated syntax drills, each lab starts from a production-style scenario with broken logic, sample tables, logs, expected behavior, and a clear debugging task.

This release ships 26 scenarios across SQL, Spark, Airflow, Kafka, Lakehouse, and Data Quality topics.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Backend: FastAPI
- Validation engine: embedded DuckDB inside the backend
- Future persistence scaffold: Postgres
- Local environment: Docker Compose

## Current Features

- Scenario library with free and premium tiers
- Demo login, sign-up, and logout flow in the browser
- Dummy premium checkout with annual and monthly pricing plus a placeholder UPI QR
- Difficulty filters: `Beginner`, `Intermediate`, `Advanced`
- Topic filters: `SQL`, `Spark`, `Airflow`, `Kafka`, `Lakehouse`, `Data Quality`
- Scenario detail pages with business context, problem statement, student task, sample tables, broken code, logs, hints, and common mistakes
- Two validation modes:
  - `SQL_OUTPUT_MATCH` for exact DuckDB result validation
  - `DEBUG_RUBRIC`, `DESIGN_RUBRIC`, and `CODE_REVIEW_RUBRIC` for model-answer comparison
- Local progress tracking, attempt history, and hint reveal state in the browser
- Premium unlock tied to the signed-in demo account in the current browser

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
```

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

- The app does **not** depend on Postgres yet for core scenario usage, so the deployed MVP still works without provisioning a production database first.
- Demo login is browser-local only.
- Dummy premium checkout is still a frontend-only placeholder.
- Email capture writes to `/tmp`, which is ephemeral on serverless deployments. That is acceptable for the current MVP, but not for real lead capture.

## API Endpoints

- `GET /healthz`
- `GET /api/v1/scenarios`
- `GET /api/v1/scenarios/{slug}`
- `POST /api/v1/email-captures`
- `POST /api/v1/scenarios/{slug}/validate`

Validation request body:

```json
{
  "answer": "SELECT ..."
}
```

For rubric-based scenarios, `answer` is free-form text instead of SQL.

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

## How To Add A New Scenario

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
- Authentication is still a frontend-only demo session, not a real backend auth system.
- Premium checkout is a dummy UPI flow for product prototyping, not a real payment integration.
